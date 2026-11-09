import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const paginationSource=readFileSync(new URL('../public/pagination.js',import.meta.url),'utf8');
const recordsSource=readFileSync(new URL('../public/records-view.js',import.meta.url),'utf8');
const areasSource=readFileSync(new URL('../public/areas.js',import.meta.url),'utf8');
const importPreviewSource=readFileSync(new URL('../public/import-preview.js',import.meta.url),'utf8');
const accountsSource=readFileSync(new URL('../public/accounts.js',import.meta.url),'utf8');
const accountLoginSource=accountsSource.slice(accountsSource.indexOf('function accountLoginAfterChange('),accountsSource.indexOf('function ownPasswordFields('));
const sourceBetween=(start,end)=>{
  const from=app.indexOf(start),to=app.indexOf(end,from);
  assert.ok(from>=0&&to>from,'No se encontró el segmento real: '+start);
  return app.slice(from,to);
};
const cacheSource=sourceBetween('let listRequest=','async function openRecord(');
const apiSource=sourceBetween('async function api(','async function download(');
const permissionsSource=sourceBetween('const viewPermissions=','function rememberLocation(');
const schoolYearsSource=sourceBetween('function schoolYearRange(){','async function init(');
const homeSource=app.slice(app.indexOf('function homeIcon('));
const shellSource=sourceBetween('function shell(){','function heading(');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const record=index=>({id:'registro-ficticio-'+index,name:'Persona ficticia '+index,courseId:'curso-ficticio',status:'draft'});
const element=()=>{
  const attributes=new Map(),classes=new Set();
  return {innerHTML:'',textContent:'',value:'',dataset:{},offsetWidth:1,focusCalls:0,focus(){this.focusCalls++;},
    setAttribute:(key,value)=>attributes.set(key,String(value)),removeAttribute:key=>attributes.delete(key),getAttribute:key=>attributes.get(key)??null,
    classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key),toggle:(key,on)=>on?classes.add(key):classes.delete(key)},contains:()=>false,querySelector:()=>null,querySelectorAll:()=>[]};
};

function fixture({api=async()=>({items:[],total:0,page:1,pageSize:25}),permissions=['read','write'],realApi=false,fetch}={}){
  const state={user:{id:'persona-ficticia',name:'Cuenta de prueba',permissions},meta:{courses:[],testEnvironment:false},csrf:'csrf-sintetico',view:'home',year:2026,course:'',status:'',q:'',page:1,pageSize:25,record:null,dirty:false};
  const selectors=['#app','#content','#list-table','#year-select','#home-index-stage','#home-title','.home-shell','.home-account-menu','.shell','.sidebar','.workspace','#main-sidebar','#area-search','#area-query','#search'];
  const elements=new Map(selectors.map(selector=>[selector,element()])),timers=new Map();let nextTimer=0;
  const storage=new Map(),body=element();
  const content=elements.get('#content'),list=elements.get('#list-table'),yearSelect=elements.get('#year-select');
  const counters={shell:0,render:0,save:0,loading:0,errors:0};
  const context=createContext({window:{matchMedia:query=>({matches:query.includes('prefers-reduced-motion')}),addEventListener(){}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},state,URLSearchParams,can:permission=>state.user?.permissions.includes(permission),
    $:selector=>elements.get(selector)||null,
    api,fetch,shell:()=>counters.shell++,renderView:async()=>counters.render++,saveRecord:async()=>{counters.save++;return true;},
    showLoading:()=>counters.loading++,loadingError:()=>counters.errors++,
    esc:value=>String(value??''),uiIcon:()=>'',helpControl:()=>'',courseName:()=> 'Curso ficticio',statusLabel:value=>value,date:()=>'',
    document:{body,getElementById:id=>elements.get('#'+id)||null,querySelector:selector=>elements.get(selector)||null,querySelectorAll:()=>[],addEventListener(){}},viewRequest:0,recordRequest:0,
    setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)});
  runInContext(paginationSource+'\nglobalThis.EnrollmentPagination=window.EnrollmentPagination;',context);
  runInContext(importPreviewSource,context);
  runInContext(permissionsSource+schoolYearsSource+areasSource+recordsSource+(realApi?apiSource:'')+cacheSource+homeSource+'\nglobalThis.ui={viewAllowed,navigateTo,recordsSelection,recordsCacheKey,invalidateRecordsCache,clearSessionViewData,collectionPages,prefetchRecords,loadList,recordsCache,homeActivities,homeIndexMarkup,showHomeMenu,renderHome,renderAreaHub,applySidebarMode,toggleSidebar,compactSidebar,api,importPreviewWorkspace,getImportPreview:()=>importPreviewPages,getGeneration:()=>cacheGeneration,getRequests:()=>({list:listRequest,navigation:navigationRequest})};',context);
  return {state,context,ui:context.ui,counters,content,list,yearSelect,elements,timers,storage,body};
}

