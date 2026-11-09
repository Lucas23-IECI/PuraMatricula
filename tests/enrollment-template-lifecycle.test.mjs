import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openAsyncStore } from '../src/async-sqlite.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';
import { createPglitePool } from './helpers/pglite-pool.mjs';
import { createService } from '../src/service.mjs';
import { ensureImportFields } from '../src/import-fields.mjs';
import { permissions } from '../src/fields.mjs';

const admin = { id: 'qa-lifecycle-admin', permissions, allCourses: true, courses: [] };
const operator = courses => ({ id: 'qa-operator', permissions: ['read', 'write', 'enroll'], allCourses: false, courses: courses.map(course => course.id) });
const status = (expected, code) => error => error.status === expected && (!code || error.code === code);
const recordInput = (course, identifier, extra = {}) => ({ year: course.year, courseId: course.id, data: { names: 'Alumno ficticio', surname: 'Prueba', identifierType: 'Otro', identifier, ...extra } });
const option = (key, label, sensitive = false) => ({ key, label, section: 'adicionales', type: 'text', sensitive });

async function fixture(t, postgres = false) {
  let store;
  if (postgres) {
    const pool = await createPglitePool({ dataDir: `memory://lifecycle-${randomBytes(8).toString('hex')}` });
    t.after(async () => { if (store) await store.close(); else await pool.end(); });
    store = await openPostgresStore({ pool, migrate: true, key: randomBytes(32) });
  } else {
    const directory = mkdtempSync(join(tmpdir(), 'matricula-lifecycle-'));
    t.after(async () => { await store?.close(); rmSync(directory, { recursive: true, force: true }); });
    store = openAsyncStore(directory);
  }
  const svc = createService(store);
  const course = await svc.createCourse(admin, { year: 2026, name: '1° Básico A' });
  const other = await svc.createCourse(admin, { year: 2026, name: '1° Básico B' });
  const next = await svc.createCourse(admin, { year: 2027, name: '2° Básico A' });
  return { store, svc, course, other, next };
}

async function withdraw(svc, record, date = '2026-09-15') {
  return svc.transition(admin, record.id, { action: 'withdraw', version: record.version, date, reason: 'Motivo ficticio de retiro reservado' });
}

async function templateDraft(store, extra = []) {
  const latest = await store.db.prepare('SELECT id,fields FROM templates ORDER BY id DESC LIMIT 1').get();
  return { baseTemplateId: Number(latest.id), name: 'Plantilla ficticia revisada', fields: [...JSON.parse(latest.fields), ...extra] };
}

