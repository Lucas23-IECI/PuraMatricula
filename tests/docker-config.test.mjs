import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {unzipSync} from 'fflate';
import {dockerConfig,backupDestination,publicOrigin} from '../scripts/docker-lib.mjs';
import {initializeDockerData} from '../scripts/docker-init.mjs';
import {startDocker} from '../scripts/docker-start.mjs';
import {checkDockerHealth} from '../scripts/docker-healthcheck.mjs';
import {collectReleaseFiles,createPortableRelease} from '../scripts/docker-package.mjs';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {createService} from '../src/service.mjs';
import {createApp} from '../src/server.mjs';
import {openStore} from '../src/store.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),digest=value=>createHash('sha256').update(value).digest('hex');
function temporary(t){
  const path=mkdtempSync(join(tmpdir(),'puramatricula-docker-test-'));
  t.after(()=>{const target=resolve(path),base=resolve(tmpdir());assert.ok(target.startsWith(base+sep)&&basename(target).startsWith('puramatricula-docker-test-'));rmSync(target,{recursive:true,force:true});});
  return path;
}
const environment=directory=>({MATRICULA_DATA:directory,MATRICULA_HOST:'0.0.0.0',MATRICULA_PORT:'4318',MATRICULA_ORIGIN:'https://matricula.example.test',MATRICULA_TRANSPORT:'proxy',MATRICULA_BEHIND_TLS_PROXY:'1'});
const password=()=>randomBytes(24).toString('base64url');
async function availablePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function requestJson(url,{headers={},body,ca}={}){return new Promise((resolve,reject)=>{const request=(url.startsWith('https:')?https:http).request(url,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},ca},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;});response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:JSON.parse(text)}));});request.on('error',reject);if(body)request.write(JSON.stringify(body));request.end();});}

test('Compose conserva servicio, volumen y red propios y endurece ambos transportes',t=>{
  for(const [file,transport] of [['compose.yaml','proxy'],['compose.tls.yaml','tls']]){
    const result=spawnSync('docker',['compose','--project-directory',root,'--env-file',join(root,'docker.env.example'),'-f',join(root,file),'-p','puramatricula-config-test','config','--format','json'],{encoding:'utf8',timeout:15000,env:{...process.env,MATRICULA_PUBLIC_ORIGIN:'https://matricula.example.test:4433',MATRICULA_DATA_VOLUME:'puramatricula_test_data',MATRICULA_NETWORK_NAME:'puramatricula_test_private'}});
    if(result.error?.code==='ENOENT'){t.skip('Docker CLI ausente: la validación Compose requiere su cliente; no se intenta instalarlo.');return;}
    assert.equal(result.status,0,result.stderr||result.error?.message);const config=JSON.parse(result.stdout),service=config.services.puramatricula;
    assert.deepEqual(Object.keys(config.services),['puramatricula']);assert.equal(service.user,'1000:1000');assert.equal(service.read_only,true);assert.equal(service.init,true);assert.deepEqual(service.cap_drop,['ALL']);assert.ok(service.security_opt.includes('no-new-privileges:true'));assert.equal(service.restart,'unless-stopped');assert.equal(service.stop_grace_period,'30s');
    assert.equal(service.environment.MATRICULA_DATA,'/data/matricula');assert.equal(service.environment.MATRICULA_TRANSPORT,transport);assert.ok(!service.environment.MATRICULA_DATABASE_URL);assert.ok(!service.volumes.some(volume=>volume.source==='/var/run/docker.sock'));assert.equal(config.volumes['matricula-data'].name,'puramatricula_test_data');assert.equal(config.networks['matricula-private'].name,'puramatricula_test_private');assert.equal(config.networks['matricula-private'].driver,'bridge');
    assert.deepEqual(service.healthcheck.test,['CMD','node','scripts/docker-healthcheck.mjs','--quiet']);assert.equal(service.ports.length,1);
    if(transport==='proxy'){assert.equal(service.ports[0].host_ip,'127.0.0.1');assert.equal(Number(service.ports[0].target),4318);assert.equal(service.environment.MATRICULA_BEHIND_TLS_PROXY,'1');}
    else{assert.equal(Number(service.ports[0].target),4433);assert.equal(Number(service.ports[0].published),4433);const certs=service.volumes.filter(volume=>volume.type==='bind');assert.equal(certs.length,2);assert.ok(certs.every(volume=>volume.read_only&&volume.bind.create_host_path===false));}
  }
  const dockerfile=readFileSync(join(root,'Dockerfile'),'utf8');assert.match(dockerfile,/FROM node:24-bookworm-slim/);assert.match(dockerfile,/npm ci --omit=dev --ignore-scripts/);assert.match(dockerfile,/USER node/);assert.match(dockerfile,/COPY --chown=node:node scripts\/school-start\.mjs/);assert.doesNotMatch(dockerfile,/COPY\s+\.\s+\./);
});

