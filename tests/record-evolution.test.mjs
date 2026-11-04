import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAsyncStore } from '../src/async-sqlite.mjs';
import { createService } from '../src/service.mjs';
import { baseFields, permissions } from '../src/fields.mjs';
import { ensureImportFields, sourceFields } from '../src/import-fields.mjs';

const admin = { id: 'qa-evolution-admin', permissions, allCourses: true, courses: [] };
const student = (identifier = 'EVOLUTION-001') => ({ names: 'Alumno ficticio', surname: 'Prueba', secondSurname: 'Sintética', identifierType: 'Otro', identifier });

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'matricula-evolution-'));
  const store = openAsyncStore(directory), svc = createService(store);
  const course = await svc.createCourse(admin, { year: 2026, name: '1° Básico A' });
  return { store, svc, course, directory, close: async () => { await store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('alta y edición manual conservan comunas y procedencia después de reabrir', async () => {
  const f = await fixture();
  try {
    await ensureImportFields(f.store);
    const data = { ...student(), commune: 'Comuna ficticia', guardianCommune: 'Comuna del apoderado', alternateCommune: 'Comuna suplente', sourceSheet: '1° Básico', sourceRow: '6', sourceContactPhone: 'Contacto ficticio', sourceContactEmail: 'ficticio@example.invalid', sourceAddress: 'Dirección de origen', sourceCommune: 'Comuna de origen', sourceGuardianNames: 'Persona ficticia', sourceGuardianSurname: 'Apoderado', sourceGuardianSecondSurname: 'Prueba' };
    const record = await f.svc.create(admin, { courseId: f.course.id, year: 2026, data });
    const saved = await f.svc.patch(admin, record.id, { version: record.version, data: { commune: 'Comuna corregida', guardianPhone: 'Teléfono corregido' } });
    assert.equal(saved.data.commune, 'Comuna corregida');
    assert.equal(saved.data.sourceAddress, data.sourceAddress);
    const reopened = openAsyncStore(f.directory);
    try {
      const detail = await createService(reopened).detail(admin, record.id);
      assert.equal(detail.data.guardianCommune, data.guardianCommune);
      assert.equal(detail.data.sourceRow, '6');
      assert.equal(detail.data.guardianPhone, 'Teléfono corregido');
      assert.equal(detail.revisions.length, 2);
      assert.ok(await reopened.verifyAudit());
    } finally { await reopened.close(); }
    await assert.rejects(() => f.svc.create(admin, { courseId: f.course.id, year: 2026, data }), error => error.status === 409 && error.code === 'DUPLICATE');
  } finally { await f.close(); }
});

test('profesor edita datos visibles pero no cambia RUN o tipo de identificación', async () => {
  const f = await fixture();
  try {
    const record = await f.svc.create(admin, { courseId: f.course.id, year: 2026, data: { ...student(), identifierType: 'RUN', identifier: '11111111-1' } });
    const teacher = { id: 'qa-evolution-teacher', permissions: ['read', 'write'], allCourses: false, courses: [f.course.id] };
    const saved = await f.svc.patch(teacher, record.id, { version: 1, data: { ...record.data, address: 'Domicilio ficticio editado' } });
    assert.equal(saved.version, 2);
    await assert.rejects(() => f.svc.patch(teacher, record.id, { version: 2, data: { identifier: '22222222-2' } }), error => error.status === 403 && error.code === 'IDENTITY_PERMISSION_REQUIRED');
    await assert.rejects(() => f.svc.patch(teacher, record.id, { version: 2, data: { identifierType: 'Otro' } }), error => error.status === 403 && error.code === 'IDENTITY_PERMISSION_REQUIRED');
    assert.equal((await f.svc.detail(admin, record.id)).version, 2);
    const allowed = await f.svc.patch(admin, record.id, { version: 2, data: { identifier: '22222222-2' } });
    assert.equal(allowed.data.identifier, '22222222-2');
    const another = await f.svc.create(admin, { courseId: f.course.id, year: 2026, data: { ...student(), identifierType: 'RUN', identifier: '33333333-3' } });
    await assert.rejects(() => f.svc.patch(admin, another.id, { version: 1, data: { identifier: allowed.data.identifier } }), error => error.status === 409 && error.code === 'DUPLICATE');
  } finally { await f.close(); }
});

test('regularizar identidad no reescribe la ficha anual ni revisiones anteriores', async () => {
  const f = await fixture();
  try {
    const original = await f.svc.create(admin, { courseId: f.course.id, year: 2026, data: student() });
    const futureCourse = await f.svc.createCourse(admin, { year: 2027, name: f.course.name });
    const renewed = await f.svc.renew(admin, original.id, { version: 1, courseId: futureCourse.id });
    const corrected = await f.svc.patch(admin, renewed.id, { version: 1, data: { identifier: 'EVOLUTION-CORRECTED' } });
    assert.equal(corrected.data.identifier, 'EVOLUTION-CORRECTED');
    assert.equal((await f.svc.detail(admin, original.id)).data.identifier, 'EVOLUTION-001');
    const snapshot = await f.store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=1').get(renewed.id);
    assert.equal(JSON.parse(f.store.unseal(snapshot.snapshot)).data.identifier, 'EVOLUTION-001');
    const currentHash = await f.store.db.prepare('SELECT identity_hash FROM students WHERE id=?').get(original.studentId);
    assert.equal(currentHash.identity_hash, f.store.mac('Otro:EVOLUTIONCORRECTED'));
  } finally { await f.close(); }
});

test('actualizar plantilla preserva antecedentes, reserva, versión anterior y preguntas aprobadas', async () => {
  const f = await fixture();
  try {
    const newBase = new Set(['commune', 'guardianCommune', 'alternateCommune']);
    const legacyFields = [...baseFields.filter(field => !newBase.has(field.key)), ...sourceFields.slice(0, 5), { key: 'approvedQuestion', label: 'Pregunta anterior', section: 'adicionales', type: 'text', sensitive: false }];
    const legacy = await f.store.db.prepare('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?)').run('Plantilla ficticia anterior', JSON.stringify(legacyFields), new Date().toISOString());
    const legacyId = Number(legacy.lastInsertRowid);
    const record = await f.svc.create(admin, { courseId: f.course.id, year: 2026, templateId: legacyId, data: { ...student(), allergies: 'Antecedente ficticio reservado', approvedQuestion: 'Respuesta conservada' } });
    const beforeRevision = await f.store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=1').get(record.id);
    const next = await ensureImportFields(f.store);
    assert.ok(next.id > legacyId);
    assert.equal((await f.svc.detail(admin, record.id)).templateId, legacyId);
    assert.equal((await ensureImportFields(f.store)).id, next.id);
    const operator = { id: 'qa-evolution-operator', permissions: ['read', 'write', 'enroll'], allCourses: false, courses: [f.course.id] };
    const upgraded = await f.svc.upgradeTemplate(operator, record.id, { version: 1 });
    assert.equal(upgraded.version, 2);
    assert.equal(upgraded.templateId, next.id);
    assert.equal(upgraded.data.approvedQuestion, 'Respuesta conservada');
    assert.equal(Object.hasOwn(upgraded.data, 'allergies'), false);
    assert.equal(Object.hasOwn(upgraded.data, 'commune'), false);
    const current = await f.svc.detail(admin, record.id);
    assert.equal(current.data.allergies, 'Antecedente ficticio reservado');
    assert.equal(current.events[0].action, 'template.upgrade');
    assert.equal((await f.store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=1').get(record.id)).snapshot, beforeRevision.snapshot);
    assert.deepEqual(JSON.parse((await f.store.db.prepare('SELECT fields FROM templates WHERE id=?').get(legacyId)).fields), legacyFields);
    const edited = await f.svc.patch(operator, record.id, { version: 2, data: { commune: 'Comuna añadida después' } });
    assert.equal(edited.data.commune, 'Comuna añadida después');
    assert.equal((await f.svc.detail(admin, record.id)).data.allergies, 'Antecedente ficticio reservado');
    assert.equal((await f.store.db.prepare('SELECT count(*) AS n FROM audit WHERE action=?').get('record.template.upgrade')).n, 1);
    assert.ok(await f.store.verifyAudit());
  } finally { await f.close(); }
});

test('actualizar plantilla rechaza permisos, conflictos, pérdida de datos y reserva rebajada', async () => {
  const f = await fixture();
  try {
    const fields = [...baseFields, { key: 'privateExtra', label: 'Antecedente ficticio', section: 'adicionales', type: 'text', sensitive: true }];
    const first = await f.svc.createTemplate(admin, { name: 'Versión ficticia inicial', fields });
    const record = await f.svc.create(admin, { courseId: f.course.id, year: 2026, templateId: first.id, data: { ...student(), privateExtra: 'Conservar reservado' } });
    const removed = await f.svc.createTemplate(admin, { name: 'Versión incompatible', fields: baseFields });
    const teacher = { id: 'qa-teacher', permissions: ['read', 'write'], allCourses: true, courses: [] };
    await assert.rejects(() => f.svc.upgradeTemplate(teacher, record.id, { version: 1 }), error => error.status === 403);
    await assert.rejects(() => f.svc.upgradeTemplate(admin, record.id, { version: 0 }), error => error.status === 409 && error.code === 'VERSION_CONFLICT');
    await assert.rejects(() => f.svc.upgradeTemplate(admin, record.id, { version: 1, templateId: first.id }), error => error.status === 409 && error.code === 'TEMPLATE_NOT_NEWER');
    await assert.rejects(() => f.svc.upgradeTemplate(admin, record.id, { version: 1, templateId: removed.id }), error => error.status === 409 && error.code === 'TEMPLATE_DATA_LOSS');
    const downgraded = await f.svc.createTemplate(admin, { name: 'Versión que quita reserva', fields: fields.map(field => field.key === 'privateExtra' ? { ...field, sensitive: false } : field) });
    await assert.rejects(() => f.svc.upgradeTemplate(admin, record.id, { version: 1, templateId: downgraded.id }), error => error.status === 409 && error.code === 'TEMPLATE_SENSITIVITY_DOWNGRADE');
    const changedType = await f.svc.createTemplate(admin, { name: 'Versión de tipo incompatible', fields: fields.map(field => field.key === 'privateExtra' ? { ...field, type: 'date' } : field) });
    await assert.rejects(() => f.svc.upgradeTemplate(admin, record.id, { version: 1, templateId: changedType.id }), error => error.status === 409 && error.code === 'TEMPLATE_FIELD_INCOMPATIBLE');
    assert.equal((await f.svc.detail(admin, record.id)).version, 1);
    await f.svc.transition(admin, record.id, { version: 1, action: 'withdraw', reason: 'Retiro ficticio de prueba', date: '2026-11-03' });
    await assert.rejects(() => f.svc.upgradeTemplate(admin, record.id, { version: 2 }), error => error.status === 409);
  } finally { await f.close(); }
});

test('curso equivalente por mayúsculas, acento, ordinal o espacios no se duplica', async () => {
  const f = await fixture();
  try {
    for (const name of ['1° básico a', ' 1º BASICO A ', '1 basico-a']) await assert.rejects(() => f.svc.createCourse(admin, { year: 2026, name }), error => error.status === 409 && error.code === 'DUPLICATE_COURSE');
    const concurrent = await Promise.allSettled(['Pre-Kínder', 'pre kinder'].map(name => f.svc.createCourse(admin, { year: 2026, name })));
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(result => result.status === 'rejected' && result.reason.code === 'DUPLICATE_COURSE').length, 1);
    assert.equal((await f.store.db.prepare('SELECT count(*) AS n FROM courses WHERE year=?').get(2026)).n, 2);
    const nextYear = await f.svc.createCourse(admin, { year: 2027, name: '1 BASICO A' });
    assert.equal(nextYear.year, 2027);
  } finally { await f.close(); }
});
