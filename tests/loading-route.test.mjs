import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../public/loading.js',import.meta.url),'utf8');
const uuid='12345678-1234-4567-8ABC-1234567890AB';
const areas=['students','followup','organization','administration'];
const modules=[...areas,'records','pending','reports','courses','users','templates','import','audit','backup'];
const routeKey='matricula-route-v2',oldRouteKey='matricula-route-v1';
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function checkEnvelope(value,route){
  assert.equal(value.version,2);assert.match(value.epoch,/^[a-zA-Z0-9-]{8,120}$/);assert.ok(Number.isSafeInteger(value.index)&&value.index>=0);
  assert.deepEqual(Object.keys(value).sort(),['epoch','index','route','version']);assert.deepEqual(plain(value.route),route);
}
function fixture({hash='',theme=null,sidebarMode=null,mobile=false,storageAvailable=true,sessionAvailable=storageAvailable,sessionData=new Map(),historyState=null,appExists=true,historyAvailable=true}={}){
  const location=new URL('http://127.0.0.1:4318/'+hash),calls=[],historyMethods=[],storageWrites=[],storageReads=[],sessionWrites=[],sessionReads=[],classes=new Set(),app={innerHTML:''},listeners=new Map(),timers=new Map();let timerId=0;
  const storage={getItem(key){storageReads.push(key);if(!storageAvailable)throw Error('Storage no disponible');return key==='matricula-theme'?theme:key==='matricula-sidebar-mode'?sidebarMode:null;},setItem(...args){storageWrites.push(args);},removeItem(key){storageWrites.push([key]);}};
  const sessionStorage={getItem(key){sessionReads.push(key);if(!sessionAvailable)throw Error('Sesión no disponible');return sessionData.get(key)??null;},setItem(key,value){if(!sessionAvailable)throw Error('Sesión no disponible');sessionWrites.push([key,String(value)]);sessionData.set(key,String(value));},removeItem(key){if(!sessionAvailable)throw Error('Sesión no disponible');sessionWrites.push([key]);sessionData.delete(key);}};
  const classList={toggle(name,on){if(on===undefined)on=!classes.has(name);if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)};
  const document={getElementById:id=>id==='app'&&appExists?app:null,body:{classList}};
  const entries=[{state:historyState,url:location.href}];let cursor=0;
  const history={get state(){return entries[cursor].state;},get length(){return entries.length;},get cursor(){return cursor;},
    replaceState(state,title,value){if(!historyAvailable)throw Error('Historial no disponible');const url=new URL(value,location.href).href;entries[cursor]={state:state===null?null:plain(state),url};calls.push(String(value));historyMethods.push('replace');location.href=url;},
    pushState(state,title,value){if(!historyAvailable)throw Error('Historial no disponible');const url=new URL(value,location.href).href;entries.splice(cursor+1);entries.push({state:plain(state),url});cursor++;calls.push(String(value));historyMethods.push('push');location.href=url;},
    go(delta){if(!historyAvailable)throw Error('Historial no disponible');const next=cursor+Number(delta);if(next<0||next>=entries.length)return;cursor=next;location.href=entries[cursor].url;for(const listener of listeners.get('popstate')||[])listener({state:entries[cursor].state});},
    back(){this.go(-1);},forward(){this.go(1);}};
  const window={location,history,localStorage:storage,sessionStorage,matchMedia:()=>({matches:mobile}),addEventListener(name,callback){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);},setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}};
  runInContext(source,createContext({window,document,URLSearchParams,URL}));
  return {api:window.EnrollmentLoading,location,app,calls,historyMethods,entries,storageWrites,storageReads,sessionWrites,sessionReads,sessionData,history,classes,timers};
}