test('Compose local fija el puerto en loopback y no conecta redes ni monta certificados',t=>{
  const result=spawnSync('docker',['compose','--project-directory',root,'--env-file',join(root,'docker.env.example'),'-f',join(root,'compose.local.yaml'),'config','--format','json'],{encoding:'utf8',timeout:15000,env:{...process.env,MATRICULA_LOCAL_PORT:'14319',MATRICULA_PUBLIC_ORIGIN:'http://192.0.2.25:14319'}});
  if(result.error?.code==='ENOENT'){t.skip('Docker CLI ausente.');return;}
  assert.equal(result.status,0,result.stderr);const config=JSON.parse(result.stdout),service=config.services.puramatricula;
  assert.deepEqual(Object.keys(config.services),['puramatricula']);
  assert.deepEqual(Object.keys(service.networks),['matricula-local']);
  assert.equal(config.networks['matricula-local'].driver_opts['com.docker.network.bridge.host_binding_ipv4'],'127.0.0.1');
  assert.equal(config.networks['matricula-local'].driver_opts['com.docker.network.bridge.enable_icc'],'false');
  assert.equal(service.environment.MATRICULA_ORIGIN,'http://127.0.0.1:14319');
  assert.equal(service.environment.MATRICULA_TRANSPORT,'local');assert.equal(service.environment.MATRICULA_BEHIND_TLS_PROXY,undefined);
  assert.equal(service.ports.length,1);assert.equal(service.ports[0].host_ip,'127.0.0.1');assert.equal(Number(service.ports[0].published),14319);
  assert.equal(service.volumes.length,1);assert.equal(service.volumes[0].type,'volume');
});

