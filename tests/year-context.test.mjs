import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {openPostgresStore} from '../src/store-postgres.mjs';
import {createService,schoolYearRange} from '../src/service.mjs';
import {createReports} from '../src/reports.mjs';
import {createSchoolImport} from '../src/school-import-service.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';
import {permissions} from '../src/fields.mjs';
import {createPglitePool} from './helpers/pglite-pool.mjs';

const user={id:'qa-year-context',permissions,allCourses:true,courses:[]};
const names='Alumno anual',surname='Sintético';
const student=(identifier='11111111-1',extra={})=>({names,surname,identifierType:'RUN',identifier,...extra});
const workbook=(year,identifier='11111111-1',extraRows=[])=>({Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos','RUT','Curso','Año escolar'],['qa-'+identifier,names,surname,identifier,'1° Básico A',year],...extraRows]});
const confirmation=(p,extra={})=>({year:p.year,rows:p.rows,ticket:p.ticket,coursesToCreate:p.coursesToCreate,...extra});
async function fixture(t,adapter='sqlite'){
  let directory,store;
  if(adapter==='postgres'){
    const pool=await createPglitePool({dataDir:'memory://year-context-'+randomBytes(8).toString('hex')});
    store=await openPostgresStore({pool,migrate:true,key:randomBytes(32)});
  }else{directory=mkdtempSync(join(tmpdir(),'pura-year-context-'));store=openAsyncStore(directory);}
  t.after(async()=>{await store.close();if(directory){assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});}});
  const svc=createService(store),reports=createReports(store,svc);await ensureImportFields(store);
  const importer=createSchoolImport(store,svc),courses={};
  for(const year of [2019,2026,2035])courses[year]=await svc.createCourse(user,{name:'1° Básico A',year});
  return {store,svc,reports,importer,courses};
}

