import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../src/server.mjs';
import {permissions} from '../src/fields.mjs';

test('HTTP prepara campos de importación explícitamente y actualiza una ficha sin perder el historial',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'matricula-flex-http-')),app=await createApp({directory:dir});
  try{
    const admin=await app.svc.saveUser({id:'setup',permissions,allCourses:true,courses:[]},{username:'qa-http',name:'QA HTTP',password:'Clave-sintetica-http!',permissions,allCourses:true,courses:[]});
    const course=await app.svc.createCourse(admin,{year:2026,name:'Kínder'}),previous=await app.svc.create(admin,{year:2026,courseId:course.id,data:{names:'Ficha previa',surname:'Sintética',identifierType:'Otro',identifier:'HTTP-FLEX-OLD'}});
    const address=await app.listen(0),base=`http://127.0.0.1:${address.port}`;
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'qa-http',password:'Clave-sintetica-http!'})});
    const session=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
    const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
    assert.equal((await(await fetch(base+'/api/meta',{headers})).json()).importFieldsReady,false);
    const input={year:2026,name:'sintetico.xlsx',content:readFileSync(new URL('./fixtures/matricula-por-cursos-sintetica.xlsx',import.meta.url)).toString('base64')};
    const missing=await post('/api/import/school/preview',input);assert.equal(missing.data.ticket,undefined);assert.equal(missing.data.errors[0].code,'IMPORT_TEMPLATE_SOURCE_FIELDS_MISSING');
    const prepared=await post('/api/templates/prepare-import',{});assert.equal(prepared.status,200);assert.equal((await post('/api/templates/prepare-import',{})).data.id,prepared.data.id);
    assert.equal((await(await fetch(base+'/api/meta',{headers})).json()).importFieldsReady,true);
    const preview=await post('/api/import/school/preview',input);assert.equal(preview.status,200);assert.equal(preview.data.rows.length,14);assert.equal(preview.data.sheetSummaries.length,14);assert.ok(preview.data.ticket);
    const upgrade=await post(`/api/records/${previous.id}/template`,{version:1,templateId:prepared.data.id});assert.equal(upgrade.status,200);assert.equal(upgrade.data.version,2);assert.equal(upgrade.data.data.names,'Ficha previa');
    const conflict=await post(`/api/records/${previous.id}/template`,{version:1,templateId:prepared.data.id});assert.equal(conflict.status,409);
    const response=await fetch(base+`/api/records/${previous.id}/revisions?version=1`,{headers});assert.equal((await response.json()).templateId,previous.templateId);
  }finally{await app.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});}
});
