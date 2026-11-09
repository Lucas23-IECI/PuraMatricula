import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture({view='reports',permissions=['read','documents','export']}={}){
  const pagerContext=createContext({window:{}});runInContext(read('pagination.js'),pagerContext);const pager=pagerContext.window.EnrollmentPagination;
  const state={user:{id:'cuenta-sintetica'},year:2026,view},calls=[],downloads=[],bindings=new Map(),preferences=new Map();
  const results={innerHTML:'',removeAttribute(){}},chips={innerHTML:''},error={textContent:''},more={open:false};
  const form={values:{course:'',status:'',q:'',pending:''},querySelector:()=>more};
  const container={innerHTML:'',insertAdjacentHTML(_position,html){this.innerHTML+=html;}};
  const dataset={generatedAt:'2026-11-08T12:00:00Z',total:73,byStatus:{enrolled:50,draft:20,withdrawn:3},pending:27,movements:{enroll:50},byCourse:Array.from({length:25},(_,index)=>({id:'curso-'+index,name:'Curso sintético '+String(index).padStart(2,'0'),total:index+1,enrolled:index,draft:1,withdrawn:0,pending:1})),page:1,pageSize:5,items:Array.from({length:5},(_,index)=>({id:'ficha-'+index,name:'Persona sintética '+index,courseName:'Curso autorizado',status:'draft',pending:['Teléfono del apoderado']}))};
  const context=createContext({
    state,URLSearchParams,FormData:class{constructor(target){this.values=target.values;}get(key){return this.values[key];}},
    $:selector=>({'#content':container,'#report-results':results,'#report-filters':form,'#report-active-filters':chips,'#report-filter-error':error}[selector]||null),
    can:permission=>permissions.includes(permission),esc:escape,statusLabel:status=>({draft:'Borrador',enrolled:'Matriculado',withdrawn:'Retirado'}[status]),heading:title=>'<h1>'+title+'</h1>',courses:()=>[{id:'curso-17',name:'Curso autorizado'}],options:()=>'',setBusy(){},notice(){},showLoading(){},loadingError(_target,failure){throw failure;},
    api:async path=>{calls.push(path);const params=new URL(path,'http://127.0.0.1').searchParams;return {...structuredClone(dataset),page:Number(params.get('page')),pageSize:Number(params.get('pageSize'))};},download:async path=>downloads.push(path),
    EnrollmentViews:{
      get:(user,section,modes,fallback)=>preferences.get(user+':'+section)||fallback||modes[0],
      set:(user,section,mode)=>preferences.set(user+':'+section,mode),
      html:({id,modes,value})=>`<div data-views="${id}">${modes.map(([mode,label])=>`<button aria-pressed="${value===mode}">${label}</button>`).join('')}</div>`,
      bind:(_target,id,callback)=>bindings.set(id,callback),
      chips:({items})=>items.map(item=>`<button>${escape(item.label)}</button>`).join(''),
      bindChips:(_target,id,callback)=>bindings.set('chips:'+id,callback)
    },
    EnrollmentPagination:{slice:pager.slice,html:pager.html,bind(target,id,callback){if(target.innerHTML.includes(`data-pagination="${id}"`))bindings.set(id,callback);else bindings.delete(id);}}
  });
  runInContext(read('reports.js')+'\nglobalThis.ui={reportsView,reportFilters,reportFilterValues,renderReports,drawReportResults,resetReportsContext,reportCharts};',context);
  return {state,context,ui:context.ui,dataset,calls,downloads,bindings,preferences,results,chips,error,form,container};
}

test('Resumen, gráficos y tabla presentan el mismo corte sin otra consulta ni pérdida de filtros o página',async()=>{
  const f=fixture(),selection=f.ui.reportsView();Object.assign(selection,{course:'curso-17',status:'draft',q:'Consulta sintética',pendingKey:'guardianPhone',page:4,pageSize:5,coursePage:2});
  await f.ui.renderReports();assert.equal(f.calls.length,1);assert.match(f.results.innerHTML,/Matrícula vigente/);
  f.bindings.get('report-mode')('charts');assert.equal(f.calls.length,1);assert.match(f.results.innerHTML,/Distribución por estado/);assert.match(f.results.innerHTML,/value="50"/);
  assert.match(f.results.innerHTML,/Curso sintético 10/);assert.doesNotMatch(f.results.innerHTML,/Curso sintético 00/);
  f.bindings.get('report-mode')('table');assert.equal(f.calls.length,1);assert.match(f.results.innerHTML,/Persona sintética 0/);assert.match(f.results.innerHTML,/data-page="4"/);
  assert.equal(selection.page,4);assert.equal(selection.pageSize,5);assert.equal(selection.coursePage,2);assert.equal(selection.pendingKey,'guardianPhone');assert.equal(selection.q,'Consulta sintética');
  f.bindings.get('report-mode')('summary');assert.equal(f.calls.length,1);assert.equal(selection.page,4);assert.doesNotMatch(f.results.innerHTML,/Persona sintética 0/);
  assert.equal(f.preferences.get('cuenta-sintetica:reports'),'summary');
});

