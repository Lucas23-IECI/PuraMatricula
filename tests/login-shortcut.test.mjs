
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,cpSync,writeFileSync,rmSync,readdirSync,symlinkSync,lstatSync,existsSync} from 'node:fs';
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
function shortcutFixture(t) {
 const root=mkdtempSync(join(tmpdir(),'matricula-shortcut-'));
 t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
 mkdirSync(join(root,'scripts'));mkdirSync(join(root,'public'));mkdirSync(join(root,'desktop'));
 cpSync(new URL('../scripts/crear-acceso-directo.ps1',import.meta.url),join(root,'scripts','crear-acceso-directo.ps1'));
 cpSync(new URL('../public/escudo.ico',import.meta.url),join(root,'public','escudo.ico'));
 const desktop=join(root,'desktop'),icon=join(root,'public','escudo.ico');
 const config=(...lines)=>writeFileSync(join(root,'docker.env'),['MATRICULA_DOCKER_MODE=local','MATRICULA_LOCAL_PORT=14325',...lines,''].join('\n'));
 const run=(...args)=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'scripts','crear-acceso-directo.ps1'),'-Carpeta',desktop,...args],{encoding:'utf8'});
 const shortcut=(url,iconFile=icon)=>Buffer.from(['\ufeff[InternetShortcut]',`URL=${url}`,`IconFile=${iconFile}`,'IconIndex=0',''].join('\r\n'),'utf16le');
 return {root,desktop,config,run,shortcut};
}
test('el acceso de escritorio conserva el icono, no pisa otro archivo y admite alternativa IP',t=>{
 if(process.platform!=='win32'){t.skip('Acceso de Windows requiere PowerShell.');return;}
 const {config,run}=shortcutFixture(t);
 config('MATRICULA_ORIGIN=http://192.168.1.25:14325');
 const first=run();assert.equal(first.status,0,first.stderr);
 const path=first.stdout.trim(),contents=readFileSync(path);
 assert.equal(contents.readUInt16LE(0),0xfeff);assert.match(contents.toString('utf16le'),/URL=http:\/\/192\.168\.1\.25:14325\//);
 assert.match(contents.toString('utf16le'),/IconFile=.*public\\escudo\.ico/);
 const again=run();assert.equal(again.stdout.trim(),path);
 const other=run('-UsarIP');assert.equal(other.status,0,other.stderr);
 assert.notEqual(other.stdout.trim(),path);assert.match(readFileSync(other.stdout.trim(),'utf16le'),/URL=http:\/\/127\.0\.0\.1:14325\//);
 assert.deepEqual(readFileSync(path),contents);
});

test('actualizar renueva solo accesos propios y la variante IP conserva la LAN',t=>{
 if(process.platform!=='win32'){t.skip('Acceso de Windows requiere PowerShell.');return;}
 const {root,desktop,config,run,shortcut}=shortcutFixture(t);
 config('MATRICULA_ORIGIN=http://192.168.1.25:14325','MATRICULA_LAN_IP=192.168.1.25','MATRICULA_TRANSPORT=lan');
 const primary=join(desktop,'Matricula del colegio.url');
 const legacy=join(desktop,'Matricula del colegio (2).url');
 const legacyAlt=join(desktop,'Matricula del colegio (3).url');
 const otherPort=join(desktop,'Matricula del colegio (4).url');
 const junction=join(desktop,'Matricula del colegio (5).url');
 const preserved=shortcut('http://matricula.localhost:14325/',join(root,'other.ico'));
 const wrongPort=shortcut('http://matricula.localhost:14326/');
 writeFileSync(primary,preserved);
 writeFileSync(legacy,shortcut('http://matricula.localhost:14325/'));
 writeFileSync(legacyAlt,shortcut('http://127.0.0.1:14325/'));
 writeFileSync(otherPort,wrongPort);
 symlinkSync(join(root,'public'),junction,'junction');
 const refreshed=run('-OrigenAnterior','http://127.0.0.1:14325');
 assert.equal(refreshed.status,0,refreshed.stderr);
 assert.equal(refreshed.stdout.trim(),legacy);
 const expected=shortcut('http://192.168.1.25:14325/');
 assert.deepEqual(readFileSync(legacy),expected);
 assert.deepEqual(readFileSync(legacyAlt),expected);
 assert.deepEqual(readFileSync(primary),preserved);
 assert.deepEqual(readFileSync(otherPort),wrongPort);
 assert.ok(lstatSync(junction).isSymbolicLink());
 assert.deepEqual(readdirSync(desktop).sort(),[primary,legacy,legacyAlt,otherPort,junction].map(p=>p.slice(desktop.length+1)).sort());
 const byIP=run('-UsarIP');assert.equal(byIP.status,0,byIP.stderr);
 assert.equal(byIP.stdout.trim(),legacy);
 // The already published LAN updater left the old primary shortcut behind.
 writeFileSync(legacy,shortcut('http://matricula.localhost:14325/'));
 const alreadyLan=run('-OrigenAnterior','http://192.168.1.25:14325/');
 assert.equal(alreadyLan.status,0,alreadyLan.stderr);
 assert.equal(alreadyLan.stdout.trim(),legacy);
 assert.deepEqual(readFileSync(legacy),expected);
 config('MATRICULA_ORIGIN=http://192.168.1.99:14325','MATRICULA_LAN_IP=192.168.1.99','MATRICULA_TRANSPORT=lan');
 rmSync(primary);
 const moved=run('-OrigenAnterior','http://192.168.1.25:14325/');
 assert.equal(moved.status,0,moved.stderr);
 assert.equal(moved.stdout.trim(),legacy);
 assert.deepEqual(readFileSync(legacy),shortcut('http://192.168.1.99:14325/'));
 assert.ok(!existsSync(primary),'No crea otro acceso cuando queda libre el primer nombre');
});
