import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';
import {permissions} from '../src/fields.mjs';
import {makeXlsx} from '../src/report-office.mjs';

function runWithDigit(number){
  const digits=String(number);
  const sum=[...digits].reverse().reduce((total,digit,index)=>total+Number(digit)*(2+index%6),0);
  const verifier=11-sum%11;
  return digits+'-'+(verifier===11?'0':verifier===10?'K':String(verifier));
}

test('HTTP guarda las filas sanas de un Excel de 390 filas y permite completar el resto después',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'matricula-partial-http-')),app=await createApp({directory});
  const fixture=[...Array.from({length:323},(_,i)=>['Estudiante de prueba '+i,'Sintético',runWithDigit(16000000+i)]),
    ...Array.from({length:41},(_,i)=>['Identidad por verificar '+i,'Sintético',runWithDigit(100001000+i)]),
    ...Array.from({length:26},(_,i)=>['Formato por verificar '+i,'Sintético','DOC-PEND-QA-'+i])];
  const sheet={name:'KINDER',headers:['Nombres (Estudiante)','Apellido Paterno (Estudiante)','RUT (Estudiante)'],rows:fixture};
  const workbook=()=>({year:2026,name:'padron-sintetico.xlsx',content:Buffer.from(makeXlsx([sheet])).toString('base64')});
  try{
    await ensureImportFields(app.store);
    const username='qa-importacion-parcial',password='Clave-sintetica-parcial-2026!';
    await app.svc.saveUser({id:'qa-setup',permissions,allCourses:true,courses:[]},{username,name:'QA',password,permissions,allCourses:true,courses:[]});
    const address=await app.listen(0),base='http://127.0.0.1:'+address.port;
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    assert.equal(login.status,200);
    const {csrf}=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':csrf};
    const post=async(name,body)=>{
      const response=await fetch(base+'/api/import/school/'+name,{method:'POST',headers,body:JSON.stringify(body)});
      return {status:response.status,data:await response.json()};
    };
    const getPreview=async()=>{const answer=await post('preview',workbook());assert.equal(answer.status,200,JSON.stringify(answer.data));return answer.data;};
    const records=()=>app.store.db.prepare('SELECT count(*) AS count FROM records').get();
    const initial=await getPreview();
    assert.equal(initial.summary.detectedRows,390);
    assert.equal(initial.summary.rejectedRows,67);
    assert.equal(initial.partialImport??null,null);
    assert.equal(initial.coursesToCreate.length,1);
    assert.equal((await post('create-courses',{year:2026,courseTicket:initial.courseTicket,coursesToCreate:initial.coursesToCreate})).status,201);
    assert.equal((await records()).count,0);

    const preview=await getPreview();
    assert.equal(preview.ticket,null);
    assert.equal(preview.partialImport.indexes.length,323);
    assert.equal(preview.partialImport.pendingCount,67);
    const commitBody=p=>({year:p.year,partial:true,ticket:p.partialImport.ticket,coursesToCreate:[],rows:p.partialImport.indexes.map(i=>p.rows[i])});
    const saved=await post('commit',commitBody(preview));assert.equal(saved.status,201,JSON.stringify(saved.data));assert.equal(saved.data.created,323);
    assert.equal((await records()).count,323);
    const replay=await post('commit',commitBody(preview));assert.equal(replay.status,409);
    const again=await getPreview();
    assert.equal(again.summary.unchanged,323);
    assert.equal(again.summary.rejectedRows,67);
    assert.equal(again.partialImport??null,null);

    fixture[323][2]=runWithDigit(17000000);
    const corrected=await getPreview();
    assert.equal(corrected.partialImport.indexes.length,1);
    assert.equal(corrected.partialImport.pendingCount,66);
    const added=await post('commit',commitBody(corrected));assert.equal(added.status,201,JSON.stringify(added.data));assert.equal(added.data.created,1);
    assert.equal((await records()).count,324);
    const states=await app.store.db.prepare('SELECT DISTINCT status FROM records').all();
    assert.deepEqual(states.map(item=>item.status),['draft']);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