test('rutas conserva solo navegación interna por pestaña y mantiene limpia la dirección visible',()=>{
  const {api,location,storageWrites,sessionData,history}=fixture();
  for(const view of ['home',...modules,'empty','login','password']){
    const expected={view,year:['login','password'].includes(view)?null:2026,record:null,tab:'ficha'};
    assert.deepEqual(plain(api.writeRoute({view,year:2026})),expected);
    assert.deepEqual(plain(api.readRoute()),expected);
    assert.equal(location.href,'http://127.0.0.1:4318/');
    checkEnvelope(JSON.parse(sessionData.get(routeKey)),expected);
    assert.deepEqual(plain(history.state),{enrollmentRoute:JSON.parse(sessionData.get(routeKey))});
  }
  assert.equal(storageWrites.length,0);
});

test('rutas acepta años enteros dentro del período y descarta años ambiguos o fuera del límite',()=>{
  const {api}=fixture();
  for(const year of [1950,2019,2020,2026,2100]){assert.equal(api.readRoute('#view=reports&year='+year).year,year);assert.equal(api.writeRoute({view:'records',year}).year,year);}
  for(const year of ['1949','2101','2026.5','02026','2026e0','2026foo','-2026','NaN','',null,Infinity]){
    assert.equal(api.readRoute('#view=reports&year='+encodeURIComponent(year??'')).year,null,String(year));
    assert.equal(api.writeRoute({view:'records',year}).year,null,String(year));
  }
});

test('expediente solo admite UUID en Expedientes y conserva únicamente pestañas válidas',()=>{
  const {api}=fixture();
  for(const tab of ['ficha','documents','history']){
    const route=api.readRoute('#view=records&year=2026&record='+uuid+'&tab='+tab);
    assert.deepEqual(plain(route),{view:'records',year:2026,record:uuid.toLowerCase(),tab});
    assert.deepEqual(plain(api.writeRoute({view:'records',year:2026,record:uuid,tab})),plain(route));
  }
  for(const view of [...modules.filter(view=>view!=='records'),'empty','login','password']){
    const route=api.readRoute('#view='+view+'&record='+uuid+'&tab=history');assert.equal(route.record,null,view);assert.equal(route.tab,'ficha',view);
  }
  for(const record of ['1234','../api/users','00000000-0000-0000-0000-00000000000Z','<img src=x onerror=alert(1)>',uuid+'/pdf']){
    const route=api.writeRoute({view:'records',record,tab:'history'});assert.equal(route.record,null);assert.equal(route.tab,'ficha');
  }
  assert.equal(api.readRoute('#view=records&record='+uuid+'&tab=unknown').tab,'ficha');
});

test('rutas desconocidas y datos libres no se convierten en HTML, enlaces ni contexto persistido',()=>{
  const {api,location,app,storageWrites,sessionData,history}=fixture(),payload='<img src=x onerror=alert(1)>';
  const route=api.readRoute('#view='+encodeURIComponent(payload)+'&year=2026&names=AlumnoPrivado&password=ClavePrivada');
  assert.equal(route.view,'login');assert.equal(route.year,null);
  api.writeRoute({view:'reports',year:2026,record:payload,tab:payload,names:'AlumnoPrivado',password:'ClavePrivada',q:'BusquedaPrivada',data:{address:'DireccionPrivada'}});
  assert.equal(location.hash,'');assert.equal(location.search,'');
  checkEnvelope(JSON.parse(sessionData.get(routeKey)),{view:'reports',year:2026,record:null,tab:'ficha'});
  for(const text of ['AlumnoPrivado','ClavePrivada','BusquedaPrivada','DireccionPrivada',payload])assert.ok(!location.href.includes(text));
  for(const text of ['AlumnoPrivado','ClavePrivada','BusquedaPrivada','DireccionPrivada',payload]){assert.ok(!sessionData.get(routeKey).includes(text));assert.ok(!JSON.stringify(history.state).includes(text));}
  api.boot(route);assert.ok(!app.innerHTML.includes('<img src=x'));assert.ok(!app.innerHTML.includes('AlumnoPrivado'));assert.equal(storageWrites.length,0);
});