for(const adapter of ['sqlite','postgres']){
  test(`${adapter}: matrícula histórica, actual y futura conserva identidad e historial y filtra estadísticas`,async t=>{
    const f=await fixture(t,adapter),{svc,reports,courses}=f;
    assert.deepEqual(schoolYearRange,{min:1950,max:2100});
    const past=await svc.create(user,{year:2019,courseId:courses[2019].id,data:student()});
    const current=await svc.renew(user,past.id,{version:1,courseId:courses[2026].id});
    const future=await svc.renew(user,current.id,{version:1,courseId:courses[2035].id});
    assert.equal(current.studentId,past.studentId);assert.equal(future.studentId,past.studentId);
    assert.equal(new Set([past.id,current.id,future.id]).size,3);
    assert.deepEqual((await svc.detail(user,past.id)).annualHistory.map(row=>row.year),[2035,2026,2019]);
    for(const year of [2019,2026,2035]){
      const list=await svc.list(user,{year});assert.equal(list.total,1);assert.equal(list.items[0].year,year);
      const stats=await reports.statistics(user,{year,includeRecords:1});assert.equal(stats.total,1);assert.equal(stats.items[0].id,({2019:past,2026:current,2035:future})[year].id);
      assert.equal(stats.movements.renewed,year===2019?0:1);
      const roster=await reports.roster(user,{year},'csv');assert.equal(roster.bytes.toString('utf8').split('\n').filter(line=>line.includes(names)).length,1);
    }
    assert.equal((await reports.statistics(user,{year:2040})).total,0);
    assert.equal((await svc.list(user,{year:2040})).total,0);
    await assert.rejects(()=>svc.list(user,{year:2019,course:courses[2026].id}),e=>e.status===400&&e.code==='COURSE_YEAR_MISMATCH');
    await assert.rejects(()=>reports.statistics(user,{year:2019,course:courses[2026].id}),e=>e.status===400);
    assert.deepEqual(await svc.availableYears(user),[2035,2026,2019]);
    await svc.createCourse(user,{name:'Curso privado',year:1955});
    const reader={id:'qa-year-restricted',permissions:['read','export'],allCourses:false,courses:[courses[2019].id]};
    assert.deepEqual(await svc.availableYears(reader),[2019]);
    assert.equal((await svc.list(reader,{year:2026})).total,0);
    assert.equal((await reports.statistics(reader,{year:2026})).total,0);
    assert.deepEqual((await svc.detail(reader,past.id)).annualHistory.map(row=>row.year),[2019]);
    for(const invalid of [1949,2101,'2026e0',true,'no-year']){
      await assert.rejects(()=>svc.createCourse(user,{name:'Inválido',year:invalid}),e=>e.code==='YEAR_INVALID');
      await assert.rejects(()=>svc.list(user,{year:invalid}),e=>e.code==='YEAR_INVALID');
      await assert.rejects(()=>reports.statistics(user,{year:invalid}),e=>e.code==='YEAR_INVALID');
      await assert.rejects(()=>f.importer.preview(user,{year:invalid,workbook:workbook(2019)}),e=>e.code==='YEAR_INVALID');
    }
    assert.equal(await f.store.verifyAudit(),true);
  });

  test(`${adapter}: importar otro año requiere selección anual y conserva la persona y la ficha de origen`,async t=>{
    const {store,svc,reports,importer,courses}=await fixture(t,adapter);
    const source=await svc.create(user,{year:2026,courseId:courses[2026].id,data:student(undefined,{imagesDecision:'Sí',imagesDate:'2026-03-01',imagesResponsible:'Persona ficticia',imagesVersion:'v1',allergies:'Dato reservado del año actual'})});
    const preview=await importer.preview(user,{year:2026,workbook:workbook(2019)});
    assert.equal(preview.year,2019);assert.deepEqual(preview.yearContext,{selectedYear:2026,sourceYears:[2019],resolvedYear:2019,source:'file',conflict:true});
    assert.equal(preview.rows[0].sourceYear,2019);assert.equal(preview.rows[0].courseId,courses[2019].id);
    assert.equal(preview.rows[0].review.kind,'annual');assert.equal(preview.summary.annual,1);assert.equal(preview.summary.new,0);assert.ok(preview.canImport);
    assert.equal(preview.rows[0].review.sourceRecordId,source.id);assert.equal(preview.rows[0].review.sourceVersion,1);assert.equal(preview.rows[0].review.sourceYear,2026);
    await assert.rejects(()=>importer.commit(user,confirmation(preview)),e=>e.code==='IMPORT_SELECTION_EMPTY');
    await assert.rejects(()=>importer.commit(user,confirmation(preview,{annualIndexes:[0,0]})),e=>e.code==='IMPORT_SELECTION_INVALID');
    await assert.rejects(()=>importer.commit(user,confirmation(preview,{year:2026,annualIndexes:[0]})),e=>e.code==='COURSE_YEAR_MISMATCH');
    const forged=structuredClone(preview);forged.rows[0].review.sourceRecordId='no-revisado';
    await assert.rejects(()=>importer.commit(user,confirmation(forged,{annualIndexes:[0]})),e=>e.code==='IMPORT_TICKET_MISMATCH');
    const result=await importer.commit(user,confirmation(preview,{annualIndexes:[0]}));
    assert.equal(result.created,1);assert.equal(result.annual,1);assert.equal(result.createdStudents,0);assert.equal(result.year,2019);
    await assert.rejects(()=>importer.commit(user,confirmation(preview,{annualIndexes:[0]})),e=>e.code==='IMPORT_REVIEW_STALE');
    const annual=await svc.detail(user,result.ids[0]),original=await svc.detail(user,source.id);
    assert.equal(annual.studentId,source.studentId);assert.equal(annual.status,'draft');assert.equal(annual.version,1);assert.equal(annual.year,2019);
    assert.equal(annual.data.imagesDecision,undefined);assert.equal(annual.data.allergies,undefined);assert.deepEqual(annual.attachments,[]);
    assert.equal(annual.data.sourceSheet,'Usuarios');assert.equal(annual.data.sourceRow,'2');assert.ok(annual.events.some(event=>event.action==='import.annual'&&event.detail.sourceYear===2026));
    assert.equal(original.version,1);assert.equal(original.data.imagesDecision,'Sí');assert.equal(original.data.allergies,'Dato reservado del año actual');
    assert.equal((await store.db.prepare('SELECT count(*) AS n FROM students').get()).n,1);
    assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n,2);
    assert.equal((await reports.statistics(user,{year:2019})).total,1);assert.equal((await reports.statistics(user,{year:2026})).total,1);
    assert.equal((await importer.preview(user,{year:2026,workbook:workbook(2019)})).rows[0].review.kind,'match');
    const future=await importer.preview(user,{year:2026,workbook:workbook(2035)});
    assert.equal(future.rows[0].review.kind,'annual');await importer.commit(user,confirmation(future,{annualIndexes:[0]}));
    assert.deepEqual((await svc.detail(user,source.id)).annualHistory.map(row=>row.year),[2035,2026,2019]);
    assert.equal((await store.db.prepare('SELECT count(*) AS n FROM students').get()).n,1);assert.equal(await store.verifyAudit(),true);
  });
}

