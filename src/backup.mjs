import { randomBytes,scryptSync,createCipheriv,createDecipheriv } from 'node:crypto';
import { readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync,unlinkSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { openStore } from './store.mjs';
const logicalTables=['users','courses','templates','students','records','revisions','events','attachments','audit'];
function encryptBackup(payload,password,magic){
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',scryptSync(password,salt,32),iv);
  const encrypted=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))),cipher.final()]);
  return Buffer.concat([Buffer.from(magic),salt,iv,cipher.getAuthTag(),encrypted]);
}
export async function createBackup(store,password,actor='local'){
  if(typeof password!=='string'||password.length<16||password.length>200)throw new Error('Use una clave de respaldo de entre 16 y 200 caracteres.');
  if(store.kind==='postgres')return store.transaction(async()=>{
    await store.audit(actor,'backup.create','',{format:2});
    const tables={};for(const table of logicalTables)tables[table]=await store.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const blobs=await store.db.prepare('SELECT * FROM attachment_blobs ORDER BY id').all();
    return encryptBackup({version:2,createdAt:new Date().toISOString(),tables,key:store.key.toString('base64'),blobs},password,'DSMBACK2');
  });
  await store.audit(actor,'backup.create','',{});
  const snapshot=join(store.dir,`snapshot-${randomBytes(8).toString('hex')}.sqlite`);await store.db.prepare('VACUUM INTO ?').run(snapshot);
  let payload;try{payload=Buffer.from(JSON.stringify({version:1,createdAt:new Date().toISOString(),database:readFileSync(snapshot).toString('base64'),key:store.key.toString('base64'),attachments:readdirSync(join(store.dir,'attachments')).filter(x=>/^[0-9a-f-]+\.enc$/.test(x)).map(name=>({name,content:readFileSync(join(store.dir,'attachments',name),'utf8')}))}));}finally{unlinkSync(snapshot);}
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',scryptSync(password,salt,32),iv);const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);return Buffer.concat([Buffer.from('DSMBACK1'),salt,iv,cipher.getAuthTag(),encrypted]);
}
export function restoreBackup(bytes,password,destination){
  const magic=bytes.subarray(0,8).toString();if(!['DSMBACK1','DSMBACK2'].includes(magic))throw new Error('Formato de respaldo inválido.');
  const cipher=createDecipheriv('aes-256-gcm',scryptSync(password,bytes.subarray(8,24),32),bytes.subarray(24,36));cipher.setAuthTag(bytes.subarray(36,52));let content;try{content=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(52)),cipher.final()]).toString());}catch{throw new Error('Clave incorrecta o respaldo alterado.');}
  if(magic==='DSMBACK2')return restoreLogicalBackup(content,destination);
  if(content.version!==1||!Array.isArray(content.attachments)||Buffer.from(content.key,'base64').length!==32||Buffer.from(content.database,'base64').subarray(0,16).toString()!=='SQLite format 3\u0000'||content.attachments.some(x=>!/^[0-9a-f-]+\.enc$/.test(x.name)||typeof x.content!=='string'))throw new Error('Contenido de respaldo inválido.');
  const dir=resolve(destination);if(existsSync(dir)&&readdirSync(dir).length)throw new Error('Restaure únicamente en una carpeta nueva o vacía.');mkdirSync(join(dir,'attachments'),{recursive:true});writeFileSync(join(dir,'storage.key'),Buffer.from(content.key,'base64'),{mode:0o600});writeFileSync(join(dir,'matricula.sqlite'),Buffer.from(content.database,'base64'),{mode:0o600});for(const a of content.attachments)writeFileSync(join(dir,'attachments',a.name),a.content,{mode:0o600});
  const store=openStore(dir);try{if(store.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||!store.verifyAudit())throw new Error('La restauración no superó la verificación.');const rows=store.db.prepare('SELECT id,data FROM records').all();for(const row of rows)JSON.parse(store.unseal(row.data));for(const a of store.db.prepare('SELECT id,hash FROM attachments').all()){const data=Buffer.from(store.unseal(readFileSync(join(dir,'attachments',a.id+'.enc'),'utf8')),'base64');if(store.mac(data)!==a.hash)throw new Error('Adjunto alterado.');}store.db.prepare('DELETE FROM sessions').run();store.audit('restore','backup.restore','',{records:rows.length});return {records:rows.length,attachments:content.attachments.length,dir};}finally{store.close();}
}

function restoreLogicalBackup(content,destination){
  if(content.version!==2||typeof content.key!=='string'||Buffer.from(content.key,'base64').length!==32||!content.tables||logicalTables.some(t=>!Array.isArray(content.tables[t]))||!Array.isArray(content.blobs))throw new Error('Contenido lógico de respaldo inválido.');
  const dir=resolve(destination);if(existsSync(dir)&&readdirSync(dir).length)throw new Error('Restaure únicamente en una carpeta nueva o vacía.');
  mkdirSync(join(dir,'attachments'),{recursive:true});writeFileSync(join(dir,'storage.key'),Buffer.from(content.key,'base64'),{mode:0o600,flag:'wx'});
  const store=openStore(dir,{initializeTemplate:false});
  try{
    store.transaction(()=>{
      for(const table of logicalTables){
        const columns=store.db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
        const statement=store.db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
        for(const row of content.tables[table]){if(!row||columns.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>!columns.includes(k)))throw new Error('Fila de respaldo incompatible.');statement.run(...columns.map(k=>row[k]));}
      }
    });
    for(const blob of content.blobs){
      const encrypted=blob.content??blob.data;
      if(!/^[0-9a-f-]{36}$/.test(blob.id)||typeof encrypted!=='string')throw new Error('Adjunto de respaldo inválido.');
      writeFileSync(join(dir,'attachments',blob.id+'.enc'),encrypted,{mode:0o600,flag:'wx'});
    }
    if(store.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||!store.verifyAudit())throw new Error('La restauración no superó la verificación.');
    for(const row of store.db.prepare('SELECT data FROM records').all())JSON.parse(store.unseal(row.data));
    for(const row of store.db.prepare('SELECT snapshot FROM revisions').all())JSON.parse(store.unseal(row.snapshot));
    for(const row of store.db.prepare('SELECT detail FROM events').all())JSON.parse(store.unseal(row.detail));
    const attachments=store.db.prepare('SELECT id,hash FROM attachments').all();
    for(const a of attachments){const data=Buffer.from(store.unseal(readFileSync(join(dir,'attachments',a.id+'.enc'),'utf8')),'base64');if(store.mac(data)!==a.hash)throw new Error('Adjunto alterado.');}
    const records=store.db.prepare('SELECT count(*) AS n FROM records').get().n;
    store.audit('restore','backup.restore','',{records,source:'postgres',format:2});return {records,attachments:attachments.length,dir,source:'postgres'};
  }finally{store.close();}
}
