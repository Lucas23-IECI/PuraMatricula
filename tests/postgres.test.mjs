import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPglitePool } from './helpers/pglite-pool.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';
import { openStore } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
import { seedDemo, demoPassword } from '../scripts/seed-demo.mjs';
import { ensureImportFields } from '../src/import-fields.mjs';
import { restoreBackup } from '../src/backup.mjs';

const loginPassword = demoPassword;
const backupPassword = 'Clave-sintetica-postgres-2026!';

async function openQa() {
  const pool = await createPglitePool({ dataDir: `memory://pura-matricula-${randomBytes(8).toString('hex')}` });
  const store = await openPostgresStore({ pool, migrate: true, key: randomBytes(32) });
  return { pool, store };
}

function makeRoster(prefix, count = 400) {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    return {
      'ID de Usuario (no modificar)': `${prefix}-${number}`,
      Nombres: `Importado ${prefix} ${number}`,
      Apellidos: 'Estudiante Sintético',
      Rol: 'Estudiante',
      Curso: '1° Básico',
      Sección: 'A',
      'Fecha Nacimiento': '2012-05-10',
      Email: `${prefix.toLowerCase()}-${number}@synthetic.invalid`,
      Teléfono: '+56900000000',
      Género: 'X',
      'Código Barra': `${prefix}-BAR-${number}`,
      Contraseña: 'esta-columna-no-se-importa'
    };
  });
}