test('el archivo añade un año disponible al crear el curso y los años mixtos no escriben',async t=>{
  const {store,svc,importer}=await fixture(t),preview=await importer.preview(user,{year:2026,workbook:workbook(2005)});
  assert.equal(preview.year,2005);assert.equal(preview.rows[0].review.kind,'new');assert.equal(preview.coursesToCreate[0].year,2005);assert.ok(preview.ticket);
  await assert.rejects(()=>importer.commit(user,confirmation(preview)),e=>e.code==='COURSES_CONFIRMATION_REQUIRED');
  await importer.commit(user,confirmation(preview,{createCourses:true}));
  assert.deepEqual(await svc.availableYears(user),[2035,2026,2019,2005]);
  const count=(await store.db.prepare('SELECT count(*) AS n FROM records').get()).n;
  const mixed=await importer.preview(user,{year:2026,workbook:workbook(2019,'11111112-9',[['qa-mixed',names,surname,'11111113-8','1° Básico A',2026]])});
  assert.equal(mixed.ticket,null);assert.equal(mixed.canImport,false);assert.equal(mixed.yearContext.resolvedYear,null);assert.ok(mixed.errors.some(error=>error.code==='IMPORT_YEARS_MIXED'));
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n,count);
});

test('la matrícula anual comprueba origen y destino autorizados y rechaza una revisión obsoleta',async t=>{
  const {store,svc,importer,courses}=await fixture(t),source=await svc.create(user,{year:2026,courseId:courses[2026].id,data:student()});
  const options={year:2026,workbook:workbook(2019)},restricted={...user,allCourses:false,courses:[courses[2019].id]};
  const hidden=await importer.preview(restricted,options);
  assert.equal(hidden.rows[0].review.kind,'review');assert.equal(hidden.ticket,null);assert.doesNotMatch(JSON.stringify(hidden.rows[0].review),/studentId|sourceRecordId|sourceVersion|sourceYear/);
  const noEnroll={...user,permissions:permissions.filter(permission=>permission!=='enroll')};
  assert.equal((await importer.preview(noEnroll,options)).rows[0].review.kind,'review');
  const preview=await importer.preview(user,options);
  const lostTarget={...user,allCourses:false,courses:[courses[2026].id]};
  await assert.rejects(()=>importer.commit(lostTarget,confirmation(preview,{annualIndexes:[0]})),e=>e.code==='COURSE_PERMISSION_DENIED'&&e.status===403);
  await assert.rejects(()=>importer.commit(restricted,confirmation(preview,{annualIndexes:[0]})),e=>e.code==='IMPORT_REVIEW_STALE');
  await svc.patch(user,source.id,{version:1,data:{address:'Edición sintética posterior'}});
  await assert.rejects(()=>importer.commit(user,confirmation(preview,{annualIndexes:[0]})),e=>e.code==='IMPORT_REVIEW_STALE');
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n,1);
  const withdrawn=await svc.transition(user,source.id,{version:2,action:'withdraw',date:'2026-10-01',reason:'Retiro sintético'});
  assert.equal(withdrawn.status,'withdrawn');
  assert.equal((await importer.preview(user,{year:2026,workbook:workbook(2035)})).rows[0].review.kind,'review');
  assert.equal((await importer.preview(user,options)).rows[0].review.kind,'annual');
});

