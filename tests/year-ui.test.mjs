import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const app=read('app.js');
function sourceBetween(start,end){
  const from=app.indexOf(start),to=app.indexOf(end,from);
  assert.ok(from>=0&&to>from,'Falta el segmento real: '+start);
  return app.slice(from,to);
}
const yearsSource=sourceBetween('function schoolYearRange(){','async function init(');
const cacheSource=sourceBetween('let listRequest=','async function openRecord(');
const importInvalidationSource=sourceBetween('function invalidateImport(','function renderImport(){');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(){
  const state={user:{id:'persona-ficticia',permissions:['read','write','enroll','import']},meta:{availableYears:[2026],courses:[],yearRange:{min:1950,max:2100}},view:'reports',year:2026,course:'',status:'',q:'',page:1,pageSize:50,record:null,draft:{},dirty:false,conflict:false,importRevision:0,importRows:null,importTicket:null,importPreview:null,importKind:null,importOptions:null};
  const calls=[],notices=[],dialogs=[],rendered=[],counters={save:0,shell:0,render:0},button={disabled:false},stale={textContent:''};
  const context=createContext({state,URLSearchParams,window:{matchMedia:()=>({matches:true})},can:permission=>state.user?.permissions.includes(permission),
    $:selector=>selector==='[data-action="commit-import"]'?button:selector==='#import-stale'?stale:null,
    api:async path=>{calls.push(path);return {items:[],total:0,page:1,pageSize:25};},
    saveRecord:async()=>{counters.save++;return true;},shell:()=>counters.shell++,renderView:async()=>{counters.render++;rendered.push({year:state.year,course:state.course,status:state.status,q:state.q,record:state.record});},
    notice:message=>notices.push(message),dialog:(title,html,onSubmit)=>dialogs.push({title,html,onSubmit})});
  runInContext(read('import-preview.js')+read('reports.js')+yearsSource+importInvalidationSource+cacheSource+'\nglobalThis.ui={schoolYearRange,validSchoolYear,availableSchoolYears,schoolYearOptions,changeSchoolYear,chooseSchoolYear,recordsCache,recordsCacheKey,collectionPages,clearSessionViewData,importPreviewWorkspace,reportsView,getImportPreview:()=>importPreviewPages,getReports:()=>reportSelection,getReportSerial:()=>reportSerial,getGeneration:()=>cacheGeneration};',context);
  return {state,context,ui:context.ui,calls,notices,dialogs,rendered,counters,button,stale};
}

test('selector reúne catálogo, cursos y año actual sin duplicados y acepta consultar años sin registros',()=>{
  const {state,ui}=fixture();
  state.meta.availableYears=[2037,2019,'1950',2026,2037,1949,2101,'desconocido'];
  state.meta.courses=[{year:2028,name:'Curso ficticio'},{year:'2019',name:'Otro curso'},{year:2026.5}];state.year=2050;
  assert.deepEqual(Array.from(ui.availableSchoolYears()),[2050,2037,2028,2026,2019,1950]);
  const options=ui.schoolYearOptions();
  assert.match(options,/<option value="2050" selected>2050<\/option>/);
  assert.equal((options.match(/value="2019"/g)||[]).length,1);assert.match(options,/<option value="other">Consultar otro año…<\/option>/);
  assert.doesNotMatch(options,/1949|2101|Curso ficticio|desconocido/);
  assert.equal(ui.validSchoolYear('2075'),2075,'Consultar otro año no debe depender de que ya existan cursos.');
});

test('validación admite años antiguos y futuros dentro del rango del servidor y rechaza valores inválidos',()=>{
  const {state,ui}=fixture();
  for(const year of [1950,2019,2026,2100,'2037'])assert.equal(ui.validSchoolYear(year),Number(year));
  for(const year of [1949,2101,2026.5,'no es un año',null,'',NaN,Infinity])assert.equal(ui.validSchoolYear(year),null,String(year));
  state.meta.yearRange={min:2000,max:2090};assert.equal(ui.validSchoolYear(1999),null);assert.equal(ui.validSchoolYear(2091),null);assert.equal(ui.validSchoolYear(2000),2000);
  delete state.meta.yearRange;assert.deepEqual(plain(ui.schoolYearRange()),{min:1950,max:2100});
});

