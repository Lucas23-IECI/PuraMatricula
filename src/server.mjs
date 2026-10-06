import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { dirname,join,resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checkPassword,hashPassword,digest } from './store.mjs';
import { openAsyncStore } from './async-sqlite.mjs';
import { createService,HttpError,fail } from './service.mjs';
import { sections,permissions,permissionLabels } from './fields.mjs';
import { createFichaPdf } from './pdf.mjs';
import { createBackup } from './backup.mjs';
import { createSchoolImport, SchoolImportError } from './school-import-service.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dummyPassword=hashPassword('unused-'+randomBytes(32).toString('hex'));
async function jsonBody(req){
  if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Use JSON para esta solicitud.');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)fail(413,'Solicitud demasiado grande.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'JSON inválido.');}
}
export async function createApp({directory=join(root,'.local','manual'),demo=false,tls,origin,host='127.0.0.1',store:injectedStore,secure=false}={}){
  const secureCookies=Boolean(tls||secure);
  if(!secure&&!['127.0.0.1','localhost','::1'].includes(host)&&(!tls||!origin?.startsWith('https://')))throw new Error('Para acceso LAN configure HTTPS y MATRÍCULA_ORIGIN.');
  if(demo&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('La demostración solo se permite en localhost.');
  const ownStore=!injectedStore,store=injectedStore||await openAsyncStore(directory),testEnvironment=process.env.MATRICULA_DATA_MODE==='synthetic'||demo,maxAttachmentBytes=store.maxAttachmentBytes||(store.kind==='postgres'?2*1024*1024:5*1024*1024);store.maxAttachmentBytes=maxAttachmentBytes;const svc=createService(store),schoolImport=createSchoolImport(store,svc),attempts=new Map();if(!await store.verifyAudit()){if(ownStore)await store.close();throw new Error('La cadena de auditoría está alterada.');}
  const coreHandler=async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    if(secureCookies)res.setHeader('Strict-Transport-Security','max-age=31536000');
    let user,url;
    const send=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
    const binary=(bytes,mime,name)=>{res.setHeader('Content-Type',mime);res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);res.end(bytes);};
    try{
      const expectedOrigin=origin?`${new URL(origin).protocol}//${req.headers.host}`:`${secureCookies?'https':'http'}://${req.headers.host}`;
      if(!origin&&!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||''))fail(403,'Host no autorizado.');
      if(origin){const allowedHosts=new Set([new URL(origin).host,...String(process.env.MATRICULA_ALLOWED_HOSTS||'').split(',').map(x=>x.trim()).filter(Boolean)]);if(!allowedHosts.has(req.headers.host))fail(403,'Host no autorizado.');}
      if(req.headers.origin&&req.headers.origin!==expectedOrigin)fail(403,'Origen no autorizado.');
      url=new URL(req.url,expectedOrigin);const path=url.pathname,method=req.method;
      if(path==='/api/health'){send({ok:true,application:'matricula',demo});return;}
      if(path==='/api/login'&&method==='POST'){
        const input=await jsonBody(req);const username=String(input.username||'').toLowerCase().trim(),key=digest(req.socket.remoteAddress||'unknown');const count=attempts.get(key);if(store.loginAllowed?!(await store.loginAllowed(key)):(count&&count.until>Date.now()&&count.count>=10))fail(429,'Espere 10 minutos antes de volver a intentar.');
        const row=await store.db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);if(typeof input.password!=='string'||input.password.length>200||!checkPassword(input.password,row?.password||dummyPassword)){
          if(store.loginFailed) await store.loginFailed(key); else attempts.set(key,{count:(count?.until>Date.now()?count.count:0)+1,until:Date.now()+600000});await store.audit('anonymous','login.failed','',{});fail(401,'Usuario o contraseña incorrectos.');
        }
        attempts.delete(key);if(store.loginSucceeded) await store.loginSucceeded(key);await store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');await store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),row.id,csrf,Date.now()+8*3600000);res.setHeader('Set-Cookie',`matricula_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookies?'; Secure':''}`);await store.audit(row.id,'login.success','',{});send({user:svc.decodeUser(row),csrf,demo});return;
      }
      if(path.startsWith('/api/')){
        const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('matricula_session='))?.slice(18);
        const session=token&&await store.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now());const row=session&&await store.db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.user_id);if(!row)fail(401,'Inicie sesión para continuar.');user=svc.decodeUser(row);
        if(!['GET','HEAD'].includes(method)&&req.headers['x-csrf-token']!==session.csrf)fail(403,'La sesión no autorizó la solicitud.','CSRF');
        if(path==='/api/session'&&method==='GET'){send({user,csrf:session.csrf,demo});return;}
        if(path==='/api/logout'&&method==='POST'){await store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));res.setHeader('Set-Cookie','matricula_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');await store.audit(user.id,'logout','',{});send({ok:true});return;}
        if(path==='/api/meta'&&method==='GET'){
          const courses=(await store.db.prepare('SELECT * FROM courses ORDER BY year DESC,name').all()).filter(x=>svc.can(user,'read',x.id)||svc.can(user,'enroll',x.id));
          const templates=(await store.db.prepare('SELECT * FROM templates ORDER BY id DESC').all()).map(t=>({...t,fields:JSON.parse(t.fields).filter(f=>!f.sensitive||svc.can(user,'sensitive')||svc.can(user,'admin'))}));send({courses,templates,sections,permissions,permissionLabels,demo,testEnvironment,maxAttachmentBytes});return;
        }
        if(path==='/api/courses'&&method==='POST'){send(await svc.createCourse(user,await jsonBody(req)),201);return;}
        if(path==='/api/records'&&method==='GET'){send(await svc.list(user,Object.fromEntries(url.searchParams)));return;}
        if(path==='/api/records'&&method==='POST'){send(await svc.create(user,await jsonBody(req)),201);return;}
        const match=path.match(/^\/api\/records\/([0-9a-f-]+)(?:\/(actions|renew|attachments|pdf|revisions))?$/);
        if(match){const [,id,operation]=match;
          if(!operation&&method==='GET'){send(await svc.detail(user,id));return;}
          if(!operation&&method==='PATCH'){send(await svc.patch(user,id,await jsonBody(req)));return;}
          if(operation==='actions'&&method==='POST'){send(await svc.transition(user,id,await jsonBody(req)));return;}
          if(operation==='renew'&&method==='POST'){send(await svc.renew(user,id,await jsonBody(req)),201);return;}
          if(operation==='attachments'&&method==='POST'){send(await svc.addAttachment(user,id,await jsonBody(req)),201);return;}
          if(operation==='revisions'&&method==='GET'){
            const record=await svc.load(id);svc.requirePermission(user,'read',record.course_id);const revision=await store.db.prepare('SELECT * FROM revisions WHERE record_id=? AND version=?').get(id,Number(url.searchParams.get('version')));if(!revision)fail(404,'Revisión no encontrada.');const snapshot=JSON.parse(store.unseal(revision.snapshot));snapshot.data=svc.filtered(snapshot.data,await svc.fieldsFor(snapshot.templateId),user);await store.audit(user.id,'revision.read',id,{version:revision.version});send({...snapshot,version:revision.version,at:revision.at,actor:revision.actor});return;
          }
          if(operation==='pdf'&&method==='GET'){
            const record=await svc.detail(user,id);svc.requirePermission(user,'export',record.courseId);const template=await store.db.prepare('SELECT * FROM templates WHERE id=?').get(record.templateId),fields=(await svc.fieldsFor(record.templateId)).filter(f=>!f.sensitive||svc.can(user,'sensitive'));const bytes=await createFichaPdf(record,fields,await svc.courseFor(record.courseId),template,!svc.can(user,'sensitive'));await store.audit(user.id,'pdf.download',id,{version:record.version,year:record.year,sensitive:svc.can(user,'sensitive')});binary(bytes,'application/pdf',`ficha-${record.year}-${id.slice(0,8)}.pdf`);return;
          }
        }
        const file=path.match(/^\/api\/attachments\/([0-9a-f-]+)$/);if(file&&method==='GET'){const a=await svc.downloadAttachment(user,file[1]);binary(a.bytes,a.mime,a.name);return;}
        if(path==='/api/export'&&method==='GET'){
          const courseId=url.searchParams.get('course');if(!courseId)fail(400,'Seleccione un curso para exportar.');svc.requirePermission(user,'export',courseId);svc.requirePermission(user,'read',courseId);const course=await svc.courseFor(courseId);
          const rows=await store.db.prepare('SELECT * FROM records WHERE course_id=? ORDER BY name').all(courseId);const csvCell=v=>'"'+String(v??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';const csv=[['Año','Curso','Estudiante','Identificador','Estado','Apoderado','Teléfono'],...rows.map(r=>{const d=svc.getData(r);return [r.year,course.name,r.name,d.identifier||'',r.status,d.guardianName||'',d.guardianPhone||''];})].map(r=>r.map(csvCell).join(';')).join('\r\n');await store.audit(user.id,'course.export',courseId,{count:rows.length});binary(Buffer.from('\uFEFF'+csv,'utf8'),'text/csv; charset=utf-8',`curso-${course.year}-${course.id.slice(0,8)}.csv`);return;
        }
        if(path==='/api/users'&&method==='GET'){svc.requirePermission(user,'admin');send({users:(await store.db.prepare('SELECT * FROM users ORDER BY name').all()).map(svc.decodeUser)});return;}
        if(path==='/api/users'&&method==='POST'){send(await svc.saveUser(user,await jsonBody(req)),201);return;}
        const userMatch=path.match(/^\/api\/users\/([0-9a-f-]+)$/);if(userMatch&&method==='PUT'){send(await svc.saveUser(user,await jsonBody(req),userMatch[1]));return;}
        if(path==='/api/templates'&&method==='POST'){send(await svc.createTemplate(user,await jsonBody(req)),201);return;}
        if(path==='/api/import/preview'&&method==='POST'){send(await svc.importPreview(user,await jsonBody(req)));return;}
        if(path==='/api/import/commit'&&method==='POST'){send(await svc.importCommit(user,await jsonBody(req)),201);return;}
        if(path==='/api/import/school/preview'&&method==='POST'){send(await schoolImport.preview(user,await jsonBody(req)));return;}
        if(path==='/api/import/school/commit'&&method==='POST'){send(await schoolImport.commit(user,await jsonBody(req)),201);return;}
        if(path==='/api/audit'&&method==='GET'){
          svc.requirePermission(user,'audit');const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1));await store.audit(user.id,'audit.read','',{page});const items=(await store.db.prepare('SELECT a.*,coalesce(u.name,a.actor) AS "actorName" FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 50 OFFSET ?').all((page-1)*50)).map(x=>({...x,detail:JSON.parse(x.detail)}));send({items,page,total:(await store.db.prepare('SELECT count(*) AS n FROM audit').get()).n,integrity:await store.verifyAudit()});return;
        }
        if(path==='/api/backup'&&method==='POST'){
          svc.requirePermission(user,'backup');svc.requirePermission(user,'sensitive');if(!user.allCourses)fail(403,'El respaldo requiere acceso autorizado a todos los cursos.');const input=await jsonBody(req);let bytes;try{bytes=await createBackup(store,input.password,user.id);}catch(e){fail(400,e.message);}if(store.kind==='postgres'&&bytes.length>4*1024*1024)fail(413,'El respaldo supera 4 MiB para descarga HTTP; use el CLI de respaldo.');binary(bytes,'application/octet-stream',`matricula-${new Date().toISOString().slice(0,10)}.dsmbak`);return;
        }
        fail(404,'Ruta no encontrada.');
      }
      if(method!=='GET'&&method!=='HEAD')fail(405,'Método no permitido.');
      const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/escudo.jpg':'escudo.jpg','/favicon.ico':'escudo.jpg'};if(!files[path])fail(404,'Página no encontrada.');const filename=files[path];res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript; charset=utf-8':filename.endsWith('.css')?'text/css; charset=utf-8':filename.endsWith('.jpg')?'image/jpeg':'text/html; charset=utf-8');res.end(readFileSync(join(root,'public',filename)));
    }catch(e){
      let status=e instanceof HttpError||e instanceof SchoolImportError?e.status||400:500,message=e instanceof HttpError||e instanceof SchoolImportError?e.message:'No fue posible completar la operación.';
      if(e.code==='23505'||e.code?.startsWith('SQLITE_CONSTRAINT')||/UNIQUE constraint failed|duplicate key value violates unique constraint/i.test(e.message)){status=409;message='El registro ya existe. Revise los duplicados.';}
      if(user)await store.audit(user.id,status===409?'request.conflict':status===403?'request.denied':'request.error','',{status,route:url?.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]+/g,':id')||'',code:e instanceof HttpError?e.code:''});
      if(status===500)console.error('Error interno de matrícula:',e.name,e.code||'SIN_CODIGO');
      if(!res.headersSent)send({error:message,code:e instanceof HttpError?e.code:''},status);else res.end();
    }
  };
  const handler=(req,res)=>store.withRequest(()=>coreHandler(req,res));
  const server=tls?https.createServer(tls,handler):http.createServer(handler);server.requestTimeout=30000;server.headersTimeout=15000;
  return {server,handler,store,svc,listen:(port=4318)=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),close:()=>new Promise(resolve=>{server.close(async()=>{if(ownStore)await store.close();resolve();});server.closeIdleConnections();})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const host=process.env.MATRICULA_HOST||'127.0.0.1',tls=process.env.MATRICULA_TLS_KEY&&process.env.MATRICULA_TLS_CERT?{key:readFileSync(process.env.MATRICULA_TLS_KEY),cert:readFileSync(process.env.MATRICULA_TLS_CERT)}:undefined;
  const app=await createApp({directory:process.env.MATRICULA_DATA||join(root,'.local','manual'),host,tls,origin:process.env.MATRICULA_ORIGIN});const address=await app.listen(Number(process.env.MATRICULA_PORT)||4318);console.log(`Matrícula local: ${tls?'https':'http'}://${host}:${address.port}`);process.on('SIGINT',async()=>{await app.close();process.exit(0);});process.on('SIGTERM',async()=>{await app.close();process.exit(0);});
}