test('limpiar ubicación elimina el contexto de sesión e historial para el siguiente ingreso',()=>{
  const {api,location,calls,storageWrites,sessionData,history}=fixture({hash:'#view=records&year=2026&record='+uuid+'&tab=documents'});
  api.clearRoute();assert.equal(location.hash,'');assert.equal(location.pathname,'/');assert.equal(calls.at(-1),'/');
  assert.deepEqual(plain(api.readRoute()),{view:'login',year:null,record:null,tab:'ficha'});assert.equal(storageWrites.length,0);
  assert.equal(sessionData.has(routeKey),false);assert.equal(history.state,null);
  const next=fixture({sessionData,historyState:history.state});
  assert.deepEqual(plain(next.api.readRoute()),{view:'login',year:null,record:null,tab:'ficha'});assert.match(next.app.innerHTML,/boot-access/);
});

test('recargar la misma pestaña restaura módulo, año y pestaña del expediente sin reconstruir el enlace',()=>{
  for(const route of [
    ...['home',...modules].map(view=>({view,year:1950,record:null,tab:'ficha'})),
    ...['ficha','documents','history'].map(tab=>({view:'records',year:2026,record:uuid.toLowerCase(),tab}))
  ]){
    const first=fixture();first.api.writeRoute(route);
    const reloaded=fixture({sessionData:first.sessionData,historyState:first.history.state});
    assert.deepEqual(plain(reloaded.api.readRoute()),route);
    assert.equal(reloaded.location.href,'http://127.0.0.1:4318/');
    const kind=route.record?(route.tab==='ficha'?'record':route.tab):route.view;
    assert.ok(reloaded.app.innerHTML.includes('data-skeleton="'+kind+'"'),kind);
    assert.ok(!reloaded.app.innerHTML.includes(uuid.toLowerCase()),'El primer frame no muestra la referencia del expediente.');
  }
});

test('la navegación es propia de cada pestaña y no escribe rutas en localStorage',()=>{
  const first=fixture(),other=fixture();first.api.writeRoute({view:'records',year:2026,record:uuid,tab:'history'});
  assert.deepEqual(plain(other.api.readRoute()),{view:'login',year:null,record:null,tab:'ficha'});
  assert.equal(other.sessionData.has(routeKey),false);assert.equal(first.storageWrites.length,0);assert.equal(other.storageWrites.length,0);
  other.api.writeRoute({view:'backup',year:2027});
  assert.equal(first.api.readRoute().view,'records');assert.equal(other.api.readRoute().view,'backup');
});

test('el hash antiguo se migra una vez y toda consulta o fragmento desaparece de la dirección',()=>{
  const migrated=fixture({hash:'?view=users&names=PersonaFicticia#view=records&year=2026&record='+uuid+'&tab=documents&password=ClaveFicticia'});
  const route={view:'records',year:2026,record:uuid.toLowerCase(),tab:'documents'};
  assert.deepEqual(plain(migrated.api.readRoute()),route);assert.equal(migrated.location.href,'http://127.0.0.1:4318/');
  checkEnvelope(JSON.parse(migrated.sessionData.get(routeKey)),route);
  migrated.location.hash='#view=users&year=2027';
  assert.deepEqual(plain(migrated.api.readRoute()),route,'Un fragmento posterior no sustituye la navegación interna.');
  assert.equal(migrated.location.hash,'');
  for(const text of ['PersonaFicticia','ClaveFicticia','names','password']){
    assert.ok(!migrated.sessionData.get(routeKey).includes(text));assert.ok(!JSON.stringify(migrated.history.state).includes(text));
  }
  const queryOnly=fixture({hash:'?view=reports&year=2026&q=PersonaFicticia'});
  assert.equal(queryOnly.location.search,'');assert.equal(queryOnly.api.readRoute().view,'login');
});