test('inicio local usa un origen exacto, cookie propia, y rechaza hosts y solicitudes cruzadas',async t=>{
  const directory=join(temporary(t),'local'),secret=password(),port=await availablePort(),origin='http://127.0.0.1:'+port;
  await initializeDockerData({directory,username:'local-admin',password:secret});
  const env={...environment(directory),MATRICULA_BEHIND_TLS_PROXY:undefined,MATRICULA_TRANSPORT:'local',MATRICULA_ORIGIN:origin,MATRICULA_PORT:String(port),MATRICULA_DESKTOP_ICON:'C:\\PuraMatricula\\public\\escudo.ico'};
  for(const invalid of ['http://192.0.2.25:'+port,'https://127.0.0.1:'+port,'http://localhost:'+port,origin+'/','http://127.0.0.1:65536'])assert.throws(()=>dockerConfig({...env,MATRICULA_ORIGIN:invalid}),/Modo local/);
  await assert.rejects(createApp({host:'0.0.0.0',origin}),/HTTPS/);
  const app=await startDocker(env);
  try{
    assert.deepEqual(await checkDockerHealth(env),{ok:true,application:'matricula'});
    const alias='matricula.localhost:'+port;
    assert.equal((await requestJson(origin+'/api/health',{headers:{Host:alias,Origin:'http://'+alias}})).status,200);
    assert.equal((await requestJson(origin+'/api/health',{headers:{Host:alias,Origin:origin}})).status,403);
    assert.equal((await requestJson(origin+'/api/health',{headers:{Host:'otro.localhost:'+port}})).status,403);
    assert.equal((await requestJson(origin+'/api/health',{headers:{Host:'localhost:'+port}})).status,403);
    function getFile(path,headers={}){
      return new Promise((done,reject)=>http.get(origin+path,{headers},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done({bytes:Buffer.concat(chunks),headers:res.headers,status:res.statusCode}));
      }).on('error',reject));
    }
    const shortcut=await getFile('/acceso-escritorio.zip?url=https://example.invalid',{Host:alias});
    assert.equal(shortcut.status,200);assert.match(shortcut.headers['content-disposition'],/attachment.*PuraMatricula-acceso.zip/);
    assert.equal(Buffer.from(unzipSync(shortcut.bytes)['PuraMatricula.url']).toString('utf16le'),'\uFEFF[InternetShortcut]\r\nURL=http://'+alias+'/\r\nIconFile=C:\\PuraMatricula\\public\\escudo.ico\r\nIconIndex=0\r\n');
    assert.match((await getFile('/',{Host:alias})).bytes.toString('utf8'),/data-desktop-shortcut="true"/);
    assert.equal((await requestJson(origin+'/api/health',{headers:{Origin:'http://127.0.0.1:4999'}})).status,403);
    for(const site of ['same-site','cross-site'])assert.equal((await requestJson(origin+'/api/health',{headers:{'Sec-Fetch-Site':site}})).status,403);
    const login=await requestJson(origin+'/api/login',{headers:{Origin:origin},body:{username:'local-admin',password:secret}});
    assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0];
    assert.match(cookie,/^matricula_local_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict/);assert.equal(login.headers['strict-transport-security'],undefined);
    assert.equal((await requestJson(origin+'/api/session',{headers:{Cookie:cookie.split(';')[0]}})).status,200);
    assert.equal((await requestJson(origin+'/api/session',{headers:{Cookie:cookie.split(';')[0].replace('matricula_local_session','matricula_session')}})).status,401);
  }finally{await app.close();}
});

test('la conexión del proxy es una extensión explícita y no une otros servicios',t=>{
  const args=['compose','--project-directory',root,'--env-file',join(root,'docker.env.example'),'-f',join(root,'compose.yaml'),'-f',join(root,'compose.proxy.yaml'),'-p','puramatricula-config-test','config','--format','json'];
  const result=spawnSync('docker',args,{encoding:'utf8',timeout:15000,env:{...process.env,MATRICULA_PUBLIC_ORIGIN:'https://matricula.example.test',MATRICULA_PROXY_NETWORK:'proxy_de_prueba_explicito'}});
  if(result.error?.code==='ENOENT'){t.skip('Docker CLI ausente.');return;}
  assert.equal(result.status,0,result.stderr||result.error?.message);const config=JSON.parse(result.stdout);assert.deepEqual(Object.keys(config.services),['puramatricula']);assert.equal(config.networks['colegio-proxy'].external,true);assert.equal(config.networks['colegio-proxy'].name,'proxy_de_prueba_explicito');assert.ok(config.services.puramatricula.networks['colegio-proxy'].aliases.includes('puramatricula-backend'));
});

