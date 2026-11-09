import {randomBytes,scryptSync,createCipheriv,createDecipheriv,createHmac,timingSafeEqual} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdtemp,mkdir,readdir,unlink,rm,rmdir,rename,link} from 'node:fs/promises';
import {dirname,join,resolve,basename} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.mjs';
import {createBackup,restoreBackup,MAX_LEGACY_BACKUP_BYTES,validateBackupPassword,BackupLimitError} from './backup.mjs';

// DSMBACK3: magic[8], salt[16], IV[12], GCM tag[16], then encrypted frames.
// Each frame is uint16BE(name bytes), uint64BE(data bytes), UTF-8 name, data.
// A zero/zero frame terminates the archive. Header bytes 0..35 are GCM AAD.
// Only the authenticated spool is materialized; no archive path is extracted.
export const BACKUP_FILE_LIMITS=Object.freeze({chunk:64*1024,name:96,entries:100003,database:16*1024**3,attachment:16*1024**2,total:64*1024**3,value:8*1024**2});
const L=BACKUP_FILE_LIMITS,MAGIC='DSMBACK3',ATTACHMENT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/;
const invalid=()=>new Error('Contenido de respaldo inválido o incompatible.');
const authError=()=>new Error('Clave incorrecta o respaldo alterado.');

async function regularFile(path){
  const before=await lstat(path);if(!before.isFile()||before.isSymbolicLink())throw invalid();
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{const after=await file.stat();if(!after.isFile()||after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size)throw invalid();return {file,size:after.size};}catch(error){await file.close();throw error;}
}
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function unlinkIfExists(path){try{await unlink(path);}catch(error){if(error.code!=='ENOENT')throw error;}}
async function cleanupSequence(actions){let first;for(const action of actions)try{await action();}catch(error){first??=error;}if(first)throw first;}
async function writeAll(file,bytes,position=null){let at=0;while(at<bytes.length){const {bytesWritten}=await file.write(bytes,at,bytes.length-at,position===null?null:position+at);if(!bytesWritten)throw new Error('No se pudo escribir el respaldo.');at+=bytesWritten;}}
async function readExact(file,length,position){const bytes=Buffer.alloc(length);let at=0;while(at<length){const {bytesRead}=await file.read(bytes,at,length-at,position+at);if(!bytesRead)throw invalid();at+=bytesRead;}return bytes;}
function frame(name,length){const encoded=Buffer.from(name);if(encoded.length>L.name)throw invalid();const head=Buffer.alloc(10);head.writeUInt16BE(encoded.length);head.writeBigUInt64BE(BigInt(length),2);return [head,encoded];}
function safeLength(name,length){
  if(!Number.isSafeInteger(length)||length<0)throw invalid();
  if(name==='manifest.json')return length>0&&length<=4096;
  if(name==='storage.key')return length===32;
  if(name==='matricula.sqlite')return length>=100&&length<=L.database;
  return name.startsWith('attachments/')&&ATTACHMENT.test(name.slice(12))&&length>=40&&length<=L.attachment;
}
async function cleanOwned(path,parent,prefix){
  const full=resolve(path),root=resolve(parent);if(dirname(full)!==root||!basename(full).startsWith(prefix)||full===root)throw new Error('Ruta temporal inválida.');
  await rm(full,{recursive:true,force:true,maxRetries:3,retryDelay:50});
}
async function emptyDestination(destination){
  const dir=resolve(destination),info=await exists(dir);
  if(info&&(!info.isDirectory()||info.isSymbolicLink()||(await readdir(dir)).length))throw new Error('Restaure únicamente en una carpeta nueva o vacía.');
  // Parent must exist. A sibling stage and final rename must share a filesystem.
  const parent=await realpath(dirname(dir));return {dir:join(parent,basename(dir)),parent};
}
async function publishDirectory(stage,dir){
  const info=await exists(dir);if(info){if(!info.isDirectory()||info.isSymbolicLink()||(await readdir(dir)).length)throw new Error('La carpeta de destino dejó de estar vacía.');await rmdir(dir);}
  // No copying into an active directory and no mountpoint replacement fallback.
  await rename(stage,dir);
}
async function publishFile(partial,destination){await link(partial,destination);await unlink(partial);}