test('claves malformadas, versiones desconocidas y datos adicionales no se restauran como contenido',()=>{
  for(const value of ['{malformado','null','[]','42','"texto"','{}',JSON.stringify({version:3,route:{view:'records',year:2026,record:uuid}}),JSON.stringify({version:2,route:'records'})]){
    const sessionData=new Map([[routeKey,value]]),f=fixture({sessionData,historyState:{enrollmentRoute:{version:2,epoch:'old-epoch-123',index:1,route:{view:'records',record:uuid,tab:'history'}}}});
    assert.equal(f.api.readRoute().view,'login',value);assert.equal(sessionData.has(routeKey),false);assert.equal(f.history.state,null);
    assert.doesNotMatch(f.app.innerHTML,/<script>|malformado|data-skeleton="history"/);
  }
  const malicious={version:2,epoch:'epoch-test-123',index:0,names:'PersonaFicticia',password:'ClaveFicticia',route:{view:'reports',year:2026,record:'<img src=x onerror=alert(1)>',tab:'history',q:'ConsultaFicticia',data:{address:'DireccionFicticia'}}};
  const f=fixture({sessionData:new Map([[routeKey,JSON.stringify(malicious)]])});
  const expected={version:2,epoch:'epoch-test-123',index:0,route:{view:'reports',year:2026,record:null,tab:'ficha'}};
  assert.deepEqual(plain(JSON.parse(f.sessionData.get(routeKey))),expected);
  assert.deepEqual(plain(f.history.state),{enrollmentRoute:expected});
  for(const input of [null,[],42,'records'])assert.doesNotThrow(()=>f.api.writeRoute(input));
});

test('cerrar la sesión no revive una ruta antigua del historial cuando el almacenamiento ya está vacío',()=>{
  const f=fixture({hash:'#view=records&year=2026&record='+uuid+'&tab=history'}),stale=plain(f.history.state);
  f.api.clearRoute();
  const next=fixture({sessionData:f.sessionData,historyState:stale});
  assert.equal(next.api.readRoute().view,'login');assert.equal(next.history.state,null);assert.match(next.app.innerHTML,/data-skeleton="login"/);
  assert.equal(next.sessionData.has(routeKey),false);
});

test('historial y memoria permiten seguir navegando cuando sessionStorage está bloqueado',()=>{
  const first=fixture({sessionAvailable:false});first.api.writeRoute({view:'records',year:1950,record:uuid,tab:'history'});
  const restored=fixture({sessionAvailable:false,historyState:first.history.state});
  assert.deepEqual(plain(restored.api.readRoute()),{view:'records',year:1950,record:uuid.toLowerCase(),tab:'history'});
  assert.equal(restored.location.hash,'');assert.match(restored.app.innerHTML,/data-skeleton="history"/);
  restored.api.clearRoute();assert.equal(restored.history.state,null);assert.equal(restored.api.readRoute().view,'login');
  const unavailable=fixture({sessionAvailable:false,historyAvailable:false});
  assert.doesNotThrow(()=>unavailable.api.writeRoute({view:'reports',year:2026}));assert.equal(unavailable.api.readRoute().view,'reports');
  unavailable.api.clearRoute();assert.equal(unavailable.api.readRoute().view,'login');
  assert.equal(fixture({sessionAvailable:false,historyAvailable:false}).api.readRoute().view,'login','Sin ambas APIs, una recarga empieza sin contexto anterior.');
});