test('Pendientes conserva alumno, total, filtros y selección de página al alternar tabla, compacta y tarjetas',async()=>{
  const f=fixture({view:'pending'}),selection=f.ui.reportsView();Object.assign(selection,{page:3,pageSize:5,q:'sintético',identifierType:'IPE'});
  await f.ui.renderReports();
  for(const mode of ['compact','cards','table']){
    f.bindings.get('report-mode')(mode);assert.equal(f.calls.length,1);assert.match(f.results.innerHTML,/Persona sintética 4/);assert.match(f.results.innerHTML,/73 expedientes pendientes/);assert.match(f.results.innerHTML,/data-page="3"/);
    assert.equal(selection.pending,'1');assert.equal(selection.identifierType,'IPE');assert.equal(selection.page,3);
  }
  f.bindings.get('report-mode')('cards');await f.bindings.get('report-records')({page:4,pageSize:5});
  assert.equal(f.calls.length,2);assert.equal(selection.mode,'cards');assert.equal(selection.page,4);assert.match(f.results.innerHTML,/report-record-cards/);
  f.state.view='reports';assert.equal(f.ui.reportsView().mode,'summary','Las preferencias de pendientes no afectan estadísticas.');
});

test('los filtros avanzados afectan consulta y exportaciones completas, sin enviar modo ni paginación a la descarga',async()=>{
  const f=fixture(),selection=f.ui.reportsView();Object.assign(selection,{page:4,coursePage:3,pageSize:5,coursePageSize:5,mode:'charts'});
  await f.ui.renderReports();
  f.form.values={course:'curso-17',status:'draft',q:' correo@sintetico.test ',pending:'1',identifierType:'IPE',pendingKey:'guardianPhone',contact:'missing-email',origin:'imported',documentKind:'signed',documentState:'missing',updatedFrom:'2026-01-01',updatedTo:'2026-11-08',sort:'updated-desc'};
  await f.form.onsubmit({preventDefault(){}});
  const query=new URL(f.calls.at(-1),'http://127.0.0.1').searchParams;
  for(const [key,value] of Object.entries(f.form.values))assert.equal(query.get(key),String(value).trim(),key);
  assert.equal(selection.page,1);assert.equal(selection.coursePage,1);assert.equal(selection.pageSize,5);assert.equal(selection.coursePageSize,5);assert.equal(selection.mode,'charts');
  await f.container.onclick({target:{closest:()=>({dataset:{reportAction:'summary',format:'pdf'}})}});
  const exported=new URL(f.downloads[0],'http://127.0.0.1').searchParams;
  assert.equal(exported.get('pendingKey'),'guardianPhone');assert.equal(exported.get('updatedTo'),'2026-11-08');assert.equal(exported.get('sort'),'updated-desc');
  for(const key of ['page','pageSize','coursePage','mode','includeRecords'])assert.equal(exported.has(key),false,key);
  assert.match(f.chips.innerHTML,/Teléfono del apoderado/);assert.match(f.chips.innerHTML,/Ficha firmada: sin documento visible/);
});

test('intervalos invertidos y documentos sin estado no consultan el servidor ni sustituyen los filtros vigentes',async()=>{
  const f=fixture(),selection=f.ui.reportsView();await f.ui.renderReports();const count=f.calls.length;
  f.form.values={course:'curso-17',updatedFrom:'2026-11-08',updatedTo:'2026-01-01'};await f.form.onsubmit({preventDefault(){}});
  assert.match(f.error.textContent,/fecha inicial/);assert.equal(f.calls.length,count);assert.equal(selection.course,'');
  f.form.values={documentKind:'identity'};await f.form.onsubmit({preventDefault(){}});
  assert.match(f.error.textContent,/tipo de documento/);assert.equal(f.calls.length,count);assert.equal(selection.documentKind,'');
});

test('limpiar filtros en Pendientes mantiene su alcance y modo, pero reinicia páginas y campos avanzados',async()=>{
  const f=fixture({view:'pending'}),selection=f.ui.reportsView();Object.assign(selection,{mode:'cards',course:'curso-17',q:'consulta',pendingKey:'guardianPhone',updatedFrom:'2026-01-01',page:3,pageSize:5,coursePage:2});await f.ui.renderReports();
  await f.bindings.get('chips:report-filters')({clear:true});
  assert.equal(selection.pending,'1');assert.equal(selection.mode,'cards');assert.equal(selection.page,1);assert.equal(selection.pageSize,5);assert.equal(selection.q,'');assert.equal(selection.course,'');assert.equal(selection.pendingKey,'');assert.equal(selection.updatedFrom,'');
});

test('una cuenta sin documentos no recibe esos controles y los datos dinámicos se escapan en tarjetas y gráficos',async()=>{
  const f=fixture({view:'pending',permissions:['read']});f.dataset.items[0].name='<img src=x onerror=alert(1)>';await f.ui.renderReports();
  assert.doesNotMatch(f.container.innerHTML,/name="documentKind"|name="documentState"/);
  f.bindings.get('report-mode')('cards');assert.match(f.results.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(f.results.innerHTML,/<img src=x/);
  f.state.view='reports';f.dataset.byCourse[0].name='<svg onload=alert(1)>';await f.ui.renderReports();f.bindings.get('report-mode')('charts');assert.doesNotMatch(f.results.innerHTML,/<svg onload=/);assert.match(f.results.innerHTML,/&lt;svg onload=alert\(1\)&gt;/);
});

test('los gráficos vacíos muestran cero sin porcentajes inválidos y no usan el tamaño de página como total',async()=>{
  const f=fixture();Object.assign(f.dataset,{total:0,byStatus:{enrolled:0,draft:0,withdrawn:0},pending:0,byCourse:[],items:[]});await f.ui.renderReports();f.bindings.get('report-mode')('charts');
  assert.match(f.results.innerHTML,/0 expedientes/);assert.match(f.results.innerHTML,/No hay cursos/);assert.doesNotMatch(f.results.innerHTML,/NaN|Infinity|<meter[^>]*value="[1-9]/);
  const g=fixture();await g.ui.renderReports();g.bindings.get('report-mode')('charts');assert.match(g.results.innerHTML,/max="73" value="50"/);assert.equal(g.dataset.items.length,5);
});
