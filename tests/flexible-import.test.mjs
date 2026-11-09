import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {createService} from '../src/service.mjs';
import {createSchoolImport} from '../src/school-import-service.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';
import {permissions} from '../src/fields.mjs';
import {randomBytes} from 'node:crypto';
import {openPostgresStore} from '../src/store-postgres.mjs';
import {createPglitePool} from './helpers/pglite-pool.mjs';

const headers=['Apellido Paterno (Estudiante)','Apellido Materno (Estudiante)','Nombres (Estudiante)','RUT (Estudiante)','Apellido Paterno (APODERADO)','Apellido Materno (APODERADO)','Nombres (Apoderado)','RUT (Apoderado)','Contacto (Teléfono)','Contacto (Email)      SOLO SI REGISTRÓ','DOMICILIO','COMUNA'];
const row=['Sintético','Prueba','Alumno flexible','11111111-1','Adulto','Prueba','Apoderado ficticio','11111112-9','+56911112222','apoderado@example.test','Domicilio ficticio','Comuna ficticia'];
async function fixture(work){
  const dir=mkdtempSync(join(tmpdir(),'pura-flex-import-')),store=openAsyncStore(dir),svc=createService(store);
  try{
    const admin=await svc.saveUser({id:'setup',permissions,allCourses:true,courses:[]},{name:'QA sintético',username:'qa-flexible',password:'Clave-ficticia-larga!',permissions,allCourses:true,courses:[]});
    await ensureImportFields(store);
    const importer=createSchoolImport(store,svc);
    await work({store,svc,admin,importer});
  }finally{await store.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});}
}

test('padrón por hojas conserva contacto y procedencia; requiere curso explícito y permite editar después',()=>fixture(async({store,svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{name:'1° Básico A',year:2026});
  const workbook={'1° Básico':[headers,[],row]};
  const initial=await importer.preview(admin,{workbook,year:2026});
  assert.equal(initial.rows.length,1);
  assert.equal(initial.rows[0].rowNumber,3);
  assert.equal(initial.coursesToCreate[0].name,'1° Básico');
  assert.ok(initial.ticket);
  assert.equal(initial.rows[0].data.guardianPhone,undefined);
  assert.equal(initial.rows[0].data.sourceContactPhone,'+56911112222');
  assert.equal(initial.rows[0].data.address,undefined);
  await assert.rejects(()=>importer.commit(admin,{year:2026,rows:initial.rows,ticket:initial.ticket,coursesToCreate:initial.coursesToCreate}),/Confirme explícitamente/);
  const preview=await importer.preview(admin,{workbook,year:2026,sheetMappings:{'1° Básico':{courseId:course.id}},contactOwner:'guardian',addressOwner:'student'});
  assert.equal(preview.canImport,true);
  assert.equal(preview.rows[0].data.guardianPhone,'+56911112222');
  assert.equal(preview.rows[0].data.guardianEmail,'apoderado@example.test');
  assert.equal(preview.rows[0].data.commune,'Comuna ficticia');
  assert.equal(preview.rows[0].data.sourceSheet,'1° Básico');
  assert.equal(preview.rows[0].data.sourceRow,'3');
  const result=await importer.commit(admin,{year:2026,rows:preview.rows,ticket:preview.ticket,coursesToCreate:[]});
  const detail=await svc.detail(admin,result.ids[0]);
  assert.match(detail.data.guardianName,/Apoderado ficticio/);
  assert.equal(detail.data.birthDate,'');
  await svc.patch(admin,detail.id,{version:detail.version,data:{...detail.data,address:'Domicilio corregido'}});
  assert.equal((await svc.detail(admin,detail.id)).data.address,'Domicilio corregido');
  assert.equal(await store.verifyAudit(),true);
  const duplicate=await importer.preview(admin,{workbook,year:2026,sheetMappings:{'1° Básico':{courseId:course.id}}});
  assert.equal(duplicate.ticket,null);
  assert.equal(duplicate.rows[0].review.kind,'match');
  assert.equal(duplicate.summary.unchanged,1);
  assert.deepEqual(duplicate.errors,[]);
}));