test('el primer ingreso reemplaza acceso y los cambios reales de ruta permiten Atrás y Adelante sin publicar el enlace',async()=>{
  const f=fixture(),events=[];f.api.clearRoute();f.api.writeRoute({view:'home',year:2026});
  assert.equal(f.history.length,1,'Ingresar no deja una pantalla de login fantasma detrás.');
  f.api.onRouteChange(navigation=>{events.push(navigation.route);checkEnvelope(JSON.parse(f.sessionData.get(routeKey)),plain(navigation.route));navigation.commit();f.api.writeRoute(navigation.route);});
  const routes=[
    {view:'students',year:2026,record:null,tab:'ficha'},
    {view:'records',year:2026,record:null,tab:'ficha'},
    {view:'reports',year:2026,record:null,tab:'ficha'},
    {view:'records',year:2026,record:uuid.toLowerCase(),tab:'documents'},
    {view:'records',year:2026,record:uuid.toLowerCase(),tab:'history'},
    {view:'reports',year:2019,record:null,tab:'ficha'}
  ];
  for(const route of routes)f.api.writeRoute(route);
  assert.equal(f.history.length,7);const length=f.history.length;
  for(let index=routes.length-2;index>=0;index--){f.history.back();await flush();assert.deepEqual(plain(f.api.readRoute()),routes[index]);assert.equal(f.location.href,'http://127.0.0.1:4318/');}
  f.history.back();await flush();assert.equal(f.api.readRoute().view,'home');
  for(const route of routes){f.history.forward();await flush();assert.deepEqual(plain(f.api.readRoute()),route);}
  assert.equal(f.history.length,length,'Restaurar la navegación no agrega entradas.');assert.equal(events.length,12);
});

test('filtros, página y repintados no agregan historial; un fallback de permisos reemplaza el destino',async()=>{
  const f=fixture();f.api.writeRoute({view:'home',year:2026});f.api.writeRoute({view:'students',year:2026});f.api.writeRoute({view:'records',year:2026});
  const length=f.history.length,pushes=f.historyMethods.filter(method=>method==='push').length;
  for(let page=1;page<=5;page++)f.api.writeRoute({view:'records',year:2026,page,pageSize:50,q:'Consulta ficticia',course:'curso-ficticio',data:{name:'Persona ficticia'}});
  assert.equal(f.history.length,length);assert.equal(f.historyMethods.filter(method=>method==='push').length,pushes);
  f.api.onRouteChange(navigation=>{navigation.commit({view:'home',year:2026});f.api.writeRoute({view:'home',year:2026});});
  f.history.back();await flush();assert.equal(f.api.readRoute().view,'home');assert.equal(f.history.length,length);
  assert.equal(f.history.cursor,1);assert.equal(f.history.state.enrollmentRoute.route.view,'home');
});

test('cancelar Atrás compensa la posición sin notificar otro pop ni perder Adelante',async()=>{
  const f=fixture();for(const view of ['home','records','reports'])f.api.writeRoute({view,year:2026});
  let notifications=0;f.api.onRouteChange(async navigation=>{notifications++;assert.equal(navigation.previous.view,'reports');assert.equal(navigation.route.view,'records');await navigation.cancel();});
  f.history.back();await flush();
  assert.equal(f.api.readRoute().view,'reports');assert.equal(f.history.cursor,2);assert.equal(f.history.length,3);assert.equal(notifications,1);assert.equal(f.timers.size,0);
  checkEnvelope(JSON.parse(f.sessionData.get(routeKey)),{view:'reports',year:2026,record:null,tab:'ficha'});
});

test('dos Atrás rápidos con guardado pendiente cancelan hacia la última pantalla aceptada y descartan el guard anterior',async()=>{
  const f=fixture();for(const view of ['home','students','records','reports'])f.api.writeRoute({view,year:2026});
  const gate=deferred(),changes=[];
  f.api.onRouteChange(navigation=>{changes.push(navigation);return changes.length===1?gate.promise:navigation.cancel();});
  f.history.back();f.history.back();await flush();
  assert.equal(changes.length,2);assert.equal(changes[1].previous.view,'reports');assert.equal(f.history.cursor,3);assert.equal(f.api.readRoute().view,'reports');
  assert.equal(changes[0].isCurrent(),false);assert.equal(await changes[0].cancel(),false);gate.resolve();await flush();assert.equal(f.api.readRoute().view,'reports');
});

