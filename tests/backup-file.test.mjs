import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,scryptSync,createCipheriv,createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile,readFile,stat,readdir,open,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {openStore} from '../src/store.mjs';
import {createBackup,restoreBackup,BackupLimitError,MAX_LEGACY_BACKUP_BYTES} from '../src/backup.mjs';
import {createBackupFile,restoreBackupFile,BACKUP_FILE_LIMITS} from '../src/backup-file.mjs';

const password='Clave-sintetica-respaldo-2026!';
async function fixture(t,{attachments=1,size=1025}={}){
  const root=await mkdtemp(join(tmpdir(),'dsm-backup-file-'));
  const dir=join(root,'source'),store=openStore(dir);t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)').run('qa','synthetic','Cuenta sintética','synthetic-hash','[]','[]',1,1);
  store.db.prepare('INSERT INTO courses VALUES(?,?,?)').run('course',2026,'Curso sintético');
  store.db.prepare('INSERT INTO students VALUES(?,?,?,?)').run('student',store.mac('synthetic'),null,null);
  store.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?)').run('record','student',2026,'course',1,'draft','Sintético',1,store.seal({names:'ESTUDIANTE-SINTETICO-PRIVADO'}),'2026-01-01');
  store.db.prepare('INSERT INTO revisions(record_id,version,actor,at,snapshot) VALUES(?,?,?,?,?)').run('record',1,'qa','2026-01-01',store.seal({names:'Sintético'}));
  store.db.prepare('INSERT INTO events(record_id,action,actor,at,detail) VALUES(?,?,?,?,?)').run('record','create','qa','2026-01-01',store.seal({reason:'Sintético'}));
  store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('session','qa','csrf',Date.now()+100000);
  for(let i=0;i<attachments;i++){
    const id=randomUUID(),bytes=Buffer.alloc(size,(i+17)%255);bytes.write('%PDF-');
    await writeFile(join(dir,'attachments',id+'.enc'),store.seal(bytes.toString('base64')),{mode:0o600});
    store.db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'record','signed','sintético.pdf','application/pdf',1,store.mac(bytes),bytes.length,'qa','2026-01-01');
  }
  store.audit('qa','fixture.create','',{});return {root,dir,store};
}
async function digest(path){const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex');}
async function absent(path){await assert.rejects(lstat(path),{code:'ENOENT'});}
function archive(entries){
  const header=Buffer.concat([Buffer.from('DSMBACK3'),randomBytes(16),randomBytes(12),Buffer.alloc(16)]),cipher=createCipheriv('aes-256-gcm',scryptSync(password,header.subarray(8,24),32),header.subarray(24,36));cipher.setAAD(header.subarray(0,36));
  const data=[];for(const [name,bytes] of entries){const n=Buffer.from(name),frame=Buffer.alloc(10);frame.writeUInt16BE(n.length);frame.writeBigUInt64BE(BigInt(bytes.length),2);data.push(frame,n,bytes);}data.push(Buffer.alloc(10));
  const encrypted=Buffer.concat([cipher.update(Buffer.concat(data)),cipher.final()]);cipher.getAuthTag().copy(header,36);return Buffer.concat([header,encrypted]);
}

test('DSMBACK3 restaura base, historial y adjunto; invalida sesiones y conserva auditoría',async t=>{
  const {root,dir,store}=await fixture(t),file=join(root,'backup.dsmbak'),destination=join(root,'restored');
  assert.equal((await createBackupFile(store,password,file,'qa')).format,3);
  const raw=await readFile(file);assert.equal(raw.subarray(0,8).toString(),'DSMBACK3');assert(!raw.includes(Buffer.from('ESTUDIANTE-SINTETICO-PRIVADO')));
  const result=await restoreBackupFile(file,password,destination);assert.equal(result.records,1);assert.equal(result.attachments,1);assert.equal(result.format,3);
  const restored=openStore(destination);try{
    assert(restored.verifyAudit());assert.equal(restored.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    assert.equal(JSON.parse(restored.unseal(restored.db.prepare('SELECT data FROM records').get().data)).names,'ESTUDIANTE-SINTETICO-PRIVADO');
    assert.equal(restored.db.prepare('SELECT action FROM audit ORDER BY id DESC LIMIT 1').get().action,'backup.restore');
  }finally{restored.close();}
  const [name]=await readdir(join(dir,'attachments'));assert.equal(await digest(join(dir,'attachments',name)),await digest(join(destination,'attachments',name)));
  await assert.rejects(createBackupFile(store,password,file),/ya existe/);await assert.rejects(restoreBackupFile(file,password,destination),/nueva o vacía/);
  assert(!(await readdir(root)).some(n=>n.startsWith('.dsmbak-')));
});

test('el formato en archivos supera el límite HTTP con E/S por bloques y varios adjuntos',async t=>{
  const {root,dir,store}=await fixture(t,{attachments:5,size:4*1024*1024}),file=join(root,'medium.dsmbak'),destination=join(root,'large-restored');
  await assert.rejects(createBackup(store,password),e=>e instanceof BackupLimitError&&e.status===413&&e.code==='BACKUP_FILE_REQUIRED');
  assert(!(await readdir(dir)).some(n=>n.startsWith('snapshot-')));
  await createBackupFile(store,password,file);assert((await stat(file)).size>32*1024*1024);
  const result=await restoreBackupFile(file,password,destination);assert.equal(result.attachments,5);assert.equal(result.records,1);
  const names=await readdir(join(dir,'attachments'));for(const name of names)assert.equal(await digest(join(dir,'attachments',name)),await digest(join(destination,'attachments',name)));
});

test('clave incorrecta, tag/cifrado truncado o alterado no dejan datos restaurados',async t=>{
  const {root,store}=await fixture(t),file=join(root,'valid.dsmbak');await createBackupFile(store,password,file);const valid=await readFile(file);
  const mutations=[['wrong-key',valid,'Clave-erronea-sintetica-2026!'],['truncated',valid.subarray(0,-1),password],['tag',Buffer.from(valid),password],['ciphertext',Buffer.from(valid),password]];
  mutations[2][1][36]^=1;mutations[3][1][100]^=1;
  for(const [name,bytes,key] of mutations){const source=join(root,name+'.dsmbak'),dest=join(root,name);await writeFile(source,bytes);await mkdir(dest);await assert.rejects(restoreBackupFile(source,key,dest),/incorrecta|alterado/);assert.deepEqual(await readdir(dest),[]);}
  assert(!(await readdir(root)).some(n=>n.startsWith('.dsmbak-')));
});

test('frames autenticados rechazan rutas, duplicados, conteos y longitudes antes de publicar',async t=>{
  const {root}=await fixture(t),manifest=Buffer.from(JSON.stringify({version:3,attachments:0,entries:3}));
  const cases=[
    [['manifest.json',manifest],['../escaped',Buffer.from('x')]],
    [['manifest.json',manifest],['storage.key',randomBytes(32)],['storage.key',randomBytes(32)]],
    [['manifest.json',manifest],['attachments/not-a-uuid.enc',Buffer.alloc(40)]],
    [['manifest.json',manifest],['storage.key',randomBytes(31)]],
    [['storage.key',randomBytes(32)]],
    [['manifest.json',Buffer.from('{"version":3,"attachments":99999999,"entries":100000002}')]]
  ];
  for(let i=0;i<cases.length;i++){const source=join(root,`malicious-${i}.dsmbak`),dest=join(root,`rejected-${i}`);await writeFile(source,archive(cases[i]));await assert.rejects(restoreBackupFile(source,password,dest));await absent(dest);}
  await absent(join(root,'escaped'));assert(!(await readdir(root)).some(n=>n.startsWith('.dsmbak-')));
});

test('una auditoría o un adjunto inválidos impiden publicación y no tocan destino vacío',async t=>{
  const {root,dir,store}=await fixture(t),file=join(root,'invalid-attachment.dsmbak'),destination=join(root,'empty');
  const [name]=await readdir(join(dir,'attachments'));await writeFile(join(dir,'attachments',name),store.seal(Buffer.from('alterado').toString('base64')));
  await createBackupFile(store,password,file);await mkdir(destination);await assert.rejects(restoreBackupFile(file,password,destination));assert.deepEqual(await readdir(destination),[]);
  store.db.exec('DROP TRIGGER audit_no_update');store.db.prepare('UPDATE audit SET actor=? WHERE id=1').run('alterado');
  const auditFile=join(root,'invalid-audit.dsmbak');await createBackupFile(store,password,auditFile);await assert.rejects(restoreBackupFile(auditFile,password,join(root,'audit-rejected')),/auditoría/);await absent(join(root,'audit-rejected'));
});

test('CLI de archivos admite DSMBACK1 y limita archivos heredados antes de leerlos',async t=>{
  const {root,store}=await fixture(t),file=join(root,'legacy.dsmbak');await writeFile(file,await createBackup(store,password));
  const result=await restoreBackupFile(file,password,join(root,'legacy-restored'));assert.equal(result.format,1);assert.equal(result.attachments,1);
  const oversized=join(root,'oversized.dsmbak'),handle=await open(oversized,'wx');await handle.write(Buffer.from('DSMBACK1'));await handle.truncate(MAX_LEGACY_BACKUP_BYTES+1);await handle.close();
  await assert.rejects(restoreBackupFile(oversized,password,join(root,'oversized-restored')),e=>e instanceof BackupLimitError);await absent(join(root,'oversized-restored'));
  assert.throws(()=>restoreBackup(Buffer.alloc(53),'x'.repeat(201),join(root,'never')),/inválido/);
});

test('restauración rechaza metadatos demasiado anchos, JSON inválido y columnas desconocidas',async t=>{
  const {root,store}=await fixture(t),file=join(root,'wide-template.dsmbak');
  store.db.prepare('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?)').run('Ancha','["'+'x'.repeat(BACKUP_FILE_LIMITS.value)+'"]','2026-01-01');
  await createBackupFile(store,password,file);await assert.rejects(restoreBackupFile(file,password,join(root,'wide-rejected')));await absent(join(root,'wide-rejected'));
  // A separate malformed user JSON needs no huge fixture and must not publish.
  store.db.exec('DROP TRIGGER templates_no_delete');store.db.prepare('DELETE FROM templates WHERE id>1').run();
  store.db.prepare('UPDATE users SET permissions=?').run('{invalid');const malformed=join(root,'json.dsmbak');await createBackupFile(store,password,malformed);await assert.rejects(restoreBackupFile(malformed,password,join(root,'json-rejected')));await absent(join(root,'json-rejected'));
  store.db.prepare('UPDATE users SET permissions=?').run('[]');store.db.exec('ALTER TABLE records ADD COLUMN unexpected TEXT');
  const altered=join(root,'schema.dsmbak');await createBackupFile(store,password,altered);await assert.rejects(restoreBackupFile(altered,password,join(root,'schema-rejected')));await absent(join(root,'schema-rejected'));
});

test('comandos npm backup/restore conservan variables y argumentos; restauran V3 verificado',async t=>{
  const {root,dir}=await fixture(t),file=join(root,'cli.dsmbak'),destination=join(root,'cli-restored');
  const env={...process.env,MATRICULA_DATA:dir,MATRICULA_BACKUP_PASSWORD:password};delete env.MATRICULA_DATABASE_URL;
  const run=(script,args)=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/'+script,import.meta.url)),...args],{env,encoding:'utf8',timeout:15000});
  const backup=run('backup.mjs',[file]);assert.equal(backup.status,0,backup.stderr);assert.match(backup.stdout,/Respaldo cifrado creado/);
  const restore=run('restore.mjs',[file,destination]);assert.equal(restore.status,0,restore.stderr);assert.match(restore.stdout,/Restauración verificada: 1 fichas y 1 adjuntos/);
  const second=run('backup.mjs',[file]);assert.notEqual(second.status,0);assert.match(second.stderr,/ya existe/);
  env.MATRICULA_DATA=join(root,'typo-source');const wrong=run('backup.mjs',[join(root,'wrong-source.dsmbak')]);assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/base inicializada/);await absent(env.MATRICULA_DATA);await absent(join(root,'wrong-source.dsmbak'));
  const restored=openStore(destination);try{assert(restored.verifyAudit());assert.equal(restored.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);}finally{restored.close();}
});

test('la cota por fila incluye metadatos combinados antes de recomputar HMAC de auditoría',async t=>{
  const {root,store}=await fixture(t),file=join(root,'combined-metadata.dsmbak');
  store.audit('x'.repeat(BACKUP_FILE_LIMITS.value/2),'synthetic','y'.repeat(BACKUP_FILE_LIMITS.value/2),{});
  await createBackupFile(store,password,file);await assert.rejects(restoreBackupFile(file,password,join(root,'combined-rejected')));await absent(join(root,'combined-rejected'));
});
