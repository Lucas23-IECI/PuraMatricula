import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';
import {permissions} from '../src/fields.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';

test('HTTP conecta reportes, Word, filtros y vista previa PDF de plantilla sin publicar antes de revisar',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'matricula-operations-http-')),app=await createApp({directory:dir});
 try{
  const setup={id:'setup',permissions,allCourses:true,courses:[]},admin=await app.svc.saveUser(setup,{username:'qa-operaciones',name:'QA',password:'Clave-sintetica-http!',permissions,allCourses:true,courses:[]});
  const course=await app.svc.createCourse(admin,{year:2026,name:'Curso ficticio'});
  const record=await app.svc.create(admin,{year:2026,courseId:course.id,data:{names:'Alumno HTTP',surname:'Ficticio',identifierType:'Otro',identifier:'HTTP-OPS-001'}});
  await ensureImportFields(app.store);const address=await app.listen(0),base=`http://127.0.0.1:${address.port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'qa-operaciones',password:'Clave-sintetica-http!'})}),session=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
  const post=(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)}),get=path=>fetch(base+path,{headers});
  const meta=await(await get('/api/meta')).json(),latest=meta.templates[0],draft={baseTemplateId:latest.id,name:'Borrador HTTP',fields:[...latest.fields,{key:'operationsTest',label:'Pregunta ficticia',section:'adicionales',type:'text',sensitive:false}]};
  const pdf=await post('/api/templates/preview-pdf',draft);assert.equal(pdf.status,200);assert.match(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),/%PDF-/);
  assert.equal((await(await get('/api/meta')).json()).templates.length,meta.templates.length);
  assert.equal((await post('/api/templates',draft)).status,409);
  const preview=await(await post('/api/templates/preview',draft)).json();assert.equal((await post('/api/templates',{...draft,previewToken:preview.previewToken})).status,201);
  const stats=await(await get('/api/reports/statistics?year=2026')).json();assert.equal(stats.total,1);assert.equal(stats.byStatus.draft,1);
  const word=await get(`/api/records/${record.id}/download?format=docx`);assert.equal(word.status,200);assert.match(word.headers.get('content-type'),/wordprocessingml/);assert.equal(Buffer.from(await word.arrayBuffer()).subarray(0,2).toString(),'PK');
  const csv=await get('/api/export?'+new URLSearchParams({year:2026,course:course.id,q:'Sin coincidencia'}));assert.equal(csv.status,200);assert.equal((await csv.text()).trim().split('\r\n').length,1);
  const summary=await get('/api/reports/summary?year=2026&format=pdf');assert.equal(summary.status,200);assert.match(Buffer.from(await summary.arrayBuffer()).subarray(0,5).toString(),/%PDF-/);
  assert.equal((await get('/api/reports/roster?year=2026&format=desconocido')).status,400);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