test('una navegación nueva durante el guard de Atrás crea su entrada y vuelve obsoleto el intento anterior',async()=>{
  const f=fixture();for(const view of ['home','records','reports'])f.api.writeRoute({view,year:2026});
  const gate=deferred();let change;f.api.onRouteChange(navigation=>{change=navigation;return gate.promise;});
  f.history.back();const pushes=f.historyMethods.filter(method=>method==='push').length;
  f.api.writeRoute({view:'administration',year:2026});
  assert.equal(f.historyMethods.filter(method=>method==='push').length,pushes+1);assert.equal(f.api.readRoute().view,'administration');
  assert.equal(change.isCurrent(),false);assert.equal(await change.cancel(),false);gate.resolve();await flush();assert.equal(f.api.readRoute().view,'administration');
});

test('repintar la ficha anterior durante un guard fallido no crea una entrada fantasma',async()=>{
  const f=fixture();for(const view of ['home','records','reports'])f.api.writeRoute({view,year:2026});
  const gate=deferred();let change;f.api.onRouteChange(navigation=>{change=navigation;return gate.promise;});
  f.history.back();const length=f.history.length;
  f.api.writeRoute({view:'reports',year:2026});assert.equal(f.history.length,length);assert.equal(f.api.readRoute().view,'records');
  await change.cancel();gate.resolve();await flush();assert.equal(f.api.readRoute().view,'reports');assert.equal(f.history.cursor,2);assert.equal(f.history.length,length);
});

test('cerrar sesión cambia la época y Atrás nunca restaura rutas de la cuenta anterior',async()=>{
  const f=fixture();f.api.writeRoute({view:'home',year:2026});f.api.writeRoute({view:'records',year:2026,record:uuid,tab:'documents'});f.api.writeRoute({view:'reports',year:2027});
  const epoch=f.history.state.enrollmentRoute.epoch;let notifications=0;f.api.onRouteChange(()=>notifications++);
  f.api.clearRoute();f.history.back();await flush();
  assert.equal(f.api.readRoute().view,'login');assert.equal(f.sessionData.has(routeKey),false);assert.equal(f.history.state,null);assert.equal(notifications,0);
  f.api.writeRoute({view:'home',year:2026});assert.notEqual(f.history.state.enrollmentRoute.epoch,epoch);
  const length=f.history.length;f.history.back();await flush();assert.equal(f.api.readRoute().view,'home');assert.equal(f.api.readRoute().record,null);assert.equal(notifications,0);
  f.history.forward();await flush();assert.equal(f.api.readRoute().view,'home');assert.equal(f.history.length,length);assert.equal(f.location.href,'http://127.0.0.1:4318/');
});

test('errores del consumidor cancelan la navegación y quitar su listener permite volver después',async()=>{
  const f=fixture();for(const view of ['home','records','reports'])f.api.writeRoute({view,year:2026});
  const unsubscribe=f.api.onRouteChange(()=>{throw Error('Fallo sintético del consumidor.');});
  f.history.back();await flush();assert.equal(f.api.readRoute().view,'reports');assert.equal(f.history.cursor,2);
  unsubscribe();f.history.back();await flush();assert.equal(f.api.readRoute().view,'records');
  assert.throws(()=>f.api.onRouteChange(null),/función/);
});

test('el contexto v1 migra a época v2 sin nombres, consultas ni entradas adicionales',()=>{
  const route={view:'records',year:2026,record:uuid.toLowerCase(),tab:'history'};
  const f=fixture({sessionData:new Map([[oldRouteKey,JSON.stringify({version:1,route:{...route,names:'PersonaFicticia',q:'ConsultaFicticia'}})]])});
  assert.deepEqual(plain(f.api.readRoute()),route);assert.equal(f.sessionData.has(oldRouteKey),false);checkEnvelope(JSON.parse(f.sessionData.get(routeKey)),route);
  f.api.writeRoute(route);assert.equal(f.history.length,1);assert.equal(f.api.storageKey,routeKey);
});

