import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../src/server.mjs';
import {pageWindow} from '../src/service.mjs';
import {createReports} from '../src/reports.mjs';
import {seedDemo,demoPassword} from '../scripts/seed-demo.mjs';
import {randomBytes} from 'node:crypto';
import {openPostgresStore} from '../src/store-postgres.mjs';
import {createPglitePool} from './helpers/pglite-pool.mjs';

test('ventanas de página normalizan valores no finitos y tamaños enteros de 1 a 100',()=>{
  for(const invalid of ['Infinity','-Infinity','NaN','texto',Infinity,NaN]){
    assert.deepEqual(pageWindow({page:invalid,pageSize:invalid},61),{page:1,pageSize:25});
  }
  assert.deepEqual(pageWindow({page:999,pageSize:10},61),{page:7,pageSize:10});
  assert.deepEqual(pageWindow({page:-2,pageSize:-5},61),{page:1,pageSize:1});
  assert.deepEqual(pageWindow({page:2.9,pageSize:3.9},61),{page:2,pageSize:3});
  assert.deepEqual(pageWindow({page:Number.MAX_VALUE,pageSize:Number.MAX_VALUE},61),{page:1,pageSize:100});
  assert.deepEqual(pageWindow({page:999,pageSize:5},0),{page:1,pageSize:5});
  for(const size of [1,2,3,5,10,25,50,100])assert.equal(pageWindow({pageSize:size},61).pageSize,size);
});

test('paginación HTTP de alumnos, reportes y auditoría conserva selección y alcance',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'matricula-pagination-')),app=await createApp({directory,demo:true});
  t.after(async()=>{
    await app.close();
    const target=resolve(directory),root=resolve(tmpdir())+sep;
    if(!target.startsWith(root))throw Error('La carpeta temporal de pruebas salió de su raíz.');
    rmSync(target,{recursive:true,force:true});
  });
  const data=await seedDemo(app.store,app.svc,61),reports=createReports(app.store,app.svc),address=await app.listen(0),base=`http://127.0.0.1:${address.port}`;
  const login=async username=>{
    const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:demoPassword})});
    assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
  };
  const admin=await login('demo-secretaria'),reader=await login('demo-lector'),none=await login('demo-sin-cursos');
  const request=async(cookie,path)=>{
    const response=await fetch(base+path,{headers:{Cookie:cookie}});return {status:response.status,data:await response.json()};
  };

  await t.test('alumnos recorren todas las páginas sin perder o duplicar filas; última válida al exceder',async()=>{
    const ids=[];
    for(let page=1;page<=21;page++){
      const response=await request(admin,`/api/records?year=2026&page=${page}&pageSize=3`);
      assert.equal(response.status,200);assert.equal(response.data.page,page);assert.equal(response.data.pageSize,3);assert.equal(response.data.total,61);
      ids.push(...response.data.items.map(item=>item.id));
    }
    assert.equal(ids.length,61);assert.equal(new Set(ids).size,61);
    const beyond=(await request(admin,'/api/records?year=2026&page=999999&pageSize=3')).data;
    assert.equal(beyond.page,21);assert.equal(beyond.items.length,1);assert.equal(beyond.items[0].id,ids.at(-1));
    for(const value of ['Infinity','NaN','texto']){
      const response=await request(admin,`/api/records?year=2026&page=${value}&pageSize=${value}`);
      assert.equal(response.status,200);assert.equal(response.data.page,1);assert.equal(response.data.pageSize,25);assert.equal(response.data.items.length,25);
    }
  });

  await t.test('cambio de filtro y cuenta vacía devuelven una página coherente sin ampliar permisos',async()=>{
    const selected=(await request(admin,'/api/records?year=2026&q=Ejemplo%20001&page=400&pageSize=5')).data;
    assert.equal(selected.page,1);assert.equal(selected.total,1);assert.equal(selected.items.length,1);
    const restricted=(await request(reader,'/api/records?year=2026&page=999&pageSize=2')).data;
    assert.equal(restricted.page,Math.ceil(restricted.total/2));assert.ok(restricted.items.length);assert.ok(restricted.items.every(item=>item.courseId===data.reader.courses[0]));
    const empty=(await request(none,'/api/records?year=2026&page=999&pageSize=5')).data;
    assert.deepEqual(empty,{items:[],total:0,page:1,pageSize:5});
    assert.equal((await request(reader,'/api/records?course='+data.courses[0].id)).status,403);
  });

  await t.test('reportes aceptan tamaño elegido, limitan la última página y sus exportaciones siguen completas',async()=>{
    const last=(await request(admin,'/api/reports/statistics?year=2026&includeRecords=1&page=999&pageSize=10')).data;
    assert.equal(last.total,61);assert.equal(last.page,7);assert.equal(last.pageSize,10);assert.equal(last.items.length,1);
    const invalid=(await request(admin,'/api/reports/statistics?year=2026&includeRecords=1&page=Infinity&pageSize=Infinity')).data;
    assert.equal(invalid.page,1);assert.equal(invalid.pageSize,25);assert.equal(invalid.items.length,25);
    const empty=(await request(admin,'/api/reports/statistics?year=2026&q=sin-coincidencias-sinteticas&includeRecords=1&page=999&pageSize=5')).data;
    assert.equal(empty.page,1);assert.equal(empty.pageSize,5);assert.equal(empty.total,0);assert.deepEqual(empty.items,[]);
    const exported=await reports.roster(data.admin,{year:2026,page:7,pageSize:10},'csv');
    assert.equal(exported.bytes.toString('utf8').split(/\r?\n/).filter(Boolean).length,62);
  });

  await t.test('auditoría conserva su tamaño de 50 y una página válida incluso con parámetros extremos',async()=>{
    const last=(await request(admin,'/api/audit?page=999999999')).data;
    assert.equal(last.pageSize,50);assert.equal(last.page,Math.ceil(last.total/50));assert.ok(last.items.length);assert.ok(last.integrity);
    for(const value of ['Infinity','NaN','-1']){
      const result=await request(admin,'/api/audit?page='+value);
      assert.equal(result.status,200);assert.equal(result.data.page,1);assert.equal(result.data.pageSize,50);assert.equal(result.data.items.length,50);
    }
    assert.equal((await request(reader,'/api/audit?page=2')).status,403);
  });

  await t.test('el corte de auditoría evita filas repetidas mientras las consultas generan eventos nuevos',async()=>{
    const first=(await request(admin,'/api/audit?page=1')).data;
    await app.store.audit(data.admin.id,'synthetic.pagination','',{purpose:'prueba de corte'});
    const second=(await request(admin,`/api/audit?page=2&snapshot=${first.snapshot}`)).data;
    assert.equal(second.snapshot,first.snapshot);assert.equal(second.total,first.total);assert.equal(second.page,2);
    assert.ok(!second.items.some(item=>first.items.some(previous=>previous.id===item.id)));
    assert.ok(second.items.every(item=>item.id<=first.snapshot));
    const fresh=(await request(admin,'/api/audit?page=1')).data;
    assert.ok(fresh.snapshot>first.snapshot);assert.ok(fresh.total>first.total);
    const end=(await request(admin,`/api/audit?page=999999&snapshot=${first.snapshot}`)).data;
    assert.equal(end.total,first.total);assert.equal(end.page,Math.ceil(first.total/50));assert.ok(end.items.length);
  });
});