test('elegir el año actual conserva trabajo pendiente y no consulta ni reconstruye la pantalla',async()=>{
  const f=fixture();f.state.dirty=true;f.state.importTicket='ticket-ficticio';f.ui.recordsCache.set('anterior',{});
  const report=f.ui.reportsView();report.q='consulta previa';const before=JSON.stringify(f.state),serial=f.ui.getReportSerial();
  await f.ui.changeSchoolYear(2026);
  assert.equal(JSON.stringify(f.state),before);assert.equal(f.counters.save,0);assert.equal(f.counters.shell,0);assert.equal(f.counters.render,0);
  assert.equal(f.calls.length,0);assert.equal(f.notices.length,0);assert.equal(f.ui.recordsCache.size,1);assert.strictEqual(f.ui.getReports(),report);assert.equal(f.ui.getReportSerial(),serial);
});

test('cambiar año elimina selección, ficha, cachés e importación anteriores y reinicia estadísticas',async()=>{
  const f=fixture(),{state,ui}=f;
  Object.assign(state,{course:'curso-anterior',status:'draft',q:'consulta anterior',page:7,auditSnapshot:90,record:{id:'ficha-ficticia'},draft:{address:'Dato sintético'},dirty:true,conflict:true,importRows:[{id:'fila-ficticia'}],importTicket:'ticket-ficticio',importKind:'school',importOptions:{columnMapping:{names:'Persona'}}});
  state.importPreview={ticket:state.importTicket,rows:state.importRows};
  state.importIpeReviewValid=true;state.importOptions.confirmedIpeRows=[{sheet:'Hoja sintética',row:2}];state.importOptions.ipeConfirmationToken='token-ficticio';
  const preview=ui.importPreviewWorkspace();preview.rows.page=4;preview.updates.add(0);preview.createCourses=true;
  const report=ui.reportsView();Object.assign(report,{course:'curso-anterior',q:'consulta anterior',status:'draft',page:8,coursePage:4});
  ui.recordsCache.set('año-anterior',{items:[{id:'ficticio'}]});ui.collectionPages.set('página-anterior',{page:6,pageSize:50});
  const serial=ui.getReportSerial();await ui.changeSchoolYear('1950');await flush();
  assert.equal(state.year,1950);assert.equal(state.view,'reports');
  for(const field of ['course','status','q'])assert.equal(state[field],'',field);
  for(const field of ['record','auditSnapshot','importRows','importTicket','importPreview','importKind','importOptions'])assert.equal(state[field],null,field);
  assert.equal(state.importIpeReviewValid,false);
  assert.equal(state.page,1);assert.equal(state.pageSize,50);assert.deepEqual(plain(state.draft),{});assert.equal(state.dirty,false);assert.equal(state.conflict,false);
  assert.equal(ui.recordsCache.has('año-anterior'),false);assert.equal(ui.collectionPages.size,0);assert.equal(ui.getGeneration(),1);
  assert.equal(state.importRevision,1);assert.equal(ui.getImportPreview(),undefined);assert.equal(f.button.disabled,true);assert.match(f.stale.textContent,/previsualizar/);
  assert.deepEqual(plain(ui.getReports()),{});assert.equal(ui.getReportSerial(),serial+1);
  const next=ui.reportsView();assert.notStrictEqual(next,report);assert.equal(next.year,1950);assert.equal(next.course,'');assert.equal(next.q,'');assert.equal(next.page,1);assert.equal(next.coursePage,1);
  assert.equal(f.counters.save,1);assert.equal(f.counters.shell,1);assert.equal(f.counters.render,1);assert.equal(f.rendered[0].year,1950);assert.equal(f.rendered[0].record,null);
  assert.equal(f.calls.length,1);assert.equal(new URL(f.calls[0],'http://127.0.0.1').searchParams.get('year'),'1950');assert.match(f.notices[0],/1950/);
  await ui.changeSchoolYear(2037);assert.equal(state.year,2037);assert.equal(f.counters.shell,2);
});