test('primer frame utiliza el skeleton de las áreas, los nueve módulos y las tres pestañas de expediente',()=>{
  for(const view of modules){
    const {app}=fixture({hash:'#view='+view+'&year=2026'});
    assert.ok(app.innerHTML.includes('data-skeleton="'+view+'"'),view);assert.match(app.innerHTML,/boot-shell/);assert.match(app.innerHTML,/aria-busy="true"/);assert.ok(!app.innerHTML.includes('boot-access'),view);
  }
  for(const [tab,kind] of [['ficha','record'],['documents','documents'],['history','history']]){
    const {app}=fixture({hash:'#view=records&year=2026&record='+uuid+'&tab='+tab});
    assert.ok(app.innerHTML.includes('data-skeleton="'+kind+'"'),tab);assert.ok(!app.innerHTML.includes(uuid),'El skeleton no presenta la identificación del expediente.');assert.match(app.innerHTML,/boot-shell/);
  }
  for(const view of ['login','password']){const {app}=fixture({hash:'#view='+view});assert.ok(app.innerHTML.includes('data-skeleton="'+view+'"'));assert.match(app.innerHTML,/boot-access/);}
});

test('cada área recarga su hub con acciones proporcionadas, sin presentar alumnos ni métricas ficticias',()=>{
  for(const view of areas){
    const {app,api}=fixture({hash:'#view='+view+'&year=2026'}),html=api.skeleton(view);
    assert.match(app.innerHTML,/class="area-workspace loading-area"/);
    assert.match(app.innerHTML,/class="content loading-area-content"/);
    assert.match(html,/class="area-actions loading-area-actions"/);
    assert.ok(html.includes('data-task-count="'+(view==='students'?2:3)+'"'));
    assert.match(html,/id="area-actions"/);
    assert.equal((html.match(/class="area-task loading-area-task"/g)||[]).length,view==='students'?2:3,view);
    assert.equal((html.match(/class="area-search loading-area-search"/g)||[]).length,view==='students'?1:0,view);
    assert.equal((html.match(/class="area-heading"/g)||[]).length,1,view);
    assert.equal((html.match(/class="area-task-go loading-area-go"/g)||[]).length,view==='students'?2:3,view);
    assert.doesNotMatch(html,/area-stage|area-workbench|area-preview|area-guide-map|area-section-number|loading-area-photo|loading-area-task-photo|area-task-number/);
    assert.doesNotMatch(html,/loading-list-row/);
    assert.doesNotMatch(app.innerHTML,/home-index-menu|home-panel-image|loading-statistics|loading-table|skeleton-heading|data-skeleton="home"/);
    assert.doesNotMatch(html,/<img|expedientes|matriculados|\b2026\b/);
    assert.ok(!app.innerHTML.includes('data-skeleton="login"'),view);
  }
});

