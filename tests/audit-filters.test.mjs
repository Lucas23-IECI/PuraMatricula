import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {openPostgresStore} from '../src/store-postgres.mjs';
import {createPglitePool} from './helpers/pglite-pool.mjs';
import {seedDemo,demoPassword} from '../scripts/seed-demo.mjs';

async function fixture(t,{postgres=false}={}){
  const directory=postgres?null:mkdtempSync(join(tmpdir(),'matricula-audit-filters-'));
  const store=postgres?await openPostgresStore({pool:await createPglitePool(),migrate:true,key:randomBytes(32)}):undefined;
  const app=await createApp({directory:directory||undefined,store,demo:true});
  t.after(async()=>{
    await app.close();if(store)await store.close();
    if(directory){const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep));rmSync(target,{recursive:true,force:true});}
  });
  const data=await seedDemo(app.store,app.svc,1),address=await app.listen(0),base=`http://127.0.0.1:${address.port}`;
  const login=async username=>{
    const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({username,password:demoPassword})});
    assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
  };
  const admin=await login('demo-secretaria'),reader=await login('demo-lector');
  const request=async(query={},cookie=admin)=>{
    const params=query instanceof URLSearchParams?query:new URLSearchParams(query);
    const response=await fetch(base+'/api/audit?'+params,{headers:{Connection:'close',...(cookie?{Cookie:cookie}:{})}});
    return {status:response.status,data:await response.json()};
  };
  return {app,data,admin,reader,request};
}

async function appendAt(store,actor,at,action,target,detail={}){
  await store.transaction(async()=>{
    const text=JSON.stringify(detail),previous=(await store.db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get())?.hash||'';
    const hash=store.mac(JSON.stringify([actor,at,action,target,text,previous]));
    await store.db.prepare('INSERT INTO audit(actor,at,action,target,detail,prev_hash,hash) VALUES(?,?,?,?,?,?,?)').run(actor,at,action,target,text,previous,hash);
  });
}

test('auditoría filtra el conjunto completo antes de contar o paginar y mantiene facetas y corte',async t=>{
  const {app,data,reader,request}=await fixture(t);
  for(let index=0;index<121;index++)await app.store.audit(data.admin.id,'record.read','archivo-encontrable-'+index,{marker:'SOLO_EN_DETALLE'});
  for(let index=0;index<115;index++)await app.store.audit(data.reader.id,'course.create','ruido-reciente-'+index,{});
  await app.store.audit('restore','backup.restore','respaldo-sintetico',{});
  await app.store.audit(data.admin.id,'pdf.download','ficha-descarga',{});
  const filters={q:'archivo-encontrable-',actor:data.admin.id,action:'record.read',module:'record'};
  const first=await request(filters);assert.equal(first.status,200);assert.equal(first.data.total,121);assert.equal(first.data.items.length,50);assert.equal(first.data.pageSize,50);assert.ok(first.data.integrity);
  assert.ok(first.data.items.every(row=>row.actor===data.admin.id&&row.action==='record.read'&&row.target.startsWith(filters.q)));
  assert.deepEqual(first.data.filters,{...filters,from:'',to:''});
  assert.ok(first.data.facets.actors.some(actor=>actor.id==='restore'&&actor.name==='restore'));
  assert.ok(first.data.facets.actors.some(actor=>actor.id===data.reader.id));
  assert.ok(first.data.facets.actions.includes('course.create'));
  assert.ok(first.data.facets.modules.includes('record')&&first.data.facets.modules.includes('backup')&&first.data.facets.modules.includes('document'));
  await app.store.audit(data.admin.id,'record.read','archivo-encontrable-nuevo',{});
  await app.store.audit('new-technical-actor','synthetic.later','fuera-del-corte',{});
  const ids=first.data.items.map(row=>row.id);
  for(const [page,size] of [[2,50],[3,21]]){
    const next=await request({...filters,page,snapshot:first.data.snapshot});assert.equal(next.status,200);assert.equal(next.data.total,121);assert.equal(next.data.page,page);assert.equal(next.data.items.length,size);assert.equal(next.data.snapshot,first.data.snapshot);
    assert.deepEqual(next.data.facets,first.data.facets);ids.push(...next.data.items.map(row=>row.id));
  }
  assert.equal(new Set(ids).size,121);assert.deepEqual(ids,[...ids].sort((left,right)=>right-left));
  const beyond=await request({...filters,page:999,snapshot:first.data.snapshot});assert.equal(beyond.data.page,3);assert.equal(beyond.data.items.length,21);
  const fresh=await request(filters);assert.equal(fresh.data.total,122);assert.ok(fresh.data.snapshot>first.data.snapshot);assert.ok(fresh.data.facets.actions.includes('synthetic.later'));
  assert.equal((await request({q:'SOLO_EN_DETALLE'})).data.total,0,'La búsqueda no debe inspeccionar el contenido de detail.');
  const actorName=await request({q:'SECRETARÍA DE PRUEBA',action:'record.read'});assert.equal(actorName.data.total,122,'La búsqueda encuentra el nombre visible de quien realizó la acción.');
  const restore=await request({actor:'restore',module:'backup'});assert.equal(restore.data.total,1);assert.equal(restore.data.items[0].action,'backup.restore');
  const documents=await request({module:'document'});assert.ok(documents.data.items.some(row=>row.action==='pdf.download'));
  const denied=await request({},reader);assert.equal(denied.status,403);assert.equal(denied.data.facets,undefined);assert.equal(denied.data.items,undefined);
  const anonymous=await request({},null);assert.equal(anonymous.status,401);assert.equal(anonymous.data.facets,undefined);
});