test('reingreso del mismo año conserva alumno, ficha, retiro y revisión; valida fechas, permisos y concurrencia', async t => {
  const { store, svc, course, other } = await fixture(t);
  const record = await svc.create(admin, recordInput(course, 'REENTRY-SAME', { allergies: 'Antecedente reservado ficticio' }));
  const reentry = { action: 'reenter', date: '2026-09-17', courseId: other.id, reason: 'Motivo ficticio de reingreso reservado' };
  await assert.rejects(() => svc.transition(admin, record.id, { ...reentry, version: 1 }), status(409, 'REENTRY_NOT_WITHDRAWN'));
  const withdrawn = await withdraw(svc, record);
  const command = { ...reentry, version: withdrawn.version };
  for (const date of ['2026-09-14', '2026-02-30', '2027-09-17']) await assert.rejects(() => svc.transition(admin, record.id, { ...command, date }), status(400, 'REENTRY_DATE_INVALID'));
  await assert.rejects(() => svc.transition(admin, record.id, { ...command, reason: '  ' }), status(400));
  await assert.rejects(() => svc.transition(operator([course]), record.id, command), status(403));
  await assert.rejects(() => svc.transition(operator([other]), record.id, command), status(403));
  const prior = await store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=?').get(record.id, withdrawn.version);
  const user = operator([course, other]);
  const results = await Promise.allSettled([svc.transition(user, record.id, command), svc.transition(user, record.id, command)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(status(409, 'VERSION_CONFLICT')(results.find(result => result.status === 'rejected').reason));
  const current = await svc.detail(user, record.id);
  assert.equal(current.id, record.id);
  assert.equal(current.studentId, record.studentId);
  assert.equal(current.status, 'enrolled');
  assert.equal(current.courseId, other.id);
  assert.equal(current.version, withdrawn.version + 1);
  assert.equal(current.annualHistory.length, 1);
  assert.equal(current.data.allergies, undefined);
  assert.equal(current.events.filter(event => event.action === 'reenter').length, 1);
  const movement = current.events.find(event => event.action === 'reenter');
  assert.deepEqual(movement.detail, { fromCourse: course.id, toCourse: other.id, date: reentry.date });
  assert.equal(current.events.find(event => event.action === 'withdraw').detail.reason, undefined);
  assert.equal((await svc.detail(admin, record.id)).events.find(event => event.action === 'reenter').detail.reason, reentry.reason);
  assert.deepEqual(await store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=?').get(record.id, withdrawn.version), prior);
  assert.equal(JSON.parse(store.unseal(prior.snapshot)).status, 'withdrawn');
  const audit = await store.db.prepare('SELECT detail FROM audit WHERE action=?').all('enrollment.reenter');
  assert.equal(audit.length, 1);
  assert.ok(!JSON.stringify(audit).includes(reentry.reason));
  assert.ok(await store.verifyAudit());
});

test('reingreso en año posterior prepara un borrador, sin autorización ni adjunto del año retirado', async t => {
  const { store, svc, course, next } = await fixture(t);
  const record = await svc.create(admin, recordInput(course, 'REENTRY-LATER', {
    guardianPhone: 'Contacto ficticio', imagesDecision: 'Sí', imagesDate: '2026-03-01', imagesResponsible: 'Apoderado ficticio', imagesVersion: 'texto ficticio', birthCertificate: 'Sí', withdrawalDocuments: 'Constancia ficticia'
  }));
  const attachment = await svc.addAttachment(admin, record.id, { version: 1, kind: 'signed', name: 'firma-ficticia.pdf', content: Buffer.from('%PDF-1.7\nDocumento de prueba').toString('base64') });
  const withdrawn = await withdraw(svc, { ...record, version: attachment.version });
  await assert.rejects(() => svc.renew(admin, record.id, { version: withdrawn.version, courseId: next.id }), status(409));
  const command = { action: 'reenter', version: withdrawn.version, courseId: next.id, date: '2027-03-01', reason: 'Vuelta ficticia en otro año' };
  const draft = await svc.transition(admin, record.id, command);
  assert.notEqual(draft.id, record.id);
  assert.equal(draft.studentId, record.studentId);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.year, next.year);
  assert.equal(draft.data.guardianPhone, 'Contacto ficticio');
  for (const field of ['imagesDecision', 'imagesDate', 'imagesResponsible', 'imagesVersion', 'birthCertificate', 'withdrawalDocuments']) assert.equal(draft.data[field], undefined);
  const detail = await svc.detail(admin, draft.id);
  assert.deepEqual(detail.attachments, []);
  assert.deepEqual(detail.events[0].detail, { sourceId: record.id, sourceYear: course.year, fromCourse: course.id, toCourse: next.id, date: command.date, reason: command.reason, prepared: true });
  assert.equal((await svc.detail(admin, record.id)).status, 'withdrawn');
  assert.equal((await svc.detail(admin, record.id)).attachments.length, 1);
  assert.equal((await svc.detail(admin, record.id)).version, withdrawn.version);
  await assert.rejects(() => svc.transition(admin, record.id, command), status(409, 'DUPLICATE_YEAR'));
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM students').get()).n, 1);
});

test('preview no cambia la plantilla; publicación firmada, campos ocultos e historia permanecen consistentes', async t => {
  const { store, svc, course, next } = await fixture(t);
  const previous = await svc.create(admin, recordInput(course, 'BEFORE-TEMPLATE'));
  const proposal = await templateDraft(store, [option('extraVisible', 'Pregunta ficticia'), option('extraReserved', 'Reserva ficticia', true)]);
  await assert.rejects(() => svc.previewTemplate(operator([course]), proposal), status(403));
  const preview = await svc.previewTemplate(admin, proposal);
  assert.deepEqual(preview.changes.added, ['extraVisible', 'extraReserved']);
  assert.equal((await store.db.prepare('SELECT max(id) AS id FROM templates').get()).id, proposal.baseTemplateId);
  await assert.rejects(() => svc.publishTemplate(admin, proposal), status(409, 'TEMPLATE_PREVIEW_REQUIRED'));
  await assert.rejects(() => svc.publishTemplate(admin, { ...proposal, name: 'Cambio después de la vista previa', previewToken: preview.previewToken }), status(409, 'TEMPLATE_PREVIEW_REQUIRED'));
  await assert.rejects(() => svc.publishTemplate({ ...admin, id: 'qa-otro-administrador' }, { ...proposal, previewToken: preview.previewToken }), status(409, 'TEMPLATE_PREVIEW_REQUIRED'));
  const first = await svc.publishTemplate(admin, { ...proposal, previewToken: preview.previewToken });
  assert.equal((await svc.detail(admin, previous.id)).templateId, proposal.baseTemplateId);
  const record = await svc.create(admin, recordInput(course, 'DURING-TEMPLATE', { extraVisible: 'Respuesta ficticia conservada', extraReserved: 'Respuesta reservada' }));
  assert.equal(record.templateId, first.id);
  const edit = await templateDraft(store);
  const plain = edit.fields.filter(field => !['extraVisible', 'extraReserved'].includes(field.key));
  edit.fields = [...plain, option('extraReserved', 'Reserva renombrada', true), { ...option('extraVisible', 'Pregunta ficticia'), hidden: true }];
  const revised = await svc.previewTemplate(admin, edit);
  assert.deepEqual(revised.changes, { added: [], edited: ['extraReserved'], hidden: ['extraVisible'], shown: [], reordered: true });
  const published = await svc.publishTemplate(admin, revised);
  await assert.rejects(() => svc.publishTemplate(admin, revised), status(409, 'TEMPLATE_BASE_STALE'));
  assert.equal((await svc.detail(admin, record.id)).data.extraVisible, 'Respuesta ficticia conservada');
  await assert.rejects(() => svc.create(admin, recordInput(course, 'HIDDEN-NEW', { extraVisible: 'No editable' })), status(400, 'FIELD_HIDDEN'));
  const fresh = await svc.create(admin, recordInput(course, 'AFTER-TEMPLATE'));
  assert.equal(fresh.templateId, published.id);
  const upgraded = await svc.upgradeTemplate(operator([course]), record.id, { version: 1 });
  assert.equal(upgraded.data.extraVisible, undefined);
  assert.equal(upgraded.data.extraReserved, undefined);
  assert.equal(svc.getData(await svc.load(record.id)).extraVisible, 'Respuesta ficticia conservada');
  const historical = await store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=1').get(record.id);
  assert.equal(JSON.parse(store.unseal(historical.snapshot)).data.extraVisible, 'Respuesta ficticia conservada');
  await assert.rejects(() => svc.patch(admin, record.id, { version: upgraded.version, data: { extraVisible: 'No editable' } }), status(400, 'FIELD_HIDDEN'));
  const renewed = await svc.renew(admin, record.id, { version: upgraded.version, courseId: next.id });
  assert.equal(renewed.data.extraVisible, undefined);
  assert.equal(renewed.data.extraReserved, 'Respuesta reservada');
  assert.ok(await store.verifyAudit());
});

test('publicar impide cambios en campos protegidos, borrar extras y bajar su reserva', async t => {
  const { store, svc } = await fixture(t);
  await store.transaction(() => ensureImportFields(store));
  const initial = await templateDraft(store, [option('extraConfidential', 'Pregunta reservada ficticia', true)]);
  await svc.publishTemplate(admin, await svc.previewTemplate(admin, initial));
  const draft = await templateDraft(store);
  const modify = (key, value) => ({ ...draft, fields: draft.fields.map(field => field.key === key ? { ...field, ...value } : field) });
  await assert.rejects(() => svc.previewTemplate(admin, modify('names', { hidden: true })), status(400));
  await assert.rejects(() => svc.previewTemplate(admin, modify('sourceRow', { hidden: true })), status(400, 'TEMPLATE_FIELD_PROTECTED'));
  await assert.rejects(() => svc.previewTemplate(admin, { ...draft, fields: draft.fields.filter(field => field.key !== 'sourceRow') }), status(400, 'TEMPLATE_FIELD_PROTECTED'));
  await assert.rejects(() => svc.previewTemplate(admin, { ...draft, fields: [...draft.fields].reverse() }), status(400, 'TEMPLATE_FIELD_PROTECTED'));
  await assert.rejects(() => svc.previewTemplate(admin, { ...draft, fields: draft.fields.filter(field => field.key !== 'extraConfidential') }), status(400, 'TEMPLATE_FIELD_MISSING'));
  await assert.rejects(() => svc.previewTemplate(admin, modify('extraConfidential', { sensitive: false })), status(400, 'TEMPLATE_SENSITIVITY_DOWNGRADE'));
});

test('PostgreSQL: publicación simultánea y reingreso no duplican versión ni ficha', async t => {
  const { svc, store, course, next } = await fixture(t, true);
  const left = await svc.previewTemplate(admin, await templateDraft(store, [option('extraLeft', 'Pregunta ficticia A')]));
  const right = await svc.previewTemplate(admin, await templateDraft(store, [option('extraRight', 'Pregunta ficticia B')]));
  const publication = await Promise.allSettled([svc.publishTemplate(admin, left), svc.publishTemplate(admin, right)]);
  assert.equal(publication.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(status(409, 'TEMPLATE_BASE_STALE')(publication.find(result => result.status === 'rejected').reason));
  const record = await svc.create(admin, recordInput(course, 'POSTGRES-REENTRY'));
  const withdrawn = await withdraw(svc, record);
  const reenter = { action: 'reenter', version: withdrawn.version, courseId: next.id, date: '2027-03-01', reason: 'Reingreso ficticio' };
  const results = await Promise.allSettled([svc.transition(admin, record.id, reenter), svc.transition(admin, record.id, reenter)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(status(409, 'DUPLICATE_YEAR')(results.find(result => result.status === 'rejected').reason));
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n, 2);
  assert.ok(await store.verifyAudit());
});