function wireRecordsPager(fixture){
  const root=fixture.elements.get('#list-table');let navigation,signature;
  root.querySelectorAll=selector=>{
    if(selector!=='[data-pagination]')return [];
    const attributes=[...root.innerHTML.matchAll(/data-(pagination|page|page-size|pages)="([^"]+)"/g)].slice(0,4);
    if(!attributes.length)return [];
    const next=JSON.stringify(attributes.map(([,key,value])=>[key,value]));
    if(next!==signature){
      signature=next;navigation=element();
      navigation.dataset=Object.fromEntries(attributes.map(([,key,value])=>[key==='page-size'?'pageSize':key,value]));
    }
    return [navigation];
  };
  return ()=>root.querySelectorAll('[data-pagination]')[0];
}
const changePage=(navigation,page)=>navigation.onclick({target:{closest:()=>({disabled:false,dataset:{page:String(page)}})}});

test('atajos del año abren borradores y matriculados con filtros propios',async()=>{
  for(const status of ['draft','enrolled']){
    const {state,ui,counters}=fixture();
    Object.assign(state,{course:'curso-anterior',status:'withdrawn',q:'busqueda anterior',page:8});
    await ui.navigateTo('records',{reset:true,status});
    assert.equal(state.view,'records');assert.equal(state.status,status);
    assert.equal(state.course,'');assert.equal(state.q,'');assert.equal(state.page,1);
    assert.equal(counters.shell,1);assert.equal(counters.render,1);
  }
  const {state,ui}=fixture();
  await ui.navigateTo('records',{reset:true,q:'Estudiante Ficticio'});
  assert.equal(state.q,'Estudiante Ficticio');assert.equal(state.status,'');
});

test('repetir la vista actual no reconstruye el shell ni descarta la caché',async()=>{
  const {state,ui,counters}=fixture();
  ui.recordsCache.set('sintetico',{items:[]});
  await ui.navigateTo('home',{reset:true});
  Object.assign(state,{view:'records',page:4});
  await ui.navigateTo('records');
  assert.equal(counters.shell,0);assert.equal(counters.render,0);assert.equal(state.page,4);
  assert.equal(ui.recordsCache.size,1);assert.equal(ui.getGeneration(),0);
});

test('navegación respeta permisos y no abandona cambios cuyo guardado falla',async()=>{
  const {state,ui,context,counters}=fixture({permissions:['admin']});
  await ui.navigateTo('records',{reset:true,status:'draft'});
  assert.equal(state.view,'home');assert.equal(counters.shell,0);
  state.view='users';await ui.navigateTo('home');
  assert.equal(state.view,'home');assert.equal(counters.shell,1);
  state.dirty=true;context.saveRecord=async()=>false;
  await ui.navigateTo('users');
  assert.equal(state.view,'home');assert.equal(counters.shell,1);
});

test('la última navegación prevalece cuando un guardado anterior termina más tarde',async()=>{
  const f=fixture({permissions:['read','admin']}),saves=[deferred(),deferred()];let calls=0;
  f.state.dirty=true;f.context.saveRecord=()=>saves[calls++].promise;
  const first=f.ui.navigateTo('records'),last=f.ui.navigateTo('users');
  saves[1].resolve(true);await last;
  assert.equal(f.state.view,'users');assert.equal(f.counters.shell,1);
  saves[0].resolve(true);await first;
  assert.equal(f.state.view,'users');assert.equal(f.counters.shell,1);assert.equal(f.counters.render,1);
});