test('no usa una ficha anterior para saltar el retiro o el curso oculto de la matrícula más reciente',async t=>{
  const {svc,importer,courses}=await fixture(t);
  const old=await svc.create(user,{year:2019,courseId:courses[2019].id,data:student()});
  const current=await svc.renew(user,old.id,{version:1,courseId:courses[2026].id});
  const limited={...user,allCourses:false,courses:[courses[2019].id,courses[2035].id]};
  const hidden=await importer.preview(limited,{year:2035,workbook:workbook(2035)});
  assert.equal(hidden.rows[0].review.kind,'review');assert.equal(hidden.ticket,null);assert.equal(hidden.rows[0].review.sourceRecordId,undefined);
  await svc.transition(user,current.id,{version:1,action:'withdraw',date:'2026-10-01',reason:'Retiro sintético'});
  const afterWithdrawal=await importer.preview(user,{year:2035,workbook:workbook(2035)});
  assert.equal(afterWithdrawal.rows[0].review.kind,'review');assert.equal(afterWithdrawal.ticket,null);
});

test('un año nuevo puede crear matrícula anual y curso; una anual sin marcar no crea su curso',async t=>{
  const {store,svc,importer,courses}=await fixture(t);
  const original=await svc.create(user,{year:2026,courseId:courses[2026].id,data:student()});
  const historical=await importer.preview(user,{year:2026,workbook:workbook(2001)});
  assert.equal(historical.rows[0].review.kind,'annual');assert.equal(historical.coursesToCreate[0].year,2001);
  await assert.rejects(()=>importer.commit(user,confirmation(historical,{annualIndexes:[0]})),e=>e.code==='COURSES_CONFIRMATION_REQUIRED');
  const imported=await importer.commit(user,confirmation(historical,{annualIndexes:[0],createCourses:true}));
  assert.equal(imported.annual,1);assert.equal((await svc.detail(user,imported.ids[0])).studentId,original.studentId);
  assert.ok((await svc.availableYears(user)).includes(2001));
  const assigned=await svc.createCourse(user,{year:2030,name:'2° Básico B'});
  const book=workbook(2030,'11111111-1',[['qa-fresh',names,surname,'11111112-9','2° Básico B',2030]]);
  const preview=await importer.preview(user,{year:2026,workbook:book});
  assert.equal(preview.summary.annual,1);assert.equal(preview.summary.new,1);assert.equal(preview.coursesToCreate.length,1);
  const selectedNewOnly=await importer.commit(user,confirmation(preview));
  assert.equal(selectedNewOnly.annual,0);assert.equal(selectedNewOnly.createdStudents,1);assert.equal(selectedNewOnly.skipped,1);
  assert.deepEqual((await store.db.prepare('SELECT id FROM courses WHERE year=?').all(2030)).map(course=>course.id),[assigned.id]);
  assert.equal((await svc.list(user,{year:2030})).total,1);
});

test('los extremos 1950 y 2100 son años válidos y los valores inválidos no crean ficha',async t=>{
  const {svc}=await fixture(t);
  for(const year of [1950,2100]){
    const course=await svc.createCourse(user,{year:String(year),name:'Curso de extremo'});
    await svc.create(user,{year:String(year),courseId:course.id,data:student(undefined,{identifierType:'Otro',identifier:'QA-YEAR-'+year})});
    assert.equal((await svc.list(user,{year:String(year)})).total,1);
    await assert.rejects(()=>svc.create(user,{year:'2026e0',courseId:course.id,data:student(undefined,{identifierType:'Otro',identifier:'QA-YEAR-INVALID-'+year})}),e=>e.code==='YEAR_INVALID');
  }
});
