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
  assert.ok(duplicate.errors.some(error=>error.code==='DUPLICADO_EXISTENTE'&&error.sheet==='1° Básico'&&error.row===3));
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
    const upgraded=await svc.upgradeTemplate(admin,previous.id,{version:1,templateId:Number(latest.id)});assert.equal(upgraded.data.allergies,'Antecedente sintético');
    const revisions=await store.db.prepare('SELECT version,snapshot FROM revisions WHERE record_id=? ORDER BY version').all(previous.id);assert.equal(revisions.length,2);assert.equal(JSON.parse(store.unseal(revisions[0].snapshot)).templateId,previous.templateId);
    assert.equal(await store.verifyAudit(),true);
  }finally{await store.close();}
});