test('el arranque exige HTTPS y configuración inequívoca, con clave persistente y sin demo',async t=>{
  const dir=join(temporary(t),'data'),secret=password();await initializeDockerData({directory:dir,username:'docker-admin',password:secret});const env=environment(dir),config=dockerConfig(env);
  assert.equal(config.origin,'https://matricula.example.test');assert.equal(config.directory,dir);assert.equal(config.secure,true);assert.equal(config.transport,'proxy');
  for(const origin of ['http://matricula.test','https://usuario:clave@matricula.test','https://matricula.test/ruta','https://matricula.test/?q=1'])assert.throws(()=>publicOrigin(origin),/HTTPS/);
  assert.throws(()=>dockerConfig({...env,MATRICULA_BEHIND_TLS_PROXY:undefined}),/proxy HTTPS/);assert.throws(()=>dockerConfig({...env,MATRICULA_DATABASE_URL:'postgresql://prohibido.invalid'}),/SQLite/);assert.throws(()=>dockerConfig({...env,MATRICULA_STORAGE_KEY:'no-copiar-clave-cloud'}),/SQLite/);assert.throws(()=>dockerConfig({...env,VERCEL:'1'}),/SQLite/);assert.throws(()=>dockerConfig({...env,MATRICULA_DATA_MODE:'synthetic'}),/demostración/);assert.throws(()=>dockerConfig({...env,MATRICULA_DATA:'relative'}),/absoluta/);assert.throws(()=>dockerConfig({...env,MATRICULA_PORT:'443'}),/1024/);
  writeFileSync(join(dir,'synthetic-demo.flag'),'synthetic');assert.throws(()=>dockerConfig(env),/demostración/);
});

test('inicializar por stdin no registra la clave ni reemplaza un volumen existente',t=>{
  const dir=join(temporary(t),'new-volume'),secret=password(),args=[join(root,'scripts/docker-init.mjs'),'--username','docker-admin','--password-stdin'];
  const first=spawnSync(process.execPath,args,{env:{...process.env,MATRICULA_DATA:dir},input:secret+'\n',encoding:'utf8',timeout:20000});assert.equal(first.status,0,first.stderr);assert.ok(!first.stdout.includes(secret)&&!first.stderr.includes(secret));assert.equal(readFileSync(join(dir,'storage.key')).length,32);
  const before=digest(readFileSync(join(dir,'matricula.sqlite'))),key=digest(readFileSync(join(dir,'storage.key'))),again=spawnSync(process.execPath,args,{env:{...process.env,MATRICULA_DATA:dir},input:password()+'\n',encoding:'utf8',timeout:20000});assert.notEqual(again.status,0);assert.match(again.stderr,/ya contiene archivos/);assert.equal(digest(readFileSync(join(dir,'matricula.sqlite'))),before);assert.equal(digest(readFileSync(join(dir,'storage.key'))),key);
  const store=openStore(dir);try{assert.equal(store.db.prepare('SELECT count(*) AS n FROM users').get().n,1);assert.ok(store.db.prepare('SELECT password FROM users').get().password.startsWith('temporary$'));}finally{store.close();}
});

test('HTTP detrás del proxy usa origen fijo, cookie Secure y healthcheck con Host público',async t=>{
  const directory=join(temporary(t),'data'),secret=password();await initializeDockerData({directory,username:'docker-admin',password:secret});
  const origin='https://matricula.example.test',app=await createApp({directory,host:'127.0.0.1',origin,secure:true}),address=await app.listen(0),base='http://127.0.0.1:'+address.port;
  try{
    assert.deepEqual(await checkDockerHealth({MATRICULA_ORIGIN:origin,MATRICULA_PORT:String(address.port),MATRICULA_TRANSPORT:'proxy'}),{ok:true,application:'matricula'});
    assert.equal((await requestJson(base+'/api/health')).status,403);
    const response=await requestJson(base+'/api/login',{headers:{Host:new URL(origin).host,Origin:origin},body:{username:'docker-admin',password:secret}});assert.equal(response.status,200);assert.match(response.headers['set-cookie'][0],/; Secure/);assert.match(response.headers['set-cookie'][0],/HttpOnly/);
    assert.equal((await requestJson(base+'/api/health',{headers:{Host:'matricula.example.test',Origin:'http://matricula.example.test'}})).status,403);
  }finally{await app.close();}
});

