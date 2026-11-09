import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createAccounts, verifyAccountPassword } from '../src/accounts.mjs';
import { openAsyncStore } from '../src/async-sqlite.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';
import { createService } from '../src/service.mjs';
import { createApp } from '../src/server.mjs';
import { permissions } from '../src/fields.mjs';
import { createPglitePool } from './helpers/pglite-pool.mjs';

const temporaryPassword='Clave-temporal-sintetica!';
const personalPassword='Clave-personal-sintetica!';
const passwordReset='Clave-restablecida-sintetica!';
const accountData=(username,password=temporaryPassword)=>({ username,name:username,password,permissions:['read'],courses:[],active:true,allCourses:false });
const createPermanentAdmin=svc=>svc.saveUser({id:'setup',permissions:['admin'],courses:[],allCourses:true},{...accountData('qa-admin',personalPassword),permissions,allCourses:true});

function localFixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'pura-matricula-cuentas-'));
  const store=openAsyncStore(dir),svc=createService(store),accounts=createAccounts(store,svc);
  t.after(async()=>{await store.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
  return {store,svc,accounts};
}

test('preparar una base local crea un administrador con clave temporal y es una operación de una sola vez',async t=>{
  const {store,accounts}=localFixture(t);
  const admin=await accounts.bootstrap({username:'administrador-local',password:temporaryPassword});
  assert.ok(admin.permissions.includes('admin'));
  assert.equal(admin.allCourses,true);
  assert.equal(admin.mustChangePassword,true);
  assert.equal(admin.password,undefined);
  const raw=await store.db.prepare('SELECT * FROM users WHERE id=?').get(admin.id);
  assert.equal(verifyAccountPassword(temporaryPassword,raw.password),true);
  assert.equal(verifyAccountPassword(personalPassword,raw.password),false);
  assert.notEqual(raw.password,temporaryPassword);
  assert.equal(verifyAccountPassword('clave','hash inválido'),false);
  await assert.rejects(accounts.list(admin),{status:403,code:'PASSWORD_CHANGE_REQUIRED'});
  await assert.rejects(accounts.bootstrap(accountData('otro-admin')),{status:409,code:'ACCOUNTS_ALREADY_INITIALIZED'});
  await assert.rejects(accounts.changePassword(admin,{currentPassword:personalPassword,newPassword:passwordReset}),{status:403,code:'CURRENT_PASSWORD_INVALID'});
  await assert.rejects(accounts.changePassword(admin,{currentPassword:temporaryPassword,newPassword:temporaryPassword}),{status:400,code:'PASSWORD_UNCHANGED'});
  await accounts.changePassword(admin,{currentPassword:temporaryPassword,newPassword:personalPassword});
  const {users}=await accounts.list(admin);
  assert.equal(users[0].mustChangePassword,false);
  assert.equal(users[0].password,undefined);
  assert.equal(await store.verifyAudit(),true);
});

test('restablecer la clave revoca todas las sesiones e impide abrir otra con credenciales anteriores',async t=>{
  const {store,svc,accounts}=localFixture(t),admin=await createPermanentAdmin(svc);
  const course=await svc.createCourse(admin,{year:2026,name:'Curso ficticio'});
  const account=await accounts.saveUser(admin,{...accountData('qa-cuenta'),courses:[course.id]});
  const find=()=>store.db.prepare('SELECT * FROM users WHERE id=?').get(account.id);
  const tokenData=tokenHash=>({tokenHash,csrf:'csrf-sintetico',expires:Date.now()+3600_000});
  const original=await find();
  assert.equal((await accounts.openSession(original,tokenData('session-a'))).mustChangePassword,true);
  await accounts.openSession(original,tokenData('session-b'));
  await accounts.changePassword(account,{currentPassword:temporaryPassword,newPassword:personalPassword});
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(account.id)).n,0);
  const permanent=await find();
  assert.equal(verifyAccountPassword(personalPassword,permanent.password),true);
  await accounts.openSession(permanent,tokenData('session-permanent'));
  const reset=await accounts.saveUser(admin,{...accountData('qa-cuenta',passwordReset),courses:[course.id]},account.id);
  assert.equal(reset.mustChangePassword,true);
  assert.equal((await store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(account.id)).n,0);
  await assert.rejects(accounts.openSession(permanent,tokenData('late-session')),{status:401,code:'CREDENTIALS_CHANGED'});
  await assert.rejects(accounts.saveUser(account,accountData('no-autorizado')),{status:403});
  assert.equal((await accounts.saveUser(admin,{...accountData('qa-cuenta',''),courses:[course.id]},account.id)).mustChangePassword,true);
  const audit=(await store.db.prepare('SELECT detail FROM audit').all()).map(row=>row.detail).join('\n');
  for(const value of [temporaryPassword,personalPassword,passwordReset])assert.ok(!audit.includes(value));
  assert.equal(await store.verifyAudit(),true);
});

