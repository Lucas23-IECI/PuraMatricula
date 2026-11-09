import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {createService} from '../src/service.mjs';
import {createSchoolImport} from '../src/school-import-service.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';
import {permissions} from '../src/fields.mjs';

async function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'matricula-import-review-')),store=openAsyncStore(directory);t.after(async()=>{await store.close();rmSync(directory,{recursive:true,force:true});});
 const svc=createService(store),user={id:'qa-import-review',permissions,allCourses:true,courses:[]};await ensureImportFields(store);
 const course=await svc.createCourse(user,{year:2026,name:'Kínder'}),other=await svc.createCourse(user,{year:2026,name:'Prekínder'});
 const student=await svc.create(user,{year:2026,courseId:course.id,data:{names:'Alumno ficticio',surname:'Sintético',identifierType:'RUN',identifier:'11111111-1',guardianName:'Persona ficticia',guardianIdentifier:'11111112-9',guardianPhone:'+56911110000',address:'Domicilio guardado',commune:'Comuna guardada'}});
 const importer=createSchoolImport(store,svc);
 const workbook=(phone='+56911112222',extra=[])=>({KINDER:[['Nombres (Estudiante)','Apellido Paterno (Estudiante)','RUT (Estudiante)','Nombres (Apoderado)','RUT (Apoderado)','Contacto (Teléfono)','DOMICILIO','COMUNA'],['Alumno ficticio','Sintético','11111111-1','Persona ficticia','11111112-9',phone,'',''],...extra]});
 const preview=(book,account=user)=>importer.preview(account,{workbook:book,year:2026,sheetMappings:{KINDER:{courseId:course.id}},contactOwner:'guardian',addressOwner:'student'});
 const commit=(p,indexes,account=user)=>importer.commit(account,{year:2026,rows:p.rows,ticket:p.ticket,coursesToCreate:p.coursesToCreate,updateIndexes:indexes});
 return {store,svc,user,course,other,student,importer,workbook,preview,commit};
}

test('previsualizar un cambio no escribe y aplicarlo requiere selección explícita; los vacíos no borran',async t=>{
 const f=await fixture(t),p=await f.preview(f.workbook());
 assert.equal(p.rows[0].review.kind,'update');assert.equal(p.rows[0].review.version,1);assert.equal(p.summary.updates,1);
 assert.equal((await f.svc.detail(f.user,f.student.id)).data.guardianPhone,'+56911110000');
 await assert.rejects(()=>f.commit(p,[]),e=>e.code==='IMPORT_SELECTION_EMPTY');
 const result=await f.commit(p,[0]);assert.equal(result.updated,1);assert.equal(result.created,0);
 const record=await f.svc.detail(f.user,f.student.id);assert.equal(record.data.guardianPhone,'+56911112222');assert.equal(record.data.address,'Domicilio guardado');assert.equal(record.data.commune,'Comuna guardada');assert.equal(record.version,2);
 const repeated=await f.preview(f.workbook());assert.equal(repeated.rows[0].review.kind,'match');assert.equal(repeated.ticket,null);
 const log=JSON.stringify(await f.store.db.prepare('SELECT detail FROM audit').all());assert.doesNotMatch(log,/56911112222|Domicilio guardado/);assert.equal(await f.store.verifyAudit(),true);
});

test('un lote puede crear alumnos nuevos sin aplicar las actualizaciones sin marcar',async t=>{
 const f=await fixture(t),p=await f.preview(f.workbook('+56911112222',[['Otra persona','Sintético','11111113-8','Otra persona adulta','11111112-9','+56911113333','','']]));
 assert.equal(p.summary.new,1);assert.equal(p.summary.updates,1);const result=await f.commit(p,[]);assert.equal(result.created,1);assert.equal(result.updated,0);assert.equal((await f.svc.detail(f.user,f.student.id)).data.guardianPhone,'+56911110000');
});

test('una edición posterior, selección alterada o cuenta distinta invalida la confirmación',async t=>{
 const f=await fixture(t),p=await f.preview(f.workbook());
 const tampered=structuredClone(p);tampered.rows[0].review.changes[0].after='valor no revisado';await assert.rejects(()=>f.commit(tampered,[0]),e=>e.code==='IMPORT_TICKET_MISMATCH');
 await assert.rejects(()=>f.commit(p,[0],{...f.user,id:'otra-cuenta'}),e=>e.code==='IMPORT_TICKET_MISMATCH');
 await assert.rejects(()=>f.commit(p,[0,0]),e=>e.code==='IMPORT_SELECTION_INVALID');
 await f.svc.patch(f.user,f.student.id,{version:1,data:{guardianPhone:'Contacto modificado después'}});
 await assert.rejects(()=>f.commit(p,[0]),e=>e.code==='IMPORT_REVIEW_STALE');assert.equal((await f.svc.detail(f.user,f.student.id)).data.guardianPhone,'Contacto modificado después');
});

test('sin acceso o con curso, retiro o apoderado distinto el Excel no expone ni modifica la ficha',async t=>{
 const f=await fixture(t),restricted={id:'qa-restricted',permissions:['read','write','import'],courses:[f.other.id],allCourses:false};
 const hidden=await f.preview(f.workbook(),restricted);assert.equal(hidden.ticket,null);assert.equal(hidden.rows[0].review.kind,'review');assert.doesNotMatch(JSON.stringify(hidden.rows[0].review),/recordId|56911110000/);
 const book=f.workbook();book.KINDER[1][3]='Otra persona adulta';const guardian=await f.preview(book);assert.equal(guardian.rows[0].review.kind,'review');
 await f.svc.transition(f.user,f.student.id,{action:'withdraw',version:1,date:'2026-11-03',reason:'Retiro sintético'});const withdrawn=await f.preview(f.workbook());assert.equal(withdrawn.rows[0].review.kind,'review');assert.equal(withdrawn.ticket,null);
});
