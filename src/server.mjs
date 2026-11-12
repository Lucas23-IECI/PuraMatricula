import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { dirname,join,resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { zipSync } from 'fflate';
import { hashPassword,digest } from './store.mjs';
import { openAsyncStore } from './async-sqlite.mjs';
import { createService,HttpError,fail,pageWindow,schoolYearRange } from './service.mjs';
import { sections,permissions,permissionLabels } from './fields.mjs';
import { createAccounts,verifyAccountPassword } from './accounts.mjs';
import { templateProtectedKeys } from './template-workflow.mjs';
import { createReports } from './reports.mjs';
import { createFichaPdf } from './pdf.mjs';
import { createBackup,BackupLimitError,validateBackupPassword } from './backup.mjs';
import { createSchoolImport, SchoolImportError } from './school-import-service.mjs';
import { ensureImportFields,hasImportFields } from './import-fields.mjs';
import { parseAuditFilters,auditWhere,auditFacets } from './audit-query.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dummyPassword=hashPassword('unused-'+randomBytes(32).toString('hex'));
const parsedJson=Symbol('parsedJson');
const isJson=req=>/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'');
async function jsonBody(req,maxBytes=8*1024*1024){
  if(Object.hasOwn(req,parsedJson))return req[parsedJson];
  if(!isJson(req))fail(415,'Use JSON para esta solicitud.');
  if(Number(req.headers['content-length'])>maxBytes)fail(413,'Solicitud demasiado grande.');
  const chunks=[];let size=0;for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>maxBytes)fail(413,'Solicitud demasiado grande.');chunks.push(chunk);}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'JSON inválido.');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Use un objeto JSON para esta solicitud.');
  req[parsedJson]=value;return value;
}
export async function createApp({directory=join(root,'.local','manual'),demo=false,tls,origin,host='127.0.0.1',store:injectedStore,secure=false,localOnly=false,desktopIcon}={}){
  const secureCookies=Boolean(tls||secure),sessionCookie=localOnly?'matricula_local_session':'matricula_session';
  const localOrigin=typeof origin==='string'&&/^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})$/.exec(origin);
  if(localOnly&&(!localOrigin||Number(localOrigin[1])<1024||Number(localOrigin[1])>65535||secureCookies||demo))throw new Error('El modo local requiere un origen HTTP de loopback explícito y su publicación local en Docker.');
  if(origin!==undefined){
    let configured;try{configured=new URL(origin);}catch{throw new Error('MATRICULA_ORIGIN debe ser un origen HTTP o HTTPS válido.');}
    if(!['http:','https:'].includes(configured.protocol)||configured.username||configured.password||configured.pathname!=='/'||configured.search||configured.hash)throw new Error('MATRICULA_ORIGIN debe indicar solo esquema, nombre y puerto, sin ruta ni credenciales.');
    origin=configured.origin;
  }
  // Proxy mode is explicit and requires its public HTTPS origin. Forwarded
  // headers alone can never turn an arbitrary HTTP listener into a TLS proxy.
  if((secure&&!origin)||(secureCookies&&origin&&!origin.startsWith('https://')))throw new Error('El modo TLS o proxy seguro requiere MATRICULA_ORIGIN HTTPS.');
  if(!secure&&!localOnly&&!['127.0.0.1','localhost','::1'].includes(host)&&(!tls||!origin?.startsWith('https://')))throw new Error('Para acceso LAN configure HTTPS y MATRÍCULA_ORIGIN.');
  if(demo&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('La demostración solo se permite en localhost.');
  const ownStore=!injectedStore,store=injectedStore||await openAsyncStore(directory),testEnvironment=process.env.MATRICULA_DATA_MODE==='synthetic'||demo,maxAttachmentBytes=store.maxAttachmentBytes||(store.kind==='postgres'?2*1024*1024:5*1024*1024);store.maxAttachmentBytes=maxAttachmentBytes;const svc=createService(store),schoolImport=createSchoolImport(store,svc),accounts=createAccounts(store,svc),reports=createReports(store,svc),attempts=new Map();let pendingBodies=0;
  const pruneLoginAttempts=now=>{if(attempts.size<5000)return;for(const [key,value] of attempts){if(value.until<=now)attempts.delete(key);if(attempts.size<5000)break;}if(attempts.size>=5000){const first=attempts.keys().next().value;if(first!==undefined)attempts.delete(first);}};
  if(!await store.verifyAudit()){if(ownStore)await store.close();throw new Error('La cadena de auditoría está alterada.');}
  const originUrl=origin?new URL(origin):null;
  const allowedHosts=originUrl?new Set([originUrl.host,...(localOnly?[`matricula.localhost:${originUrl.port}`]:String(process.env.MATRICULA_ALLOWED_HOSTS||'').split(',').map(x=>x.trim()).filter(Boolean))]):null;
  // The Windows installer supplies a local drive path. Never accept UNC paths,
  // line breaks or untrusted request parameters in an Internet Shortcut.
  const shortcutIcon=localOnly&&typeof desktopIcon==='string'&&desktopIcon.length<=400&&/^[A-Z]:\\(?:[^\\/:*?"<>|\x00-\x1f]+\\)*public\\escudo\.ico$/i.test(desktopIcon)&&!desktopIcon.split('\\').some(segment=>segment==='.'||segment==='..')?desktopIcon:null;
  const coreHandler=async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-DNS-Prefetch-Control','off');res.setHeader('X-Permitted-Cross-Domain-Policies','none');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    if(secureCookies)res.setHeader('Strict-Transport-Security','max-age=31536000');
    let user,url;
    const send=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
    const binary=(bytes,mime,name)=>{res.setHeader('Content-Type',mime);res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);res.end(bytes);};
    try{
      const expectedOrigin=origin?`${new URL(origin).protocol}//${req.headers.host}`:`${secureCookies?'https':'http'}://${req.headers.host}`;
      if(!origin&&!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||''))fail(403,'Host no autorizado.');
      if(allowedHosts&&!allowedHosts.has(req.headers.host))fail(403,'Host no autorizado.');
      if(req.headers.origin&&req.headers.origin!==expectedOrigin)fail(403,'Origen no autorizado.');
      url=new URL(req.url,expectedOrigin);const path=url.pathname,method=req.method;
      if(localOnly&&path.startsWith('/api/')&&['cross-site','same-site'].includes(req.headers['sec-fetch-site']))fail(403,'Origen no autorizado.');
      if(path==='/acceso-escritorio.zip'&&['GET','HEAD'].includes(method)){
        if(!shortcutIcon)fail(404,'Acceso directo no disponible.');
        const contents=Buffer.from(`\uFEFF[InternetShortcut]\r\nURL=${expectedOrigin}/\r\nIconFile=${shortcutIcon}\r\nIconIndex=0\r\n`,'utf16le');
        const archive=zipSync({'PuraMatricula.url':contents,'LEEME.txt':Buffer.from('Extrae PuraMatricula.url y muevelo a tu Escritorio. El escudo usa la carpeta instalada de Matricula; conserva esa carpeta. Este acceso abre Matricula desde el mismo PC servidor.\r\n','utf8')});
        binary(method==='HEAD'?undefined:archive,'application/zip','PuraMatricula-acceso.zip');return;
      }
      // Read bounded network input before the SQLite queue: an unfinished body
      // must not keep every other user's database request waiting behind it.
      if(path.startsWith('/api/')&&!['GET','HEAD'].includes(method)&&isJson(req)){
        if(pendingBodies>=8){res.setHeader('Retry-After','5');fail(503,'Hay varias cargas en curso. Vuelva a intentar.');}
        pendingBodies++;try{await jsonBody(req,path==='/api/login'?16*1024:8*1024*1024);}finally{pendingBodies--;}
      }
      await store.withRequest(async()=>{
      if(path==='/api/health'){send({ok:true,application:'matricula',demo});return;}
      if(path==='/api/login'&&method==='POST'){
        const input=await jsonBody(req);const username=String(input.username||'').toLowerCase().trim(),address=secure&&process.env.VERCEL==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';const key=digest(address||req.socket.remoteAddress||'unknown'),now=Date.now();pruneLoginAttempts(now);const count=attempts.get(key);if(store.loginAllowed?!(await store.loginAllowed(key)):(count&&count.until>now&&count.count>=10))fail(429,'Espere 10 minutos antes de volver a intentar.');
        const row=await store.db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);if(typeof input.password!=='string'||input.password.length>200||!verifyAccountPassword(input.password,row?.password||dummyPassword)){
          if(store.loginFailed) await store.loginFailed(key); else attempts.set(key,{count:(count?.until>now?count.count:0)+1,until:now+600000});await store.audit('anonymous','login.failed','',{});fail(401,'Usuario o contraseña incorrectos.');
        }
        attempts.delete(key);if(store.loginSucceeded) await store.loginSucceeded(key);const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url'),logged=await accounts.openSession(row,{tokenHash:digest(token),csrf,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookies?'; Secure':''}`);send({user:logged,csrf,demo});return;
      }
      if(path.startsWith('/api/')){
        const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
        const session=token&&await store.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now());const row=session&&await store.db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.user_id);if(!row)fail(401,'Inicie sesión para continuar.');user=accounts.decodeUser(row);
        if(!['GET','HEAD'].includes(method)&&req.headers['x-csrf-token']!==session.csrf)fail(403,'La sesión no autorizó la solicitud.','CSRF');
        if(path==='/api/session'&&method==='GET'){send({user,csrf:session.csrf,demo});return;}
        if(path==='/api/logout'&&method==='POST'){await store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));res.setHeader('Set-Cookie',`${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies?'; Secure':''}`);await store.audit(user.id,'logout','',{});send({ok:true});return;}
        if(path==='/api/account/password'&&method==='POST'){await accounts.changePassword(user,await jsonBody(req));res.setHeader('Set-Cookie',`${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies?'; Secure':''}`);send({ok:true});return;}
        if(user.mustChangePassword)fail(403,'Cambia tu contraseña temporal antes de continuar.','PASSWORD_CHANGE_REQUIRED');
        if(path==='/api/meta'&&method==='GET'){
          const courses=(await store.db.prepare('SELECT * FROM courses ORDER BY year DESC,name').all()).filter(x=>svc.can(user,'read',x.id)||svc.can(user,'enroll',x.id));
          const templateRows=await store.db.prepare('SELECT * FROM templates ORDER BY id DESC').all(),importFieldsReady=hasImportFields(JSON.parse(templateRows[0]?.fields||'[]')),templates=templateRows.map(t=>({...t,fields:JSON.parse(t.fields).filter(f=>!f.sensitive||svc.can(user,'sensitive')||svc.can(user,'admin'))}));send({courses,templates,availableYears:await svc.availableYears(user),yearRange:schoolYearRange,sections,permissions,permissionLabels,demo,testEnvironment,maxAttachmentBytes,importFieldsReady,templateProtectedKeys:[...templateProtectedKeys]});return;
        }
        if(path==='/api/courses'&&method==='POST'){send(await svc.createCourse(user,await jsonBody(req)),201);return;}
        if(path==='/api/records'&&method==='GET'){send(await svc.list(user,Object.fromEntries(url.searchParams)));return;}
        if(path==='/api/records'&&method==='POST'){send(await svc.create(user,await jsonBody(req)),201);return;}
        const match=path.match(/^\/api\/records\/([0-9a-f-]+)(?:\/(actions|renew|attachments|pdf|download|revisions|template))?$/);
        if(match){const [,id,operation]=match;
          if(!operation&&method==='GET'){send(await svc.detail(user,id));return;}
          if(!operation&&method==='PATCH'){send(await svc.patch(user,id,await jsonBody(req)));return;}
          if(operation==='actions'&&method==='POST'){send(await svc.transition(user,id,await jsonBody(req)));return;}
          if(operation==='renew'&&method==='POST'){send(await svc.renew(user,id,await jsonBody(req)),201);return;}
          if(operation==='template'&&method==='POST'){send(await svc.upgradeTemplate(user,id,await jsonBody(req)));return;}
          if(operation==='attachments'&&method==='POST'){send(await svc.addAttachment(user,id,await jsonBody(req)),201);return;}
          if(operation==='revisions'&&method==='GET'){
            const record=await svc.load(id);svc.requirePermission(user,'read',record.course_id);const revision=await store.db.prepare('SELECT * FROM revisions WHERE record_id=? AND version=?').get(id,Number(url.searchParams.get('version')));if(!revision)fail(404,'Revisión no encontrada.');const snapshot=JSON.parse(store.unseal(revision.snapshot));svc.requirePermission(user,'read',snapshot.courseId);snapshot.data=svc.filtered(snapshot.data,await svc.fieldsFor(snapshot.templateId),user);await store.audit(user.id,'revision.read',id,{version:revision.version});send({...snapshot,version:revision.version,at:revision.at,actor:revision.actor});return;
          }
          if((operation==='pdf'||operation==='download')&&method==='GET'){
            const request=operation==='pdf'?{format:'pdf',kind:'ficha'}:Object.fromEntries(url.searchParams);const file=await reports.record(user,id,request);binary(file.bytes,file.mime,file.name);return;
          }
        }
        const file=path.match(/^\/api\/attachments\/([0-9a-f-]+)$/);if(file&&method==='GET'){const a=await svc.downloadAttachment(user,file[1]);binary(a.bytes,a.mime,a.name);return;}
        if(method==='GET'&&path==='/api/reports/statistics'){send(await reports.statistics(user,Object.fromEntries(url.searchParams)));return;}
        if(method==='GET'&&['/api/reports/roster','/api/reports/summary','/api/export'].includes(path)){
          const query=Object.fromEntries(url.searchParams);if(path==='/api/export'&&!query.course)fail(400,'Seleccione un curso para exportar.');
          const file=path==='/api/reports/summary'?await reports.summary(user,query,query.format||'pdf'):await reports.roster(user,query,path==='/api/export'?'csv':query.format||'xlsx');binary(file.bytes,file.mime,file.name);return;
        }
        if(path==='/api/users'&&method==='GET'){send(await accounts.list(user));return;}
        if(path==='/api/users'&&method==='POST'){send(await accounts.saveUser(user,await jsonBody(req)),201);return;}
        const userMatch=path.match(/^\/api\/users\/([0-9a-f-]+)$/);if(userMatch&&method==='PUT'){send(await accounts.saveUser(user,await jsonBody(req),userMatch[1]));return;}
        if(path==='/api/templates/prepare-import'&&method==='POST'){svc.requirePermission(user,'admin');const id=await store.transaction(async()=>{const before=await store.db.prepare('SELECT max(id) AS id FROM templates').get();const template=await ensureImportFields(store);if(Number(before.id)!==Number(template.id))await store.audit(user.id,'template.import.prepare',String(template.id),{});return template.id;});send({id});return;}
        if(path==='/api/templates/preview'&&method==='POST'){send(await svc.previewTemplate(user,await jsonBody(req)));return;}
        if(path==='/api/templates/preview-pdf'&&method==='POST'){const draft=await svc.previewTemplate(user,await jsonBody(req));const fields=draft.fields.filter(f=>!f.hidden&&(!f.sensitive||svc.can(user,'sensitive')));const bytes=await createFichaPdf({id:'00000000-0000-0000-0000-000000000000',name:'Ejemplo ficticio · vista previa',year:new Date().getFullYear(),status:'draft',version:0,data:{},events:[]},fields,{name:'Curso de ejemplo'},{id:draft.baseTemplateId,name:draft.name},!svc.can(user,'sensitive'));binary(bytes,'application/pdf','plantilla-vista-previa.pdf');return;}
        if(path==='/api/templates'&&method==='POST'){send(await svc.publishTemplate(user,await jsonBody(req)),201);return;}
        if(path==='/api/import/preview'&&method==='POST'){send(await svc.importPreview(user,await jsonBody(req)));return;}
        if(path==='/api/import/commit'&&method==='POST'){send(await svc.importCommit(user,await jsonBody(req)),201);return;}
        if(path==='/api/import/school/preview'&&method==='POST'){send(await schoolImport.preview(user,await jsonBody(req)));return;}
        if(path==='/api/import/school/create-courses'&&method==='POST'){send(await schoolImport.createCourses(user,await jsonBody(req)),201);return;}
        if(path==='/api/import/school/commit'&&method==='POST'){send(await schoolImport.commit(user,await jsonBody(req)),201);return;}
        if(path==='/api/audit'&&method==='GET'){
          svc.requirePermission(user,'audit');
          const parsed=parseAuditFilters(url.searchParams);
          const result=await store.transaction(async()=>{
            if(parsed.filters.actor&&!await store.db.prepare('SELECT actor FROM audit WHERE actor=? LIMIT 1').get(parsed.filters.actor))fail(400,'Seleccione una cuenta existente en la auditoría.','AUDIT_FILTER_INVALID');
            const requestedSnapshot=Number(url.searchParams.get('snapshot')),latest=Number((await store.db.prepare('SELECT coalesce(max(id),0) AS id FROM audit').get()).id);
            let snapshot=Number.isSafeInteger(requestedSnapshot)&&requestedSnapshot>0?Math.min(requestedSnapshot,latest):null;
            const beforeWhere=auditWhere(parsed,snapshot??latest),from='FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE ';
            const before=Number((await store.db.prepare('SELECT count(*) AS n '+from+beforeWhere.sql).get(...beforeWhere.args)).n);
            const requestedPage=pageWindow({page:url.searchParams.get('page')},before+(snapshot===null?1:0),{defaultSize:50,maxSize:50}).page;
            await store.audit(user.id,'audit.read','',{page:requestedPage,snapshot,filtered:Object.values(parsed.filters).some(Boolean)});
            if(snapshot===null)snapshot=Number((await store.db.prepare('SELECT coalesce(max(id),0) AS id FROM audit').get()).id);
            const where=auditWhere(parsed,snapshot),total=Number((await store.db.prepare('SELECT count(*) AS n '+from+where.sql).get(...where.args)).n);
            const {page,pageSize}=pageWindow({page:url.searchParams.get('page')},total,{defaultSize:50,maxSize:50});
            const items=(await store.db.prepare('SELECT a.*,coalesce(u.name,a.actor) AS "actorName" '+from+where.sql+' ORDER BY a.id DESC LIMIT ? OFFSET ?').all(...where.args,pageSize,(page-1)*pageSize)).map(x=>({...x,detail:JSON.parse(x.detail)}));
            return {items,page,pageSize,total,snapshot,filters:parsed.filters,facets:await auditFacets(store,snapshot)};
          });
          send({...result,integrity:await store.verifyAudit()});return;
        }
        if(path==='/api/backup'&&method==='POST'){
          svc.requirePermission(user,'backup');svc.requirePermission(user,'sensitive');if(!user.allCourses)fail(403,'El respaldo requiere acceso autorizado a todos los cursos.');const input=await jsonBody(req);
          try{validateBackupPassword(input.password);}catch{fail(400,'Use una clave de respaldo de entre 16 y 200 caracteres.');}
          let bytes;try{bytes=await createBackup(store,input.password,user.id);}catch(e){if(e instanceof BackupLimitError)fail(e.status,e.message,e.code);fail(500,'No fue posible preparar el respaldo. Revise el servidor o vuelva a intentar.','BACKUP_FAILED');}
          if(store.kind==='postgres'&&bytes.length>4*1024*1024)fail(413,'El respaldo supera 4 MiB para descarga HTTP; use el CLI de respaldo.','BACKUP_FILE_REQUIRED');binary(bytes,'application/octet-stream',`matricula-${new Date().toISOString().slice(0,10)}.dsmbak`);return;
        }
        fail(404,'Ruta no encontrada.');
      }
      if(method!=='GET'&&method!=='HEAD')fail(405,'Método no permitido.');
      const files={'/view-controls.js':'view-controls.js','/view-controls.css':'view-controls.css','/collections.js':'collections.js','/collections.css':'collections.css','/import-preview.css':'import-preview.css','/templates.css':'templates.css','/record-views.js':'record-views.js','/record-views.css':'record-views.css','/areas.js':'areas.js','/records-view.js':'records-view.js','/records.css':'records.css','/workspace.css':'workspace.css','/home-students.jpg':'home-students.jpg','/home-followup.jpg':'home-followup.jpg','/home-organization.jpg':'home-organization.jpg','/home-admin.jpg':'home-admin.jpg','/pagination.js':'pagination.js','/pagination.css':'pagination.css','/home-creative.css':'home-creative.css','/import-observations.js':'import-observations.js','/import-preview.js':'import-preview.js','/loading.js':'loading.js','/loading.css':'loading.css','/help.css':'help.css','/':'index.html','/app.js':'app.js','/help.js':'help.js','/reports.js':'reports.js','/reports.css':'reports.css','/accounts.js':'accounts.js','/templates.js':'templates.js','/style.css':'style.css','/escudo.jpg':'escudo.jpg','/favicon.ico':'escudo.ico','/escudo.ico':'escudo.ico'};if(!files[path])fail(404,'Página no encontrada.');const filename=files[path];res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript; charset=utf-8':filename.endsWith('.css')?'text/css; charset=utf-8':filename.endsWith('.jpg')?'image/jpeg':filename.endsWith('.ico')?'image/x-icon':'text/html; charset=utf-8');const bytes=readFileSync(join(root,'public',filename));res.end(method==='HEAD'?undefined:filename==='index.html'&&shortcutIcon?bytes.toString('utf8').replace('<body>','<body data-desktop-shortcut="true">'):bytes);
      });
    }catch(e){
      let status=e instanceof HttpError||e instanceof SchoolImportError?e.status||400:500,message=e instanceof HttpError||e instanceof SchoolImportError?e.message:'No fue posible completar la operación.';
      if(e.code==='23505'||e.code?.startsWith('SQLITE_CONSTRAINT')||/UNIQUE constraint failed|duplicate key value violates unique constraint/i.test(e.message)){status=409;message='El registro ya existe. Revise los duplicados.';}
      if(user)await store.audit(user.id,status===409?'request.conflict':status===403?'request.denied':'request.error','',{status,route:url?.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]+/g,':id')||'',code:(e instanceof HttpError||e instanceof SchoolImportError)?e.code:''});
      if(status===413||status===503)res.setHeader('Connection','close');
      if(status===500&&!req.aborted)console.error('Error interno de matrícula:',e.name,e.code||'SIN_CODIGO');
      if(!res.headersSent)send({error:message,code:(e instanceof HttpError||e instanceof SchoolImportError)?e.code:''},status);else res.end();
    }
  };
  const handler=(req,res)=>coreHandler(req,res);
  const server=tls?https.createServer(tls,handler):http.createServer(handler);server.requestTimeout=30000;server.headersTimeout=15000;
  return {server,handler,store,svc,listen:(port=4318)=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),close:()=>new Promise(resolve=>{server.close(async()=>{if(ownStore)await store.close();resolve();});server.closeIdleConnections();})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const host=process.env.MATRICULA_HOST||'127.0.0.1',tls=process.env.MATRICULA_TLS_KEY&&process.env.MATRICULA_TLS_CERT?{key:readFileSync(process.env.MATRICULA_TLS_KEY),cert:readFileSync(process.env.MATRICULA_TLS_CERT)}:undefined;
  const app=await createApp({directory:process.env.MATRICULA_DATA||join(root,'.local','manual'),host,tls,origin:process.env.MATRICULA_ORIGIN});const address=await app.listen(Number(process.env.MATRICULA_PORT)||4318);console.log(`Matrícula local: ${tls?'https':'http'}://${host}:${address.port}`);process.on('SIGINT',async()=>{await app.close();process.exit(0);});process.on('SIGTERM',async()=>{await app.close();process.exit(0);});
}