test('PGlite pool mantiene una transacción exclusiva frente a consultas externas', async () => {
  const pool = await createPglitePool({ dataDir: `memory://pura-matricula-lock-${randomBytes(8).toString('hex')}` });
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    let finished = false;
    const outside = pool.query('SELECT 42 AS answer').then(value => { finished = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(finished, false, 'pool.query no debe intercalarse dentro de BEGIN');
    await client.query('COMMIT');
    client.release();
    assert.equal((await outside).rows[0].answer, 42);
  } finally {
    await pool.end();
  }
});

test('Aceptación HTTP con PostgreSQL PGlite, importación escolar y respaldo lógico', async t => {
  const { store } = await openQa();
  const directory = mkdtempSync(join(tmpdir(), 'pura-matricula-pg-'));
  const app = await createApp({ store, demo: true });
  const data = await seedDemo(store, app.svc, 400);
  await ensureImportFields(store);
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close();
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const login = async username => {
    const response = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: loginPassword })
    });
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: (await response.json()).csrf };
  };
  const request = async (session, path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, data: type.startsWith('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };

  const admin = await login('demo-secretaria');
  const teacher = await login('demo-profesor');
  const courses = await store.db.prepare('SELECT * FROM courses WHERE year=? ORDER BY name').all(2026);
  const futureCourses = await store.db.prepare('SELECT * FROM courses WHERE year=? ORDER BY name').all(2027);
  const record = data.records[0];

  await t.test('400 fichas, búsqueda normalizada, páginas independientes y cursos privados', async () => {
    const first = await request(admin, '/api/records?year=2026&page=1&pageSize=25');
    const second = await request(admin, '/api/records?year=2026&page=2&pageSize=25');
    assert.equal(first.status, 200);
    assert.equal(first.data.total, 400);
    assert.equal(first.data.items.length, 25);
    assert(!second.data.items.some(row => first.data.items.some(other => row.id === other.id)));
    assert.equal((await request(admin, '/api/records?q=DEMO001')).data.total, 1);
    const teacherRecord = await request(teacher, `/api/records/${record.id}`);
    assert.equal(teacherRecord.status, 200);
    assert.equal(Object.hasOwn(teacherRecord.data.data, 'allergies'), false);
    assert.equal((await request(teacher, `/api/records/${data.records[1].id}`)).status, 403);
  });

  await t.test('dos escrituras concurrentes: una gana y la otra conserva conflicto 409', async () => {
    const before = await request(admin, `/api/records/${record.id}`);
    const responses = await Promise.all(['A', 'B'].map(value => request(admin, `/api/records/${record.id}`, 'PATCH', { version: before.data.version, data: { observations: `PostgreSQL concurrente ${value}` } })));
    assert.deepEqual(responses.map(item => item.status).sort(), [200, 409]);
    assert.equal(responses.find(item => item.status === 409).data.code, 'VERSION_CONFLICT');
  });

  let pdfBytes;
  let signedId;
  await t.test('PDF, adjunto firmado cifrado en blob privado y descarga autorizada', async () => {
    const pdf = await request(admin, `/api/records/${record.id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
    pdfBytes = pdf.data;
    const before = await request(admin, `/api/records/${record.id}`);
    const uploaded = await request(admin, `/api/records/${record.id}/attachments`, 'POST', { version: before.data.version, kind: 'signed', name: 'firma-pg.pdf', content: pdfBytes.toString('base64') });
    assert.equal(uploaded.status, 201);
    signedId = uploaded.data.id;
    const blob = await store.db.prepare('SELECT content FROM attachment_blobs WHERE id=?').get(signedId);
    assert(blob && !String(blob.content).includes(pdfBytes.toString('base64')));
    assert.deepEqual((await request(admin, `/api/attachments/${signedId}`)).data, pdfBytes);
  });

  await t.test('plantilla versionada y renovación anual mantienen separado el año actual', async () => {
    const latest = await store.db.prepare('SELECT fields FROM templates ORDER BY id DESC LIMIT 1').get();
    const fields = JSON.parse(latest.fields);
    const created = await request(admin, '/api/templates', 'POST', { name: 'Versión PostgreSQL sintética', fields: [...fields, { key: 'pgQaQuestion', label: 'Pregunta PostgreSQL QA', section: 'adicionales', type: 'text', sensitive: true }] });
    assert.equal(created.status, 201);
    const source = data.records[3];
    assert.equal(futureCourses.length, 8);
    const renewed = await request(admin, `/api/records/${source.id}/renew`, 'POST', { version: source.version, courseId: futureCourses[0].id });
    assert.equal(renewed.status, 201, JSON.stringify(renewed.data));
    assert.equal(renewed.data.year, 2027);
    assert.equal(renewed.data.status, 'draft');
    assert.equal((await request(admin, `/api/records/${source.id}`)).data.year, 2026);
  });

  await t.test('padrón sintético en dos lotes de 400 IDs ERP, aplicación transaccional', async () => {
    const firstPreview = await request(admin, '/api/import/school/preview', 'POST', { year: 2026, name: 'padron-a.xlsx', workbook: { Usuarios: makeRoster('ERP-A') } });
    assert.equal(firstPreview.status, 200);
    assert.equal(firstPreview.data.rows.length, 400);
    assert.equal(firstPreview.data.canImport, true);
    const firstCommit = await request(admin, '/api/import/school/commit', 'POST', { year: 2026, rows: firstPreview.data.rows, ticket: firstPreview.data.ticket, coursesToCreate: firstPreview.data.coursesToCreate, createCourses: false });
    assert.equal(firstCommit.status, 201);
    assert.equal(firstCommit.data.count, 400);
    const secondPreview = await request(admin, '/api/import/school/preview', 'POST', { year: 2026, name: 'padron-b.xlsx', workbook: { Usuarios: makeRoster('ERP-B') } });
    assert.equal(secondPreview.data.canImport, true);
    const secondCommit = await request(admin, '/api/import/school/commit', 'POST', { year: 2026, rows: secondPreview.data.rows, ticket: secondPreview.data.ticket, coursesToCreate: secondPreview.data.coursesToCreate, createCourses: false });
    assert.equal(secondCommit.status, 201);
    assert.equal(secondCommit.data.count, 400);
    assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n, 1201);
  });

  await t.test('auditoría encadenada y filas inmutables', async () => {
    assert.equal(await store.verifyAudit(), true);
    await assert.rejects(() => store.db.exec('DELETE FROM audit'));
    await assert.rejects(() => store.db.exec('UPDATE audit SET action=\'alterado\''));
    assert.equal(await store.verifyAudit(), true);
  });

  await t.test('respaldo DSMBACK2, restauración local y descifrado de datos', async () => {
    const backup = await request(admin, '/api/backup', 'POST', { password: backupPassword });
    assert.equal(backup.status, 200);
    assert.equal(backup.data.subarray(0, 8).toString(), 'DSMBACK2');
    const restoreDir = mkdtempSync(join(tmpdir(), 'pura-matricula-pg-restore-'));
    rmSync(restoreDir, { recursive: true, force: true });
    const restored = restoreBackup(backup.data, backupPassword, restoreDir);
    assert.equal(restored.records, 1201);
    assert.equal(restored.source, 'postgres');
    const local = openStore(restoreDir);
    try {
      assert.equal(local.verifyAudit(), true);
      assert.equal(local.db.prepare('SELECT count(*) AS n FROM records').get().n, 1201);
      const restoredData = JSON.parse(local.unseal(local.db.prepare('SELECT data FROM records WHERE id=?').get(record.id).data));
      assert.equal(restoredData.names, 'Estudiante de prueba 001');
    } finally {
      local.close();
      rmSync(restoreDir, { recursive: true, force: true });
    }
  });

  await t.test('throttling de inicio de sesión persiste en PostgreSQL', async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'demo-secretaria', password: 'clave-incorrecta' }) });
      assert.equal(response.status, 401);
    }
    const blocked = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'demo-secretaria', password: 'clave-incorrecta' }) });
    assert.equal(blocked.status, 429);
    const attempts = await store.db.prepare('SELECT count FROM login_attempts').all();
    assert.equal(Number(attempts[0].count), 10);
  });

  console.log('Evidencia PostgreSQL sintética: 400 fichas base + 800 filas ERP, respaldo DSMBACK2 y cadena de auditoría verificada.');
});