test('año inválido o guardado rechazado conserva el año, la selección y la vista actuales',async()=>{
  const f=fixture();Object.assign(f.state,{course:'curso-ficticio',q:'consulta ficticia',dirty:true,importTicket:'ticket-ficticio'});
  f.ui.recordsCache.set('ficticio',{});const before=JSON.stringify(f.state);f.context.saveRecord=async()=>false;
  await assert.rejects(f.ui.changeSchoolYear(1949),/1950.*2100/);
  await f.ui.changeSchoolYear(2030);
  assert.equal(JSON.stringify(f.state),before);assert.equal(f.ui.recordsCache.size,1);assert.equal(f.counters.shell,0);assert.equal(f.counters.render,0);assert.equal(f.calls.length,0);assert.equal(f.notices.length,0);
});

test('la selección más reciente prevalece si los guardados de dos cambios de año terminan fuera de orden',async()=>{
  const f=fixture(),saves=[deferred(),deferred()];let index=0;f.state.dirty=true;f.context.saveRecord=()=>saves[index++].promise;
  const old=f.ui.changeSchoolYear(2030),latest=f.ui.changeSchoolYear(2032);
  saves[0].resolve(true);await old;assert.equal(f.state.year,2026);assert.equal(f.counters.shell,0);
  saves[1].resolve(true);await latest;await flush();
  assert.equal(f.state.year,2032);assert.equal(f.counters.shell,1);assert.equal(f.notices.length,1);assert.match(f.notices[0],/2032/);
  assert.equal(f.calls.length,1);assert.equal(new URL(f.calls[0],'http://127.0.0.1').searchParams.get('year'),'2032');
});

test('volver a elegir el año actual cancela un cambio anterior cuyo guardado sigue pendiente',async()=>{
  const f=fixture(),save=deferred();f.state.dirty=true;f.context.saveRecord=()=>save.promise;
  const changing=f.ui.changeSchoolYear(2030);await f.ui.changeSchoolYear(2026);save.resolve(true);await changing;
  assert.equal(f.state.year,2026);assert.equal(f.counters.shell,0);assert.equal(f.counters.render,0);assert.equal(f.calls.length,0);assert.equal(f.notices.length,0);
});

test('cambiar de cuenta o reiniciar la sesión descarta un cambio de año que estaba guardando',async()=>{
  for(const reason of ['person','session']){
    const f=fixture(),save=deferred();f.state.dirty=true;f.context.saveRecord=()=>save.promise;
    const changing=f.ui.changeSchoolYear(2030);
    if(reason==='person')f.state.user={...f.state.user,id:'otra-persona-ficticia'};else f.ui.clearSessionViewData();
    save.resolve(true);await changing;
    assert.equal(f.state.year,2026,reason);assert.equal(f.counters.shell,0,reason);assert.equal(f.calls.length,0,reason);assert.equal(f.notices.length,0,reason);
  }
});

test('un render anterior no anuncia ni precarga el año que dejó de estar seleccionado',async()=>{
  const f=fixture(),renders=[deferred(),deferred()];let index=0;f.context.renderView=()=>renders[index++].promise;
  const old=f.ui.changeSchoolYear(2030),latest=f.ui.changeSchoolYear(2031);
  renders[0].resolve();await old;assert.equal(f.notices.length,0);assert.equal(f.calls.length,0);
  renders[1].resolve();await latest;
  assert.equal(f.state.year,2031);assert.equal(f.notices.length,1);assert.match(f.notices[0],/2031/);assert.equal(f.calls.length,1);
  assert.equal(new URL(f.calls[0],'http://127.0.0.1').searchParams.get('year'),'2031');
});

test('Consultar otro año usa límites reales y al enviar consulta el año sin crear cursos ni matrículas',async()=>{
  const f=fixture();f.state.user.permissions=['read'];f.ui.chooseSchoolYear();
  assert.equal(f.dialogs.length,1);const dialog=f.dialogs[0];assert.equal(dialog.title,'Consultar otro año');
  assert.match(dialog.html,/type="number" min="1950" max="2100"/);assert.match(dialog.html,/value="2026" required/);
  await dialog.onSubmit({get:field=>{assert.equal(field,'year');return '2075';}});
  assert.equal(f.state.year,2075);assert.equal(f.calls.length,1);assert.match(f.calls[0],/^\/api\/records\?/);assert.match(f.notices[0],/2075/);
});
