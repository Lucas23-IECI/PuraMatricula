import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.mjs';
import { openAsyncStore } from '../src/async-sqlite.mjs';
import { ensureImportFields, sourceFields } from '../src/import-fields.mjs';
import { createSchoolImport } from '../src/school-import-service.mjs';
import { makeXlsx } from '../src/report-office.mjs';

const user = { id: 'qa-import-user', permissions: ['import', 'write', 'enroll', 'sensitive'], allCourses: true, courses: [] };
const svc = { requirePermission() {}, can() { return true; } };
const workbook = {
  Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Apellidos', 'Rol', 'Curso', 'Sección', 'Teléfono', 'Género', 'Código Barra', 'Contraseña'],
    ['erp-qa-001', '11111111', '1', 'Ana', 'Pérez Soto', 'Estudiante', '1° Básico', 'A', '+56911112222', 'F', 'BAR-001', 'nunca-importar']
  ]
};

function openQaStore() {
  const dir = mkdtempSync(join(tmpdir(), 'pura-matricula-import-'));
  const store = openStore(dir);
  return { dir, store };
}

function checkDigit(body) {
  let sum = 0; let multiplier = 2;
  for (const digit of [...String(body)].reverse()) { sum += Number(digit) * multiplier; multiplier = multiplier === 7 ? 2 : multiplier + 1; }
  const value = 11 - (sum % 11);
  return value === 11 ? '0' : value === 10 ? 'K' : String(value);
}