/** Large local SQLite backups never build a JSON/base64 copy of the database. */
export async function createBackupFile(store,password,destination,actor='local'){
  validateBackupPassword(password);
  const target=resolve(destination),parent=await realpath(dirname(target));
  if(await exists(target))throw new Error('El archivo de respaldo ya existe; elija otro nombre.');
  const partial=join(parent,`.dsmbak-partial-${randomBytes(16).toString('hex')}`);
  let output,snapshot,db;
  try{
    output=await open(partial,'wx',0o600);
    if(store.kind==='postgres'){
      const bytes=await createBackup(store,password,actor);await writeAll(output,bytes);await output.sync();await output.close();output=null;
      await publishFile(partial,target);return {destination:target,format:2};
    }
    await store.audit(actor,'backup.create','',{format:3});
    snapshot=join(store.dir,`.backup-snapshot-${randomBytes(16).toString('hex')}.sqlite`);
    const reserved=await open(snapshot,'wx',0o600);await reserved.close();await store.db.prepare('VACUUM INTO ?').run(snapshot);
    db=new DatabaseSync(snapshot,{readOnly:true});
    const count=Number(db.prepare('SELECT count(*) AS n FROM attachments').get().n);
    if(!Number.isSafeInteger(count)||count+3>L.entries)throw new Error('Demasiados adjuntos para este formato de respaldo.');
    const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([Buffer.from(MAGIC),salt,iv,Buffer.alloc(16)]);
    const cipher=createCipheriv('aes-256-gcm',scryptSync(password,salt,32),iv);cipher.setAAD(header.subarray(0,36));await writeAll(output,header);
    let total=0;
    const encrypted=async bytes=>{total+=bytes.length;if(total>L.total)throw new Error('El respaldo supera el tamaño admitido.');await writeAll(output,cipher.update(bytes));};
    const entryBytes=async(name,bytes)=>{if(!safeLength(name,bytes.length))throw invalid();for(const b of frame(name,bytes.length))await encrypted(b);await encrypted(bytes);};
    const entryFile=async(name,path)=>{
      const {file,size}=await regularFile(path);
      try{if(!safeLength(name,size))throw invalid();for(const b of frame(name,size))await encrypted(b);let copied=0;
        for await(const chunk of file.createReadStream({highWaterMark:L.chunk,autoClose:false})){copied+=chunk.length;if(copied>size)throw new Error('Un archivo cambió mientras se respaldaba.');await encrypted(chunk);}
        if(copied!==size||(await file.stat()).size!==size)throw new Error('Un archivo cambió mientras se respaldaba.');
      }finally{await file.close();}
    };
    await entryBytes('manifest.json',Buffer.from(JSON.stringify({version:3,createdAt:new Date().toISOString(),attachments:count,entries:count+3})));
    if(!Buffer.isBuffer(store.key)||store.key.length!==32)throw invalid();await entryBytes('storage.key',store.key);
    await entryFile('matricula.sqlite',snapshot);
    for(const row of db.prepare('SELECT id FROM attachments ORDER BY id').iterate()){
      const name=row.id+'.enc';if(!ATTACHMENT.test(name))throw invalid();await entryFile('attachments/'+name,join(store.dir,'attachments',name));
    }
    await encrypted(Buffer.alloc(10));await writeAll(output,cipher.final());await writeAll(output,cipher.getAuthTag(),36);await output.sync();await output.close();output=null;
    await publishFile(partial,target);return {destination:target,format:3,attachments:count};
  }finally{
    await cleanupSequence([()=>db?.close(),()=>output?.close(),()=>snapshot?unlinkIfExists(snapshot):undefined,()=>unlinkIfExists(partial)]);
  }
}

