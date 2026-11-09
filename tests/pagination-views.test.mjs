import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../public/reports.js',import.meta.url),'utf8');
const paginationSource=readFileSync(new URL('../public/pagination.js',import.meta.url),'utf8');
function fixture(){
  const pagerContext=createContext({window:{}});runInContext(paginationSource,pagerContext);const pager=pagerContext.window.EnrollmentPagination;
  const state={user:{id:'persona-sintetica'},year:2026,view:'reports'},calls=[],bindings=new Map(),controls=new Map();
  const results={innerHTML:'',removeAttribute(){}},form={values:{course:'',status:'',q:'',pending:''}},container={innerHTML:'',insertAdjacentHTML(_position,html){this.innerHTML+=html;}};
  const data={generatedAt:'2026-11-08T12:00:00Z',total:73,byStatus:{enrolled:50,draft:23,withdrawn:0},pending:23,movements:{},byCourse:Array.from({length:25},(_,index)=>({id:'curso-'+(index+1),name:'Curso sintético '+String(index+1).padStart(2,'0'),total:3,enrolled:2,draft:1,withdrawn:0,pending:1})),page:2,pageSize:5,items:Array.from({length:5},(_,index)=>({id:'ficha-'+index,name:'Alumno sintético '+index,courseName:'Curso autorizado',status:'draft',pending:[]}))};
  const context=createContext({
    state,URLSearchParams,FormData:class{constructor(form){this.values=form.values;}get(key){return this.values[key];}},
    $:selector=>selector==='#content'?container:selector==='#report-results'?results:selector==='#report-filters'?form:null,
    can:()=>false,esc:value=>String(value??''),statusLabel:status=>status,heading:title=>'<h1>'+title+'</h1>',courses:()=>[],options:()=>'',
    showLoading(){},loadingError(_target,error){throw error;},api:async path=>{calls.push(path);return structuredClone(data);},notice(){},
    EnrollmentPagination:{
      slice:pager.slice,
      html(values){controls.set(values.id,values);return pager.html(values);},
      bind(_root,id,callback){bindings.set(id,callback);}
    }
  });
  runInContext(source+'\nglobalThis.ui={reportsView,reportFilters,renderReports,loadReportResults,drawReportResults};',context);
  return {state,context,ui:context.ui,data,results,form,container,calls,bindings,controls};
}

test('informe conserva paginaciones independientes y exporta los filtros completos',()=>{
  const {ui}=fixture(),selection=ui.reportsView();
  assert.equal(selection.pageSize,25);assert.equal(selection.coursePage,1);assert.equal(selection.coursePageSize,10);
  Object.assign(selection,{course:'curso-autorizado',status:'draft',q:'sintético',pending:'1',showRows:true,page:4,pageSize:5,coursePage:2,coursePageSize:10});
  assert.strictEqual(ui.reportsView(),selection);
  const filters=ui.reportFilters(selection);
  assert.deepEqual(Object.keys(filters).sort(),['course','pending','q','status','year']);
  assert.equal(filters.q,'sintético');assert.equal(Object.hasOwn(filters,'page'),false);assert.equal(Object.hasOwn(filters,'pageSize'),false);
});

test('paginar cursos no consulta servidor ni altera la página o los filtros del detalle',()=>{
  const {ui,data,container,results,bindings,calls,controls}=fixture(),selection=ui.reportsView();
  Object.assign(selection,{course:'seleccionado',status:'draft',q:'consulta sintética',showRows:true,page:2,pageSize:5,coursePage:2,coursePageSize:10});
  ui.drawReportResults(container,results,selection,data);
  assert.match(results.innerHTML,/Curso sintético 11/);assert.match(results.innerHTML,/Curso sintético 20/);assert.doesNotMatch(results.innerHTML,/Curso sintético 01/);assert.doesNotMatch(results.innerHTML,/Curso sintético 21/);
  bindings.get('report-courses')({page:3,pageSize:10});
  assert.match(results.innerHTML,/Curso sintético 21/);assert.match(results.innerHTML,/Curso sintético 25/);assert.doesNotMatch(results.innerHTML,/Curso sintético 20/);
  assert.equal(calls.length,0);assert.equal(selection.coursePage,3);assert.equal(selection.page,2);assert.equal(selection.pageSize,5);assert.equal(selection.course,'seleccionado');assert.equal(selection.q,'consulta sintética');
  assert.equal(controls.get('report-courses').total,25);assert.equal(controls.get('report-records').total,73);
});

test('detalle envía página y tamaño mientras el resumen mantiene el total del filtro',async()=>{
  const {ui,data,container,results,bindings,calls,controls}=fixture(),selection=ui.reportsView();
  Object.assign(selection,{status:'draft',q:'sintético',showRows:true,page:2,pageSize:5,coursePage:2});
  await ui.loadReportResults(container,results,selection);
  let query=new URL(calls[0],'http://127.0.0.1').searchParams;
  assert.equal(query.get('page'),'2');assert.equal(query.get('pageSize'),'5');assert.equal(query.get('includeRecords'),'1');assert.equal(query.get('q'),'sintético');
  assert.equal(controls.get('report-records').total,73);assert.match(results.innerHTML,/73 expedientes/);
  data.page=3;data.pageSize=10;
  await bindings.get('report-records')({page:3,pageSize:10});
  query=new URL(calls[1],'http://127.0.0.1').searchParams;
  assert.equal(query.get('page'),'3');assert.equal(query.get('pageSize'),'10');assert.equal(selection.coursePage,2);assert.equal(selection.page,3);
});

test('nuevos filtros reinician ambas páginas sin perder los tamaños elegidos',async()=>{
  const {ui,form,data}=fixture(),selection=ui.reportsView();
  Object.assign(selection,{showRows:true,page:3,pageSize:5,coursePage:3,coursePageSize:5});
  await ui.renderReports();
  form.values={course:'curso-nuevo',status:'enrolled',q:'nuevo',pending:'1'};data.page=1;data.pageSize=5;
  await form.onsubmit({preventDefault(){}});
  assert.equal(selection.page,1);assert.equal(selection.coursePage,1);assert.equal(selection.pageSize,5);assert.equal(selection.coursePageSize,5);assert.equal(selection.course,'curso-nuevo');assert.equal(selection.status,'enrolled');
});

test('Pendientes ofrece la misma paginación sin convertir el resumen por curso en otra tabla',()=>{
  const {ui,state,data,container,results,controls}=fixture();state.view='pending';const selection=ui.reportsView();
  ui.drawReportResults(container,results,selection,data);
  assert.equal(selection.showRows,true);assert.equal(selection.pending,'1');assert.match(results.innerHTML,/data-pagination="report-records"/);assert.doesNotMatch(results.innerHTML,/data-pagination="report-courses"/);assert.equal(controls.get('report-records').label,'expedientes pendientes');
});