test('el ticket liga la titularidad de los contactos y la hoja de procedencia',()=>fixture(async({svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{name:'Kínder',year:2026});
  const input={workbook:{KINDER:[headers,row]},year:2026,sheetMappings:{KINDER:{courseId:course.id}}};
  const preview=await importer.preview(admin,input);
  for(const mutate of [rows=>rows[0].data.guardianPhone='Contacto inventado',rows=>rows[0].sourceSheet='Otra hoja',rows=>rows[0].data.sourceRow='999']){
    const rows=structuredClone(preview.rows);mutate(rows);
    await assert.rejects(()=>importer.commit(admin,{year:2026,rows,ticket:preview.ticket,coursesToCreate:preview.coursesToCreate}),error=>error.code==='IMPORT_TICKET_MISMATCH');
  }
}));

test('un mapeo de curso no puede inventar permisos ni cambiar el año en la previsualización',()=>fixture(async({svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{name:'Kínder',year:2027});
  const result=await importer.preview(admin,{workbook:{KINDER:[headers,row]},year:2026,courses:[{...course,year:2026}],sheetMappings:{KINDER:{courseId:course.id}}});
  assert.equal(result.ticket,null);
  assert.ok(result.errors.some(error=>error.code==='COURSE_MAPPING_INVALID'));
}));

test('las columnas ajustadas se validan de nuevo al confirmar y no pierden contactos del apoderado',()=>fixture(async({svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{name:'Curso flexible',year:2026});
  const workbook={'Lista nueva':[['Persona','Primer apellido','Documento','Celular','Distrito'],['Nuevo','Sintético','11111111-1','+56911112222','Comuna ficticia']]};
  const preview=await importer.preview(admin,{workbook,year:2026,columnMapping:{names:'Persona',surname:'Primer apellido',identifier:'Documento',contactPhone:'Celular',commune:'Distrito'},sheetMappings:{'Lista nueva':{include:true,courseId:course.id}},contactOwner:'guardian',addressOwner:'guardian'});
  assert.equal(preview.canImport,true,JSON.stringify(preview.errors));
  const result=await importer.commit(admin,{year:2026,rows:preview.rows,ticket:preview.ticket,coursesToCreate:[]});
  const detail=await svc.detail(admin,result.ids[0]);
  assert.equal(detail.data.guardianPhone,'+56911112222');
  assert.equal(detail.data.guardianCommune,'Comuna ficticia');
  assert.equal(detail.data.sourceCommune,'Comuna ficticia');
}));