// Decode each base64 layer without ever loading an attachment into memory.
function decode64(state,input,final=false){
  state.tail+=input.toString('latin1');if(!/^[A-Za-z0-9+/]*={0,2}$/.test(state.tail))throw invalid();
  let length=Math.floor(state.tail.length/4)*4;const padding=state.tail.indexOf('=');if(!final&&padding>=0)length=Math.floor(padding/4)*4;
  if(final&&state.tail.length%4)throw invalid();
  const text=state.tail.slice(0,length),bytes=Buffer.from(text,'base64');if(bytes.toString('base64')!==text)throw invalid();state.tail=state.tail.slice(length);
  if(final&&state.tail)throw invalid();return bytes;
}
async function verifyAttachment(path,row,key){
  const {file,size}=await regularFile(path);if(size>L.attachment){await file.close();throw invalid();}
  const outer={tail:''},inner={tail:''},mac=createHmac('sha256',key);let header=Buffer.alloc(0),decipher,rawSize=0;
  const plaintext=bytes=>{const raw=decode64(inner,bytes);rawSize+=raw.length;if(rawSize>L.attachment)throw invalid();mac.update(raw);};
  const sealed=bytes=>{if(header.length<28){const take=Math.min(28-header.length,bytes.length);header=Buffer.concat([header,bytes.subarray(0,take)]);bytes=bytes.subarray(take);if(header.length===28){decipher=createDecipheriv('aes-256-gcm',key,header.subarray(0,12));decipher.setAuthTag(header.subarray(12,28));}}if(bytes.length)plaintext(decipher.update(bytes));};
  try{
    for await(const chunk of file.createReadStream({highWaterMark:L.chunk,autoClose:false}))sealed(decode64(outer,chunk));
    sealed(decode64(outer,Buffer.alloc(0),true));if(!decipher)throw invalid();plaintext(decipher.final());const last=decode64(inner,Buffer.alloc(0),true);rawSize+=last.length;mac.update(last);
    const hash=mac.digest(),expected=Buffer.from(row.hash,'hex');if(expected.length!==hash.length||!timingSafeEqual(hash,expected)||rawSize!==row.size)throw new Error('Adjunto alterado.');
  }finally{await file.close();}
}
function boundedRows(db){
  // SQLite length(BLOB) reads stored lengths without bringing wide text rows to JS.
  const columns={users:['id','username','name','password','permissions','courses'],courses:['id','name'],templates:['name','fields','created_at'],students:['id','identity_hash','origin','origin_id'],records:['id','student_id','course_id','status','name','data','updated_at'],revisions:['record_id','snapshot','actor','at'],events:['record_id','detail','actor','action','at'],audit:['actor','at','action','target','detail','prev_hash','hash'],attachments:['id','record_id','kind','name','mime','hash','actor','at']};
  for(const [table,names] of Object.entries(columns))if(db.prepare(`SELECT 1 AS bad FROM ${table} WHERE (${names.map(n=>`coalesce(length(CAST(${n} AS BLOB)),0)`).join(' + ')}) > ${L.value} LIMIT 1`).get())throw invalid();
  const schemas={users:['id','username','name','password','permissions','courses','all_courses','active'],courses:['id','year','name'],templates:['id','name','fields','created_at'],students:['id','identity_hash','origin','origin_id'],records:['id','student_id','year','course_id','template_id','status','name','version','data','updated_at'],revisions:['id','record_id','version','actor','at','snapshot'],events:['id','record_id','action','actor','at','detail'],attachments:['id','record_id','kind','name','mime','sensitive','hash','size','actor','at'],audit:['id','actor','at','action','target','detail','prev_hash','hash']};
  // Reject unknown columns too: the application uses SELECT * in some places.
  for(const [table,names] of Object.entries(schemas)){
    const actual=db.prepare(`PRAGMA table_info(${table})`).all();if(actual.length!==names.length||actual.some(column=>!names.includes(column.name)))throw invalid();
  }
}
async function verifyRestoredDirectory(dir,expected,{format=3,appendAudit=true}={}){
  const store=openStore(dir,{initializeTemplate:false});
  try{
    if(store.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||store.db.prepare('PRAGMA foreign_key_check').get())throw new Error('La restauración no superó la verificación.');
    boundedRows(store.db);let previous='';
    for(const row of store.db.prepare('SELECT actor,at,action,target,detail,prev_hash,hash FROM audit ORDER BY id').iterate()){
      if(row.prev_hash!==previous||row.hash!==store.mac(JSON.stringify([row.actor,row.at,row.action,row.target,row.detail,row.prev_hash])))throw new Error('La auditoría del respaldo está alterada.');previous=row.hash;
    }
    for(const row of store.db.prepare('SELECT permissions,courses FROM users').iterate())if(!Array.isArray(JSON.parse(row.permissions))||!Array.isArray(JSON.parse(row.courses)))throw invalid();
    for(const row of store.db.prepare('SELECT fields FROM templates').iterate())if(!Array.isArray(JSON.parse(row.fields)))throw invalid();
    for(const [table,column] of [['records','data'],['revisions','snapshot'],['events','detail']])for(const row of store.db.prepare(`SELECT ${column} AS value FROM ${table}`).iterate()){
      const value=JSON.parse(store.unseal(row.value));if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
    }
    let count=0;for(const row of store.db.prepare('SELECT id,hash,size FROM attachments ORDER BY id').iterate()){
      if(!ATTACHMENT.test(row.id+'.enc')||!expected.has('attachments/'+row.id+'.enc'))throw invalid();await verifyAttachment(join(dir,'attachments',row.id+'.enc'),row,store.key);count++;
    }
    if(count!==expected.size)throw invalid();
    const records=Number(store.db.prepare('SELECT count(*) AS n FROM records').get().n);
    store.db.prepare('DELETE FROM sessions').run();if(appendAudit)store.audit('restore','backup.restore','',{records,format});
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');return {records,attachments:count,dir,format};
  }finally{store.close();}
}