test('ensureImportFields crea una versión nueva y conserva la plantilla anterior', () => {
  const { dir, store } = openQaStore();
  try {
    const before = store.db.prepare('SELECT count(*) AS count FROM templates').get().count;
    const created = ensureImportFields(store);
    const after = store.db.prepare('SELECT count(*) AS count FROM templates').get().count;
    assert.equal(after, before + 1);
    assert.ok(sourceFields.every(field => created.fields.some(candidate => candidate.key === field.key)));
    const first = store.db.prepare('SELECT fields FROM templates ORDER BY id LIMIT 1').get();
    assert.equal(JSON.parse(first.fields).some(field => field.key === 'sourceBarcode'), false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('preview no escribe, propone curso con sección y filtra credenciales', async () => {
  const { dir, store } = openQaStore();
  try {
    ensureImportFields(store);
    const importer = createSchoolImport(store, svc);
    const beforeTemplates = store.db.prepare('SELECT count(*) AS count FROM templates').get().count;
    const beforeCourses = store.db.prepare('SELECT count(*) AS count FROM courses').get().count;
    const result = await importer.preview(user, { workbook, year: 2026, courses: [] });
    assert.equal(result.canImport, false);
    assert.equal(result.rows.length, 1);
    assert.equal(result.coursesToCreate[0].name, '1° Básico A');
    assert.equal(result.rows[0].courseId, null);
    assert.ok(result.ticket);
    assert.equal(result.rows[0].data.studentPhone, '+56911112222');
    assert.equal(result.rows[0].data.sourceBarcode, 'BAR-001');
    assert.equal(Object.hasOwn(result.rows[0].data, 'password'), false);
    assert.equal(JSON.stringify(result).includes('nunca-importar'), false);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM templates').get().count, beforeTemplates);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM courses').get().count, beforeCourses);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('la selección IPE está ligada al mismo archivo, año, cuenta y mapeo y solo escribe al confirmar', async () => {
  const { dir, store } = openQaStore();
  const sheet='KINDER', headers=['Nombres (Estudiante)','Apellido Paterno (Estudiante)','RUT (Estudiante)'];
  const content=(body)=>Buffer.from(makeXlsx([{ name:sheet, headers, rows:[['Estudiante de prueba','Sintético QA',`${body}-${checkDigit(body.replaceAll('.',''))}`]] }])).toString('base64');
  const input={year:2026,name:'sintetico.xlsx',content:content('100.001.071')};
  const possibleIpe=`100.001.071-${checkDigit(100001071)}`;
  const confirmedIpeRows=[{sheet,row:2}];
  try {
    ensureImportFields(store);
    store.db.prepare('INSERT INTO courses(id,year,name) VALUES(?,?,?)').run('qa-course-ipe',2026,'Kínder');
    const importer=createSchoolImport(store,svc);
    const initial=await importer.preview(user,input);
    assert.match(initial.ipeConfirmationToken,/^[0-9a-f]{64}$/);
    assert.equal(initial.errors[0].reason,'possibleIpe');
    assert.equal(initial.ticket,null);
    const selected={...input,ipeConfirmationToken:initial.ipeConfirmationToken,confirmedIpeRows};
    for(const [account,attempt] of [[user,{...selected,ipeConfirmationToken:undefined}],
      [user,{...selected,content:content('100.001.072')}],[user,{...selected,year:2027}],
      [{...user,id:'otra-cuenta-qa'},selected],[user,{...selected,columnMapping:{identifier:headers[2]}}],
      [user,{...selected,sheetMappings:{[sheet]:{headerRow:1}}}]]){
      const stale=await importer.preview(account,attempt);
      assert.equal(stale.ticket,null);
      assert.equal(stale.canImport,false);
      assert.ok(stale.errors.some(error=>error.code==='IPE_CONFIRMATION_INVALID'));
      assert.ok(stale.errors.some(error=>error.reason==='possibleIpe'));
      assert.deepEqual(stale.confirmedIpeRows,[]);
    }
    const preview=await importer.preview(user,{...selected,contactOwner:'guardian',sheetMappings:{[sheet]:{courseId:'qa-course-ipe'}}});
    assert.equal(preview.ipeConfirmationToken,initial.ipeConfirmationToken);
    assert.deepEqual(preview.confirmedIpeRows,confirmedIpeRows);
    assert.equal(preview.canImport,true);
    assert.equal(preview.rows[0].data.identifier,possibleIpe);
    assert.equal(preview.rows[0].data.identifierType,'IPE');
    assert.equal(preview.rows[0].data.sourceIdentifierType,'');
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM records').get().count,0);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM audit').get().count,0);
    const commit={year:2026,rows:preview.rows,ticket:preview.ticket};
    await assert.rejects(importer.commit(user,{...commit,rows:[{...preview.rows[0],ipeConfirmed:false}]}),error=>error.code==='IMPORT_TICKET_MISMATCH');
    assert.equal((await importer.commit(user,commit)).created,1);
    const data=JSON.parse(store.unseal(store.db.prepare('SELECT data FROM records').get().data));
    assert.equal(data.identifier,possibleIpe);
    assert.equal(data.identifierType,'IPE');
    const event=JSON.parse(store.unseal(store.db.prepare("SELECT detail FROM events WHERE action='imported'").get().detail));
    assert.equal(event.ipeConfirmed,true);
    assert.equal(event.sourceRow,2);
    assert.equal(store.verifyAudit(),true);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test('commit requiere creación explícita, crea curso y ficha con procedencia ERP', async () => {
  const { dir, store } = openQaStore();
  try {
    ensureImportFields(store);
    const importer = createSchoolImport(store, svc);
    const preview = await importer.preview(user, { workbook, year: 2026, courses: [] });
    await assert.rejects(() => importer.commit(user, { year: 2026, rows: preview.rows, ticket: preview.ticket, coursesToCreate: preview.coursesToCreate }), /creación de los cursos faltantes/);
    const committed = await importer.commit(user, {
      year: 2026, rows: preview.rows, ticket: preview.ticket,
      coursesToCreate: preview.coursesToCreate, createCourses: true
    });
    assert.equal(committed.count, 1);
    const course = store.db.prepare('SELECT * FROM courses WHERE year=2026').get();
    const student = store.db.prepare('SELECT origin,origin_id FROM students').get();
    const record = store.db.prepare('SELECT year,course_id,status FROM records').get();
    assert.equal(course.name, '1° Básico A');
    assert.equal(student.origin, 'ERP_USUARIOS');
    assert.equal(student.origin_id, 'erp-qa-001');
    assert.equal(record.year, 2026);
    assert.equal(record.status, 'draft');
    assert.equal(store.verifyAudit(), true);
    const auditActions = store.db.prepare('SELECT action FROM audit ORDER BY id').all().map(row => row.action);
    assert.ok(auditActions.includes('course.create.import'));
    assert.ok(auditActions.includes('import.commit.erp'));
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('preview retiene ticket solo para cursos pendientes y bloquea fecha o campo reservado', async () => {
  const { dir, store } = openQaStore();
  try {
    ensureImportFields(store);
    const importer = createSchoolImport(store, svc);
    const noSensitive = { ...user, permissions: ['import', 'write', 'enroll'] };
    const noSensitiveImporter = createSchoolImport(store, { requirePermission() {}, can(_account, permission) { return permission !== 'sensitive'; } });
    const reserved = await noSensitiveImporter.preview(noSensitive, { workbook, year: 2026, courses: [] });
    assert.ok(reserved.errors.some(error => error.code === 'SENSITIVE_PERMISSION_REQUIRED'));
    assert.equal(reserved.ticket, null);
    const badDate = { Usuarios: [
      ['ID de Usuario (no modificar)', 'Nombres', 'Apellidos', 'Fecha Nacimiento', 'Rol', 'Curso'],
      ['erp-date-bad', 'Ana', 'Pérez', '31/02/2020', 'Estudiante', '1° Básico']
    ] };
    const dateResult = await importer.preview(user, { workbook: badDate, year: 2026, courses: [] });
    assert.ok(dateResult.errors.some(error => error.code === 'FECHA_INVALIDA'));
    assert.equal(dateResult.ticket, null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('previsualiza un padrón de 390 filas sin mezclar cursos, identificación y duplicados ni confirmar parcialmente', async () => {
  const { dir, store } = openQaStore();
  try {
    ensureImportFields(store);
    const importer = createSchoolImport(store, svc);
    const header = ['Nombres (Estudiante)', 'Apellido Paterno (Estudiante)', 'RUT (Estudiante)'];
    const valid = Array.from({length:323}, (_,i) => {
      const body = 17000000+i;
      return [`Estudiante de prueba ${i}`, 'Sintético QA', `${body}-${checkDigit(body)}`];
    });
    const possibleIpe = Array.from({length:41}, (_,i) => {
      const body = 100001000+i;
      return ['Posible IPE de prueba', 'Sintético QA', `${body}-${checkDigit(body)}`];
    });
    const invalidDv = Array.from({length:19}, (_,i) => {
      const body = 18000000+i;
      return ['Dígito de prueba', 'Sintético QA', `${body}-${checkDigit(body)==='0'?'1':'0'}`];
    });
    const otherFormats = Array.from({length:5}, (_,i) => ['Formato de prueba', 'Sintético QA', `PRUEBA-${i}`]);
    const mixed = {
      '1° Básico': [header,...valid,...possibleIpe,...invalidDv,...otherFormats],
      '2° Básico': [header,valid[0],valid[1]]
    };
    const preview = await importer.preview(user,{ workbook:mixed, year:2026 });
    assert.deepEqual(preview.summary,{
      total:323, valid:0, errors:390, warnings:0, unresolvedCourses:1,
      detectedRows:390, candidateRows:323, rejectedRows:67,
      courseIssues:323, identityIssues:65, duplicateIssues:2, otherIssues:0, possibleIpeIssues:41,
      new:323, annual:0, unchanged:0, updates:0, review:0
    });
    assert.equal(preview.coursesToCreate[0].count,323);
    assert.equal(preview.ticket,null);
    assert.equal(preview.canImport,false);
    await assert.rejects(importer.commit(user,{
      year:2026, rows:preview.rows, ticket:preview.ticket, coursesToCreate:preview.coursesToCreate, createCourses:true
    }), error => error.code==='IMPORT_TICKET_MISMATCH');
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM courses').get().count,0);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM records').get().count,0);

    store.db.prepare('INSERT INTO courses(id,year,name) VALUES(?,?,?)').run('qa-course',2026,'1° Básico');
    const withCourse = await importer.preview(user,{ workbook:mixed, year:2026 });
    assert.equal(withCourse.summary.valid,323);
    assert.equal(withCourse.summary.errors,67);
    assert.equal(withCourse.summary.courseIssues,0);
    assert.equal(withCourse.ticket,null);
    assert.equal(withCourse.canImport,false);
  } finally { store.close(); rmSync(dir,{ recursive:true, force:true }); }
});

test('commit revierte curso y primera ficha cuando una fila falla dentro de la transacción', async () => {
  const { dir, store } = openQaStore();
  const twoRows = { Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Apellidos', 'Rol', 'Curso', 'Sección'],
    ['erp-rollback-1', '11111111', '1', 'Ana', 'Pérez', 'Estudiante', '1° Básico', 'A'],
    ['erp-rollback-2', '11111112', '9', 'Luis', 'Soto', 'Estudiante', '1° Básico', 'A']
  ] };
  try {
    ensureImportFields(store);
    const importer = createSchoolImport(store, svc);
    const preview = await importer.preview(user, { workbook: twoRows, year: 2026, courses: [] });
    const originalPrepare = store.db.prepare.bind(store.db);
    let recordsInserted = 0;
    store.db.prepare = (sql) => {
      const statement = originalPrepare(sql);
      if (!/^INSERT INTO records/i.test(sql)) return statement;
      return { ...statement, run: (...args) => {
        recordsInserted += 1;
        if (recordsInserted === 2) throw new Error('synthetic row failure');
        return statement.run(...args);
      } };
    };
    await assert.rejects(() => importer.commit(user, { year: 2026, rows: preview.rows, ticket: preview.ticket, coursesToCreate: preview.coursesToCreate, createCourses: true }), /synthetic row failure/);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM courses').get().count, 0);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM students').get().count, 0);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM records').get().count, 0);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM audit').get().count, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('previsualiza y confirma 400 filas sintéticas por el adaptador async SQLite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pura-matricula-import-async-'));
  const store = openAsyncStore(dir);
  try {
    await ensureImportFields(store);
    const importer = createSchoolImport(store, svc);
    const rows = [[
      'ID de Usuario (no modificar)', 'RUT', 'DV', 'Tipo de documento', 'País emisor', 'Nombres', 'Apellidos',
      'Email', 'Teléfono', 'Rol', 'Curso', 'Sección', 'Género', 'Fecha Nacimiento', 'Nombre Usuario',
      'RUT Apoderado', 'Código Barra', 'Contraseña'
    ]];
    for (let index = 0; index < 400; index += 1) {
      const body = String(15000000 + index);
      rows.push([`erp-400-${index}`, body, checkDigit(body), 'RUN', 'CL', `Estudiante ${index}`, 'Sintético QA', `student${index}@example.test`, `+569${String(10000000 + index)}`, 'Estudiante', '1° Básico', 'A', 'F', '01/03/2014', `user-${index}`, '', `BAR-${index}`, 'omitida']);
    }
    const preview = await importer.preview(user, { workbook: { Usuarios: rows }, year: 2026, courses: [] });
    assert.equal(preview.rows.length, 400);
    assert.equal(preview.errors.length, 400); // only the unresolved course proposal is blocking
    assert.ok(preview.ticket);
    const committed = await importer.commit(user, { year: 2026, rows: preview.rows, ticket: preview.ticket, coursesToCreate: preview.coursesToCreate, createCourses: true });
    assert.equal(committed.count, 400);
    assert.equal((await store.db.prepare('SELECT count(*) AS count FROM records').get()).count, 400);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