test('corte de auditoría y paginación numérica funcionan con PostgreSQL/PGlite',async t=>{
  const pool=await createPglitePool(),store=await openPostgresStore({pool,migrate:true,key:randomBytes(32)}),app=await createApp({store,demo:true});
  t.after(async()=>{await app.close();await store.close();});
  const data=await seedDemo(store,app.svc,6);
  for(let index=0;index<55;index++)await store.audit(data.admin.id,'synthetic.pagination','',{index});
  const address=await app.listen(0),base=`http://127.0.0.1:${address.port}`;
  const logged=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'demo-secretaria',password:demoPassword})});
  assert.equal(logged.status,200);const cookie=logged.headers.get('set-cookie').split(';')[0];
  const get=async path=>{const response=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.json();};
  const first=await get('/api/audit?page=1'),second=await get('/api/audit?page=2&snapshot='+first.snapshot);
  assert.equal(typeof first.snapshot,'number');assert.ok(Number.isSafeInteger(first.snapshot));assert.equal(second.total,first.total);assert.equal(second.pageSize,50);assert.ok(second.integrity);
  assert.ok(second.items.length);assert.ok(!second.items.some(item=>first.items.some(previous=>previous.id===item.id)));
  const records=await get('/api/records?year=2026&page=999&pageSize=2');assert.equal(records.page,3);assert.equal(records.items.length,2);
  const report=await get('/api/reports/statistics?year=2026&includeRecords=1&page=999&pageSize=5');assert.equal(report.page,2);assert.equal(report.items.length,1);
});