test('la gestión de cuentas en PostgreSQL conserva un administrador activo aun con cambios concurrentes',async t=>{
  const pool=await createPglitePool({dataDir:`memory://pura-matricula-cuentas-${randomBytes(8).toString('hex')}`});
  const store=await openPostgresStore({pool,migrate:true,key:randomBytes(32)}),svc=createService(store),accounts=createAccounts(store,svc);
  t.after(()=>store.close());
  const adminA=await createPermanentAdmin(svc);
  const adminB=await accounts.saveUser(adminA,{...accountData('qa-admin-b'),permissions:['admin']});
  await accounts.changePassword(adminB,{currentPassword:temporaryPassword,newPassword:personalPassword});
  const operations=await Promise.allSettled([
    accounts.saveUser(adminA,{...accountData(adminB.username,''),permissions:['admin'],active:false},adminB.id),
    accounts.saveUser(adminB,{...accountData(adminA.username,''),permissions:['admin'],active:false},adminA.id)
  ]);
  assert.equal(operations.filter(result=>result.status==='fulfilled').length,1);
  const active=await store.db.prepare('SELECT permissions FROM users WHERE active=1').all();
  assert.equal(active.filter(row=>JSON.parse(row.permissions).includes('admin')).length,1);
  assert.equal(await store.verifyAudit(),true);
});

test('HTTP exige cambio inicial, valida CSRF y limita al usuario a sus cursos',async t=>{
  const {store,svc}=localFixture(t),admin=await createPermanentAdmin(svc);
  const courseA=await svc.createCourse(admin,{year:2026,name:'Curso A'}),courseB=await svc.createCourse(admin,{year:2026,name:'Curso B'});
  const createRecord=(courseId,identifier)=>svc.create(admin,{year:2026,courseId,data:{names:'Ejemplo',surname:'Sintético',identifierType:'Otro',identifier}});
  const allowed=await createRecord(courseA.id,'CUENTA-A'),denied=await createRecord(courseB.id,'CUENTA-B');
  const app=await createApp({store}),address=await app.listen(0);
  t.after(()=>app.close());
  const base=`http://127.0.0.1:${address.port}`;
  const request=(path,{method='GET',body,session,csrf=true}={})=>fetch(base+path,{method,headers:{
    ...(body?{'Content-Type':'application/json'}:{}),
    ...(session?{Cookie:session.cookie,...(csrf?{'X-CSRF-Token':session.csrf}:{})}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  const login=async (username,password)=>{
    const response=await request('/api/login',{method:'POST',body:{username,password}});
    assert.equal(response.status,200);
    const data=await response.json();
    return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:data.csrf,user:data.user};
  };
  const adminSession=await login(admin.username,personalPassword);
  const created=await request('/api/users',{method:'POST',session:adminSession,body:{...accountData('qa-profesor'),permissions:['read','export'],courses:[courseA.id]}});
  assert.equal(created.status,201);
  const newUser=await created.json();
  assert.equal(newUser.mustChangePassword,true);
  assert.equal(newUser.password,undefined);
  const tempSession=await login(newUser.username,temporaryPassword);
  assert.equal(tempSession.user.mustChangePassword,true);
  assert.equal((await request('/api/session',{session:tempSession})).status,200);
  const blocked=await request('/api/meta',{session:tempSession});
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json()).code,'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await request(`/api/records/${allowed.id}/pdf`,{session:tempSession})).status,403);
  const change={method:'POST',session:tempSession,body:{currentPassword:temporaryPassword,newPassword:personalPassword}};
  assert.equal((await request('/api/account/password',{...change,csrf:false})).status,403);
  const changed=await request('/api/account/password',change);
  assert.equal(changed.status,200);
  assert.match(changed.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await request('/api/session',{session:tempSession})).status,401);
  const session=await login(newUser.username,personalPassword);
  assert.equal(session.user.mustChangePassword,false);
  assert.equal((await request(`/api/records/${allowed.id}`,{session})).status,200);
  assert.equal((await request(`/api/records/${denied.id}`,{session})).status,403);
  assert.equal((await request(`/api/records/${denied.id}/pdf`,{session})).status,403);
  assert.equal((await request('/api/users',{session})).status,403);
  const reset=await request(`/api/users/${newUser.id}`,{method:'PUT',session:adminSession,body:{...accountData(newUser.username,passwordReset),permissions:['read','export'],courses:[courseA.id]}});
  assert.equal(reset.status,200);
  assert.equal((await request('/api/session',{session})).status,401);
  assert.equal((await login(newUser.username,passwordReset)).user.mustChangePassword,true);
});