function makeTestCertificate(directory){
  const cert=join(directory,'test.crt'),key=join(directory,'test.key'),script=join(directory,'certificate.ps1');
  writeFileSync(script,String.raw`param([string]$Cert,[string]$Key)
$ErrorActionPreference='Stop'
$rsa=[System.Security.Cryptography.RSA]::Create(2048)
$name=[System.Security.Cryptography.X509Certificates.X500DistinguishedName]::new('CN=127.0.0.1')
$request=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new($name,$rsa,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san=[System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
$request.CertificateExtensions.Add($san.Build($false))
$certificate=$request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5),[DateTimeOffset]::Now.AddDays(1))
[System.IO.File]::WriteAllText($Cert,$certificate.ExportCertificatePem())
[System.IO.File]::WriteAllText($Key,$rsa.ExportPkcs8PrivateKeyPem())
`);
  for(const command of ['pwsh','powershell']){const result=spawnSync(command,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,cert,key],{encoding:'utf8',timeout:20000});if(result.status===0&&existsSync(cert)&&existsSync(key))return {cert,key};}
  return null;
}

test('TLS independiente verifica el certificado y el healthcheck sin desactivar validaciones',async t=>{
  const base=temporary(t),certificate=makeTestCertificate(base);if(!certificate){t.skip('No hay PowerShell con CertificateRequest y export PEM para generar este certificado sintético.');return;}
  const directory=join(base,'data'),secret=password(),port=await availablePort();await initializeDockerData({directory,username:'docker-admin',password:secret});
  const env={...environment(directory),MATRICULA_TRANSPORT:'tls',MATRICULA_BEHIND_TLS_PROXY:undefined,MATRICULA_PORT:String(port),MATRICULA_ORIGIN:'https://127.0.0.1:'+port,MATRICULA_TLS_CERT:certificate.cert,MATRICULA_TLS_KEY:certificate.key},config=dockerConfig(env);
  assert.ok(config.tls.cert.length>0);assert.throws(()=>dockerConfig({...env,MATRICULA_ORIGIN:'https://otro.example.test:'+port}),/no corresponde/);assert.throws(()=>dockerConfig({...env,MATRICULA_PORT:String(port===65535?port-1:port+1)}),/coincidir/);
  const doctor=spawnSync(process.execPath,[join(root,'scripts/docker-start.mjs'),'--check'],{encoding:'utf8',timeout:20000,env:{...process.env,MATRICULA_DATABASE_URL:'',MATRICULA_STORAGE_KEY:'',VERCEL:'',MATRICULA_DATA_MODE:'production',...env}});assert.equal(doctor.status,0,doctor.stderr);assert.match(doctor.stdout,/SAN y vigencia/);
  const app=await startDocker(env);
  try{assert.deepEqual(await checkDockerHealth(env),{ok:true,application:'matricula'});const login=await requestJson(env.MATRICULA_ORIGIN+'/api/login',{headers:{Origin:env.MATRICULA_ORIGIN},ca:readFileSync(certificate.cert),body:{username:'docker-admin',password:secret}});assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/; Secure/);}finally{await app.close();}
  assert.equal(app.server.listening,false);await assert.rejects(()=>checkDockerHealth(env));
  const goodKey=readFileSync(certificate.key);writeFileSync(certificate.key,'not a private key');assert.throws(()=>dockerConfig(env));writeFileSync(certificate.key,goodKey);
});