test('una transición nueva cancela la anterior y el reinicio de sesión impide navegar al terminar',async()=>{
  for(const cancelWithSession of [false,true]){
    const f=fixture({permissions:['read','admin']}),exit=deferred();let cancelled=0,animations=0;
    f.context.window.matchMedia=()=>({matches:false});
    f.elements.get('.home-shell').animate=()=>{
      animations++;return {finished:animations===1?exit.promise:Promise.resolve(),cancel(){cancelled++;exit.resolve();}};
    };
    const previous=f.ui.navigateTo('records');
    assert.equal(f.elements.get('#app').classList.contains('is-navigating'),true);
    if(cancelWithSession){f.ui.clearSessionViewData();f.state.user=null;}
    else await f.ui.navigateTo('users');
    await previous;
    assert.ok(cancelled>=1);assert.equal(f.elements.get('#app').classList.contains('is-navigating'),false);
    assert.equal(f.state.view,cancelWithSession?'home':'users');assert.equal(f.counters.shell,cancelWithSession?0:1);
  }
});

test('mutación confirmada invalida la caché de expedientes; lectura y rechazo no la invalidan',async()=>{
  for(const [path,method] of [['/api/records','POST'],['/api/records/ficticio','PATCH'],['/api/records/ficticio/actions','POST'],['/api/import/commit','POST'],['/api/import/school/commit','POST']]){
    let ok=true;
    const {ui}=fixture({realApi:true,fetch:async()=>({get ok(){return ok;},status:409,json:async()=>ok?{ok:true}:{error:'Conflicto sintético'}})});
    ui.recordsCache.set('sintetico',{});
    await ui.api('/api/records?year=2026');
    assert.equal(ui.getGeneration(),0);assert.equal(ui.recordsCache.size,1);
    ok=false;await assert.rejects(ui.api(path,{method}),/Conflicto sintético/);
    assert.equal(ui.getGeneration(),0);assert.equal(ui.recordsCache.size,1);
    ok=true;await ui.api(path,{method});
    assert.equal(ui.getGeneration(),1,path);assert.equal(ui.recordsCache.size,0);
  }
});

test('reiniciar la sesión borra cachés, páginas y selección de importación del propietario anterior',()=>{
  const {ui,state}=fixture();
  ui.recordsCache.set('datos-anteriores',{items:[record(1)]});
  ui.collectionPages.set('cuentas-anteriores',{page:9,pageSize:50});
  Object.assign(state,{importRows:[{review:{kind:'update'}}],importTicket:'ticket-anterior',importKind:'school',importOptions:{contactOwner:'guardian'}});
  state.importPreview={ticket:state.importTicket,rows:state.importRows};
  const importWorkspace=ui.importPreviewWorkspace();importWorkspace.updates.add(0);importWorkspace.createCourses=true;importWorkspace.rows.page=3;
  const before=ui.getRequests();ui.clearSessionViewData();
  assert.equal(ui.recordsCache.size,0);assert.equal(ui.collectionPages.size,0);
  for(const field of ['importRows','importTicket','importPreview','importKind','importOptions'])assert.equal(state[field],null,field);
  assert.equal(ui.getImportPreview(),undefined);
  assert.equal(ui.getGeneration(),1);assert.equal(ui.getRequests().list,before.list+1);assert.equal(ui.getRequests().navigation,before.navigation+1);
});

test('respuestas previas al reinicio no repueblan expedientes aunque reingrese el mismo usuario',async()=>{
  const pending=deferred(),{ui,elements,state}=fixture({api:()=>pending.promise});
  const loading=ui.loadList();ui.prefetchRecords();
  const before=elements.get('#list-table').innerHTML;
  ui.clearSessionViewData();state.user={...state.user,permissions:['read']};
  pending.resolve({items:[record(88)],total:1,page:1,pageSize:25});await loading;await flush();
  assert.equal(ui.recordsCache.size,0);assert.equal(elements.get('#list-table').innerHTML,before);
  assert.doesNotMatch(elements.get('#list-table').innerHTML,/Persona ficticia 88/);
});

