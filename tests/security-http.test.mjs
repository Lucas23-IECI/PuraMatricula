import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync,openSync,ftruncateSync,closeSync,unlinkSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../src/server.mjs';
import {permissions} from '../src/fields.mjs';

const rawRequest=(base,path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
  const req=http.request(base+path,{method,headers},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{const bytes=Buffer.concat(chunks),resultHeaders=new Headers();for(const [name,value]of Object.entries(response.headers))if(value!==undefined)resultHeaders.set(name,Array.isArray(value)?value.join(', '):value);resolve({status:response.statusCode,headers:resultHeaders,json:async()=>JSON.parse(bytes.toString('utf8'))});});});
  req.on('error',reject);req.end(body);
});

async function fixture(t,options={}){
  const directory=mkdtempSync(join(tmpdir(),'matricula-security-http-'));
  const app=await createApp({directory,...options}),address=await app.listen(0),base=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{await app.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});});
  return {app,base,directory};
}

test('un JSON anónimo incompleto no retiene la cola SQLite de otras solicitudes',async t=>{
  const {base}=await fixture(t);
  const slow=http.request(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'100'}});
  slow.on('error',()=>{});slow.write('{');
  await delay(80);
  const controller=new AbortController(),health=fetch(base+'/api/health',{signal:controller.signal}).then(response=>response.status);
  try{
    const result=await Promise.race([health,delay(600).then(()=>null)]);
    assert.equal(result,200,'Un cuerpo lento no debe bloquear una petición independiente.');
  }finally{slow.destroy();controller.abort();await health.catch(()=>{});}
});

test('los cuerpos tienen límites tempranos y las cargas pendientes están acotadas',async t=>{
  const {base}=await fixture(t),sockets=[];
  const declared=new Promise((resolve,reject)=>{
    const req=http.request(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':String(16*1024+1)}},response=>{response.resume();resolve(response.statusCode);});
    sockets.push(req);req.on('error',reject);req.flushHeaders();
  });
  try{
    assert.equal(await Promise.race([declared,delay(1000).then(()=>null)]),413,'Rechazar Content-Length sin esperar el cuerpo.');
    const oversized=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'x'.repeat(17*1024),password:'sintetica'})});
    assert.equal(oversized.status,413);
    assert.equal((await rawRequest(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Transfer-Encoding':'chunked'},body:JSON.stringify({username:'x'.repeat(17*1024)})})).status,413,'El límite también se aplica sin Content-Length.');
    for(let index=0;index<8;index++){const req=http.request(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'100'}});req.on('error',()=>{});req.write('{');sockets.push(req);}
    await delay(80);
    const busy=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'5');
    assert.equal((await fetch(base+'/api/health')).status,200);
  }finally{for(const req of sockets)req.destroy();}
});

test('Host, Origin, JSON y la lista de estáticos rechazan entradas ajenas sin filtrar archivos',async t=>{
  const {base}=await fixture(t);
  for(const path of ['/view-controls.js','/view-controls.css','/collections.js','/collections.css','/import-preview.css','/templates.css','/record-views.js','/record-views.css','/areas.js','/records-view.js','/app.js','/loading.js','/reports.js','/style.css']){
    const response=await fetch(base+path);assert.equal(response.status,200,path);
    assert.equal(response.headers.get('content-type'),path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8',path);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.ok((await response.text()).length>50,path);
  }
  for(const path of ['/view-controls.js.map','/collections.mjs','/record-views.css.map','/src/audit-query.mjs'])assert.equal((await fetch(base+path)).status,404,path);
  assert.equal((await rawRequest(base,'/api/health',{headers:{Host:'attacker.invalid'}})).status,403);
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:'https://attacker.invalid'}})).status,403);
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:'null'}})).status,403);
  assert.equal((await fetch(base+'/api/health',{headers:{Origin:base}})).status,200);
  for(const path of ['/.env','/.local/manual/storage.key','/src/server.mjs','/matricula.sqlite','/backup.dsmbak','/%2e%2e/.env'])assert.equal((await fetch(base+path)).status,404,path);
  for(const body of ['null','[]','"texto"','{'])assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,400);
  assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json-invalid'},body:'{}'})).status,415);
});