test('crear cursos sin sección y con sección conserva el destino específico de cada fila',()=>fixture(async({store,admin,importer})=>{
  const workbook={Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos','Curso','Sección'],['base','Alumno base','Sintético','1° Básico',''],['seccion-a','Alumno sección','Sintético','1° Básico','A']]};
  const preview=await importer.preview(admin,{workbook,year:2026});
  const imported=await importer.commit(admin,{year:2026,rows:preview.rows,ticket:preview.ticket,coursesToCreate:preview.coursesToCreate,createCourses:true});
  const result=await store.db.prepare('SELECT r.id,c.name FROM records r JOIN courses c ON c.id=r.course_id ORDER BY r.id').all();
  assert.equal(result.find(row=>row.id===imported.ids[0]).name,'1° Básico');
  assert.equal(result.find(row=>row.id===imported.ids[1]).name,'1° Básico A');
}));

test('ajustar contacto y domicilio en Usuarios conserva los campos elegidos',()=>fixture(async({svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{year:2026,name:'Kínder'});
  const workbook={Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos','Celular familiar','Persona a cargo','Distrito','Dirección familiar'],['erp-flex-1','Alumno ficticio','Sintético','+56911112222','Persona ficticia','Comuna ficticia','Domicilio ficticio']]};
  const preview=await importer.preview(admin,{workbook,year:2026,columnMapping:{contactPhone:'Celular familiar',guardianNames:'Persona a cargo',commune:'Distrito',address:'Dirección familiar'},sheetMappings:{Usuarios:{courseId:course.id}},contactOwner:'guardian',addressOwner:'guardian'});
  assert.equal(preview.canImport,true,JSON.stringify(preview.errors));
  const result=await importer.commit(admin,{year:2026,rows:preview.rows,ticket:preview.ticket,coursesToCreate:[]}),detail=await svc.detail(admin,result.ids[0]);
  assert.equal(detail.data.guardianPhone,'+56911112222');assert.equal(detail.data.guardianName,'Persona ficticia');assert.equal(detail.data.guardianCommune,'Comuna ficticia');assert.equal(detail.data.sourceSheet,'Usuarios');
}));

const applyReview = (importer, user, preview, updateIndexes = []) => importer.commit(user, {
  year: preview.year, rows: preview.rows, ticket: preview.ticket, coursesToCreate: preview.coursesToCreate, updateIndexes
});

test('concilia ERP: altas, coincidencias y cambios explícitos sin borrar datos ni alterar identidad',()=>fixture(async({store,svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{year:2026,name:'Kínder'});
  const first=await svc.create(admin,{year:2026,courseId:course.id,data:{names:'Ana ficticia',surname:'Sintética',identifierType:'RUN',identifier:'11111111-1',email:'anterior@example.test',studentPhone:'+56911110001',commune:'Comuna conservada',allergies:'Reservado sintético'}});
  const matched=await svc.create(admin,{year:2026,courseId:course.id,data:{names:'Luis ficticio',surname:'Sintético',identifierType:'RUN',identifier:'11111112-K',email:'igual@example.test'}});
  const workbook={Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos','RUT','Email','Teléfono','Curso'],['qa-existing','Ana ficticia','Sintética','11.111.111-1','nuevo@example.test','','KINDER'],['qa-match','Luis ficticio','Sintético','11111112-K','igual@example.test','','KINDER'],['qa-new','Nuevo ficticio','Sintético','','alta@example.test','','KINDER']]};
  const input={workbook,year:2026};
  let preview=await importer.preview(admin,input);
  assert.deepEqual(preview.rows.map(row=>row.review.kind),['update','match','new']);
  assert.deepEqual(preview.rows[0].review.changes.map(({key,before,after})=>[key,before,after]),[['email','anterior@example.test','nuevo@example.test']]);
  assert.equal(preview.rows[0].review.version,1);
  assert.equal((await svc.detail(admin,first.id)).data.email,'anterior@example.test');
  const created=await applyReview(importer,admin,preview);
  assert.deepEqual([created.created,created.updated,created.skipped],[1,0,2]);
  assert.equal((await svc.detail(admin,first.id)).version,1);
  preview=await importer.preview(admin,input);
  assert.deepEqual(preview.rows.map(row=>row.review.kind),['update','match','match']);
  await assert.rejects(()=>applyReview(importer,admin,preview),error=>error.code==='IMPORT_SELECTION_EMPTY');
  const updated=await applyReview(importer,admin,preview,[0]);
  assert.deepEqual([updated.created,updated.updated,updated.skipped],[0,1,2]);
  const detail=await svc.detail(admin,first.id);
  assert.equal(detail.version,2);
  assert.equal(detail.status,'draft');
  assert.equal(detail.courseId,course.id);
  assert.equal(detail.data.email,'nuevo@example.test');
  assert.equal(detail.data.studentPhone,'+56911110001');
  assert.equal(detail.data.identifier,'11111111-1');
  assert.equal(detail.data.commune,'Comuna conservada');
  assert.equal(detail.data.allergies,'Reservado sintético');
  assert.equal((await svc.detail(admin,matched.id)).version,1);
  assert.ok(detail.events.some(event=>event.action==='import.updated'&&event.detail.fields.includes('email')));
  assert.equal(JSON.parse(store.unseal((await store.db.prepare('SELECT snapshot FROM revisions WHERE record_id=? AND version=1').get(first.id)).snapshot)).data.email,'anterior@example.test');
  const audit=await store.db.prepare("SELECT detail FROM audit WHERE action='import.commit.erp' ORDER BY id DESC LIMIT 1").get();
  assert.equal(JSON.parse(audit.detail).updated,1);
  assert.ok(!audit.detail.includes('@example.test'));
  assert.equal(await store.verifyAudit(),true);
  await assert.rejects(()=>applyReview(importer,admin,preview,[0]),error=>error.code==='IMPORT_REVIEW_STALE');
  const repeated=await importer.preview(admin,input);
  assert.equal(repeated.summary.unchanged,3);
  assert.equal(repeated.ticket,null);
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n,3);
}));

test('el ticket liga los cambios, la versión y la cuenta y una edición concurrente revierte todo el lote',()=>fixture(async({store,svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{year:2026,name:'Kínder'});
  const record=await svc.create(admin,{year:2026,courseId:course.id,data:{names:row[2],surname:row[0],secondSurname:row[1],identifierType:'RUN',identifier:row[3],guardianPhone:'+56911110000'}});
  const preview=await importer.preview(admin,{year:2026,contactOwner:'guardian',workbook:{KINDER:[headers,row,[...row.slice(0,2),'Otro ficticio','11111112-K',...row.slice(4)]]}});
  assert.deepEqual(preview.rows.map(item=>item.review.kind),['update','new']);
  for(const tamper of [value=>value.rows[0].review.version++,value=>value.rows[0].review.changes[0].after='Manipulado',value=>value.rows[0].review.kind='new']){
    const fake=structuredClone(preview);tamper(fake);
    await assert.rejects(()=>applyReview(importer,admin,fake),error=>error.code==='IMPORT_TICKET_MISMATCH');
  }
  await assert.rejects(()=>applyReview(importer,{...admin,id:'otra-cuenta-sintetica'},preview,[0]),error=>error.code==='IMPORT_TICKET_MISMATCH');
  await assert.rejects(()=>applyReview(importer,admin,preview,[1]),error=>error.code==='IMPORT_SELECTION_INVALID');
  await svc.patch(admin,record.id,{version:1,data:{guardianPhone:'+56911110002'}});
  await assert.rejects(()=>applyReview(importer,admin,preview,[0]),error=>error.code==='IMPORT_REVIEW_STALE');
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM records').get()).n,1);
  assert.equal((await svc.detail(admin,record.id)).data.guardianPhone,'+56911110002');
}));

test('no propone traslados ni identidades nuevas para el mismo origen; la matrícula anual requiere selección y autorización',()=>fixture(async({svc,admin,importer})=>{
  const course=await svc.createCourse(admin,{year:2026,name:'Kínder'}),other=await svc.createCourse(admin,{year:2026,name:'Prekínder'});
  const seed={year:2026,contactOwner:'guardian',workbook:{KINDER:[headers,row]}};
  const original=await importer.preview(admin,seed),result=await applyReview(importer,admin,original),id=result.ids[0];
  const elsewhere=await importer.preview(admin,{...seed,sheetMappings:{KINDER:{courseId:other.id}}});
  assert.equal(elsewhere.rows[0].review.kind,'review');
  assert.match(elsewhere.rows[0].review.reason,/curso no coincide/);
  assert.equal(elsewhere.ticket,null);
  const future=await importer.preview(admin,{...seed,year:2027});
  assert.equal(future.rows[0].review.kind,'annual');assert.equal(future.summary.annual,1);assert.match(future.rows[0].review.reason,/Nueva matrícula anual 2027/);assert.equal(future.coursesToCreate[0].year,2027);assert.ok(future.ticket);
  const restricted={...admin,allCourses:false,courses:[other.id]};
  const changedRow=[...row];changedRow[8]='+56911110002';
  const proposed=await importer.preview(admin,{...seed,workbook:{KINDER:[headers,changedRow]}});
  assert.equal(proposed.rows[0].review.kind,'update');
  await assert.rejects(()=>applyReview(importer,restricted,proposed,[0]),error=>error.code==='COURSE_PERMISSION_DENIED'&&error.status===403);
  const hidden=await importer.preview(restricted,{...seed,workbook:{KINDER:[headers,changedRow]}});
  assert.equal(hidden.rows[0].review.kind,'review');
  assert.equal(hidden.rows[0].review.changes,undefined);
  assert.equal(hidden.rows[0].review.recordId,undefined);
  const erp={year:2026,workbook:{Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos','RUT','Curso'],['erp-origen','Estudiante ficticio','Sintético','11111112-K','Kínder']]}};
  await applyReview(importer,admin,await importer.preview(admin,erp));
  erp.workbook.Usuarios[1][3]='11111111-1';
  const conflicting=await importer.preview(admin,erp);
  assert.equal(conflicting.rows[0].review.kind,'review');assert.match(conflicting.rows[0].review.reason,/referencia de origen/);
  assert.equal((await svc.detail(admin,id)).courseId,course.id);
  await svc.transition(admin,id,{version:1,action:'withdraw',reason:'Retiro sintético de prueba'});
  const withdrawn=await importer.preview(admin,{...seed,workbook:{KINDER:[headers,changedRow]}});
  assert.equal(withdrawn.rows[0].review.kind,'review');assert.match(withdrawn.rows[0].review.reason,/retirada/);
}));

test('PostgreSQL admite padrón por curso, edición y evolución de plantilla sin alterar revisiones',async()=>{
  const pool=await createPglitePool({dataDir:`memory://flexible-${randomBytes(8).toString('hex')}`}),store=await openPostgresStore({pool,migrate:true,key:randomBytes(32)}),svc=createService(store),admin={id:'qa-flexible',permissions,allCourses:true,courses:[]};
  try{
    const course=await svc.createCourse(admin,{year:2026,name:'Kínder'});
    const previous=await svc.create(admin,{year:2026,courseId:course.id,data:{names:'Antiguo ficticio',surname:'Sintético',identifierType:'Otro',identifier:'PG-OLD-FLEX',allergies:'Antecedente sintético'}});
    const latest=await ensureImportFields(store),importer=createSchoolImport(store,svc);
    const preview=await importer.preview(admin,{workbook:{KINDER:[headers,row]},year:2026,sheetMappings:{KINDER:{courseId:course.id}},contactOwner:'guardian',addressOwner:'student'});
    assert.equal(preview.canImport,true,JSON.stringify(preview.errors));
    const result=await importer.commit(admin,{year:2026,rows:preview.rows,ticket:preview.ticket,coursesToCreate:[]});
    const record=await svc.detail(admin,result.ids[0]);assert.equal(record.data.commune,'Comuna ficticia');assert.equal(record.data.guardianPhone,'+56911112222');
    const changed=await svc.patch(admin,record.id,{version:record.version,data:{...record.data,commune:'Comuna corregida'}});assert.equal(changed.data.commune,'Comuna corregida');
    const review=await importer.preview(admin,{workbook:{KINDER:[headers,row]},year:2026,sheetMappings:{KINDER:{courseId:course.id}},contactOwner:'guardian',addressOwner:'student'});
    assert.equal(review.rows[0].review.kind,'update');assert.equal(review.rows[0].review.version,2);
    const reconciled=await applyReview(importer,admin,review,[0]);assert.equal(reconciled.updated,1);
    const current=await svc.detail(admin,record.id);assert.equal(current.version,3);assert.equal(current.data.commune,'Comuna ficticia');
    const upgraded=await svc.upgradeTemplate(admin,previous.id,{version:1,templateId:Number(latest.id)});assert.equal(upgraded.data.allergies,'Antecedente sintético');
    const revisions=await store.db.prepare('SELECT version,snapshot FROM revisions WHERE record_id=? ORDER BY version').all(previous.id);assert.equal(revisions.length,2);assert.equal(JSON.parse(store.unseal(revisions[0].snapshot)).templateId,previous.templateId);
    assert.equal(await store.verifyAudit(),true);
  }finally{await store.close();}
});
