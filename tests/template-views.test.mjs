import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const plain=value=>JSON.parse(JSON.stringify(value));
const field=(index,changes={})=>({key:'extra'+index,label:'Pregunta sintética '+index,section:index%2?'adicionales':'contacto',type:index%2?'text':'select',sensitive:index%3===0,hidden:index%5===0,...changes});
const fields=()=>[{key:'names',label:'Nombres',section:'identidad',type:'text',sensitive:false},...Array.from({length:26},(_,index)=>field(index+1)),{key:'sourceRow',label:'Fila de origen',section:'importacion',type:'text',sensitive:false}];
class FormDataFixture{constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}has(key){return Object.hasOwn(this.values,key);}}
function element(){return {innerHTML:'',textContent:'',value:'',disabled:false,open:false,hidden:false,focus(){},scrollIntoView(){},replaceChildren(){this.innerHTML='';},addEventListener(){}};}

function fixture(){
  const pages=new Map(),pagers=new Map(),views=new Map(),preferences=new Map(),chips=new Map(),calls=[],notices=[];let nodes=new Map(),lastDialog;
  const node=selector=>{if(!nodes.has(selector)){const value=element();value.querySelector=child=>node(selector+' '+child);value.elements={type:{value:'text',addEventListener(){}},options:{disabled:true,required:false}};nodes.set(selector,value);}return nodes.get(selector);};
  const container={_html:'',set innerHTML(value){this._html=value;nodes=new Map();},get innerHTML(){return this._html;},querySelector:node};
  const state={view:'templates',user:{id:'persona-a'},year:2026,meta:{importFieldsReady:true,templateProtectedKeys:['names','sourceRow'],sections:{identidad:'Identificación',contacto:'Contacto',adicionales:'Adicionales',importacion:'Procedencia'},templates:Array.from({length:15},(_,index)=>({id:32-index,name:'Plantilla sintética '+(32-index),created_at:`2026-11-${String(15-index).padStart(2,'0')}T14:00:00Z`,fields:fields()}))}};
  const context=createContext({window:{},state,structuredClone,FormData:FormDataFixture,esc:escape,date:value=>String(value||''),heading:title=>'<h1>'+title+'</h1>',notice:message=>notices.push(message),setBusy(){},crypto:{randomUUID:()=> '00000000-0000-0000-0000-000000000001'},
    $:selector=>selector==='#content'?container:node(selector),
    dialog:(title,html,submit)=>{lastDialog={title,html,submit};},
    download:async(path,options)=>{calls.push({path,options});},
    api:async(path,options)=>{calls.push({path,options:plain(options||{})});if(path==='/api/templates/preview')return {...structuredClone(options.body),previewToken:'ticket-revisado'};if(path==='/api/templates'){state.meta.templates.unshift({id:33,name:options.body.name,fields:structuredClone(options.body.fields),created_at:'2026-11-20T12:00:00Z'});return {id:33};}if(path==='/api/meta')return structuredClone(state.meta);throw Error('Llamada inesperada: '+path);},
    EnrollmentViews:{get:(owner,section,modes,fallback)=>preferences.get(owner+':'+section)||fallback,set:(owner,section,mode)=>preferences.set(owner+':'+section,mode),html:({id,value})=>`<div data-view-control="${id}" data-value="${value}"></div>`,bind:(_root,id,callback)=>views.set(id,callback),chips:({id,items})=>`<div data-chips="${id}">${items.map(item=>escape(item.label)).join(' · ')}</div>`,bindChips:(_root,id,callback)=>chips.set(id,callback)}
  });
  runInContext(read('pagination.js'),context);
  context.EnrollmentPagination={...context.window.EnrollmentPagination,html:values=>{pages.set(values.id,plain(values));return context.window.EnrollmentPagination.html(values);},bind:(_root,id,callback)=>pagers.set(id,callback)};
  runInContext(read('templates.js')+'\nglobalThis.ui={renderTemplateEditor,templateVersionRows,templateQuestionRows,templateVersionFilterDefaults,templateQuestionFilterDefaults,templateFilterDate,resetTemplateViews,draft:()=>enrollmentTemplateDraft};',context);
  context.ui.renderTemplateEditor();
  const click=async(action,index)=>container.onclick({target:{closest:()=>({disabled:false,dataset:{template:action,...(index===undefined?{}:{index:String(index)})}})}});
  const filter=(kind,values)=>{const form=node(kind==='versions'?'#template-version-filters':'#template-question-filters');form.values=values;return form.onsubmit({preventDefault(){}});};
  return {ui:context.ui,state,context,container,node,pages,pagers,views,preferences,chips,calls,notices,click,filter,getDialog:()=>lastDialog};
}