test('sesiones opacas, CSRF y atributos de cookie se conservan detrás del proxy TLS explícito',async t=>{
  const {app,base}=await fixture(t,{secure:true,origin:'https://matricula.example.test'}),headers={Host:'matricula.example.test',Origin:'https://matricula.example.test'};
  await app.svc.saveUser({id:'setup',permissions:['admin'],allCourses:true,courses:[]},{username:'security-admin',name:'Cuenta sintética',password:'Synthetic-security-2026!',permissions,allCourses:true,courses:[]});
  const response=await rawRequest(base,'/api/login',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({username:'security-admin',password:'Synthetic-security-2026!'})});
  assert.equal(response.status,200);const result=await response.json(),setCookie=response.headers.get('set-cookie'),cookie=setCookie.split(';')[0];
  assert.match(setCookie,/; HttpOnly; SameSite=Strict; Path=\//);assert.match(setCookie,/; Secure/);assert.match(cookie,/^matricula_session=[A-Za-z0-9_-]{43}$/);
  const sessions=await app.store.db.prepare('SELECT token_hash FROM sessions').all();assert.equal(sessions.length,1);assert.equal(sessions[0].token_hash.length,64);assert.ok(!sessions[0].token_hash.includes(cookie.split('=')[1]));
  const session=await rawRequest(base,'/api/session',{headers:{...headers,Cookie:cookie}});assert.equal(session.status,200);assert.equal(session.headers.get('cache-control'),'no-store');assert.equal(session.headers.get('x-content-type-options'),'nosniff');assert.match(session.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(session.headers.get('access-control-allow-origin'),null);
  assert.equal((await rawRequest(base,'/api/logout',{method:'POST',headers:{...headers,Cookie:cookie}})).status,403);
  assert.equal((await rawRequest(base,'/api/logout',{method:'POST',headers:{...headers,Cookie:cookie,'X-CSRF-Token':'incorrecto'}})).status,403);
  const logout=await rawRequest(base,'/api/logout',{method:'POST',headers:{...headers,Cookie:cookie,'X-CSRF-Token':result.csrf}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);assert.match(logout.headers.get('set-cookie'),/; Secure/);
  assert.equal((await rawRequest(base,'/api/session',{headers:{...headers,Cookie:cookie}})).status,401);
});

test('el modo proxy requiere origen HTTPS explícito y no acepta rutas ni credenciales en su origen',async()=>{
  for(const options of [{secure:true},{secure:true,origin:'http://matricula.example.test'},{origin:'https://matricula.example.test/ruta'},{origin:'https://usuario:clave@matricula.example.test'},{origin:'file:///tmp/matricula'}])await assert.rejects(createApp(options),/MATRICULA_ORIGIN/);
});

test('el respaldo HTTP rechaza fuentes grandes antes de leerlas y mantiene errores internos privados',async t=>{
  const {app,base,directory}=await fixture(t);
  await app.svc.saveUser({id:'setup',permissions:['admin'],allCourses:true,courses:[]},{username:'backup-admin',name:'Respaldo sintético',password:'Synthetic-security-2026!',permissions,allCourses:true,courses:[]});
  const login=await rawRequest(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'backup-admin',password:'Synthetic-security-2026!'})}),session=await login.json();
  assert.equal(login.status,200);
  const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
  const backup=password=>rawRequest(base,'/api/backup',{method:'POST',headers,body:JSON.stringify({password})});
  assert.equal((await backup('corta')).status,400);
  const largePath=join(directory,'attachments','00000000-0000-4000-8000-000000000099.enc');
  const descriptor=openSync(largePath,'wx');try{ftruncateSync(descriptor,33*1024*1024);}finally{closeSync(descriptor);}
  const prepare=app.store.db.prepare;let vacuumCalls=0;
  app.store.db.prepare=sql=>{if(/^VACUUM\b/i.test(sql))vacuumCalls++;return prepare(sql);};
  try{
    const oversized=await backup('Clave-sintetica-de-respaldo-2026!');
    assert.equal(oversized.status,413);assert.equal((await oversized.json()).code,'BACKUP_FILE_REQUIRED');assert.equal(vacuumCalls,0,'El límite se comprueba antes del snapshot.');
    assert.ok(!readdirSync(directory).some(name=>name.startsWith('snapshot-')));assert.equal((await fetch(base+'/api/health')).status,200);
    unlinkSync(largePath);
    app.store.db.prepare=sql=>{if(/^VACUUM\b/i.test(sql))throw Object.assign(new Error('ruta-privada-sintetica-no-publicar'),{status:413,code:'CODIGO_PRIVADO'});return prepare(sql);};
    const failed=await backup('Clave-sintetica-de-respaldo-2026!'),error=await failed.json();
    assert.equal(failed.status,500);assert.equal(error.code,'BACKUP_FAILED');assert.ok(!JSON.stringify(error).includes('ruta-privada'));assert.equal((await fetch(base+'/api/health')).status,200);
  }finally{app.store.db.prepare=prepare;}
});
