const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={user:null,csrf:'',meta:null,view:'home',year:null,course:'',status:'',q:'',page:1,pageSize:25,auditSnapshot:null,record:null,tab:'ficha',draft:{},editing:false,dirty:false,saving:false,conflict:false,importRows:null,importTicket:null,importPreview:null,importKind:null,importOptions:null,importRevision:0,recordFilters:{}};
let noticeTimer,viewRequest=0,recordRequest=0;
const busyButtons=new WeakMap();
function eyeIcon(visible=false){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${visible?'<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11.1 11.1 0 0 1 12 5c5.5 0 9 7 9 7a16.6 16.6 0 0 1-3 3.9M6.4 6.4A17.7 17.7 0 0 0 3 12s3.5 7 9 7a10.3 10.3 0 0 0 5.6-1.8"/>':'<path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/>'}</svg>`;}
function passwordField(id,label,attributes=''){return `<div class="password-field wide"><label for="${id}">${label}</label><div class="password-input"><input id="${id}" name="password" type="password" ${attributes}><button type="button" class="password-toggle" data-action="toggle-password" aria-label="Mostrar contraseña" title="Mostrar contraseña" aria-controls="${id}" aria-pressed="false">${eyeIcon()}</button></div></div>`;}
function setBusy(button,busy,label='Procesando…'){
  if(!button)return;
  if(busy){if(busyButtons.has(button))return;busyButtons.set(button,{html:button.innerHTML,disabled:button.disabled});button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML=`<span class="button-spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;}
  else{const previous=busyButtons.get(button);if(!previous)return;button.innerHTML=previous.html;button.disabled=previous.disabled;button.removeAttribute('aria-busy');busyButtons.delete(button);}
}
function skeleton(kind='table',label='Cargando…'){return EnrollmentLoading.skeleton(kind,label);}
function showLoading(container,label,kind='table'){if(!container)return;container.setAttribute('aria-busy','true');container.innerHTML=skeleton(kind,label);}
function loadingError(container,error){if(!container)return;container.removeAttribute('aria-busy');container.innerHTML=`<div class="callout error" role="alert">${esc(error.message)}</div><button data-action="retry">Reintentar</button>`;}
const can=p=>state.user?.permissions.includes(p),statusLabel=s=>({draft:'Borrador',enrolled:'Matriculado',withdrawn:'Retirado'}[s]||s),date=v=>v?new Date(v).toLocaleString('es-CL'):'—';
const courses=y=>state.meta.courses.filter(c=>!y||c.year===Number(y));
const courseName=id=>state.meta.courses.find(c=>c.id===id)?.name||'Curso sin acceso';
const options=(items,value,label='name')=>items.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(typeof label==='function'?label(x):x[label])}</option>`).join('');
function notice(text){$('#notice').textContent=text;$('#notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),5500);}
async function api(path,{method='GET',body,binary=false}={}){
  let response;try{response=await fetch(path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':state.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new Error('No hay conexión. El formulario sigue en pantalla; vuelva a guardar cuando se recupere.');}
  if(!response.ok){const data=await response.json().catch(()=>({error:'Error de servidor.'}));const error=new Error(data.error);error.code=data.code;error.status=response.status;throw error;}
  if(method!=='GET'&&(/^\/api\/records(?:\/|$)/.test(path)||/^\/api\/import\/(?:school\/)?commit$/.test(path)))invalidateRecordsCache();
  return binary?response.blob():response.json();
}
async function download(path,opts,filename){const blob=await api(path,{...opts,binary:true}),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function uiIcon(name){
  const shapes={exit:'<path d="M9 5H5v14h4M14 8l4 4-4 4M8 12h10"/>',theme:'<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>',key:'<circle cx="8" cy="9" r="4"/><path d="m11 12 8 8M15 16l3-3M17 18l3-3"/>'};
  return '<svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(shapes[name]||'')+'</svg>';
}
function helpControl(label='Ayuda de esta pantalla'){return '<button type="button" class="help-button utility-button" data-action="help" aria-label="'+esc(label)+'" title="'+esc(label)+'"><span class="help-symbol" aria-hidden="true">?</span><span>Ayuda</span></button>';}
const dialogActionLabels={'Guardar antes de salir':'Guardar y continuar','Descartar edición':'Descartar cambios','Nueva matrícula':'Crear borrador','Cambiar curso':'Guardar cambio de curso','Registrar retiro':'Registrar retiro','Registrar reingreso':'Registrar reingreso','Preparar matrícula de otro año':'Crear borrador anual','Actualizar plantilla de esta ficha':'Actualizar plantilla','Agregar curso':'Crear curso','Consultar otro año':'Consultar año','Nueva cuenta':'Crear cuenta','Configurar cuenta':'Guardar cambios','Cambiar contraseña':'Cambiar contraseña','Añadir pregunta':'Añadir al borrador','Editar pregunta':'Guardar pregunta','Exportar nómina':'Descargar','Descargas de la ficha':'Descargar','Recargar ficha guardada':'Recargar ficha'};
function dialog(title,html,onSubmit){
  const d=$('#dialog'),trigger=document.activeElement,readOnly=/^Revisión \d+$/.test(title);
  d.dataset.helpTopic=enrollmentDialogHelpTopic(title);
  const label=dialogActionLabels[title]||'Guardar cambios';
  d.innerHTML=`<form id="dialog-form"><div class="dialog-heading"><h2 id="dialog-title" tabindex="-1">${esc(title)}</h2><div class="dialog-heading-actions">${helpControl('Ayuda de este formulario')}<button type="button" class="close-button danger" data-action="close-dialog" aria-label="Cerrar formulario" title="Cerrar formulario">×</button></div></div>${html}<div id="dialog-error" class="error-text" role="alert"></div><div class="actions dialog-actions">${readOnly?'<button type="button" class="cancel-button" data-action="close-dialog">Cerrar</button>':`<button type="button" class="cancel-button" data-action="close-dialog">Cancelar</button><button type="submit" class="${title==='Registrar retiro'?'danger-primary':'primary'}">${esc(label)}</button>`}</div></form>`;
  d.setAttribute('aria-labelledby','dialog-title');
  let submitting=false;
  d.oncancel=e=>{if(submitting)e.preventDefault();};
  d.onclose=()=>{if(trigger?.isConnected)trigger.focus();};
  d.showModal();
  const form=$('#dialog-form'),closeButtons=[...form.querySelectorAll('[data-action="close-dialog"]')];
  const firstField=form.querySelector('input:not([disabled]):not([readonly]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]):not([readonly])');
  (firstField||form.querySelector('#dialog-title')).focus();
  form.onsubmit=async e=>{
    e.preventDefault();if(submitting||readOnly)return;submitting=true;
    const button=e.submitter;closeButtons.forEach(control=>control.disabled=true);setBusy(button,true,'Guardando…');
    try{await onSubmit(new FormData(form));if(d.contains(form))d.close();}
    catch(error){if(d.contains(form))form.querySelector('#dialog-error').textContent=error.message;else notice(error.message);}
    finally{submitting=false;closeButtons.forEach(control=>control.disabled=false);setBusy(button,false);}
  };
}
function login(demo=false){
  EnrollmentLoading.clearRoute();
  $('#app').innerHTML=`<main class="login"><section class="login-story"><p class="eyebrow">Colegio Domingo Santa María</p><h1>Cada estudiante.<br>Su historia, al día.</h1><p>Un espacio de trabajo para organizar la matrícula, actualizar las fichas y acompañar cada año escolar.</p></section><section class="login-form-area"><form id="login" class="login-form"><div class="brand"><img class="brand-crest" src="/escudo.jpg" width="54" height="54" alt=""><div><strong>Liceo Domingo Santa María</strong><span>Concepción · Matrícula</span></div></div><div class="login-heading"><h1>Bienvenido/a</h1>${helpControl()}</div><p class="muted">Ingresa con tu cuenta individual del colegio.</p>${demo?'<div class="callout">Demostración local · datos sintéticos.<br>Cuenta: demo-secretaria<br>Clave de prueba: Demo-matricula-2026!</div>':''}<label>Usuario<input name="username" autocomplete="username" required autofocus></label>${passwordField('login-password','Contraseña','autocomplete="current-password" required')}<div id="login-error" class="error-text" role="alert"></div><button class="primary" type="submit">Ingresar</button><p class="muted">El acceso a cada curso y a los antecedentes reservados depende de tus permisos.</p></form></section></main>`;
  $('#login').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),b=e.submitter;setBusy(b,true,'Ingresando…');try{const result=await api('/api/login',{method:'POST',body:Object.fromEntries(fd)});state.user=result.user;state.csrf=result.csrf;state.demo=result.demo;await init();}catch(error){if(state.user)renderStartupError(error);else if($('#login-error'))$('#login-error').textContent=error.message;else notice(error.message);}finally{setBusy(b,false);}};
}
const viewPermissions={home:null,students:'read',followup:'read',organization:['enroll','import','admin'],administration:['admin','audit','backup'],records:'read',pending:'read',reports:'read',courses:'enroll',users:'admin',templates:'admin',import:'import',audit:'audit',backup:'backup'};
function viewAllowed(view){const permission=viewPermissions[view];return view==='home'||Boolean(permission&&(Array.isArray(permission)?permission.some(can):can(permission)));}
function rememberLocation(){EnrollmentLoading.writeRoute({view:state.view,year:state.year,record:state.record?.id,tab:state.tab});}
function schoolYearRange(){return state.meta?.yearRange||{min:1950,max:2100};}
function recordDecision(title,description){
  return new Promise(resolve=>{
    let accepted=false;
    dialog(title,'<p>'+esc(description)+'</p>',async()=>{accepted=true;});
    const panel=$('#dialog'),restoreFocus=panel.onclose;
    panel.onclose=()=>{restoreFocus?.();resolve(accepted);};
  });
}
async function leaveRecordChanges(){return !state.editing||recordDecision('Guardar antes de salir','Tienes cambios pendientes en esta ficha. Guarda para continuar o pulsa Cancelar para seguir editando.');}
function validSchoolYear(value){const year=Number(value),range=schoolYearRange();return Number.isInteger(year)&&year>=range.min&&year<=range.max?year:null;}
function availableSchoolYears(){return [...new Set([...(state.meta?.availableYears||[]),...(state.meta?.courses||[]).map(course=>course.year),state.year].map(validSchoolYear).filter(year=>year!==null))].sort((a,b)=>b-a);}
function schoolYearOptions(){return availableSchoolYears().map(year=>`<option value="${year}" ${year===Number(state.year)?'selected':''}>${year}</option>`).join('')+'<option value="other">Consultar otro año…</option>';}
let yearChangeRequest=0;
function applySchoolYear(year){
  state.year=year;state.course='';state.status='';state.q='';state.recordFilters={};state.page=1;state.auditSnapshot=null;state.record=null;state.draft={};state.editing=false;state.dirty=false;state.conflict=false;
  invalidateRecordsCache();collectionPages.clear();invalidateImport();resetImportPreview();
  Object.assign(state,{importRows:null,importTicket:null,importPreview:null,importKind:null,importOptions:null});
  if(typeof resetReportsContext==='function')resetReportsContext();
  if(typeof resetCollectionViews==='function')resetCollectionViews({yearOnly:true});
  if(typeof resetTemplateViews==='function')resetTemplateViews();
}
async function changeSchoolYear(value){
  const year=validSchoolYear(value);if(year===null)throw new Error(`Elige un año entre ${schoolYearRange().min} y ${schoolYearRange().max}.`);
  const request=++yearChangeRequest,userId=state.user?.id;
  if(year===state.year)return;
  if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;
  if(request!==yearChangeRequest||userId!==state.user?.id)return;
  navigationRequest++;finishNavigationMotion();applySchoolYear(year);shell();await renderView();
  if(request!==yearChangeRequest||userId!==state.user?.id)return;
  notice(`Año escolar ${year} seleccionado. Expedientes, pendientes y estadísticas corresponden a ese año.`);prefetchRecords();
}
function chooseSchoolYear(){
  const range=schoolYearRange();
  dialog('Consultar otro año',`<p>Consulta matrículas antiguas o prepara un año futuro. Seleccionar el año no modifica ni traslada estudiantes.</p><label>Año escolar<input name="year" type="number" min="${range.min}" max="${range.max}" value="${state.year}" required></label><p class="hint spaced">Los años con cursos o matrículas aparecen automáticamente en el selector. Si aún no hay datos, verás una lista vacía.</p>`,async fd=>changeSchoolYear(fd.get('year')));
}
async function restoreHistoryNavigation(navigation){
  const request=++navigationRequest,userId=state.user?.id;
  finishNavigationMotion();viewRequest++;recordRequest++;listRequest++;
  if(!state.user||!state.meta||state.user.mustChangePassword){navigation.commit({view:state.user?.mustChangePassword?'password':'login'});return;}
  const overlay=document.querySelector('#help-dialog[open], #dialog[open]');
  if(overlay){
    if(!overlay.querySelector('[aria-busy="true"]'))overlay.close();
    await navigation.cancel();return;
  }
  if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord()))){if(navigation.isCurrent())await navigation.cancel();return;}
  if(request!==navigationRequest||userId!==state.user?.id){if(navigation.isCurrent())await navigation.cancel();return;}
  if(!navigation.isCurrent())return;
  const route=navigation.route,view=viewAllowed(route.view)?route.view:'home',year=validSchoolYear(route.year)||state.year;
  if(!navigation.commit({view,year,record:view==='records'?route.record:null,tab:route.tab}))return;
  const loaded=state.record;
  if(year!==state.year)applySchoolYear(year);
  state.view=view;state.record=view==='records'&&loaded?.id===route.record&&loaded.year===year?loaded:null;
  state.editing=false;state.tab=route.tab||'ficha';state.page=1;sidebarMobileOpen=false;shell();window.scrollTo?.(0,0);
  try{
    if(view==='records'&&route.record&&!state.record)await openRecord(route.record,{tab:route.tab,replaceLocation:true});
    else await renderView();
  }catch(error){
    if(request!==navigationRequest||userId!==state.user?.id)return;
    if(error.status===401){clearSessionViewData();state.user=null;state.meta=null;login(state.demo);return;}
    state.record=null;EnrollmentLoading.writeRoute({view,year},{replace:true});shell();await renderView();notice(error.message);
  }
  if(request!==navigationRequest||userId!==state.user?.id)return;
  const title=document.querySelector('#content h1');if(title){title.setAttribute('tabindex','-1');title.focus({preventScroll:true});}
}
async function init({restore=false}={}){
  if(state.user.mustChangePassword)return renderRequiredPasswordChange();
  state.meta=await api('/api/meta');
  const route=restore?EnrollmentLoading.readRoute():null;
  const years=availableSchoolYears();
  const preferred=route?.year||state.year;
  state.year=validSchoolYear(preferred)||years.find(y=>y===new Date().getFullYear())||years[0]||new Date().getFullYear();
  const fallback='home';
  const requested=route?.view||state.view;
  state.view=viewAllowed(requested)?requested:fallback;
  state.record=null;shell();
  if(restore&&route.view==='records'&&route.record&&state.view==='records'){
    try{await openRecord(route.record,{tab:route.tab,replaceLocation:true});}catch(error){if(error.status===401)throw error;}
    return;
  }
  await renderView();
  prefetchRecords();
}
function renderStartupError(error){
  $('#app').innerHTML='<main class="boot-loading"><section class="panel"><h1>No se pudo cargar la pantalla</h1><p id="startup-error" role="alert">'+esc(error.message)+'</p><button type="button" class="primary spaced" data-action="retry-startup">Reintentar</button></section></main>';
}
async function startApplication(){
  EnrollmentLoading.boot();
  try{
    const session=await api('/api/session');state.user=session.user;state.csrf=session.csrf;state.demo=session.demo;
    await init({restore:true});
  }catch(error){
    if(error.status===401){state.user=null;state.meta=null;const health=await api('/api/health').catch(()=>({}));login(health.demo);}
    else renderStartupError(error);
  }
}
function shell(){
  viewRequest++;recordRequest++;listRequest++;
  document.body.classList.remove('sidebar-drawer-open');
  const areas=areaDefinitions().filter(area=>viewAllowed(area.view)),currentArea=areaForView(state.view);
  const taskLabels={records:'Expedientes',pending:'Pendientes',reports:'Estadísticas',courses:'Cursos y años',users:'Cuentas y permisos',templates:'Plantillas',import:'Importación',audit:'Auditoría',backup:'Respaldo'};
  const section=state.record?'Expediente del estudiante':taskLabels[state.view]||currentArea?.label||'Mi cuenta';
  const navItem=(view,label,icon,status)=>`<button type="button" data-action="nav" data-view="${view}" ${status?`data-status="${status}" data-reset-filters="true"`:''} class="${state.view===view?'active':''}" ${state.view===view?'aria-current="page"':''} aria-label="${esc(label)}" title="${esc(label)}"><span class="nav-icon" aria-hidden="true">${homeIcon(icon)}</span><span class="nav-label">${esc(label)}</span></button>`;
  const localNavigation=currentArea?navItem(currentArea.view,'Inicio de '+currentArea.label,currentArea.icon)+currentArea.actions.filter(([destination,,,permission])=>destination!=='new'&&can(permission)).map(([view,label,,,icon,status])=>navItem(view,label,icon,status)).join(''):'';
  const navigation=`<div class="nav-group"><p class="nav-caption">${esc(currentArea?.label||'Tu área')}</p>${localNavigation}</div><div class="nav-group"><p class="nav-caption">Otras áreas</p>${areas.filter(area=>area.view!==currentArea?.view).map(area=>navItem(area.view,area.label,area.icon)).join('')}</div>`;
  const dark=document.body.classList.contains('dark');
  if(state.view==='home'){
    $('#app').innerHTML=`<div class="home-shell"><header class="home-header" aria-label="Herramientas de inicio"><button type="button" class="brand brand-home" data-action="home" aria-label="Ir al inicio de matrícula"><img class="brand-crest" src="/escudo.jpg" width="48" height="48" alt=""><span class="brand-copy"><strong>Liceo Domingo<br>Santa María</strong></span></button><div class="home-utilities">${helpControl()}<details class="home-account-menu"><summary aria-label="Opciones de mi cuenta">${homeIcon('users')}<span>Mi cuenta</span></summary><div class="home-account-options"><p>${esc(state.user.name)}</p><button type="button" data-action="change-password">${uiIcon('key')}Mi contraseña</button><button type="button" data-action="theme" aria-label="Cambiar tema claro u oscuro" aria-pressed="${dark}">${uiIcon('theme')}<span data-theme-label>${dark?'Tema oscuro':'Tema claro'}</span></button><button type="button" class="danger" data-action="logout">${uiIcon('exit')}Salir</button></div></details></div></header><main class="home-content content" id="content"></main></div>`;
    const account=document.querySelector('.home-account-menu');
    account.onkeydown=event=>{if(event.key==='Escape'){account.open=false;account.querySelector('summary').focus();}};
    return;
  }
  $('#app').innerHTML=`<div class="shell" data-screen="${state.record?'record':state.view}"><button type="button" class="sidebar-backdrop" data-action="sidebar-toggle" aria-label="Cerrar menú lateral" hidden></button><aside class="sidebar" id="main-sidebar" aria-label="Navegación de matrícula"><div class="sidebar-heading"><button type="button" class="brand brand-home" data-action="home" aria-label="Ir al inicio de matrícula" title="Inicio general"><img class="brand-crest" src="/escudo.jpg" width="42" height="42" alt=""><span class="brand-copy"><strong>Liceo Domingo<br>Santa María</strong><small>Inicio general</small></span></button><button type="button" class="sidebar-compact" data-action="sidebar-compact" aria-label="Compactar menú lateral" title="Compactar menú lateral">${homeIcon('sidebar')}</button><button type="button" class="sidebar-close" data-action="sidebar-toggle" aria-label="Cerrar menú lateral">×</button></div><nav aria-label="Principal">${navigation}</nav><div class="sidebar-foot"><strong>${esc(state.user.name)}</strong><span class="muted small">Cuenta individual</span><button class="text-button" data-action="change-password" title="Cambiar contraseña">${uiIcon('key')}<span>Cambiar contraseña</span></button></div></aside><div class="workspace"><header class="topbar" aria-label="Herramientas de matrícula"><button type="button" class="sidebar-toggle" data-action="sidebar-toggle" aria-controls="main-sidebar" aria-label="Ocultar menú lateral" aria-expanded="true">${homeIcon('menu')}</button><nav class="workspace-breadcrumb" aria-label="Ubicación"><button type="button" data-action="home">Inicio</button>${currentArea?`<span aria-hidden="true">/</span><button type="button" data-action="nav" data-view="${currentArea.view}" data-reset-filters="true">${currentArea.label}</button>`:''}${state.view!==currentArea?.view?`<span aria-hidden="true">/</span><span aria-current="page">${esc(section)}</span>`:''}</nav><div class="topbar-controls"><label class="school-year">Año escolar<select id="year-select">${schoolYearOptions()}</select></label><div class="utility-actions" role="group" aria-label="Ayuda y apariencia">${helpControl()}<button type="button" class="utility-button" data-action="theme" aria-label="Cambiar tema claro u oscuro" aria-pressed="${dark}">${uiIcon('theme')}<span data-theme-label>${dark?'Tema oscuro':'Tema claro'}</span></button></div><div class="session-actions"><button type="button" class="utility-button account-mobile" data-action="change-password" aria-label="Cambiar contraseña">${uiIcon('key')}<span>Contraseña</span></button><button type="button" class="session-exit danger" data-action="logout">${uiIcon('exit')}<span>Salir</span></button></div></div></header><main class="content" id="content"></main></div></div>`;
  applySidebarMode();
  $('#year-select').onchange=async event=>{const value=event.target.value;event.target.value=String(state.year);try{if(value==='other')chooseSchoolYear();else await changeSchoolYear(value);}catch(error){notice(error.message);}};
}
function heading(title,text,actions=''){const scope=['users','templates','audit','backup'].includes(state.view)?'Gestión general · Todos los años':`Año escolar ${state.year}`;return `<div class="page-heading"><div><p class="eyebrow">${scope}</p><h1>${title}</h1><p>${text}</p></div><div class="actions">${actions}</div></div>`;}
async function renderView(){
  rememberLocation();
  $('#content')?.classList.remove('records-content');
  document.querySelectorAll('.sidebar nav button').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  try{if(state.view==='home')return renderHome();if(areaDefinitions().some(area=>area.view===state.view))return renderAreaHub(state.view);if(state.view==='records')return state.record?renderRecord():await renderRecords();if(state.view==='courses')renderCourses();else if(state.view==='users')await renderUsers();else if(state.view==='templates')renderTemplateEditor();else if(state.view==='reports'||state.view==='pending')await renderReports();else if(state.view==='empty')$('#content').innerHTML=heading('Cuenta sin módulos asignados','Contacta a Administración para solicitar acceso.');else if(state.view==='import')renderImport();else if(state.view==='audit')await renderAudit();else if(state.view==='backup')renderBackup();}catch(error){loadingError($('#content'),error);}
}
let listRequest=0,cacheGeneration=0;
const recordsCache=new Map();
let navigationRequest=0,activeNavigationAnimations=[];
const recordFilterDefaults=Object.freeze({identifierType:'',pendingKey:'',documentKind:'',documentState:'',contact:'',origin:'',updatedFrom:'',updatedTo:'',sort:'name'});
function recordAdvancedFilters(){return {...recordFilterDefaults,...state.recordFilters};}
function recordsFilterQuery(){return {year:state.year,course:state.course,status:state.status,q:state.q,...recordAdvancedFilters()};}
const recordsSelection=()=>({userId:state.user?.id,...recordsFilterQuery(),page:state.page,pageSize:state.pageSize||25});
const recordsCacheKey=(selection=recordsSelection())=>JSON.stringify([selection.userId,selection.year,selection.course,selection.status,selection.q,selection.page,selection.pageSize||25,...Object.keys(recordFilterDefaults).map(key=>selection[key]??recordFilterDefaults[key])]);
function invalidateRecordsCache(){cacheGeneration++;recordsCache.clear();}
function finishNavigationMotion(){
  activeNavigationAnimations.forEach(animation=>animation.cancel());
  activeNavigationAnimations=[];
  $('#app')?.classList.remove('is-navigating');
}
async function runNavigationMotion(specifications,duration){
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
  const animations=specifications.filter(([element])=>typeof element?.animate==='function').map(([element,keyframes])=>element.animate(keyframes,{duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'}));
  if(!animations.length)return;
  activeNavigationAnimations=animations;
  $('#app')?.classList.add('is-navigating');
  await Promise.allSettled(animations.map(animation=>animation.finished));
}
async function navigateTo(view,{reset=false,status,q}={}){
  if(!viewAllowed(view))return;
  const request=++navigationRequest,userId=state.user?.id,from=state.view;
  finishNavigationMotion();
  const course=reset?'':state.course,nextStatus=status??(reset?'':state.status),query=q??(reset?'':state.q);
  if(state.view===view&&!state.record&&course===state.course&&nextStatus===state.status&&query===state.q)return;
  if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;
  if(request!==navigationRequest||userId!==state.user?.id)return;
  if(view==='home'){
    await runNavigationMotion([
      [document.querySelector('.sidebar'),[{transform:'translateX(0)',opacity:1},{transform:'translateX(-100%)',opacity:0}]],
      [document.querySelector('.workspace'),[{transform:'translate(0,0) scale(1)',opacity:1,transformOrigin:'50% 0'},{transform:'translate(-18px,10px) scale(.97)',opacity:0,transformOrigin:'50% 0'}]]
    ],280);
  }else if(from==='home'){
    await runNavigationMotion([[document.querySelector('.home-shell'),[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.985)'}]]],160);
  }
  if(request!==navigationRequest||userId!==state.user?.id)return;
  finishNavigationMotion();
  if(reset)state.recordFilters={};if(view==='audit')state.auditSnapshot=null;state.view=view;state.record=null;state.editing=false;state.draft={};state.course=course;state.status=nextStatus;state.q=query;state.page=1;
  sidebarMobileOpen=false;shell();window.scrollTo?.(0,0);
  const rendering=renderView();
  const entering=view==='home'
    ?[[document.querySelector('.home-shell'),[{opacity:0,transform:'scale(1.018)'},{opacity:1,transform:'scale(1)'}]]]
    :from==='home'?[
      [document.querySelector('.sidebar'),[{transform:'translateX(-24px)',opacity:0},{transform:'translateX(0)',opacity:1}]],
      [document.querySelector('.workspace'),[{transform:'translateY(8px)',opacity:0},{transform:'translateY(0)',opacity:1}]]
    ]:[];
  try{await Promise.all([rendering,runNavigationMotion(entering,220)]);}
  finally{if(request===navigationRequest)finishNavigationMotion();}
  if(request!==navigationRequest)return false;
  if(view==='home')$('#home-title')?.focus({preventScroll:true});
  else{const title=document.querySelector('#content h1');if(title){title.setAttribute('tabindex','-1');title.focus({preventScroll:true});}}
  return true;
}
const collectionPages=new Map();
function clearSessionViewData(){
  navigationRequest++;yearChangeRequest++;finishNavigationMotion();
  state.recordFilters={};
  if(typeof resetCollectionViews==='function')resetCollectionViews();
  if(typeof resetTemplateViews==='function')resetTemplateViews();
  window.EnrollmentRecordViews?.reset();
  invalidateRecordsCache();collectionPages.clear();listRequest++;
  if(typeof resetReportsContext==='function')resetReportsContext();
  if(typeof resetImportPreview==='function')resetImportPreview();
  Object.assign(state,{importRows:null,importTicket:null,importPreview:null,importKind:null,importOptions:null});
}
function paintCollection(container,id,items,row,{label='registros',pageSize=10,empty='No hay registros.',before='',after=''}={}){
  if(!container)return;
  const key=JSON.stringify([state.user?.id,state.year,state.record?.id||'',id]),selection=collectionPages.get(key)||{page:1,pageSize};
  const result=EnrollmentPagination.slice(items,selection);collectionPages.set(key,{page:result.page,pageSize:result.pageSize});
  container.innerHTML=(result.items.length?before+result.items.map(row).join('')+after:`<div class="empty">${esc(empty)}</div>`)+EnrollmentPagination.html({id,label,...result});
  EnrollmentPagination.bind(container,id,next=>{collectionPages.set(key,next);paintCollection(container,id,items,row,{label,pageSize,empty,before,after});});
}
async function loadList({background=false}={}){
  const request=++listRequest,container=$('#list-table');if(!container)return;
  const selection=recordsSelection(),generation=cacheGeneration,key=recordsCacheKey(selection),cached=recordsCache.get(key);
  if(cached)paintListResult(container,cached);else if(!background)showLoading(container,'Cargando expedientes…');
  try{
    const {userId,...filters}=selection,query=new URLSearchParams(filters),result=await api('/api/records?'+query);
    if(request!==listRequest||container!==$('#list-table')||generation!==cacheGeneration)return;
    recordsCache.set(recordsCacheKey({...selection,page:result.page,pageSize:result.pageSize}),result);paintListResult(container,result);
  }catch(error){if(request===listRequest&&container===$('#list-table')&&!cached)loadingError(container,error);}
}
function prefetchRecords(){
  if(!can('read'))return;
  const selection={userId:state.user.id,year:state.year,course:'',q:'',page:1,pageSize:25,status:''},generation=cacheGeneration,key=recordsCacheKey(selection);if(recordsCache.has(key))return;
  const {userId,...filters}=selection,query=new URLSearchParams(filters);
  api('/api/records?'+query).then(result=>{if(generation===cacheGeneration&&state.user?.id===userId)recordsCache.set(key,result);}).catch(()=>{});
}async function openRecord(id,{tab='ficha',replaceLocation=false,edit=false}={}){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;const request=++recordRequest,container=$('#content');showLoading(container,'Cargando ficha del estudiante…',tab==='documents'?'documents':tab==='history'?'history':'record');try{const record=await api('/api/records/'+id);if(request!==recordRequest||container!==$('#content'))return;if(!state.meta.templates.some(t=>t.id===record.templateId)){const meta=await api('/api/meta');if(request!==recordRequest||container!==$('#content'))return;state.meta=meta;}state.record=record;state.draft=recordDraft(record);state.editing=edit&&recordCanEdit();state.dirty=false;state.conflict=false;state.view='records';state.tab=['ficha','documents','history'].includes(tab)?tab:'ficha';state.year=record.year;if(replaceLocation)EnrollmentLoading.writeRoute({view:'records',year:record.year,record:record.id,tab:state.tab},{replace:true});shell();renderRecord();}catch(error){if(request===recordRequest&&container===$('#content')){container.removeAttribute('aria-busy');if(state.record)renderRecord();else{container.innerHTML=`<div class="callout error" role="alert">${esc(error.message)}</div><div class="actions"><button data-action="open" data-id="${esc(id)}">Reintentar</button><button data-action="back">Volver a expedientes</button></div>`;}throw error;}}}
function recordDraft(record){return Object.fromEntries(Object.entries(record.data).map(([key,value])=>[key,value==null?'':String(value)]));}
function recordCanEdit(){return Boolean(state.record&&can('write')&&state.record.status!=='withdrawn');}
function recordChanges(){return Object.fromEntries(Object.entries(state.draft).filter(([key,value])=>String(state.record.data[key]??'')!==value));}
function fieldLabel(f){const p=[['father','padre'],['mother','madre'],['guardian','apoderado'],['alternate','suplente']].find(([prefix])=>f.key.startsWith(prefix));return p&&!f.key.endsWith('Name')?f.label+' ('+p[1]+')':f.label;}
const fieldHints=Object.freeze({
  names:'Ej. Camila Fernanda',surname:'Ej. González',secondSurname:'Ej. Pérez',identifier:'Ej. 12345678-5 o IPE12345',birthDate:'Ej. 15/03/2012',
  birthPlace:'Ej. Concepción',email:'Ej. nombre@ejemplo.cl',address:'Ej. Avenida Los Carrera 1234',commune:'Ej. Concepción',addressChange:'Ej. Se mudó en marzo de 2026',
  emergencyPhone:'Ej. +56 9 1234 5678',emergencyEmail:'Ej. emergencia@ejemplo.cl',emergencyName:'Ej. María González',
  guardianName:'Ej. Daniela González',guardianIdentifier:'Ej. 12345678-5',guardianAddress:'Ej. Pasaje Los Aromos 45',guardianCommune:'Ej. Concepción',guardianPhone:'Ej. +56 9 1234 5678',guardianEmail:'Ej. apoderado@ejemplo.cl',guardianBirthDate:'Ej. 15/03/1985',guardianRelationship:'Ej. Madre',guardianNationality:'Ej. Chilena',guardianEducation:'Ej. Enseñanza media completa',guardianEmployment:'Ej. Trabajo dependiente',guardianOccupation:'Ej. Vendedora',guardianIncome:'Ej. 650000',
  alternateName:'Ej. Patricio González',alternateIdentifier:'Ej. 12345678-5',alternateAddress:'Ej. Pasaje Los Aromos 45',alternateCommune:'Ej. Concepción',alternateBirthDate:'Ej. 15/03/1985',alternateRelationship:'Ej. Tío',alternateNationality:'Ej. Chilena',alternatePhone:'Ej. +56 9 1234 5678',alternateEmail:'Ej. suplente@ejemplo.cl',alternateEducation:'Ej. Enseñanza media completa',alternateEmployment:'Ej. Trabajo dependiente',alternateOccupation:'Ej. Comerciante',alternateIncome:'Ej. 500000',
  fatherName:'Ej. Juan González',motherName:'Ej. María Pérez',fatherBirthDate:'Ej. 15/03/1980',motherBirthDate:'Ej. 20/07/1982',fatherIdentifier:'Ej. 12345678-5',motherIdentifier:'Ej. 12345678-5',fatherNationality:'Ej. Chilena',motherNationality:'Ej. Chilena',fatherPhone:'Ej. +56 9 1234 5678',motherPhone:'Ej. +56 9 1234 5678',fatherAddress:'Ej. Avenida Los Carrera 1234',motherAddress:'Ej. Avenida Los Carrera 1234',
  previousSchool:'Ej. Liceo Domingo Santa María',enrollmentNumber:'Ej. MAT-2026-001',registryNumber:'Ej. EXP-2026-001',receipt:'Ej. REC-2026-001',enrollmentDate:'Ej. 05/03/2026',fee:'Ej. 0',gradeAverage:'Ej. 6,2',officer:'Ej. Ana Pérez',observations:'Ej. Información administrativa relevante',
  birthCertificate:'Selecciona Sí, No o Pendiente',studyCertificate:'Selecciona Sí, No o Pendiente',personalityReport:'Selecciona Sí, No o Pendiente',
  protectionMeasures:'Ej. Tribunal, medida y vigencia, si corresponde',legalProhibitions:'Ej. Resolución o restricción vigente, si corresponde',householdRelationships:'Ej. Vive con su madre y dos hermanos',benefits:'Ej. Programa o apoyo vigente',householdRegistry:'Ej. Tramo o registro informado',
  treatments:'Ej. Tratamiento informado y contacto autorizado',treatmentYear:'Ej. 2026',visualImpairment:'Ej. Usa lentes',motorImpairment:'Ej. Sin antecedentes informados',otherImpairment:'Ej. Descripción breve y pertinente',bloodGroup:'Ej. O positivo',healthSystem:'Ej. Fonasa B',insuranceName:'Ej. Nombre de seguro',insurancePhone:'Ej. +56 2 2345 6789',allergies:'Ej. Alergia y medidas conocidas',
  religionDetail:'Ej. Alcance de la decisión informada',imagesDetail:'Ej. Alcance de la autorización',outingsDetail:'Ej. Alcance y restricciones informadas',religionDate:'Ej. 05/03/2026',imagesDate:'Ej. 05/03/2026',outingsDate:'Ej. 05/03/2026',religionResponsible:'Ej. Daniela González',imagesResponsible:'Ej. Daniela González',outingsResponsible:'Ej. Daniela González',religionVersion:'Ej. v2026.1',imagesVersion:'Ej. v2026.1',outingsVersion:'Ej. v2026.1',withdrawalDocuments:'Ej. Documentos entregados al retirar',withdrawalResponsible:'Ej. Daniela González',withdrawalOfficer:'Ej. Ana Pérez'
});
const fieldAutocomplete=Object.freeze({
  names:'given-name',surname:'family-name',secondSurname:'additional-name',email:'email',emergencyEmail:'email',guardianEmail:'email',
  alternateEmail:'email',address:'street-address',guardianAddress:'street-address',commune:'address-level2',
  guardianCommune:'address-level2',guardianName:'name',alternateName:'name',fatherName:'name',motherName:'name',
  emergencyName:'name',guardianPhone:'tel',alternatePhone:'tel',emergencyPhone:'tel'
});
function fieldInput(f,value){
  const disabled=!state.editing||!recordCanEdit()||(['identifier','identifierType'].includes(f.key)&&!can('enroll')&&!can('admin'));
  const hint=(Object.hasOwn(fieldHints,f.key)?fieldHints[f.key]:'')||(f.type==='date'?'Ej. 15/03/2012':f.type==='email'?'Ej. nombre@ejemplo.cl':f.type==='tel'?'Ej. +56 9 1234 5678':f.type==='textarea'?'Ej. Escribe una nota breve y verificable':''),autocomplete=f.sensitive||!Object.hasOwn(fieldAutocomplete,f.key)?'off':fieldAutocomplete[f.key];
  const type=['date','email','tel'].includes(f.type)?f.type:'text';
  const locked=disabled||f.section==='procedencia',helperId=`hint-${f.key}`,attr=`data-field="${f.key}" id="field-${f.key}" ${locked?(f.type==='select'?'disabled':'readonly'):''} autocomplete="${autocomplete}" ${hint&&!disabled&&f.section!=='procedencia'?'aria-describedby="'+helperId+'"':''}`;
  const inputHint=hint&&!disabled&&f.section!=='procedencia'&&!['date','select'].includes(f.type)?` placeholder="${esc(hint)}"`:'';
  const labelHint=hint&&!disabled&&f.section!=='procedencia'?`<small class="field-example" id="${helperId}">Ejemplo: ${esc(hint.replace(/^Ej\.\s*/,'').replace(/^Selecciona\s+/i,''))}</small>`:'';
  return `<label for="field-${f.key}" class="${f.type==='textarea'?'wide':''}">${esc(fieldLabel(f))} ${f.sensitive?'<small>· reservado</small>':''}${labelHint}${f.type==='select'?`<select ${attr}><option value="">Sin registrar</option>${f.options.map(x=>`<option ${value===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea ${attr}${inputHint} maxlength="4000">${esc(value)}</textarea>`:`<input ${attr} type="${type}" value="${esc(value)}" maxlength="500"${inputHint}>`}</label>`;
}

function recordPendingHtml(r){return r.status==='withdrawn'?'<p class="muted small">Expediente retirado. Se conserva para consulta e historial.</p>':r.pending.length?'<p class="small">'+r.pending.length+' antecedentes pendientes de revisar.</p>':'<p class="success-text">Antecedentes de seguimiento registrados.</p>';}
function renderRecord(){
  rememberLocation();
  $('#content').removeAttribute('aria-busy');
  const r=state.record,template=state.meta.templates.find(t=>t.id===r.templateId),fields=template.fields.filter(f=>!f.hidden&&(!f.sensitive||can('sensitive'))),editable=can('write')&&r.status!=='withdrawn';
  const editBanner=state.tab!=='ficha'?'':state.editing
    ? '<div class="record-edit-banner" tabindex="-1"><span class="record-edit-badge">En edición</span><div><strong>Editar ficha</strong><p>Los cambios se aplican al pulsar Guardar cambios.</p></div></div>'
    : '<div class="record-edit-banner record-readonly-banner"><span class="record-edit-badge">Consulta</span><div><strong>Ficha guardada</strong><p>'+(editable?'Puedes actualizar los datos de este año.':r.status==='withdrawn'?'Este expediente está retirado.':'Tu cuenta tiene acceso de consulta.')+'</p></div>'+(editable?'<button class="primary" data-action="edit-record">Editar ficha</button>':'')+'</div>';
  $('#content').innerHTML=`<button class="text-button" data-action="back">← Volver a expedientes</button>`+heading(esc(r.name),`${esc(courseName(r.courseId))} · ${r.year} · ${statusLabel(r.status)}`,can('export')?'<button data-action="pdf">Descargar ficha PDF</button><button data-action="record-downloads">Más descargas</button>':'')+editBanner+`<div class="record-layout"><div><div class="tabs" role="tablist" aria-label="Secciones del expediente">${[['ficha','Ficha del estudiante'],['documents','Documentos'],['history','Historial']].map(([v,l])=>`<button role="tab" aria-selected="${state.tab===v}" data-action="tab" data-tab="${v}" class="${state.tab===v?'active':''}">${l}</button>`).join('')}</div><div id="record-tab"></div></div><aside class="record-aside"><section class="panel"><h3>Este expediente</h3><div class="stat-line"><span>Estado</span><strong>${statusLabel(r.status)}</strong></div><div class="stat-line"><span>Revisión</span><strong>${r.version}</strong></div><div class="stat-line"><span>Plantilla</span><strong>v${r.templateId}</strong></div><p class="muted small spaced">${esc(template.name)}</p>${Number(state.meta.templates[0].id)>Number(r.templateId)&&can('write')&&can('enroll')&&r.status!=='withdrawn'?'<button data-action="upgrade-template">Actualizar plantilla de esta ficha</button>':''}<div id="record-pending">${recordPendingHtml(r)}</div><p class="muted small">Los pendientes de apoyo no impiden matricular.</p></section>${can('enroll')&&r.status!=='withdrawn'?`<section class="panel"><h3>Gestión de matrícula</h3>${r.status==='draft'?'<button class="primary" data-action="enroll">Confirmar matrícula</button>':''}<button data-action="transfer">Cambiar curso</button><button class="danger" data-action="withdraw">Registrar retiro</button><hr><button data-action="renew">Preparar otro año</button><p class="muted small spaced">Se crea un nuevo borrador y se conserva este año.</p></section>`:can('enroll')&&r.status==='withdrawn'?'<section class="panel"><h3>Gestión de matrícula</h3><button data-action="reenter">Registrar reingreso</button><p class="muted small spaced">El retiro y las revisiones anteriores se conservan.</p></section>':''}<section class="panel"><h3>Años del estudiante</h3><div id="record-years"></div></section></aside></div>`;renderRecordTab(fields);
  paintCollection($('#record-years'),'record-years',r.annualHistory,x=>`<button class="text-button" data-action="open" data-id="${x.id}">${x.year} · ${esc(courseName(x.courseId))}</button>`,{label:'años',pageSize:5,empty:'Sin años anteriores.'});
}
function renderRecordTab(fields){
  const r=state.record,container=$('#record-tab');
  window.EnrollmentRecordViews?.setContext({userId:state.user.id,recordId:r.id,year:r.year});
  if(state.tab==='ficha'){
    container.innerHTML=(!can('sensitive')?'<div class="callout">Esta vista muestra los datos autorizados para tus cursos. Los antecedentes reservados y la copia firmada completa tienen acceso separado.</div>':'')+(state.conflict?'<div class="callout error" role="alert">Otra persona guardó una versión nueva. Tu formulario conserva tus cambios. Descarga una copia antes de recargar si necesitas compararlos.<div class="actions spaced"><button data-action="draft-copy">Guardar copia de mis cambios</button><button data-action="reload-record">Recargar versión guardada</button></div></div>':'')+`<div class="record-form-intro"><div><p class="eyebrow">Ficha del estudiante · revisión ${r.version}</p><h2>Información de matrícula</h2><p class="muted">${state.editing?'Los ejemplos en gris muestran el formato de algunos campos.':'Consulta los datos registrados para este año.'}</p></div><span class="record-form-privacy">${can('sensitive')?'Acceso autorizado':'Vista limitada'}</span></div>`+Object.entries(state.meta.sections).map(([section,title])=>{const group=fields.filter(f=>f.section===section);if(!group.length)return '';return `<details class="section" ${['identificacion','contactos','apoderados'].includes(section)?'open':''}><summary>${esc(title)} <small>${group.length} campos${group.every(f=>f.sensitive)?' · reservado':''}</small></summary><div class="section-content">${section==='autorizaciones'?'<p class="hint">Registra por separado decisión, fecha, apoderado/tutor y versión del texto. La autorización anual de salidas requiere respaldo y no sustituye las autorizaciones de cada actividad.</p>':section==='social'?'<p class="hint">No solicitar antecedentes socioeconómicos durante matrícula SAE. Esta sección solo corresponde a apoyo social separado, con finalidad y acceso institucionalmente autorizados.</p>':['salud','judicial','reservados'].includes(section)?'<p class="hint">Información opcional de apoyo. Registra solo antecedentes pertinentes para una finalidad autorizada.</p>':''}<div class="fields">${group.map(f=>fieldInput(f,state.draft[f.key]||'')).join('')}</div></div></details>`;}).join('')+`<div class="save-bar"><span id="save-state" class="save-state" role="status">${state.dirty?'Cambios sin guardar':'Guardado · revisión '+r.version}</span>${state.editing?'<div class="actions"><button data-action="cancel-record-edit" type="button">Cancelar edición</button><button data-action="save" class="primary">Guardar cambios</button></div>':''}</div>`;
    if(state.editing)container.querySelectorAll('[data-field]:not([disabled]):not([readonly])').forEach(input=>input.addEventListener('input',()=>{
      if(!state.editing)return;
      state.draft[input.dataset.field]=input.value;
      state.dirty=Object.keys(recordChanges()).length>0;
      $('#save-state').textContent=state.conflict?'Hay una revisión más reciente':state.dirty?'Cambios sin guardar':'Sin cambios pendientes';
    }));
  }else if(state.tab==='documents'){
    container.innerHTML=`<section class="panel"><h2>Documentos del año ${r.year}</h2><p class="hint">Adjunta la copia firmada y los documentos recibidos. Los archivos se conservan como versiones separadas. Máximo ${Math.round((state.meta.maxAttachmentBytes||5*1024*1024)/1024/1024)} MB por archivo.</p>${can('documents')&&can('write')&&r.status!=='withdrawn'?`<form id="upload"><div class="fields"><label>Tipo<select name="kind"><option value="identity">Documento identificatorio</option>${can('sensitive')?'<option value="signed">Copia de ficha firmada</option><option value="support">Antecedente reservado</option>':''}</select></label><label>Archivo<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required></label></div><button class="primary spaced">Guardar documento</button><div id="upload-error" class="error-text" role="alert"></div></form>`:''}<div id="record-attachments"></div></section>`;
    window.EnrollmentRecordViews.paintDocuments($('#record-attachments'),'record-documents',r.attachments,a=>`<div class="file-row"><div><strong>${esc(a.name)}</strong><small class="muted">${a.kind==='signed'?'Ficha firmada':a.kind==='support'?'Antecedente reservado':'Identificación'} · ${Math.ceil(a.size/1024)} KB · ${date(a.at)}</small></div><button data-action="download-document" data-id="${a.id}" data-name="${esc(a.name)}">Descargar</button></div>`,{label:'documentos',empty:'Sin documentos visibles con tus permisos.'});
    if($('#upload'))$('#upload').onsubmit=async e=>{e.preventDefault();if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;const fd=new FormData(e.target),file=fd.get('file'),button=e.submitter,container=$('#content');if(file.size>(state.meta.maxAttachmentBytes||5*1024*1024)){$('#upload-error').textContent='El archivo supera el máximo permitido.';return;}setBusy(button,true,'Subiendo documento…');try{const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));await api(`/api/records/${r.id}/attachments`,{method:'POST',body:{version:state.record.version,kind:fd.get('kind'),name:file.name,content:btoa(text),sensitive:fd.get('kind')!=='identity'}});const record=await api('/api/records/'+r.id);if(container===$('#content')){state.record=record;renderRecord();}notice('Documento guardado.');}catch(error){if(container===$('#content')&&$('#upload-error'))$('#upload-error').textContent=error.message;else notice(error.message);}finally{setBusy(button,false);}};
  }else{
    container.innerHTML='<section class="panel"><h2>Movimientos y revisiones</h2><div id="record-events"></div><h3 class="spaced">Versiones guardadas</h3><div id="record-revisions"></div></section>';
    window.EnrollmentRecordViews.paintEvents($('#record-events'),'record-events',r.events,e=>`<li><strong>${esc({created:'Ficha creada',enroll:'Matrícula confirmada',transfer:'Cambio de curso',withdraw:'Retiro registrado',renewed:'Preparación de otro año',imported:'Importación controlada','document.add':'Documento agregado','template.upgrade':'Plantilla actualizada',reenter:'Reingreso registrado','import.updated':'Contacto actualizado por importación'}[e.action]||e.action)}</strong><span>${esc(e.actor)} · ${date(e.at)}</span>${e.detail.reason?`<p>${esc(e.detail.reason)}</p>`:''}${e.detail.sourceYear?`<p>Desde la ficha del año ${e.detail.sourceYear}. Autorizaciones pendientes de renovar.</p>`:''}${e.action==='transfer'?`<p>${esc(courseName(e.detail.fromCourse))} → ${esc(courseName(e.detail.toCourse))}</p>`:''}</li>`,{label:'movimientos',before:'<ul class="timeline">',after:'</ul>',empty:'Sin movimientos visibles.'});
    window.EnrollmentRecordViews.paintRevisions($('#record-revisions'),'record-revisions',r.revisions,v=>`<div class="stat-line"><span>Revisión ${v.version} · ${date(v.at)}</span><button class="text-button" data-action="revision" data-version="${v.version}">Consultar</button></div>`,{label:'revisiones',empty:'Sin revisiones anteriores.'});
  }
  window.EnrollmentRecordViews?.enhanceRecordView(container,state.tab);
}
function closeRecordEditor(){
  state.editing=false;state.dirty=false;state.conflict=false;state.draft=recordDraft(state.record);
  renderRecord();$('[data-action="edit-record"]')?.focus({preventScroll:true});
}
async function saveRecord({close=false}={}){
  if(state.saving||state.conflict)return false;
  if(!state.dirty){if(close&&state.editing)closeRecordEditor();return true;}
  if(!recordCanEdit()||!state.editing)return false;
  const sent=recordChanges(),invalid=[...($('#record-tab')?.querySelectorAll('[data-field]:invalid')||[])].find(field=>Object.hasOwn(sent,field.dataset.field));
  if(invalid){invalid.closest('details').open=true;invalid.reportValidity();return false;}
  state.saving=true;
  const saveButton=$('[data-action="save"]'),cancel=$('[data-action="cancel-record-edit"]'),status=$('#save-state');
  setBusy(saveButton,true,'Guardando…');if(cancel)cancel.disabled=true;
  if(status){status.textContent='Guardando…';status.setAttribute('aria-busy','true');}
  const atSave={...state.draft},recordId=state.record.id,owner=state.user.id;
  try{
    const result=await api('/api/records/'+recordId,{method:'PATCH',body:{version:state.record.version,data:sent}});
    if(state.user?.id!==owner||state.record?.id!==recordId)return false;
    const ongoing=Object.entries(state.draft).filter(([key,value])=>value!==atSave[key]);
    state.record={...state.record,...result};
    state.draft={...recordDraft(state.record),...Object.fromEntries(ongoing)};
    state.dirty=Object.keys(recordChanges()).length>0;
    if(close&&!state.dirty){closeRecordEditor();notice('Cambios guardados.');}
    else {if(status)status.textContent=state.dirty?'Cambios sin guardar':'Guardado · revisión '+result.version;if($('#record-pending'))$('#record-pending').innerHTML=recordPendingHtml(state.record);}
    return !state.dirty;
  }catch(error){
    if(error.code==='VERSION_CONFLICT'){state.conflict=true;state.tab='ficha';renderRecord();}
    if($('#save-state'))$('#save-state').textContent=error.message;
    notice(error.message);return false;
  }finally{state.saving=false;setBusy(saveButton,false);if(cancel)cancel.disabled=false;status?.removeAttribute('aria-busy');}
}
function newRecord(){const cs=courses(state.year);if(!cs.length){notice('Crea un curso para este año en Cursos y años.');return;}
  dialog('Nueva matrícula',`<p class="muted">Crea un borrador. Luego podrás completar la ficha en secciones. Los ejemplos desaparecen al escribir.</p><div class="fields"><label>Nombres<input name="names" autocomplete="given-name" placeholder="Ej. Camila Fernanda" required></label><label>Apellido paterno<input name="surname" autocomplete="family-name" placeholder="Ej. González" required></label><label>Apellido materno<input name="secondSurname" autocomplete="additional-name" placeholder="Ej. Pérez"></label><label>Curso<select name="courseId">${options(cs,state.course)}</select></label><label>Identificación<select name="identifierType">${['RUN','IPE','Pasaporte','Otro','Provisional'].map(v=>`<option>${v}</option>`).join('')}</select></label><label>Identificador<input name="identifier" autocomplete="off" placeholder="Ej. 12345678-5 o IPE12345"></label></div><p class="hint spaced">Provisional permite registrar un borrador cuando falta identificar. Revísalo antes del uso oficial; no reemplaza un RUN o IPE.</p>`,async fd=>{const input=Object.fromEntries(fd),courseId=input.courseId;delete input.courseId;const r=await api('/api/records',{method:'POST',body:{year:state.year,courseId,data:input}});await openRecord(r.id,{edit:true});notice('Borrador creado.');});
}
async function movement(action){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;const r=state.record;
  if(action==='enroll'){const result=await api(`/api/records/${r.id}/actions`,{method:'POST',body:{version:r.version,action}});state.record={...r,...result};await openRecord(r.id);notice('Matrícula confirmada.');return;}
  dialog(action==='transfer'?'Cambiar curso':'Registrar retiro',`<p class="muted">El movimiento conservará el historial de este año.</p>${action==='transfer'?`<label>Nuevo curso<select name="courseId">${options(courses(r.year).filter(c=>c.id!==r.courseId),'')}</select></label>`:''}<label class="spaced">Fecha<input name="date" type="date" value="${new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago'}).format(new Date())}" required></label><label class="spaced">Motivo<textarea name="reason" minlength="3" maxlength="1000" required></textarea></label><p class="hint spaced">Usa un motivo administrativo. Los antecedentes médicos o judiciales pertenecen a sus secciones reservadas.</p>`,async fd=>{await api(`/api/records/${r.id}/actions`,{method:'POST',body:{...Object.fromEntries(fd),action,version:r.version}});await openRecord(r.id);notice('Movimiento registrado.');});
}
function openReentry(){
  const r=state.record,choices=state.meta.courses.filter(c=>c.year>=r.year);if(!choices.length){notice('Prepara un curso de destino para registrar el reingreso.');return;}
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago'}).format(new Date());
  dialog('Registrar reingreso',`<p>En el mismo año se reabre esta ficha. Si eliges otro año se crea un borrador vinculado al mismo estudiante. El retiro anterior se conserva.</p><label>Curso y año<select name="courseId">${options(choices,r.courseId,c=>`${c.year} · ${c.name}`)}</select></label><label class="spaced">Fecha de reingreso<input type="date" name="date" value="${today}" required></label><label class="spaced">Motivo<textarea name="reason" minlength="3" maxlength="1000" required></textarea></label>`,async fd=>{const result=await api(`/api/records/${r.id}/actions`,{method:'POST',body:{...Object.fromEntries(fd),action:'reenter',version:r.version}});await openRecord(result.id);notice(result.year===r.year?'Reingreso registrado.':'Borrador de reingreso creado.');});
  const form=$('#dialog-form');form.elements.courseId.onchange=()=>{const course=choices.find(c=>c.id===form.elements.courseId.value);if(course)form.elements.date.value=Number(today.slice(0,4))===course.year?today:course.year+'-01-01';};form.elements.courseId.onchange();
}
function renew(){const r=state.record,cs=state.meta.courses.filter(c=>c.year>r.year);if(!cs.length){notice('Primero prepara los cursos del próximo año en Cursos y años.');return;}dialog('Preparar matrícula de otro año',`<p>Se crea un borrador independiente con los datos de contacto. La matrícula ${r.year} se conserva. Las autorizaciones y documentos deberán revisarse nuevamente.</p><label>Curso y año<select name="courseId">${options(cs,'',c=>`${c.year} · ${c.name}`)}</select></label>`,async fd=>{const result=await api(`/api/records/${r.id}/renew`,{method:'POST',body:{version:r.version,courseId:fd.get('courseId')}});await openRecord(result.id);notice('Borrador del nuevo año creado.');});}
function importReady(){const p=state.importPreview;if(!state.importTicket||!p?.ticket||!state.importRows?.length)return false;if(state.importKind==='json')return p.canImport;const annual=new Set(selectedImportAnnual()),needsCourses=p.rows.some((row,index)=>(row.review?.kind==='new'||annual.has(index))&&!row.courseId);return (p.summary.new>0||selectedImportUpdates().length>0||annual.size>0)&&!(p.errors||[]).some(x=>x.code!=='CURSO_NO_RESUELTO')&&(!needsCourses||$('#create-import-courses')?.checked===true);}
function refreshImportCommit(){const button=$('[data-action="commit-import"]'),preview=state.importPreview;if(!button||button.getAttribute('aria-busy')==='true')return;button.disabled=!importReady();if(state.importKind==='school'&&preview?.summary)button.textContent=`Guardar en ${preview.year}: ${preview.summary.new+selectedImportAnnual().length} nuevas y ${selectedImportUpdates().length} cambios`;}
function invalidateImport(){state.importRevision++;state.importTicket=null;const button=$('[data-action="commit-import"]');if(button)button.disabled=true;if($('#import-stale'))$('#import-stale').textContent='Cambió la configuración. Vuelve a previsualizar para revisar el resultado.';}
function renderImport(){
  state.importRows=null;state.importTicket=null;state.importPreview=null;state.importKind=null;state.importOptions={columnMapping:Object.create(null),sheetMappings:Object.create(null),contactOwner:'unassigned',addressOwner:'unassigned'};state.importRevision++;
  $('#content').innerHTML=heading('Importación de estudiantes','Revisa el archivo, ajusta sus columnas y confirma los cursos antes de guardar.')+`<section class="panel">${state.meta.testEnvironment?'<div class="callout">Entorno de pruebas: usa estudiantes ficticios.</div>':''}<p class="help">Acepta Excel <strong>.xlsx</strong> del ERP (hoja Usuarios), padrones administrativos y libros con <strong>una hoja por curso</strong>. Puedes ajustar columnas y asignar cursos desde la previsualización. Hasta 500 estudiantes por carga y 2 MB por archivo. Las columnas de acceso se descartan.</p><form id="import-form"><div class="fields narrow"><label>Año de matrícula<input name="year" type="number" min="${schoolYearRange().min}" max="${schoolYearRange().max}" value="${state.year}" required></label><label>Planilla de estudiantes<input name="file" type="file" accept=".xlsx,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json" required></label></div><p class="hint spaced">El año indicado en la planilla se detecta antes de guardar. Si no lo indica, se usará el año del formulario. Los libros que mezclan años se revisan por separado. Si tienes un archivo .xls, guárdalo como .xlsx. Excel permite revisar cambios de contacto en fichas existentes. JSON solo agrega fichas nuevas. La planilla no cambia identificaciones ni cursos, ni crea cuentas.</p><div id="import-config"></div><button class="primary">Previsualizar carga</button><p id="import-stale" class="hint spaced" role="status"></p><div id="import-error" class="error-text" role="alert"></div></form><div id="import-preview" aria-live="polite"></div></section>`;
  const form=$('#import-form');form.elements.year.oninput=invalidateImport;form.elements.file.onchange=()=>{invalidateImport();state.importOptions={columnMapping:Object.create(null),sheetMappings:Object.create(null),contactOwner:'unassigned',addressOwner:'unassigned'};$('#import-config').innerHTML='';$('#import-preview').innerHTML='';state.importPreview=null;};
  form.onsubmit=async e=>{e.preventDefault();const button=e.submitter,container=$('#import-preview'),errorLabel=$('#import-error'),requestRevision=state.importRevision;if(button?.disabled)return;setBusy(button,true,'Revisando planilla…');errorLabel.textContent='';$('#import-stale').textContent='';showLoading(container,'Revisando estudiantes y cursos…','import');state.importRows=null;state.importTicket=null;try{const fd=new FormData(e.target),file=fd.get('file');if(file.size>2*1024*1024)throw new Error('Use un archivo de hasta 2 MB.');const school=/\.xlsx$/i.test(file.name);if(!school&&!/\.json$/i.test(file.name))throw new Error('Elija una planilla .xlsx o un padrón .json.');let body;if(school){const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));body={content:btoa(text),name:file.name,year:Number(fd.get('year')),...state.importOptions};}else{body={rows:JSON.parse(await file.text())};}const preview=await api(school?'/api/import/school/preview':'/api/import/preview',{method:'POST',body});if(container!==$('#import-preview'))return;if(requestRevision!==state.importRevision){container.removeAttribute('aria-busy');container.innerHTML='';return;}container.removeAttribute('aria-busy');state.importKind=school?'school':'json';state.importRows=school?preview.rows:body.rows;state.importTicket=preview.ticket;state.importPreview=preview;renderImportConfiguration();renderImportPreview();}catch(error){if(container===$('#import-preview')){container.removeAttribute('aria-busy');container.innerHTML='';errorLabel.textContent=error.message;}}finally{setBusy(button,false);}};
}
function renderImportConfiguration(){
  const p=state.importPreview,container=$('#import-config');if(state.importKind!=='school'||!p.sheetSummaries?.length){container.innerHTML='';return;}
  const config=state.importOptions,headers=[...new Set(p.sheetSummaries.flatMap(sheet=>sheet.headers||[]))],labels={usuarios:'Padrón ERP',por_curso:'Matrícula por curso',administrativo:'Padrón administrativo',identificadores:'Identificadores',no_reconocido:'Requiere ajustar columnas'};
  container.innerHTML=`<details class="section import-configuration" open><summary>Hojas y cursos · ${p.sheetSummaries.length} hojas revisadas</summary><div class="section-content"><p class="hint">Revisa qué hojas incluir y el curso de destino. Puedes elegir un curso existente o conservar el nombre propuesto para crearlo al confirmar. La sección nunca se completa automáticamente.</p><div class="import-sheet-list">${p.sheetSummaries.map((sheet,index)=>{const mapping=config.sheetMappings[sheet.name]||{},included=mapping.include??sheet.included;return `<div class="import-sheet"><label class="import-include"><input type="checkbox" data-sheet-include="${index}" ${included?'checked':''}>${esc(sheet.name)}<small>${esc(labels[sheet.format]||sheet.format)} · ${sheet.studentRows||0} estudiantes · ${sheet.ignoredRows||0} filas omitidas</small></label><label>Curso de destino · ${esc(sheet.name)}<select data-sheet-course="${index}"><option value="">Usar nombre de la hoja o columna Curso</option>${(p.courses||[]).map(course=>`<option value="${esc(course.id)}" ${mapping.courseId===course.id?'selected':''}>${esc(course.name)} · ${course.year}</option>`).join('')}</select></label><label>Nombre propuesto · ${esc(sheet.name)}<input data-sheet-name="${index}" maxlength="80" value="${esc(mapping.courseName??sheet.courseName??'')}" placeholder="Curso si no existe en el listado"></label><label>Fila de encabezados · ${esc(sheet.name)}<input type="number" min="1" max="100" required data-sheet-header="${index}" value="${mapping.headerRow??(sheet.headerRow||1)}"></label></div>`;}).join('')}</div></div></details><details class="section"><summary>Columnas y titularidad de los contactos</summary><div class="section-content"><p class="hint">La detección usa encabezados, no posiciones. Ajusta una columna si tiene otro nombre. Para hojas con formatos diferentes, revísalas en cargas separadas.</p><div class="fields"><label>El contacto del padrón corresponde a<select data-import-owner="contactOwner">${[['unassigned','Conservar solo como contacto de origen'],['guardian','Apoderado'],['student','Estudiante']].map(([value,label])=>`<option value="${value}" ${config.contactOwner===value?'selected':''}>${label}</option>`).join('')}</select></label><label>El domicilio del padrón corresponde a<select data-import-owner="addressOwner">${[['unassigned','Conservar solo como domicilio de origen'],['guardian','Apoderado'],['student','Estudiante']].map(([value,label])=>`<option value="${value}" ${config.addressOwner===value?'selected':''}>${label}</option>`).join('')}</select></label>${(p.mappingTargets||[]).map(target=>`<label>${esc(target.label)}<select data-import-column="${esc(target.key)}"><option value="__auto__" ${!Object.hasOwn(config.columnMapping,target.key)?'selected':''}>Detectar automáticamente</option><option value="__skip__" ${config.columnMapping[target.key]===''?'selected':''}>No importar esta columna</option>${headers.map(header=>`<option value="${esc(header)}" ${config.columnMapping[target.key]===header?'selected':''}>${esc(header)}</option>`).join('')}</select></label>`).join('')}</div></div></details>`;
  container.onchange=e=>{const input=e.target;if(input.dataset.importColumn){const value=input.value,key=input.dataset.importColumn;if(value==='__auto__')delete config.columnMapping[key];else config.columnMapping[key]=value==='__skip__'?'':value;}else if(input.dataset.importOwner){config[input.dataset.importOwner]=input.value;}else{const index=input.dataset.sheetInclude??input.dataset.sheetCourse??input.dataset.sheetName??input.dataset.sheetHeader;if(index===undefined)return;const sheet=p.sheetSummaries[Number(index)],entry=config.sheetMappings[sheet.name]||={};if(input.dataset.sheetInclude!==undefined)entry.include=input.checked;else if(input.dataset.sheetCourse!==undefined){if(input.value)entry.courseId=input.value;else delete entry.courseId;}else if(input.dataset.sheetHeader!==undefined)entry.headerRow=Number(input.value);else entry.courseName=input.value.trim();}invalidateImport();};
  container.oninput=e=>{if(e.target.dataset.sheetName!==undefined||e.target.dataset.sheetHeader!==undefined)container.onchange(e);};
}
const auditActivityLabels={'login.success':'Inicio de sesión','login.failed':'Intento de acceso rechazado','records.list':'Consulta de expedientes','record.read':'Consulta de ficha','record.create':'Ficha creada','record.edit':'Ficha actualizada','record.revision':'Consulta de revisión','revision.read':'Consulta de revisión','report.summary':'Informe de estadísticas descargado','record.template.upgrade':'Plantilla de ficha actualizada','enrollment.enroll':'Matrícula confirmada','enrollment.transfer':'Cambio de curso','enrollment.withdraw':'Retiro registrado','enrollment.renew':'Nuevo año preparado','enrollment.reenter':'Reingreso registrado','user.configure':'Cuenta y permisos configurados','user.password.change':'Contraseña cambiada','course.create':'Curso creado','template.publish':'Plantilla publicada','template.create':'Plantilla creada','template.import.prepare':'Campos de importación preparados','import.commit':'Estudiantes importados','import.school.commit':'Padrón importado','audit.read':'Consulta de auditoría','pdf.download':'Documento PDF descargado','docx.download':'Documento Word descargado','course.export':'Nómina descargada','backup.create':'Respaldo creado','document.add':'Documento adjuntado','document.download':'Documento descargado'};
function auditSummary(item){
  const detail=item.detail||{};
  if(Array.isArray(detail.changes)){const fields=state.meta.templates.flatMap(template=>template.fields);return 'Campos actualizados: '+detail.changes.map(change=>{const field=fields.find(field=>field.key===change.field);return field?fieldLabel(field):change.field;}).join(', ');}
  const facts=[detail.year?'Año escolar '+detail.year:'',Number.isInteger(detail.count)?detail.count+' registros':'',detail.version?'Revisión '+detail.version:'',detail.page?'Página '+detail.page:''].filter(Boolean);
  return facts.join(' · ')||'Actividad registrada. Los detalles técnicos están disponibles para revisión.';
}
function renderBackup(){ $('#content').innerHTML=heading('Respaldo','Descarga una copia cifrada de la base, el historial y los adjuntos.')+`<section class="panel narrow"><h2>Crear respaldo cifrado</h2><p>Guarda la copia en una ubicación institucional autorizada. Conserva su clave por separado: sin ella no se puede restaurar.</p><form id="backup-form">${passwordField('backup-password','Clave del respaldo <small>(mínimo 16 caracteres)</small>','minlength="16" maxlength="200" autocomplete="new-password" required')}<button class="primary spaced">Descargar respaldo</button><div id="backup-error" class="error-text" role="alert"></div></form><div class="callout spaced">La restauración se realiza localmente en una carpeta nueva. El procedimiento está documentado y debe comprobarse antes del uso escolar.</div></section>`;$('#backup-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;setBusy(b,true,'Preparando respaldo…');try{await download('/api/backup',{method:'POST',body:{password:new FormData(e.target).get('password')}},`matricula-completa-${new Date().toISOString().slice(0,10)}.dsmbak`);e.target.reset();notice('Respaldo descargado.');}catch(error){if($('#backup-error'))$('#backup-error').textContent=error.message;else notice(error.message);}finally{setBusy(b,false);}};}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action;
  if(a==='toggle-password'){const input=document.getElementById(b.getAttribute('aria-controls')),visible=input.type==='password',start=input.selectionStart,end=input.selectionEnd;input.type=visible?'text':'password';if(start!==null)input.setSelectionRange(start,end);b.setAttribute('aria-pressed',String(visible));b.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');b.title=visible?'Ocultar contraseña':'Mostrar contraseña';b.innerHTML=eyeIcon(visible);return;}
  const busyLabels={logout:'Cerrando sesión…',pdf:'Preparando PDF…','download-document':'Descargando…','export-course':'Preparando archivo…','commit-import':'Guardando estudiantes…','prepare-import-fields':'Preparando campos…',enroll:'Confirmando matrícula…',revision:'Cargando revisión…'};
  if(busyLabels[a])setBusy(b,true,busyLabels[a]);try{
  if(a==='retry-startup'){await startApplication();return;}
  if(a==='help'){showEnrollmentHelp(b);return;}
  if(a==='theme'){document.body.classList.toggle('dark');localStorage.setItem('matricula-theme',document.body.classList.contains('dark')?'dark':'light');b.setAttribute('aria-pressed',String(document.body.classList.contains('dark')));const label=b.querySelector('[data-theme-label]');if(label)label.textContent=document.body.classList.contains('dark')?'Tema oscuro':'Tema claro';return;}
  if(a==='close-dialog'){$('#dialog').close();return;}
  const accountMenu=b.closest('.home-account-menu');if(accountMenu){accountMenu.open=false;accountMenu.querySelector('summary').focus({preventScroll:true});}
  if(a==='sidebar-toggle'){toggleSidebar();}else if(a==='sidebar-compact'){compactSidebar();}else if(a==='home'){if(state.view==='home')$('#home-title')?.focus({preventScroll:true});else await navigateTo('home',{reset:true});} else if(a==='nav'){const changed=await navigateTo(b.dataset.view,{reset:b.dataset.resetFilters==='true',status:b.dataset.status});if(changed&&b.dataset.focusSearch==='true')$('#search')?.focus({preventScroll:true});}
  else if(a==='logout'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;await api('/api/logout',{method:'POST'});clearSessionViewData();state.user=null;state.record=null;state.draft={};state.users=[];state.accountCourses=[];state.meta=null;state.view='home';state.pageSize=25;state.auditSnapshot=null;state.year=null;state.course='';state.status='';state.q='';state.page=1;enrollmentTemplateDraft=null;login(state.demo);}
  else if(a==='prepare-import-fields'){await api('/api/templates/prepare-import',{method:'POST',body:{}});state.meta=await api('/api/meta');invalidateImport();if(state.view==='templates'){renderTemplateEditor();notice('Plantilla preparada con los campos actuales.');}else notice('Campos preparados. Vuelve a previsualizar el archivo.');}
  else if(a==='upgrade-template'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;const id=state.record.id,version=state.record.version,templateId=state.meta.templates[0].id;dialog('Actualizar plantilla de esta ficha',`<p>Se usará la plantilla v${templateId}, con los campos nuevos. Se conservan los datos y las revisiones anteriores.</p>`,async()=>{await api(`/api/records/${id}/template`,{method:'POST',body:{version,templateId}});await openRecord(id);notice('Plantilla actualizada. El historial anterior se conserva.');});}
  else if(a==='new'){if(state.view!=='records'&&!(await navigateTo('records',{reset:true})))return;newRecord();}else if(a==='open')await openRecord(b.dataset.id,{tab:b.dataset.tab||'ficha'});
  else if(a==='back'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;state.record=null;state.editing=false;state.draft={};state.view='records';shell();await renderView();}
  else if(a==='edit-record'&&recordCanEdit()&&state.tab==='ficha'){state.editing=true;renderRecord();$('.record-edit-banner')?.focus({preventScroll:true});}
  else if(a==='cancel-record-edit'&&state.editing&&!state.saving){if(!state.dirty||await recordDecision('Descartar edición','Se perderán los cambios sin guardar. La última revisión se conserva.'))closeRecordEditor();}
  else if(a==='save')await saveRecord({close:true});else if(a==='tab'){if(state.tab===b.dataset.tab)return;if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;state.editing=false;state.tab=b.dataset.tab;renderRecord();}
  else if(a==='enroll'||a==='transfer'||a==='withdraw')await movement(a);else if(a==='renew'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;renew();}
  else if(a==='pdf'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;await download(`/api/records/${state.record.id}/pdf`,{},`ficha-${state.record.year}.pdf`);}
  else if(a==='download-document')await download('/api/attachments/'+b.dataset.id,{},b.dataset.name);
  else if(a==='previous'||a==='next'){state.page+=a==='next'?1:-1;state.view==='audit'?await renderAudit():await loadList();}
  else if(a==='retry')await renderView();
  else if(a==='new-course')dialog('Agregar curso',`<div class="fields"><label>Año<input name="year" type="number" value="${state.year}" min="${schoolYearRange().min}" max="${schoolYearRange().max}" required></label><label>Nombre del curso<input name="name" placeholder="Ej. 1° Medio A" maxlength="80" required></label></div>`,async fd=>{const container=$('#content');await api('/api/courses',{method:'POST',body:Object.fromEntries(fd)});state.meta=await api('/api/meta');if(container===$('#content')){applySchoolYear(Number(fd.get('year')));shell();renderCourses();notice('Curso creado en el año '+state.year+'.');}});
  else if(a==='new-user')openAccountEditor();else if(a==='edit-user')openAccountEditor(b.dataset.id);
  else if(a==='change-password'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;openPasswordChange();}
  else if(a==='record-downloads'){if(state.dirty&&(!(await leaveRecordChanges())||!(await saveRecord())))return;openRecordDownloads();}
  else if(a==='export-roster')openRosterDownloads();
  else if(a==='reenter')openReentry();
  else if(a==='export-course')await download('/api/export?'+new URLSearchParams(recordsFilterQuery()),{},`curso-${state.year}.csv`);
  else if(a==='commit-import'){
    if(!importReady())throw new Error('Revisa la planilla y selecciona qué cambios aplicar antes de importar.');
    const container=$('#content'),school=state.importKind==='school';
    let result;
    try{result=await api(school?'/api/import/school/commit':'/api/import/commit',{method:'POST',body:{rows:state.importRows,ticket:state.importTicket,...(school?{year:state.importPreview.year,coursesToCreate:state.importPreview.coursesToCreate,createCourses:$('#create-import-courses')?.checked===true,updateIndexes:selectedImportUpdates(),annualIndexes:selectedImportAnnual()}:{})}});}
    catch(error){if(school&&error.status===409&&container===$('#content')){invalidateImport();$('#import-stale').textContent='La revisión ya no está vigente. Vuelve a previsualizar el archivo.';queueMicrotask(refreshImportCommit);}throw error;}
    const meta=await api('/api/meta');state.meta=meta;
    if(container===$('#content')){if(school)applySchoolYear(result.year);shell();renderImport();rememberLocation();}
    notice((school?`Año ${result.year}: `:'')+(school&&(result.updated||result.skipped)?`${result.created} fichas nuevas, ${result.updated} actualizadas, ${result.skipped} omitidas.`:`${result.count} fichas importadas como borradores.`));
  }
  else if(a==='revision'){const revision=await api(`/api/records/${state.record.id}/revisions?version=${b.dataset.version}`),fields=state.meta.templates.find(t=>t.id===revision.templateId).fields;dialog('Revisión '+revision.version,`<p class="muted">${date(revision.at)} · ${revision.year} · ${esc(courseName(revision.courseId))}</p><div class="table-wrap"><table><tbody>${fields.filter(f=>revision.data[f.key]).map(f=>`<tr><th>${esc(f.label)}</th><td>${esc(revision.data[f.key])}</td></tr>`).join('')}</tbody></table></div>`,async()=>{});}
  else if(a==='draft-copy'){const blob=new Blob([JSON.stringify({year:state.record.year,recordId:state.record.id,baseVersion:state.record.version,data:recordChanges()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='cambios-pendientes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Guarda esta copia solo en una ubicación autorizada.');}
  else if(a==='reload-record'){dialog('Recargar ficha guardada','<p>Se reemplazará el formulario por la última revisión del servidor. Conserva una copia si necesitas comparar tus cambios.</p>',async()=>{state.dirty=false;state.conflict=false;await openRecord(state.record.id);});}
}catch(error){notice(error.message);}finally{if(busyLabels[a])setBusy(b,false);}});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('offline',()=>notice('Sin conexión. Conserva esta pestaña abierta si tienes cambios pendientes.'));
document.addEventListener('reset',e=>{e.target.querySelectorAll('.password-toggle').forEach(button=>{document.getElementById(button.getAttribute('aria-controls')).type='password';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Mostrar contraseña');button.title='Mostrar contraseña';button.innerHTML=eyeIcon();});});
try{document.body.classList.toggle('dark',localStorage.getItem('matricula-theme')==='dark');}catch{}
EnrollmentLoading.onRouteChange(restoreHistoryNavigation);
startApplication();
function homeIcon(name){
  const shapes={menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',sidebar:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-11-3 3 3 3"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',records:'<path d="M3 7h7l2-3h9v16H3Z"/><path d="M7 11h10M7 15h7"/>',pending:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h4"/>',reports:'<path d="M4 3v17h17M8 15v-4M13 15V7M18 15v-7"/>',courses:'<path d="m2 8 10-5 10 5-10 5L2 8Zm4 2v7c4 3 8 3 12 0v-7M22 8v7"/>',import:'<path d="M13 3h7v18H4V12M8 3v10m-4-4 4 4 4-4M8 17h8"/>',templates:'<path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h5"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15c2 1 3 2 3 5"/>',audit:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',backup:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.arrow}</svg>`;
}
function homeActivities(){return areaDefinitions().filter(area=>viewAllowed(area.view)).map(area=>({...area,description:area.short}));}
function homeIndexMarkup(){
  const groups=homeActivities();
  if(!groups.length)return '<div class="home-no-modules"><h2>Tu cuenta necesita accesos</h2><p>Contacta con Administración para preparar tus áreas de trabajo.</p></div>';
  return `<nav class="home-index-menu home-activities" aria-label="Áreas de trabajo">${groups.map((group,index)=>`<section class="home-index-row" data-home-group="${group.id}"><img class="home-panel-image" src="/home-${group.id}.jpg" alt="" aria-hidden="true" width="1200" height="1600" decoding="async" fetchpriority="${index===0?'high':'auto'}"><span class="home-index-number" aria-hidden="true">0${index+1}</span><div class="home-index-copy"><h2>${group.label}</h2><p>${group.description}</p></div><span class="home-index-hint" aria-hidden="true">Entrar a ${group.label} ${homeIcon('arrow')}</span><button type="button" class="home-area-open" data-action="nav" data-view="${group.view}" data-reset-filters="true" aria-label="Abrir ${group.label}"></button></section>`).join('')}</nav>`;
}
function showHomeMenu({focus=false}={}){
  const stage=$('#home-index-stage');if(!stage)return;
  stage.innerHTML=homeIndexMarkup();stage.scrollTop=0;
  if(focus)$('#home-title')?.focus({preventScroll:true});
}
function renderHome(){
  const container=$('#content');viewRequest++;
  container.removeAttribute('aria-busy');
  container.innerHTML='<div class="home-hub"><h1 id="home-title" class="sr-only" tabindex="-1">Inicio de matrícula</h1><section id="home-index-stage" class="home-index-stage" aria-label="Áreas de trabajo"></section></div>';
  showHomeMenu();
}
document.addEventListener('pointerdown',event=>{
  const account=document.querySelector('.home-account-menu[open]');
  if(account&&!account.contains(event.target))account.open=false;
});