test('preguntas filtran el conjunto completo antes de paginar y conservan índices y posiciones globales',()=>{
  const f=fixture(),draft=f.ui.draft();
  f.filter('questions',{q:'Pregunta sintética 26'});
  assert.equal(f.pages.get('template-questions').total,1);assert.match(f.container.innerHTML,/data-template="edit" data-index="26"/);
  const result=f.ui.templateQuestionRows(draft.fields,new Set(['names','sourceRow']),{q:'extra26'});
  assert.deepEqual(plain(result.map(({index,position})=>({index,position}))),[{index:26,position:25}]);
  assert.equal(f.pages.get('template-questions').page,1);assert.equal(draft.fields.length,28);
  assert.doesNotMatch(f.container.innerHTML,/data-template="edit" data-index="0"|data-template="edit" data-index="27"/);
});

test('combinaciones de tipo, sección, visibilidad y reserva no mutan el borrador ni muestran campos protegidos',()=>{
  const f=fixture(),draft=f.ui.draft(),before=JSON.stringify(draft.fields),blocked=new Set(['names','sourceRow']);
  const selected=f.ui.templateQuestionRows(draft.fields,blocked,{q:'SINTETICA',type:'select',section:'contacto',visibility:'hidden',sensitive:'ordinary'});
  assert.deepEqual(Array.from(selected,entry=>entry.field.key),['extra10','extra20']);
  assert.equal(JSON.stringify(draft.fields),before);
  assert.equal(f.ui.templateQuestionRows(draft.fields,blocked,{q:'Nombres'}).length,0);
});

test('vista, filtros y paginación conservan el token y publican el borrador completo incluso sin coincidencias',async()=>{
  const f=fixture(),draft=f.ui.draft();draft.name='Plantilla revisada';await f.click('preview');
  const token=draft.preview,expected=JSON.stringify(draft.fields);
  f.pagers.get('template-questions')({page:2,pageSize:5});
  f.views.get('template-questions-view')('cards');
  assert.equal(draft.questionsPage,2);assert.equal(draft.questionsPageSize,5);assert.strictEqual(draft.preview,token);
  f.filter('questions',{q:'sin coincidencias'});f.filter('versions',{state:'previous'});
  assert.equal(f.pages.get('template-questions').total,0);assert.strictEqual(draft.preview,token);
  await f.node('#template-preview #template-publish').onclick({currentTarget:{disabled:false}});
  const sent=f.calls.find(call=>call.path==='/api/templates').options.body;
  assert.equal(sent.previewToken,'ticket-revisado');assert.equal(JSON.stringify(sent.fields),expected);
  assert.equal(sent.fields.length,28);assert.ok(sent.fields.some(question=>question.key==='sourceRow'));assert.ok(sent.fields.some(question=>question.hidden));
});

test('editar y ocultar una pregunta filtrada actúa sobre su índice global e invalida la revisión',async()=>{
  const f=fixture(),draft=f.ui.draft();draft.name='Borrador';await f.click('preview');f.filter('questions',{q:'extra23'});
  await f.click('edit',23);const form=f.getDialog();assert.equal(form.title,'Editar pregunta');
  form.submit(new FormDataFixture({values:{label:'Pregunta corregida',type:'text'}}));
  assert.equal(draft.fields[23].label,'Pregunta corregida');assert.equal(draft.fields[0].key,'names');assert.equal(draft.preview,null);
  await f.click('toggle',23);assert.equal(draft.fields[23].hidden,true);assert.equal(draft.fields[22].hidden,false);
});

test('mover una pregunta filtrada usa vecinos globales sin mover la ficha base ni la procedencia',async()=>{
  const f=fixture(),draft=f.ui.draft();f.filter('questions',{q:'extra20'});
  await f.click('up',20);
  assert.equal(draft.fields[19].key,'extra20');assert.equal(draft.fields[20].key,'extra19');
  assert.equal(draft.fields[0].key,'names');assert.equal(draft.fields.at(-1).key,'sourceRow');
  assert.equal(draft.questionsPage,1);assert.match(f.container.innerHTML,/data-template="edit" data-index="19"/);
  const before=JSON.stringify(draft.fields);for(const action of ['edit','up','down','toggle'])await f.click(action,0);
  assert.equal(JSON.stringify(draft.fields),before);
});