test('auditoría valida filtros completos sin interpretar comodines, SQL o fechas inexistentes',async t=>{
  const {app,data,request}=await fixture(t);
  await app.store.audit(data.admin.id,'record.read','literal%_objetivo',{});
  await app.store.audit(data.admin.id,'record.read','literalXYZobjetivo',{});
  const literal=await request({q:'%_'});assert.equal(literal.status,200);assert.equal(literal.data.total,1);assert.equal(literal.data.items[0].target,'literal%_objetivo');
  const injection=await request({q:"%' OR 1=1 --"});assert.equal(injection.status,200);assert.equal(injection.data.total,0);assert.ok(injection.data.integrity);
  const cases=[{actor:'nobody'},{actor:randomUUID()},{actor:"restore' OR 1=1"},{action:'record.%'},{action:'x'.repeat(81)},{module:'all'},{from:'2026-02-30'},{from:'2026-2-01'},{to:'2026-01-01T00:00:00Z'},{from:'2026-06-01',to:'2026-05-31'},{q:'x'.repeat(161)},{q:'texto\u0000oculto'}];
  for(const query of cases){const result=await request(query);assert.equal(result.status,400,JSON.stringify(query));assert.equal(result.data.code,'AUDIT_FILTER_INVALID');assert.equal(result.data.facets,undefined);}
  const repeated=await request(new URLSearchParams([['actor',data.admin.id],['actor',data.reader.id]]));assert.equal(repeated.status,400);
  const empty=await request({q:'sin-coincidencias',page:999999});assert.equal(empty.status,200);assert.equal(empty.data.page,1);assert.equal(empty.data.total,0);assert.deepEqual(empty.data.items,[]);
  assert.ok(await app.store.verifyAudit());
});

test('fechas de auditoría usan días inclusivos de Chile con cambios de horario de 23 y 25 horas',async t=>{
  const {app,data,request}=await fixture(t);
  const cases=[
    {day:'2026-09-06',before:'2026-09-06T03:59:59.999Z',start:'2026-09-06T04:00:00.000Z',end:'2026-09-07T02:59:59.999Z',after:'2026-09-07T03:00:00.000Z'},
    {day:'2026-04-04',before:'2026-04-04T02:59:59.999Z',start:'2026-04-04T03:00:00.000Z',end:'2026-04-05T03:59:59.999Z',after:'2026-04-05T04:00:00.000Z'}
  ];
  for(const {day,before,start,end,after} of cases){
    for(const [label,at] of Object.entries({before,start,end,after}))await appendAt(app.store,data.admin.id,at,'record.read','limite-dia-'+day+'-'+label);
    const result=await request({q:'limite-dia-'+day,from:day,to:day});assert.equal(result.status,200);assert.equal(result.data.total,2,day);assert.deepEqual(result.data.items.map(row=>row.at),[end,start]);assert.ok(result.data.integrity);
    const since=await request({q:'limite-dia-'+day,from:day});assert.equal(since.data.total,3);
    const until=await request({q:'limite-dia-'+day,to:day});assert.equal(until.data.total,3);
  }
});

test('filtros de auditoría, facetas, fechas y corte funcionan en PostgreSQL/PGlite',async t=>{
  const {app,data,request}=await fixture(t,{postgres:true});
  for(let index=0;index<103;index++)await app.store.audit(data.admin.id,'enrollment.renew','coincidencia-pg-'+index,{});
  for(let index=0;index<55;index++)await app.store.audit(data.reader.id,'record.read','ruido-pg-'+index,{});
  const filters={q:'coincidencia-pg-',actor:data.admin.id,action:'enrollment.renew',module:'enrollment'},first=await request(filters);
  assert.equal(first.status,200);assert.equal(first.data.total,103);assert.equal(first.data.items.length,50);assert.ok(first.data.facets.modules.includes('enrollment'));assert.ok(first.data.integrity);
  await app.store.audit(data.admin.id,'enrollment.renew','coincidencia-pg-nueva',{});
  const second=await request({...filters,page:2,snapshot:first.data.snapshot}),last=await request({...filters,page:999,snapshot:first.data.snapshot});
  assert.equal(second.status,200);assert.equal(second.data.total,103);assert.equal(second.data.items.length,50);assert.equal(last.data.page,3);assert.equal(last.data.items.length,3);
  assert.equal(new Set([...first.data.items,...second.data.items,...last.data.items].map(row=>row.id)).size,103);assert.deepEqual(second.data.facets,first.data.facets);
  await appendAt(app.store,'restore','2026-09-06T03:59:59.999Z','backup.restore','fecha-pg-antes');
  await appendAt(app.store,'restore','2026-09-06T04:00:00.000Z','backup.restore','fecha-pg-dentro');
  const day=await request({q:'fecha-pg',actor:'restore',from:'2026-09-06',to:'2026-09-06'});assert.equal(day.status,200);assert.equal(day.data.total,1);assert.equal(day.data.items[0].target,'fecha-pg-dentro');assert.ok(day.data.integrity);
  const bad=await request({actor:'no-existe'});assert.equal(bad.status,400);
});