/** Authenticates into a private spool, verifies a private SQLite stage, then renames. */
export async function restoreBackupFile(source,password,destination){
  if(typeof password!=='string'||password.length>200)throw authError();
  const {dir,parent}=await emptyDestination(destination),{file:input,size}=await regularFile(resolve(source));
  let temp,spool,stage;
  try{
    if(size<52||size>L.total+52)throw invalid();const header=await readExact(input,52,0),magic=header.subarray(0,8).toString();
    if(!['DSMBACK1','DSMBACK2',MAGIC].includes(magic))throw invalid();
    if(magic!==MAGIC&&size>MAX_LEGACY_BACKUP_BYTES)throw new BackupLimitError();
    temp=await mkdtemp(join(parent,'.dsmbak-restore-'));await mkdir(join(temp,'data'),{mode:0o700});stage=join(temp,'data');
    if(magic!==MAGIC){
      const bytes=await readExact(input,size,0),restored=restoreBackup(bytes,password,stage),format=magic==='DSMBACK1'?1:2;
      const expected=new Set((await readdir(join(stage,'attachments'))).map(name=>'attachments/'+name));
      const result=await verifyRestoredDirectory(stage,expected,{format,appendAudit:false});
      await publishDirectory(stage,dir);return {...restored,...result,dir};
    }
    spool=await open(join(temp,'authenticated.bin'),'wx+',0o600);const decipher=createDecipheriv('aes-256-gcm',scryptSync(password,header.subarray(8,24),32),header.subarray(24,36));decipher.setAAD(header.subarray(0,36));decipher.setAuthTag(header.subarray(36,52));
    try{
      for(let position=52;position<size;position+=L.chunk)await writeAll(spool,decipher.update(await readExact(input,Math.min(L.chunk,size-position),position)));
      await writeAll(spool,decipher.final());
    }catch{throw authError();}
    // No restored path has been written before GCM final() authenticated all data.
    const spoolSize=(await spool.stat()).size;let position=0,manifest,entryCount=0;const seen=new Set(),attachments=new Set();
    await mkdir(join(stage,'attachments'),{mode:0o700});
    while(true){
      if(position+10>spoolSize)throw invalid();const head=await readExact(spool,10,position);position+=10;const nameSize=head.readUInt16BE(),rawLength=head.readBigUInt64BE(2);
      if(nameSize===0){if(rawLength!==0n||position!==spoolSize)throw invalid();break;}
      if(nameSize>L.name||rawLength>BigInt(L.total)||position+nameSize>spoolSize||++entryCount>L.entries)throw invalid();
      const nameBytes=await readExact(spool,nameSize,position);position+=nameSize;const name=nameBytes.toString('utf8'),length=Number(rawLength);
      if(!Buffer.from(name).equals(nameBytes)||!safeLength(name,length)||seen.has(name)||position+length>spoolSize)throw invalid();seen.add(name);
      if(entryCount===1&&name!=='manifest.json')throw invalid();
      if(name==='manifest.json'){
        try{manifest=JSON.parse((await readExact(spool,length,position)).toString());}catch{throw invalid();}
        if(manifest.version!==3||!Number.isInteger(manifest.attachments)||manifest.attachments<0||manifest.attachments+3>L.entries||manifest.entries!==manifest.attachments+3)throw invalid();position+=length;continue;
      }
      const path=name==='storage.key'||name==='matricula.sqlite'?join(stage,name):join(stage,'attachments',name.slice(12));
      const output=await open(path,'wx',0o600);try{for(let remaining=length;remaining>0;){const amount=Math.min(L.chunk,remaining);await writeAll(output,await readExact(spool,amount,position));position+=amount;remaining-=amount;}await output.sync();}finally{await output.close();}
      if(name.startsWith('attachments/'))attachments.add(name);
    }
    if(!manifest||entryCount!==manifest.entries||attachments.size!==manifest.attachments||!seen.has('storage.key')||!seen.has('matricula.sqlite'))throw invalid();
    const sqlite=await regularFile(join(stage,'matricula.sqlite'));try{if((await readExact(sqlite.file,16,0)).toString()!=='SQLite format 3\u0000')throw invalid();}finally{await sqlite.file.close();}
    const result=await verifyRestoredDirectory(stage,attachments);await spool.close();spool=null;await unlink(join(temp,'authenticated.bin'));
    await publishDirectory(stage,dir);return {...result,dir};
  }finally{
    await cleanupSequence([()=>spool?.close(),()=>input.close(),()=>temp?cleanOwned(temp,parent,'.dsmbak-restore-'):undefined]);
  }
}