test('la reserva publicada sigue bloqueada al editar desde un filtro y el nombre invalida la revisión',async()=>{
  const f=fixture(),draft=f.ui.draft();f.filter('questions',{sensitive:'reserved'});await f.click('edit',3);
  assert.match(f.getDialog().html,/name="sensitive"[^>]*disabled/);
  f.getDialog().submit(new FormDataFixture({values:{label:'Reserva conservada',type:'text'}}));assert.equal(draft.fields[3].sensitive,true);
  draft.name='Antes';await f.click('preview');assert.ok(draft.preview);
  f.node('#template-name').oninput({target:{value:'Después'}});assert.equal(draft.preview,null);assert.equal(draft.name,'Después');
});

test('versiones y preguntas tienen filtros y páginas independientes con fechas de Chile y vigente real',()=>{
  const f=fixture(),draft=f.ui.draft();f.pagers.get('template-versions')({page:2,pageSize:5});f.pagers.get('template-questions')({page:3,pageSize:5});
  f.filter('versions',{q:'Plantilla',state:'previous',from:'2026-11-01',to:'2026-11-10'});
  assert.equal(draft.versionsPage,1);assert.equal(draft.questionsPage,3);assert.equal(draft.questionsPageSize,5);
  assert.doesNotMatch(f.container.innerHTML,/Vigente para fichas nuevas/);
  f.filter('questions',{visibility:'hidden'});assert.equal(draft.questionsPage,1);assert.equal(draft.versionsPageSize,5);
  assert.equal(f.ui.templateFilterDate('2026-11-08T02:30:00Z'),'2026-11-07');
  const previous=plain(draft.versionsFilters);f.filter('versions',{from:'2026-11-11',to:'2026-11-01'});
  assert.deepEqual(plain(draft.versionsFilters),previous);assert.match(f.node('#template-version-filters [data-filter-error]').textContent,/inicial/);
});

test('quitar filtros conserva borrador y revisión; cambiar propietario o plantilla reinicia la selección anterior',async()=>{
  const f=fixture(),draft=f.ui.draft();draft.name='Privado de A';await f.click('preview');const preview=draft.preview;
  f.filter('questions',{q:'extra',sensitive:'reserved'});f.chips.get('template-question-chips')({key:'q',clear:false});
  assert.equal(draft.questionsFilters.q,'');assert.equal(draft.questionsFilters.sensitive,'reserved');assert.strictEqual(draft.preview,preview);
  f.node('[data-template-clear="questions"]').onclick();assert.deepEqual(plain(draft.questionsFilters),plain(f.ui.templateQuestionFilterDefaults()));assert.strictEqual(draft.preview,preview);
  const oldModeCallback=f.views.get('template-questions-view');f.state.user={id:'persona-b'};f.ui.renderTemplateEditor();
  assert.notStrictEqual(f.ui.draft(),draft);assert.equal(f.ui.draft().name,'');assert.equal(f.ui.draft().preview,null);assert.equal(f.ui.draft().questionsFilters.q,'');
  oldModeCallback('cards');assert.equal(f.preferences.has('persona-a:template-questions'),false);
  const second=f.ui.draft();f.state.meta.templates.unshift({...f.state.meta.templates[0],id:99});f.ui.renderTemplateEditor();assert.notStrictEqual(f.ui.draft(),second);assert.equal(f.ui.draft().baseTemplateId,99);
});

test('los filtros escapan contenido y la preferencia solo almacena el modo por persona y sección',()=>{
  const f=fixture(),draft=f.ui.draft();f.filter('questions',{q:'<img src=x onerror=alert(1)>'});
  assert.doesNotMatch(f.container.innerHTML,/<img src=x/);assert.match(f.container.innerHTML,/&lt;img/);
  f.views.get('template-questions-view')('compact');assert.equal(f.preferences.get('persona-a:template-questions'),'compact');
  assert.equal(f.preferences.has('persona-a:template-versions'),false);assert.equal(draft.questionsFilters.q,'<img src=x onerror=alert(1)>');
  assert.equal(f.calls.length,0,'Cambiar presentación y filtros no debe llamar al servidor.');
});