test('backup y restauración Docker conservan clave, ficha y adjunto sin sobrescribir el activo',async t=>{
  const {backupDockerData,restoreDockerData}=await import('../scripts/docker-maintenance.mjs');
  const base=temporary(t),directory=join(base,'active'),secret=password();await initializeDockerData({directory,username:'docker-admin',password:secret});
  const store=openAsyncStore(directory),svc=createService(store),actor=svc.decodeUser(await store.db.prepare('SELECT * FROM users WHERE username=?').get('docker-admin')),course=await svc.createCourse(actor,{year:2026,name:'Curso sintético Docker'}),record=await svc.create(actor,{year:2026,courseId:course.id,data:{names:'Estudiante ficticio Docker',surname:'Sintético',identifierType:'Otro',identifier:'DOCKER-ONLY-001'}}),attachment=await svc.addAttachment(actor,record.id,{version:record.version,kind:'signed',name:'ficticio.pdf',content:Buffer.from('%PDF-1.4\nSOLO PRUEBA DOCKER\n').toString('base64')});
  await store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('synthetic-session',actor.id,'synthetic-csrf',Date.now()+60000);await store.close();
  const destination=join(directory,'backups','test.dsmbak'),backupPassword=password();assert.throws(()=>backupDestination(directory,join(directory,'matricula.sqlite')),/backups/);
  await backupDockerData({directory,destination,password:backupPassword});const archiveHash=digest(readFileSync(destination));assert.equal(readFileSync(destination).subarray(0,8).toString(),'DSMBACK3');assert.ok(!readFileSync(destination).includes(Buffer.from('Estudiante ficticio Docker')));
  await assert.rejects(()=>backupDockerData({directory,destination,password:backupPassword}),/ya existe/);assert.equal(digest(readFileSync(destination)),archiveHash);
  await assert.rejects(()=>restoreDockerData({source:destination,directory,password:backupPassword}),/ya contiene archivos/);
  const restoredPath=join(base,'restored'),restored=await restoreDockerData({source:destination,directory:restoredPath,password:backupPassword});assert.equal(restored.records,1);assert.equal(restored.attachments,1);assert.equal(digest(readFileSync(join(restoredPath,'storage.key'))),digest(readFileSync(join(directory,'storage.key'))));
  const restoredStore=openAsyncStore(restoredPath);try{assert.ok(await restoredStore.verifyAudit());assert.equal((await restoredStore.db.prepare('SELECT count(*) AS n FROM sessions').get()).n,0);const restoredSvc=createService(restoredStore);assert.equal((await restoredSvc.detail(actor,record.id)).data.names,'Estudiante ficticio Docker');assert.equal((await restoredSvc.downloadAttachment(actor,attachment.id)).bytes.toString(),'%PDF-1.4\nSOLO PRUEBA DOCKER\n');}finally{await restoredStore.close();}
  const cliBackup=join(directory,'backups','cli.dsmbak'),cliRestore=join(base,'restored-cli'),script=join(root,'scripts/docker-maintenance.mjs');
  for(const args of [[script,'backup',cliBackup,'--password-stdin'],[script,'restore',cliBackup,cliRestore,'--password-stdin']]){
    const result=spawnSync(process.execPath,args,{env:{...process.env,MATRICULA_DATA:directory},input:backupPassword+'\n',encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr);assert.ok(!result.stdout.includes(backupPassword)&&!result.stderr.includes(backupPassword));
  }
  assert.equal(digest(readFileSync(join(cliRestore,'storage.key'))),digest(readFileSync(join(directory,'storage.key'))));
});

function releaseFixture(directory){
  const files={'package.json':JSON.stringify({name:'puramatricula',version:'1.2.3'}),'package-lock.json':'{}','Dockerfile':'FROM node:24-bookworm-slim\n','.dockerignore':'**\n','compose.yaml':'services: {}\n','docker.env.example':'MATRICULA_PUBLIC_ORIGIN=https://school.invalid:4433\n','docs/DOCKER-COLEGIO.md':'Entrega de prueba.','docs/ANIOS-ESCOLARES.md':'Años de prueba.','src/server.mjs':'export {};','public/app.js':'void 0;','public/home.jpg':'synthetic image','scripts/docker-test.mjs':'export {};','.env':'NEVER_PACKAGE_THIS_SECRET','.local/matricula.sqlite':'PRIVATE_DATABASE','node_modules/private/index.js':'PRIVATE_DEPENDENCY','output/private.pdf':'PRIVATE_DOCUMENT','public/alumnos.xlsx':'PRIVATE_ROSTER','public/private/real.js':'PRIVATE_PUBLIC_SUBDIR','src/secrets/credentials.mjs':'PRIVATE_SOURCE_SUBDIR'};
  for(const [path,content] of Object.entries(files)){const file=join(directory,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content);}
}
test('el ZIP portable usa whitelist y SHA-256, rechaza enlaces y no pisa otra entrega',t=>{
  const base=temporary(t),source=join(base,'source');mkdirSync(source);releaseFixture(source);
  const files=collectReleaseFiles(source);assert.ok(files.includes('docs/ANIOS-ESCOLARES.md'));for(const forbidden of ['.env','.local/matricula.sqlite','node_modules/private/index.js','output/private.pdf','public/alumnos.xlsx','public/private/real.js','src/secrets/credentials.mjs'])assert.ok(!files.includes(forbidden),forbidden);
  const options={root:source,output:join(base,'release'),now:new Date('2026-11-08T00:00:00Z')},release=createPortableRelease(options),zip=readFileSync(release.zipPath),entries=unzipSync(zip),metadata=JSON.parse(Buffer.from(entries['RELEASE.json']).toString());
  assert.equal(release.archiveSha256,digest(zip));assert.ok(readFileSync(release.checksumPath,'utf8').startsWith(release.archiveSha256+'  '));assert.equal(metadata.imageIncluded,false);assert.equal(metadata.installationRequiresNetwork,true);assert.equal(metadata.manifestSha256,digest(entries['MANIFEST.sha256']));
  for(const line of Buffer.from(entries['MANIFEST.sha256']).toString().trim().split('\n')){const [hash,path]=line.split('  ');assert.equal(digest(entries[path]),hash,path);}
  assert.ok(!Object.values(entries).some(bytes=>Buffer.from(bytes).includes(Buffer.from('NEVER_PACKAGE_THIS_SECRET'))));assert.throws(()=>createPortableRelease(options),/ya existe/);assert.equal(digest(readFileSync(release.zipPath)),release.archiveSha256);
  const target=join(source,'private');mkdirSync(target);const link=join(source,'public','linked');try{symlinkSync(target,link,process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','ENOTSUP'].includes(error.code))return;throw error;}assert.throws(()=>collectReleaseFiles(source),/enlaces|reanálisis/);
});

test('la comprobación de entrega operativa funciona sin tests y sigue detectando fuentes inválidas',t=>{
  const directory=temporary(t);for(const name of ['src','scripts','public'])mkdirSync(join(directory,name));
  writeFileSync(join(directory,'scripts','check.mjs'),readFileSync(join(root,'scripts','check.mjs')));writeFileSync(join(directory,'src','server.mjs'),'export {};');writeFileSync(join(directory,'public','app.js'),'void 0;');
  const good=spawnSync(process.execPath,['scripts/check.mjs'],{cwd:directory,encoding:'utf8',timeout:20000});assert.equal(good.status,0,good.stderr);
  writeFileSync(join(directory,'public','app.js'),'const = ;');const bad=spawnSync(process.execPath,['scripts/check.mjs'],{cwd:directory,encoding:'utf8',timeout:20000});assert.notEqual(bad.status,0);assert.match(bad.stderr,/SyntaxError/);
});

test('PowerShell recupera el servicio tras stop parcial y conserva argumentos inspect en PS5 y PS7',t=>{
  const directory=temporary(t),script=join(directory,'wrapper-regression.ps1'),psQuote=value=>"'"+value.replaceAll("'","''")+"'",wrapper=join(root,'scripts/docker-colegio.ps1');
  writeFileSync(script,`
$tokens=$null;$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(${psQuote(wrapper)},[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Wrapper con errores sintacticos.'}
foreach($definition in $ast.FindAll({param($item) $item -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true)){Invoke-Expression $definition.Extent.Text}
$ProjectRoot=${psQuote(directory)};$ProjectName='puramatricula';$ServiceName='puramatricula';$BackupFile=${psQuote(join(directory,'safety.dsmbak'))}
$script:Stopped=$false;$script:Restarted=0;$script:Cleaned=$false
function Invoke-Compose {param([string[]]$Arguments,[switch]$Capture) if($Arguments[0] -eq 'ps'){return 'puramatricula'};if($Arguments[0] -eq 'stop'){$script:Stopped=$true;throw 'stop parcial'};throw 'No debe iniciar backup despues de fallar stop'}
function Start-Matricula {$script:Restarted++}
function Remove-OwnedTaskContainer {param([string]$Name) $script:Cleaned=$true}
function Assert-LocalImage {}
try{Backup-Matricula}catch{}
$firstOutcome=[pscustomobject]@{stopped=$script:Stopped;restarted=$script:Restarted;cleaned=$script:Cleaned}
$script:Stopped=$false;$script:Restarted=0;$script:Cleaned=$false
function Assert-LocalImage {throw 'imagen local ausente'}
try{Backup-Matricula}catch{}
$preflightSafe=(-not $script:Stopped -and $script:Restarted -eq 0 -and -not $script:Cleaned)
$format='{{json .Config.Labels}}'
$native=@(& ${psQuote(process.execPath)} -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- $format)
if($LASTEXITCODE -ne 0){throw 'No se pudo comprobar el reenvio nativo de argumentos.'}
[pscustomobject]@{stopped=$firstOutcome.stopped;restarted=$firstOutcome.restarted;cleaned=$firstOutcome.cleaned;preflightSafe=$preflightSafe;native=($native -join '')}|ConvertTo-Json -Compress
`);
  let tested=0;
  for(const shell of ['powershell','pwsh']){const result=spawnSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',timeout:20000});if(result.error?.code==='ENOENT')continue;assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout.trim());assert.equal(value.stopped,true);assert.equal(value.restarted,1);assert.equal(value.cleaned,true);assert.equal(value.preflightSafe,true);assert.deepEqual(JSON.parse(value.native),['{{json .Config.Labels}}']);tested++;}
  if(!tested)t.skip('PowerShell no está instalado; no se instala para esta comprobación.');
  assert.doesNotMatch(readFileSync(wrapper,'utf8'),/\{\{\s*index\s+\.Config\.Labels\s+"/);
});

test('el asistente SH cancela el backup si no puede comprobar el estado del servicio',t=>{
  const directory=temporary(t),source=readFileSync(join(root,'scripts/docker-colegio.sh'),'utf8').replaceAll('\r\n','\n'),start=source.indexOf('backup_data() {'),end=source.indexOf('\n}\n',start);assert.ok(start>=0&&end>start);const body=source.slice(start,end+3),shell=existsSync('C:/Program Files/Git/bin/bash.exe')?'C:/Program Files/Git/bin/bash.exe':'bash';
  const regression=`set -eu\nSERVICE=puramatricula\nPROJECT_ROOT=.\nBACKUP_FILE="$PWD/safety.dsmbak"\nBACKUP_NEEDS_RESTART=0\nfail(){ printf '%s\\n' "$*" >&2; exit 1; }\nunique_token(){ printf abcdef123456; }\nassert_local_image(){ :; }\ncompose(){ if [ "$1" = ps ]; then return 17; fi; touch reached-container-operation; return 0; }\n${body}\nbackup_data\n`;
  const result=spawnSync(shell,['-c',regression],{cwd:directory,encoding:'utf8',timeout:15000});if(result.error?.code==='ENOENT'){t.skip('Shell POSIX no disponible.');return;}assert.notEqual(result.status,0);assert.match(result.stderr,/estado.*respaldo cancelado/);assert.equal(existsSync(join(directory,'reached-container-operation')),false);
});