test('volver al acceso tras cambiar cuenta usa el reinicio real y elimina filtros anteriores antes del login',()=>{
  const {ui,context,state}=fixture(),logins=[],notices=[];
  state.meta.demo=true;Object.assign(state,{view:'records',q:'consulta anterior',course:'curso-anterior',page:7,pageSize:100,auditSnapshot:900,record:{id:'ficticio'},dirty:true});
  ui.recordsCache.set('anterior',{items:[record(1)]});ui.collectionPages.set('anterior',{page:7,pageSize:100});
  state.editing=true;context.enrollmentTemplateDraft={name:'borrador anterior'};
  context.login=demo=>{assert.equal(ui.recordsCache.size,0);logins.push(demo);};context.notice=message=>notices.push(message);
  runInContext(accountLoginSource+'\nglobalThis.backToLogin=accountLoginAfterChange;',context);
  context.backToLogin('Configuración guardada.');
  assert.deepEqual(logins,[true]);assert.deepEqual(notices,['Configuración guardada.']);assert.equal(context.enrollmentTemplateDraft,null);
  assert.equal(state.user,null);assert.equal(state.csrf,'');assert.equal(state.meta,null);assert.equal(state.view,'home');assert.equal(state.q,'');assert.equal(state.course,'');
  assert.equal(state.page,1);assert.equal(state.pageSize,25);assert.equal(state.auditSnapshot,null);assert.equal(state.record,null);assert.equal(state.editing,false);assert.equal(state.dirty,false);assert.equal(ui.collectionPages.size,0);
});

test('precarga usa la misma selección vacía en la consulta y en su clave',async()=>{
  const pending=deferred(),calls=[];
  const {state,ui}=fixture({api:path=>{calls.push(path);return pending.promise;}});
  Object.assign(state,{course:'curso-filtrado',status:'draft',q:'consulta previa',page:5});
  ui.prefetchRecords();
  const request=new URL(calls[0],'http://127.0.0.1'),query=request.searchParams;
  assert.equal(query.get('year'),'2026');assert.equal(query.get('course'),'');assert.equal(query.get('q'),'');assert.equal(query.get('status'),'');assert.equal(query.get('page'),'1');assert.equal(query.has('userId'),false);
  pending.resolve({items:[],total:0,page:1,pageSize:25});await flush();
  const key=ui.recordsCacheKey({userId:state.user.id,year:2026,course:'',status:'',q:'',page:1});
  assert.equal(ui.recordsCache.has(key),true);assert.equal(ui.recordsCache.has(ui.recordsCacheKey()),false);
});

test('precarga tardía no repuebla la caché después de invalidar o cambiar persona',async()=>{
  for(const reason of ['invalidate','person']){
    const pending=deferred(),{state,ui}=fixture({api:()=>pending.promise});
    ui.prefetchRecords();
    if(reason==='invalidate')ui.invalidateRecordsCache();else state.user={...state.user,id:'otra-persona-ficticia'};
    pending.resolve({items:[],total:0,page:1,pageSize:25});await flush();
    assert.equal(ui.recordsCache.size,0,reason);
  }
});

test('lista cacheada se pinta sin skeleton y descarta una respuesta anterior a la invalidación',async()=>{
  const pending=deferred(),{ui,list,counters}=fixture({api:()=>pending.promise});
  ui.recordsCache.set(ui.recordsCacheKey(),{items:[],total:0,page:1,pageSize:25});
  const loading=ui.loadList();
  assert.equal(counters.loading,0);assert.match(list.innerHTML,/No hay expedientes/);
  const painted=list.innerHTML;ui.invalidateRecordsCache();
  pending.resolve({items:[{id:'respuesta-antigua'}],total:1,page:1,pageSize:25});await loading;
  assert.equal(list.innerHTML,painted);assert.equal(ui.recordsCache.size,0);
});