test('el primer frame restaura el panel guardado y marca el módulo antes de autenticar',()=>{
  for(const mode of ['expanded','compact','hidden'])for(const view of ['students','reports','records']){
    const {app,storageWrites}=fixture({hash:'#view='+view+'&year=2026',sidebarMode:mode});
    assert.ok(app.innerHTML.includes('data-sidebar="'+mode+'"'),view+'/'+mode);
    assert.ok(app.innerHTML.includes('data-screen="'+view+'"'),view+'/'+mode);
    assert.match(app.innerHTML,/loading-sidebar" aria-hidden="true" inert/);
    assert.equal(storageWrites.length,0);
  }
  for(const mode of ['expanded','compact','hidden','<img src=x>']){
    const {app,storageWrites}=fixture({hash:'#view=organization',sidebarMode:mode,mobile:true});
    assert.match(app.innerHTML,/data-sidebar="hidden"/);assert.equal(storageWrites.length,0);
  }
  for(const mode of [null,'unknown','Compact','<script>'])assert.match(fixture({hash:'#view=students',sidebarMode:mode}).app.innerHTML,/data-sidebar="expanded"/);
  const record=fixture({hash:'#view=records&record='+uuid+'&tab=history',sidebarMode:'compact'});
  assert.match(record.app.innerHTML,/data-screen="record" data-sidebar="compact"/);
  assert.match(fixture({hash:'#view=students',storageAvailable:false}).app.innerHTML,/data-sidebar="expanded"/);
  assert.match(fixture({hash:'#view=students',storageAvailable:false,mobile:true}).app.innerHTML,/data-sidebar="hidden"/);
  for(const view of ['login','password','home'])assert.ok(!fixture({hash:'#view='+view,sidebarMode:'hidden'}).app.innerHTML.includes('data-sidebar='));
});

test('inicio conserva cuatro paneles de acciones sin inventar alumnos ni fotografías al recargar',()=>{
  const {app,api}=fixture({hash:'#view=home&year=2026'});
  assert.match(app.innerHTML,/home-shell boot-home/);
  assert.match(app.innerHTML,/home-header loading-home-header/);
  assert.match(app.innerHTML,/data-skeleton="home"/);
  assert.match(app.innerHTML,/home-index-stage loading-home-index-stage/);
  assert.match(app.innerHTML,/home-index-menu home-activities loading-home-index-menu/);
  assert.ok(!app.innerHTML.includes('sidebar'));
  assert.ok(!app.innerHTML.includes('boot-shell'));
  assert.ok(!app.innerHTML.includes('Entorno de pruebas'));
  assert.ok(!app.innerHTML.includes('2026'));
  assert.match(app.innerHTML,/home-hub loading-home/);
  assert.match(app.innerHTML,/<h1 class="sr-only">Inicio de matrícula<\/h1>/);
  assert.match(app.innerHTML,/loading-home-overlay-tools/);
  assert.equal((api.skeleton('home').match(/class="home-index-row loading-home-index-row"/g)||[]).length,4);
  assert.equal((api.skeleton('home').match(/class="loading-home-photo-slot"/g)||[]).length,4);
  assert.doesNotMatch(app.innerHTML,/home-feature|loading-home-student-card|loading-home-pagination|home-results|loading-home-index-heading|home-heading|home-portal-controls|home-year-overview|topbar-controls|school-year/);
});

test('skeleton comparte tipos entre arranque y cargas y escapa texto no confiable',()=>{
  const {api}=fixture();
  for(const kind of ['home',...modules,'record','documents','history','login','password','empty']){
    const html=api.skeleton(kind,'Espera <script>alert("x")</script> & datos');
    assert.ok(html.includes('data-skeleton="'+kind+'"'),kind);assert.match(html,/role="status"/);assert.match(html,/aria-hidden="true"/);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&amp; datos'));
  }
  assert.ok(api.skeleton('table').includes('data-skeleton="records"'));assert.ok(api.skeleton('unknown').includes('data-skeleton="records"'));
});

test('boot aplica tema oscuro antes de autenticar y tolera almacenamiento, historial o destino ausentes',()=>{
  const dark=fixture({hash:'#view=reports&year=2026',theme:'dark'});
  assert.ok(dark.classes.has('dark'));assert.deepEqual(dark.storageReads,['matricula-theme','matricula-sidebar-mode']);assert.equal(dark.storageWrites.length,0);
  assert.ok(!fixture({theme:'light'}).classes.has('dark'));
  const unavailable=fixture({hash:'#view=backup',storageAvailable:false,historyAvailable:false});
  assert.ok(unavailable.app.innerHTML.includes('data-skeleton="backup"'));assert.doesNotThrow(()=>unavailable.api.writeRoute({view:'reports',year:2026}));assert.doesNotThrow(()=>unavailable.api.clearRoute());
  const absent=fixture({appExists:false});assert.equal(absent.app.innerHTML,'');assert.doesNotThrow(()=>absent.api.boot({view:'reports',year:2026}));
});
