import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { baseFields } from './fields.mjs';
export const digest = x => createHash('sha256').update(x).digest('hex');
export function hashPassword(password){ const salt=randomBytes(16).toString('hex'); return salt+':'+scryptSync(password,salt,64).toString('hex'); }
export function checkPassword(password,hash){ const [salt,h]=hash.split(':'); return timingSafeEqual(Buffer.from(h,'hex'),scryptSync(password,salt,64)); }
export function openStore(directory,{initializeTemplate=true}={}){
  const dir=resolve(directory); mkdirSync(join(dir,'attachments'),{recursive:true});
  const keyPath=join(dir,'storage.key'); if(!existsSync(keyPath)) writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});
  const key=readFileSync(keyPath); if(key.length!==32) throw new Error('Clave de almacenamiento inválida.');
  const db=new DatabaseSync(join(dir,'matricula.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, permissions TEXT NOT NULL, courses TEXT NOT NULL, all_courses INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY, year INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(year,name));
    CREATE TABLE IF NOT EXISTS templates(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, fields TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, identity_hash TEXT UNIQUE NOT NULL, origin TEXT, origin_id TEXT, UNIQUE(origin,origin_id));
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), year INTEGER NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id), template_id INTEGER NOT NULL REFERENCES templates(id), status TEXT NOT NULL CHECK(status IN ('draft','enrolled','withdrawn')), name TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(student_id,year));
    CREATE INDEX IF NOT EXISTS record_lookup ON records(year,course_id,status,name);
    CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL REFERENCES records(id), version INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, snapshot TEXT NOT NULL, UNIQUE(record_id,version));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL REFERENCES records(id), action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES records(id), kind TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, sensitive INTEGER NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Auditoría inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Auditoría inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS revisions_no_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'Historial inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS revisions_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'Historial inmutable'); END;
    CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Eventos inmutables'); END;
    CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Eventos inmutables'); END;
    CREATE TRIGGER IF NOT EXISTS templates_no_update BEFORE UPDATE ON templates BEGIN SELECT RAISE(ABORT,'Plantillas inmutables'); END;
    CREATE TRIGGER IF NOT EXISTS templates_no_delete BEFORE DELETE ON templates BEGIN SELECT RAISE(ABORT,'Plantillas inmutables'); END;`);
  if(initializeTemplate&&!db.prepare('SELECT id FROM templates LIMIT 1').get()) db.prepare('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?)').run('Referencia Word · versión 1',JSON.stringify(baseFields),new Date().toISOString());
  const seal = value => { const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv); const encrypted=Buffer.concat([cipher.update(typeof value==='string'?value:JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64'); };
  const unseal = value => { const b=Buffer.from(value,'base64');const cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8'); };
  const mac = x => createHmac('sha256',key).update(x).digest('hex');
  const audit=(actor,action,target='',detail={})=>{ const at=new Date().toISOString(),text=JSON.stringify(detail),prev=db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get()?.hash||'';const hash=mac(JSON.stringify([actor,at,action,target,text,prev]));db.prepare('INSERT INTO audit(actor,at,action,target,detail,prev_hash,hash) VALUES(?,?,?,?,?,?,?)').run(actor,at,action,target,text,prev,hash); };
  const verifyAudit=()=>{let prev='';for(const row of db.prepare('SELECT * FROM audit ORDER BY id').all()){if(row.prev_hash!==prev||row.hash!==mac(JSON.stringify([row.actor,row.at,row.action,row.target,row.detail,row.prev_hash])))return false;prev=row.hash;}return true;};
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  return {db,dir,key,seal,unseal,mac,audit,verifyAudit,transaction,close:()=>db.close()};
}