test('Expedientes conserva páginas y tamaños distintos en su caché y vuelve a la primera al cambiar tamaño',async()=>{
  const students=Array.from({length:60},(_,index)=>record(index+1)),calls=[];
  const f=fixture({api:async path=>{
    const params=new URL(path,'http://127.0.0.1').searchParams,page=Number(params.get('page')),pageSize=Number(params.get('pageSize'));
    calls.push({page,pageSize});return {items:students.slice((page-1)*pageSize,page*pageSize),total:students.length,page,pageSize};
  }});
  const navigation=wireRecordsPager(f);await f.ui.loadList();
  assert.equal((f.list.innerHTML.match(/class="student-button\b/g)||[]).length,25);
  changePage(navigation(),2);await flush();
  assert.equal(f.state.page,2);assert.match(f.list.innerHTML,/Persona ficticia 26/);assert.doesNotMatch(f.list.innerHTML,/>Persona ficticia 1</);
  navigation().onchange({target:{matches:()=>true,value:'50'}});await flush();
  assert.equal(f.state.page,1);assert.equal(f.state.pageSize,50);
  assert.equal((f.list.innerHTML.match(/class="student-button\b/g)||[]).length,50);
  assert.deepEqual(calls,[{page:1,pageSize:25},{page:2,pageSize:25},{page:1,pageSize:50}]);assert.equal(f.ui.recordsCache.size,3);
});

test('inicio administrativo no consulta estadísticas ni muestra búsqueda sin permiso de lectura',async()=>{
  let calls=0;
  const {ui,content,elements}=fixture({permissions:['admin'],api:async()=>{calls++;throw Error('No debe consultar datos de alumnos.');}});
  await ui.renderHome();
  assert.equal(calls,0);assert.doesNotMatch(content.innerHTML,/class="home-search-panel"/);
  const panel=elements.get('#home-index-stage');
  assert.match(panel.innerHTML,/data-home-group="organization"/);assert.match(panel.innerHTML,/data-home-group="admin"/);
  assert.doesNotMatch(panel.innerHTML,/data-home-group="students"/);assert.doesNotMatch(content.innerHTML,/class="home-year-overview"/);
  assert.match(panel.innerHTML,/data-view="organization"/);assert.match(panel.innerHTML,/data-view="administration"/);
  assert.doesNotMatch(panel.innerHTML,/data-view="templates"|data-view="users"|data-view="backup"/);
});

test('actividades solo ofrecen categorías autorizadas y cuenta sin permisos conserva su mensaje',async()=>{
  const ids=ui=>Array.from(ui.homeActivities(),activity=>activity.id);
  assert.deepEqual(ids(fixture({permissions:['read']}).ui),['students','followup']);
  assert.deepEqual(ids(fixture({permissions:['enroll']}).ui),['organization']);
  assert.deepEqual(ids(fixture({permissions:['audit']}).ui),['admin']);
  const {ui,content,elements}=fixture({permissions:[]});
  assert.deepEqual(ids(ui),[]);await ui.renderHome();
  assert.match(elements.get('#home-index-stage').innerHTML,/home-no-modules/);assert.doesNotMatch(content.innerHTML,/data-home-activity=/);
});

test('Inicio es solo un menú: no consulta API ni muestra buscador, cifras o alumnos',async()=>{
  const calls=[],{ui,elements}=fixture({permissions:['read','write','enroll','import','admin','audit','backup'],api:async path=>{calls.push(path);return {total:40,byStatus:{draft:10,enrolled:30}};}});
  await ui.renderHome();
  const stage=elements.get('#home-index-stage');
  assert.equal((stage.innerHTML.match(/class="home-index-row"/g)||[]).length,4);
  assert.doesNotMatch(stage.innerHTML,/class="home-person"|id="home-results"|home-feature/);
  assert.equal(calls.length,0);
  assert.match(elements.get('#content').innerHTML,/<h1[^>]*class="sr-only"/);
  assert.doesNotMatch(elements.get('#content').innerHTML,/home-heading|home-portal-controls|home-query|home-search|home-year-overview/);
});

test('cada panel de Inicio abre su área autorizada con un único botón accesible',()=>{
  const scenarios=[
    {permissions:['read','write','enroll','import','admin','audit','backup'],views:['students','followup','organization','administration']},
    {permissions:['read'],views:['students','followup']},
    {permissions:['admin'],views:['organization','administration']},
    {permissions:['enroll'],views:['organization']},
    {permissions:['backup'],views:['administration']}
  ];
  for(const {permissions,views} of scenarios){
    const {ui}=fixture({permissions}),markup=ui.homeIndexMarkup();
    const rows=[...markup.matchAll(/<section\b[^>]*\bdata-home-group="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
    assert.equal(rows.length,views.length);const actual=[];
    for(const [,id,row] of rows){
      const buttons=[...row.matchAll(/<button\b([^>]*)>/g)];assert.equal(buttons.length,1,`El panel ${id} debe tener un destino único.`);
      const attributes=buttons[0][1],view=attributes.match(/data-view="([^"]+)"/)?.[1];actual.push(view);
      assert.match(attributes,/class="[^"]*\bhome-area-open\b/);assert.match(attributes,/data-action="nav"/);assert.match(attributes,/data-reset-filters="true"/);
      assert.match(attributes,/aria-label="Abrir [^"]+"/);assert.ok(ui.viewAllowed(view));
    }
    assert.deepEqual(actual,views);assert.doesNotMatch(markup,/data-home-toggle|home-index-actions|data-view="records"|data-action="new"/);
  }
});

test('las áreas muestran únicamente sus tareas autorizadas y no consultan datos para inventar cifras',()=>{
  const scenarios=[
    {permissions:['read'],view:'students',destinations:['records'],create:false},
    {permissions:['read','write'],view:'students',destinations:['records'],create:true},
    {permissions:['read'],view:'followup',destinations:['records','pending','reports']},
    {permissions:['enroll'],view:'organization',destinations:['courses']},
    {permissions:['import'],view:'organization',destinations:['import']},
    {permissions:['admin'],view:'organization',destinations:['templates']},
    {permissions:['admin'],view:'administration',destinations:['users']},
    {permissions:['audit'],view:'administration',destinations:['audit']},
    {permissions:['backup'],view:'administration',destinations:['backup']}
  ];
  for(const {permissions,view,destinations,create=false} of scenarios){
    let calls=0;const {ui,content}=fixture({permissions,api:async()=>{calls++;throw Error('Consulta no autorizada por esta prueba.');}});
    ui.renderAreaHub(view);assert.match(content.innerHTML,/class="area-workspace"/);
    const actual=[...new Set([...content.innerHTML.matchAll(/\bdata-view="([^"]+)"/g)].map(([,destination])=>destination))];
    assert.deepEqual(actual,destinations,`${view} con ${permissions}`);assert.equal(content.innerHTML.includes('data-action="new"'),create);
    assert.doesNotMatch(content.innerHTML,/<img\b|area-task-photo|area-stage/,'Las áreas no deben repetir los paneles fotográficos del Inicio.');
    assert.doesNotMatch(content.innerHTML,/area-guide-map|area-preview|PASO 0/,'Los accesos deben abrir herramientas sin un panel de instrucciones intermedio.');
    if(view==='followup')assert.match(content.innerHTML,/<button[^>]*data-view="records"[^>]*data-status="draft"/);
    assert.equal(calls,0);
  }
  const unauthorized=fixture({permissions:['backup']});unauthorized.content.innerHTML='Pantalla anterior';
  unauthorized.ui.renderAreaHub('students');assert.equal(unauthorized.content.innerHTML,'Pantalla anterior');
});

test('la búsqueda del área Estudiantes abre Expedientes con consulta limpia y foco en su buscador',async()=>{
  const {ui,state,elements}=fixture();
  Object.assign(state,{view:'students',course:'curso-anterior',status:'withdrawn',q:'consulta anterior',page:8});
  ui.renderAreaHub('students');elements.get('#area-query').value='  Persona sintética  ';
  await elements.get('#area-search').onsubmit({preventDefault(){}});
  assert.equal(state.view,'records');assert.equal(state.q,'Persona sintética');assert.equal(state.course,'');assert.equal(state.status,'');assert.equal(state.page,1);
  assert.equal(elements.get('#search').focusCalls,1);
});

test('los permisos alternativos de las áreas habilitan la navegación y rechazan destinos ajenos',async()=>{
  const scenarios=[
    {permissions:['enroll'],allowed:['organization'],denied:['students','followup','administration']},
    {permissions:['import'],allowed:['organization'],denied:['administration']},
    {permissions:['backup'],allowed:['administration'],denied:['organization','students']},
    {permissions:['audit'],allowed:['administration'],denied:['organization']},
    {permissions:['admin'],allowed:['organization','administration'],denied:['students']},
    {permissions:['read'],allowed:['students','followup'],denied:['organization','administration']}
  ];
  for(const {permissions,allowed,denied} of scenarios){
    for(const view of allowed){const f=fixture({permissions});assert.equal(f.ui.viewAllowed(view),true);await f.ui.navigateTo(view);assert.equal(f.state.view,view);assert.equal(f.counters.shell,1);}
    for(const view of denied){const f=fixture({permissions});assert.equal(f.ui.viewAllowed(view),false);await f.ui.navigateTo(view);assert.equal(f.state.view,'home');assert.equal(f.counters.shell,0);}
  }
});

test('compactar y ocultar el menú conserva filtros, página, caché y contenido del módulo',()=>{
  const f=fixture(),shell=f.elements.get('.shell'),sidebar=f.elements.get('#main-sidebar');
  Object.assign(f.state,{view:'records',course:'curso-ficticio',status:'draft',q:'Persona sintética',page:3,pageSize:50});
  f.list.innerHTML='Resultados ya cargados';f.ui.recordsCache.set('ficticio',{items:[record(1)]});
  const before=JSON.stringify(f.state);f.ui.applySidebarMode('expanded',{persist:true});f.ui.compactSidebar();
  assert.equal(shell.dataset.sidebar,'compact');assert.equal(f.storage.get('matricula-sidebar-mode'),'compact');
  f.ui.toggleSidebar();assert.equal(shell.dataset.sidebar,'hidden');assert.equal(sidebar.inert,true);
  f.ui.toggleSidebar();assert.equal(shell.dataset.sidebar,'compact');assert.equal(sidebar.inert,false);
  assert.equal(JSON.stringify(f.state),before);assert.equal(f.list.innerHTML,'Resultados ya cargados');assert.equal(f.ui.recordsCache.size,1);
  assert.equal(f.counters.shell,0);assert.equal(f.counters.render,0);
  f.context.window.matchMedia=query=>({matches:query.includes('max-width')});
  f.ui.applySidebarMode('expanded',{persist:true});assert.equal(f.storage.get('matricula-sidebar-mode'),'compact','Abrir el menú móvil no debe sobrescribir la preferencia de escritorio.');
  assert.equal(f.body.classList.contains('sidebar-drawer-open'),true);
});

test('Inicio y módulos omiten la franja de pruebas sin importar los metadatos del entorno',()=>{
  for(const synthetic of [false,true])for(const view of ['home','records']){
    const {state,context,content}=fixture();state.meta.testEnvironment=synthetic;state.view=view;
    const appElement={innerHTML:''};context.$=selector=>selector==='#app'?appElement:selector==='#year-select'?{}:content;
    runInContext(shellSource+'\nshell();',context);
    assert.doesNotMatch(appElement.innerHTML,/Entorno de pruebas|class="environment"/,`${view}, testEnvironment=${synthetic}`);
    if(view==='home'){assert.match(appElement.innerHTML,/class="home-shell"/);assert.doesNotMatch(appElement.innerHTML,/class="sidebar"/);}
    else{assert.match(appElement.innerHTML,/class="shell"/);assert.match(appElement.innerHTML,/class="sidebar"/);}
  }
});
