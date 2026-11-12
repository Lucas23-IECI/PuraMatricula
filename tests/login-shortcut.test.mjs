
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,cpSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const helpers=app.slice(app.indexOf("const rememberedUserStorageKey="),app.indexOf('function login('));
function fixture({blocked=false}={}){
 let now=Date.UTC(2026,10,9);
 const entries=new Map(),writes=[];
 const storage={getItem(key){if(blocked)throw Error('blocked');return entries.get(key)??null;},setItem(key,value){if(blocked)throw Error('blocked');entries.set(key,value);writes.push(JSON.parse(value));},removeItem(key){if(blocked)throw Error('blocked');entries.delete(key);}};
 const ctx=vm.createContext({localStorage:storage,Date:{now:()=>now}});
 vm.runInContext(helpers+';globalThis.api={readRememberedUsername,rememberLoginUsername,forgetRememberedUsername};',ctx);
 return {api:ctx.api,entries,writes,advance:ms=>now+=ms,now:()=>now,key:'matricula:remembered-user:v1',ttl:30*24*3600000};
}
test('recordar usuario guarda solo nombre y caduca a los treinta dias sin renovar con cada ingreso',()=>{
 const f=fixture();
 assert.equal(f.api.readRememberedUsername(),'');
 f.api.rememberLoginUsername('direccion');
 const first=[...f.entries.values()][0];
 assert.deepEqual(Object.keys(JSON.parse(first)).sort(),['expiresAt','username']);
 f.advance(f.ttl-1);f.api.rememberLoginUsername('direccion');
 assert.equal([...f.entries.values()][0],first);
 assert.equal(f.api.readRememberedUsername(),'direccion');
 f.advance(1);assert.equal(f.api.readRememberedUsername(),'');assert.equal(f.entries.size,0);
 f.api.rememberLoginUsername('otra.cuenta');f.api.forgetRememberedUsername();assert.equal(f.entries.size,0);
});
test('usuario recordado ignora formatos maliciosos y almacenamiento bloqueado',()=>{
 const f=fixture();
 for(const raw of ['null','[]','{}','{',JSON.stringify({username:'<img onerror=x>',expiresAt:f.now()+10}),JSON.stringify({username:'direccion',expiresAt:f.now()+f.ttl+1}),JSON.stringify({username:'direccion',expiresAt:f.now()+10,password:'NO-ACEPTAR'})]){
  f.entries.set(f.key,raw);assert.equal(f.api.readRememberedUsername(),'');assert.equal(f.entries.size,0);
 }
 assert.doesNotThrow(()=>{const b=fixture({blocked:true});b.api.rememberLoginUsername('direccion');assert.equal(b.api.readRememberedUsername(),'');b.api.forgetRememberedUsername();});
});
test('el acceso de escritorio conserva el icono, no pisa otro archivo y admite alternativa IP',t=>{
 if(process.platform!=='win32'){t.skip('Acceso de Windows requiere PowerShell.');return;}
 const root=mkdtempSync(join(tmpdir(),'matricula-shortcut-'));
 t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
 mkdirSync(join(root,'scripts'));mkdirSync(join(root,'public'));mkdirSync(join(root,'desktop'));
 cpSync(new URL('../scripts/crear-acceso-directo.ps1',import.meta.url),join(root,'scripts','crear-acceso-directo.ps1'));
 cpSync(new URL('../public/escudo.ico',import.meta.url),join(root,'public','escudo.ico'));
 writeFileSync(join(root,'docker.env'),'MATRICULA_DOCKER_MODE=local\nMATRICULA_LOCAL_PORT=14325\nMATRICULA_ORIGIN=http://192.168.1.25:14325\n');
 const run=(...args)=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'scripts','crear-acceso-directo.ps1'),'-Carpeta',join(root,'desktop'),...args],{encoding:'utf8'});
 const first=run();assert.equal(first.status,0,first.stderr);
 const path=first.stdout.trim(),contents=readFileSync(path);
 assert.equal(contents.readUInt16LE(0),0xfeff);assert.match(contents.toString('utf16le'),/URL=http:\/\/192\.168\.1\.25:14325\//);
 assert.match(contents.toString('utf16le'),/IconFile=.*public\\escudo\.ico/);
 const again=run();assert.equal(again.stdout.trim(),path);
 const other=run('-UsarIP');assert.equal(other.status,0,other.stderr);
 assert.notEqual(other.stdout.trim(),path);assert.match(readFileSync(other.stdout.trim(),'utf16le'),/URL=http:\/\/127\.0\.0\.1:14325\//);
 assert.deepEqual(readFileSync(path),contents);
});
