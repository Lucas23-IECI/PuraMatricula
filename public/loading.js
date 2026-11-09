/* The first frame shares the same route and skeleton vocabulary as the app.
 * A route contains navigation only: never form values, names or credentials. */
(function () {
  'use strict';
  const areaViews = new Set(['students','followup','organization','administration']);
  const views = new Set(['login','password','home',...areaViews,'records','pending','reports','courses','users','templates','import','audit','backup','empty']);
  const tabs = new Set(['ficha','documents','history']);
  const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const routeStorageKey='matricula-route-v2',legacyStorageKey='matricula-route-v1',routeVersion=2;
  let currentRoute=null,routeInitialized=false,currentEpoch='',currentIndex=0,replaceNextWrite=true,hintActive=false,committed=null,navigationSerial=0,pendingNavigation=null,compensatingPop=null;
  const routeListeners=new Set();
  const kinds = new Set([...views,'record','documents','history']);
  const labels = {
    login:'Abriendo acceso…',password:'Abriendo cambio de contraseña…',home:'Cargando inicio de matrícula…',records:'Cargando expedientes…',
    students:'Cargando el área de Estudiantes…',followup:'Cargando el área de Seguimiento…',organization:'Cargando el área de Organización…',administration:'Cargando el área de Administración…',
    pending:'Cargando antecedentes pendientes…',reports:'Cargando estadísticas de matrícula…',courses:'Cargando cursos y años…',
    users:'Cargando cuentas y permisos…',templates:'Cargando plantillas…',import:'Cargando importación…',
    audit:'Cargando auditoría…',backup:'Cargando respaldo…',empty:'Comprobando acceso…',
    record:'Cargando ficha del estudiante…',documents:'Cargando documentos del expediente…',history:'Cargando historial del expediente…'
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const line = (size='') => `<span class="skeleton-line ${size}"></span>`;
  const field = () => `<div class="skeleton-field">${line('short')}${line('input')}</div>`;
  const fields = count => `<div class="loading-fields">${Array.from({length:count},field).join('')}</div>`;
  const heading = () => `<div class="skeleton-heading loading-heading" aria-hidden="true">${line('short')}${line('title')}${line()}</div>`;
  const action = () => `<div class="loading-action">${line('input')}</div>`;
  const panel = (content,form=false) => `<div class="panel loading-panel${form?' skeleton-form':''}">${content}</div>`;
  const rows = (count=4) => `<div class="loading-list">${Array.from({length:count},()=>`<div class="loading-list-row"><div>${line()}${line('short')}</div>${action()}</div>`).join('')}</div>`;
  const filters = () => panel(fields(4) + action());
  const table = (type='records') => {
    const columns = type==='audit'?5:4;
    return `<div class="skeleton-table loading-table loading-table-${type}"><div class="skeleton-table-head">${Array.from({length:columns},()=>`<div class="loading-cell">${line('short')}</div>`).join('')}</div>${Array.from({length:type==='pending'?5:6},()=>`<div class="skeleton-table-row">${Array.from({length:columns},(_,index)=>`<div class="loading-cell">${line(index===0?'':'short')}${index===0?line('short'):''}</div>`).join('')}</div>`).join('')}<div class="skeleton-table-foot">${line('short')}${line('short')}</div></div>`;
  };
  const recordTabs = () => `<div class="loading-tabs">${line('short')}${line('short')}${line('short')}</div>`;

  function sanitize(input={}) {
    if(!input||typeof input!=='object'||Array.isArray(input))input={};
    const view = views.has(input.view)?input.view:'login';
    const access = view==='login'||view==='password';
    const rawYear = String(input.year ?? '');
    const year = !access&&/^\d{4}$/.test(rawYear)&&Number(rawYear)>=1950&&Number(rawYear)<=2100?Number(rawYear):null;
    const record = view==='records'&&typeof input.record==='string'&&recordId.test(input.record)?input.record.toLowerCase():null;
    const tab = record&&tabs.has(input.tab)?input.tab:'ficha';
    return {view,year,record,tab};
  }

  function parseLegacyRoute(hash) {
    try {
      const params = new URLSearchParams(String(hash).replace(/^#\??/,''));
      return sanitize({view:params.get('view'),year:params.get('year'),record:params.get('record'),tab:params.get('tab')});
    } catch { return sanitize(); }
  }

  const sameRoute=(left,right)=>left.view===right.view&&left.year===right.year&&left.record===right.record&&left.tab===right.tab;
  const newEpoch=()=>window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  const snapshot=()=>({version:routeVersion,epoch:currentEpoch,index:currentIndex,route:sanitize(currentRoute)});
  function stateFromEnvelope(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==routeVersion||typeof value.epoch!=='string'||!/^[a-zA-Z0-9-]{8,120}$/.test(value.epoch)||!Number.isSafeInteger(value.index)||value.index<0||!value.route||typeof value.route!=='object'||Array.isArray(value.route))return null;
    return {version:routeVersion,epoch:value.epoch,index:value.index,route:sanitize(value.route)};
  }
  function legacyRouteFromEnvelope(value){
    return value&&typeof value==='object'&&!Array.isArray(value)&&value.version===1&&value.route&&typeof value.route==='object'&&!Array.isArray(value.route)?sanitize(value.route):null;
  }
  function historyHint(){try{return stateFromEnvelope(window.history.state?.enrollmentRoute);}catch{return null;}}
  function writeHistory(state,{push=false}={}){
    try{window.history[push?'pushState':'replaceState'](state?{enrollmentRoute:state}:null,'',window.location.pathname||'/');return true;}catch{return false;}
  }
  function saveHint(){
    if(!hintActive)return;
    const serialized=JSON.stringify(snapshot());
    try{if(window.sessionStorage.getItem(routeStorageKey)!==serialized)window.sessionStorage.setItem(routeStorageKey,serialized);window.sessionStorage.removeItem(legacyStorageKey);}catch{}
  }
  function loadHint(){
    try{
      const serialized=window.sessionStorage.getItem(routeStorageKey);
      if(serialized!==null){
        let state;try{state=stateFromEnvelope(JSON.parse(serialized));}catch{}
        if(state)return {available:true,state};
        try{window.sessionStorage.removeItem(routeStorageKey);window.sessionStorage.removeItem(legacyStorageKey);}catch{}
        return {available:true};
      }
      const legacy=window.sessionStorage.getItem(legacyStorageKey);
      if(legacy!==null){
        let route;try{route=legacyRouteFromEnvelope(JSON.parse(legacy));}catch{}
        try{window.sessionStorage.removeItem(legacyStorageKey);}catch{}
        return {available:true,route};
      }
      // An empty session means no restore, even if an older history entry still exists.
      return {available:true};
    }catch{return {available:false,state:historyHint()};}
  }
  function invalidateCompensation(){
    if(!compensatingPop)return;
    window.clearTimeout?.(compensatingPop.timer);const resolve=compensatingPop.resolve;compensatingPop=null;resolve(false);
  }
  function readRoute(hash){
    if(arguments.length)return parseLegacyRoute(hash);
    if(!routeInitialized){
      routeInitialized=true;const stored=loadHint(),history=historyHint();
      const restored=stored.state&&(history?.epoch===stored.state.epoch?history:stored.state);
      currentEpoch=restored?.epoch||newEpoch();currentIndex=restored?.index||0;
      currentRoute=window.location.hash?parseLegacyRoute(window.location.hash):restored?.route||stored.route||sanitize();
      hintActive=Boolean(window.location.hash||restored||stored.route);committed=snapshot();
      saveHint();writeHistory(hintActive?snapshot():null);
    }else if(window.location.hash||window.location.search)writeHistory(hintActive?snapshot():null);
    return {...currentRoute};
  }
  function writeRoute(input,options={}){
    readRoute();const route=sanitize(input);
    // A failed save can repaint the unchanged screen during a pending Back/Forward guard.
    if(pendingNavigation&&sameRoute(route,pendingNavigation.previous.route)&&!sameRoute(route,currentRoute)&&options.replace!==true)return {...route};
    const changed=!sameRoute(route,currentRoute),replace=options.replace??replaceNextWrite;
    if(changed||options.replace===true){
      navigationSerial++;pendingNavigation=null;invalidateCompensation();
      const previousIndex=currentIndex;currentRoute=route;
      if(changed&&!replace){currentIndex++;if(!writeHistory(snapshot(),{push:true})){currentIndex=previousIndex;writeHistory(snapshot());}}
      else writeHistory(snapshot());
    }else writeHistory(snapshot());
    replaceNextWrite=false;hintActive=true;committed=snapshot();saveHint();
    return {...currentRoute};
  }
  function clearRoute(){
    navigationSerial++;pendingNavigation=null;invalidateCompensation();
    currentRoute=sanitize();routeInitialized=true;currentEpoch=newEpoch();currentIndex=0;replaceNextWrite=true;hintActive=false;committed=snapshot();
    try{window.sessionStorage.removeItem(routeStorageKey);window.sessionStorage.removeItem(legacyStorageKey);}catch{}
    writeHistory(null);
  }
  function commitNavigation(id,route){
    if(!pendingNavigation||pendingNavigation.id!==id||navigationSerial!==id)return false;
    currentRoute=sanitize(route);pendingNavigation=null;replaceNextWrite=false;hintActive=true;committed=snapshot();saveHint();writeHistory(snapshot());return true;
  }
  function cancelNavigation(id){
    const pending=pendingNavigation;
    if(!pending||pending.id!==id||navigationSerial!==id)return Promise.resolve(false);
    navigationSerial++;pendingNavigation=null;invalidateCompensation();
    const previous=pending.previous,fromIndex=currentIndex,delta=previous.index-fromIndex;
    currentEpoch=previous.epoch;currentIndex=previous.index;currentRoute=sanitize(previous.route);committed=snapshot();hintActive=pending.hintActive;saveHint();
    if(!delta||typeof window.history?.go!=='function'){writeHistory(hintActive?snapshot():null);return Promise.resolve(true);}
    return new Promise(resolve=>{
      const compensation={epoch:currentEpoch,index:currentIndex,route:{...currentRoute},resolve,timer:null};compensatingPop=compensation;
      const fallback=()=>{if(compensatingPop!==compensation)return;compensatingPop=null;writeHistory(hintActive?snapshot():null);resolve(true);};
      compensation.timer=window.setTimeout?.(fallback,1200);
      try{window.history.go(delta);}catch{fallback();}
    });
  }
  function handlePopState(event){
    readRoute();const target=stateFromEnvelope(event.state?.enrollmentRoute);
    if(compensatingPop&&target?.epoch===compensatingPop.epoch&&target.index===compensatingPop.index&&sameRoute(target.route,compensatingPop.route)){
      window.clearTimeout?.(compensatingPop.timer);const resolve=compensatingPop.resolve;compensatingPop=null;
      writeHistory(hintActive?snapshot():null);saveHint();resolve(true);return;
    }
    if(compensatingPop)invalidateCompensation();
    if(!target||target.epoch!==currentEpoch){
      navigationSerial++;pendingNavigation=null;currentRoute=sanitize(committed.route);currentIndex=committed.index;
      writeHistory(hintActive?snapshot():null);saveHint();return;
    }
    const previous=committed,id=++navigationSerial,wasActive=hintActive;
    currentRoute=target.route;currentIndex=target.index;replaceNextWrite=false;hintActive=true;saveHint();writeHistory(snapshot());
    if(sameRoute(currentRoute,previous.route)){committed=snapshot();return;}
    pendingNavigation={id,previous,hintActive:wasActive};
    const navigation={route:{...currentRoute},previous:{...previous.route},isCurrent:()=>navigationSerial===id&&currentEpoch===target.epoch,commit:(route=target.route)=>commitNavigation(id,route),cancel:()=>cancelNavigation(id)};
    if(!routeListeners.size){navigation.commit();return;}
    const results=[...routeListeners].map(listener=>{try{return Promise.resolve(listener(navigation));}catch(error){return Promise.reject(error);}});
    Promise.allSettled(results).then(outcomes=>{
      if(!navigation.isCurrent()||pendingNavigation?.id!==id)return;
      if(outcomes.some(outcome=>outcome.status==='rejected'||outcome.value===false))navigation.cancel();else navigation.commit(currentRoute);
    });
  }
  function onRouteChange(listener){
    if(typeof listener!=='function')throw new TypeError('La navegación requiere una función.');
    routeListeners.add(listener);return ()=>routeListeners.delete(listener);
  }

  function skeleton(requestedKind='table',label) {
    const kind = requestedKind==='table'?'records':kinds.has(requestedKind)?requestedKind:'records';
    let body;
    switch(kind){
      case 'login': case 'password':
        body = `<div class="loading-access-fields skeleton-form">${heading()}${Array.from({length:kind==='password'?3:2},field).join('')}${line('input')}</div>`;
        break;
      case 'home':
        body = `<div class="home-hub loading-home"><h1 class="sr-only">Inicio de matrícula</h1><div class="home-index-stage loading-home-index-stage"><div class="home-index-menu home-activities loading-home-index-menu">${Array.from({length:4},()=>`<div class="home-index-row loading-home-index-row"><div class="loading-home-photo-slot"></div><span class="home-index-number loading-home-index-number">${line('short')}</span><div class="home-index-copy loading-home-index-copy">${line('title')}${line('short')}</div><div class="home-index-reveal loading-home-index-reveal">${line('short')}</div></div>`).join('')}</div></div></div>`;
        break;
      case 'students': case 'followup': case 'organization': case 'administration':
        body = `<section class="area-workspace loading-area" data-area="${kind==='administration'?'admin':kind}" data-task-count="${kind==='students'?2:3}"><header class="area-heading"><div class="area-heading-copy loading-area-copy">${line('title')}${line('short')}</div><span class="area-heading-mark loading-area-identity">${line('short')}</span></header>${kind==='students'?`<div class="area-search loading-area-search"><div>${line('input')}${line('input')}</div></div>`:''}<div class="area-actions loading-area-actions" id="area-actions">${Array.from({length:kind==='students'?2:3},()=>`<div class="area-task loading-area-task"><span class="area-task-icon loading-area-task-icon">${line('short')}</span><span class="area-task-copy">${line('title')}${line()}</span><span class="area-task-go loading-area-go">${line('short')}</span></div>`).join('')}</div></section>`;
        break;
      case 'records': case 'users': case 'audit': case 'pending':
        body = table(kind);
        break;
      case 'reports':
        body = `<div class="loading-statistics">${Array.from({length:4},()=>panel(line('short')+line('title')+line('short'))).join('')}</div>${panel(line('title')+table('reports'))}${panel(line('title')+rows(3))}`;
        break;
      case 'courses':
        body = `<div class="loading-columns">${panel(line('title')+rows(6))}${panel(line('title')+line()+fields(2)+action())}</div>`;
        break;
      case 'templates':
        body = `<div class="loading-columns">${panel(line('title')+rows(4))}${panel(line('title')+line()+field()+rows(2)+action())}</div>`;
        break;
      case 'import':
        body = panel(line('title')+line()+`<div class="loading-upload">${line('short')}${line('input')}</div>`+fields(2)+action());
        break;
      case 'backup':
        body = `<div class="loading-narrow">${panel(line('title')+line()+field()+action()+`<div class="loading-notice">${line()}${line('short')}</div>`)}</div>`;
        break;
      case 'record': case 'documents': case 'history': {
        let main;
        if(kind==='documents')main=panel(line('title')+line()+fields(2)+action()+rows(3));
        else if(kind==='history')main=panel(line('title')+`<div class="loading-timeline">${Array.from({length:4},()=>`<div>${line('short')}${line()}${line('short')}</div>`).join('')}</div>`+line('title')+rows(3));
        else main=panel(line('title')+fields(6),true)+panel(line('title')+fields(4),true);
        body = heading()+`<div class="record-layout loading-record"><div>${recordTabs()}${main}</div><aside class="record-aside">${panel(line('title')+rows(3))}${panel(line('title')+line('input')+line('input'))}</aside></div>`;
        break;
      }
      default:
        body = panel(line('title')+line()+line('short'));
    }
    return `<div class="skeleton-state" role="status" aria-label="${escape(label||labels[kind])}" data-skeleton="${kind}"><span class="sr-only">${escape(label||labels[kind])}</span><div class="loading-shape" aria-hidden="true">${body}</div></div>`;
  }

  function boot(input=readRoute()) {
    const app=document.getElementById('app');
    if(!app)return;
    const route=sanitize(input),kind=route.record?(route.tab==='ficha'?'record':route.tab):route.view;
    try { document.body.classList.toggle('dark',window.localStorage.getItem('matricula-theme')==='dark'); } catch {}
    const brand='<div class="brand"><img class="brand-crest" src="/escudo.jpg" width="54" height="54" alt=""><div><strong>Liceo Domingo Santa María</strong><span>Concepción · Matrícula</span></div></div>';
    if(route.view==='login'||route.view==='password'){
      app.innerHTML=`<main class="boot-loading boot-access login" aria-busy="true"><section class="login-story loading-story" aria-hidden="true">${line('short')}${line('title')}${line('title')}${line()}${line('short')}</section><section class="login-form-area"><div class="login-form">${brand}${skeleton(kind)}</div></section></main>`;
    }else if(route.view==='home'){
      const homeBrand='<div class="brand brand-home"><img class="brand-crest" src="/escudo.jpg" width="48" height="48" alt=""><span class="brand-copy"><strong>Liceo Domingo<br>Santa María</strong></span></div>';
      app.innerHTML=`<div class="home-shell boot-home" aria-busy="true"><header class="home-header loading-home-header" aria-hidden="true"><div class="home-header-brand">${homeBrand}</div><div class="home-utilities loading-home-overlay-tools"><div class="loading-home-overlay-control">${line('input')}</div><div class="loading-home-overlay-control">${line('input')}</div></div></header><main class="home-content content">${skeleton('home')}</main></div>`;
    }else{
      let sidebarMode='expanded';
      try { const saved=window.localStorage.getItem('matricula-sidebar-mode');if(['expanded','compact','hidden'].includes(saved))sidebarMode=saved; } catch {}
      try { if(window.matchMedia?.('(max-width: 780px)')?.matches)sidebarMode='hidden'; } catch {}
      const showFilters=['records','reports','pending'].includes(kind);
      const main=['record','documents','history'].includes(kind)||areaViews.has(kind)?skeleton(kind):heading()+(showFilters?`<div class="loading-filter-space" aria-hidden="true">${filters()}</div>`:'')+skeleton(kind);
      const workspaceBrand='<div class="brand brand-home"><img class="brand-crest" src="/escudo.jpg" width="36" height="36" alt=""><span class="brand-copy"><strong>Liceo Domingo<br>Santa María</strong><small>Inicio general</small></span></div>';
      const localLinks=['students','records','record','documents','history'].includes(kind)?2:4;
      app.innerHTML=`<div class="shell boot-shell" data-screen="${route.record?'record':route.view}" data-sidebar="${sidebarMode}" aria-busy="true"><aside class="sidebar loading-sidebar" aria-hidden="true" inert><div class="sidebar-heading">${workspaceBrand}<div class="loading-sidebar-control">${line('input')}</div></div><div class="loading-navigation"><div class="loading-nav-group">${line('short')}${Array.from({length:localLinks},()=>line()).join('')}</div><div class="loading-nav-group">${line('short')}${Array.from({length:3},()=>line()).join('')}</div></div><div class="sidebar-foot">${line('short')}${line()}</div></aside><div class="workspace"><header class="topbar loading-topbar" aria-hidden="true"><div class="loading-sidebar-trigger">${line('input')}</div><div class="topbar-context">${line('short')}${line()}</div><div class="topbar-controls"><div class="school-year loading-year">${line('short')}${line('input')}</div><div class="utility-actions"><div class="loading-button">${line('input')}</div><div class="loading-button">${line('input')}</div></div><div class="session-actions"><div class="loading-button">${line('input')}</div></div></div></header><main class="content${areaViews.has(kind)?' loading-area-content':''}">${main}</main></div></div>`;
    }
  }

  window.EnrollmentLoading=Object.freeze({readRoute,writeRoute,clearRoute,onRouteChange,storageKey:routeStorageKey,skeleton,boot});
  window.addEventListener?.('popstate',handlePopState);
  boot();
})();
