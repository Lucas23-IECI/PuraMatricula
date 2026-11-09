import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../public/record-views.js',import.meta.url),'utf8'),pagination=readFileSync(new URL('../public/pagination.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
class Element{
  constructor(tagName='DIV'){this.tagName=tagName;this.listeners=new Map();this.attrs=new Map();this.hidden=false;this.value='';this.dataset={};this.textContent='';this.children=[];this._html='';this.isConnected=true;this.classList={values:new Set(),add:(...names)=>names.forEach(n=>this.classList.values.add(n)),toggle:(n,on)=>on?this.classList.values.add(n):this.classList.values.delete(n)};}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  emit(name,target=this){for(const listener of this.listeners.get(name)||[])listener({type:name,target,preventDefault(){}});}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)??null;}
  matches(selector){return selector==='[data-field]'&&Object.hasOwn(this.dataset,'field');}
  closest(selector){if(selector==='label')return this.label;if(selector==='[data-rv-filter]'&&this.dataset.rvFilter)return this;if(selector==='summary'&&this.tagName==='SUMMARY')return this;return null;}
  querySelectorAll(){return [];}
  remove(){this.removed=true;}
  set innerHTML(value){this._html=value;}
  get innerHTML(){return this._html;}
}
function harness(){
  const modeHandlers=new Map(),chipHandlers=new Map(),pageHandlers=new Map(),writes=[],prefs=new Map(),timers=new Map();let serial=0;
  const document={activeElement:null,createElement:tag=>tag==='section'?toolbar():new Element(tag.toUpperCase())};
  const window={setTimeout(fn){const id=++serial;timers.set(id,fn);return id;}};
  window.EnrollmentViews={get(user,section,allowed,fallback){return prefs.get(user+':'+section)||fallback;},set(user,section,mode,allowed){writes.push({user,section,mode,allowed:plain(allowed)});prefs.set(user+':'+section,mode);},html(){return '<div class="view-controls"></div>';},bind(root,id,fn){modeHandlers.set(id,fn);},chips({items}){return items.map(x=>x.label).join(' | ');},bindChips(root,id,fn){chipHandlers.set(id,fn);}};
  const context=createContext({window,document,Date,Map,Set,WeakMap,String,Array,Object,JSON,Number,clearTimeout:id=>timers.delete(id)});runInContext(pagination,context);window.EnrollmentPagination={...window.EnrollmentPagination,bind(root,id,fn){pageHandlers.set(id,fn);}};runInContext(source,context);
  function toolbar(){const node=new Element('SECTION');node.nodes=new Map([['[data-rv-question-search]',new Element('INPUT')],['[data-rv-completion]',new Element('SELECT')],['.rv-result-status',new Element()],['.rv-question-empty',new Element('P')],['[data-rv-reset]',new Element('BUTTON')],['.rv-chips',new Element()]]);node.querySelector=selector=>node.nodes.get(selector)||null;
    Object.defineProperty(node,'innerHTML',{get(){return this._html;},set(html){this._html=html;node.querySelector('[data-rv-question-search]').value=html.match(/data-rv-question-search[^>]*value="([^"]*)"/)?.[1]||'';node.querySelector('[data-rv-completion]').value=/value="missing" selected/.test(html)?'missing':/value="filled" selected/.test(html)?'filled':'all';}});return node;}
  function form(){
    const container=new Element();container.ownerDocument=document;container.onclick=()=>{};Object.defineProperty(container,'innerHTML',{set(){throw Error('Rebuilt the student form');}});
    const definition=[['Identificación',true,[['Nombre','Nombre del estudiante','Ana sintética'],['Correo','Correo electrónico','']]],['Contacto',false,[['Domicilio','Domicilio del apoderado','Calle sintética']]],['Protegida',false,[['Secreto','Campo ya oculto','No revelar']]]];
    const sections=definition.map(([title,isOpen,fields])=>{const section=new Element('DETAILS'),summary=new Element('SUMMARY');summary.textContent=title;section.open=isOpen;section.summary=summary;section.inputs=fields.map(([key,label,value])=>{const input=new Element('INPUT'),labelNode=new Element('LABEL');labelNode.textContent=label;labelNode.hidden=key==='Secreto';labelNode.cloneNode=()=>({textContent:label,querySelectorAll:()=>[]});input.dataset.field=key;input.label=labelNode;input.value=value;input.type='text';input.disabled=key==='Domicilio';input.readOnly=key==='Domicilio';input.selectionStart=3;input.selectionEnd=3;return input;});section.querySelector=selector=>selector==='summary'?summary:null;section.querySelectorAll=selector=>selector==='[data-field]'?section.inputs:[];section.before=node=>{container.toolbar=node;};return section;});
    container.querySelector=selector=>selector==='details.section'?sections[0]:null;container.querySelectorAll=selector=>selector==='details.section'?sections:[];
    return {container,sections,inputs:sections.flatMap(x=>x.inputs),get toolbar(){return container.toolbar;}};
  }
  function collection(){
    const container=new Element(),nodes=new Map([['.rv-collection-results',new Element()],['.rv-result-status',new Element()],['.rv-chips',new Element()],['[data-rv-reset]',new Element('BUTTON')]]),inputs=['q','kind','action','actor','from','to'].map(key=>{const input=new Element(key==='q'?'INPUT':'SELECT');input.dataset.rvFilter=key;return input;});
    container.querySelector=selector=>nodes.get(selector)||null;container.querySelectorAll=selector=>selector==='[data-rv-filter]'?inputs:[];container.contains=node=>inputs.includes(node)||[...nodes.values()].includes(node);container.ownerDocument=document;
    nodes.get('.rv-collection-results').querySelector=()=>null;
    return {container,inputs,nodes,query:inputs[0],results:nodes.get('.rv-collection-results')};
  }
  return {api:window.EnrollmentRecordViews,window,document,writes,prefs,modeHandlers,chipHandlers,pageHandlers,form,collection,flush(){for(const fn of timers.values())fn();timers.clear();}};
}

test('filtros locales combinan tipo, nombre y fecha sin mutar los documentos autorizados',()=>{
  const {api}=harness(),items=[{id:'a',kind:'signed',name:'Ficha Álvarez.pdf',at:'2026-03-10T12:00:00Z'},{id:'b',kind:'identity',name:'Documento.pdf',at:'2026-03-11T12:00:00Z'},{id:'c',kind:'signed',name:'Otra ficha.pdf',at:null}];const snapshot=JSON.stringify(items);
  assert.deepEqual(plain(api.filterItems(items,'documents',{q:'alvarez',kind:'signed',from:'2026-03-10',to:'2026-03-10'})).map(x=>x.id),['a']);
  assert.equal(api.filterItems(items,'documents',{kind:'support'}).length,0);assert.equal(api.filterItems(items,'documents',{from:'2026-04-01',to:'2026-01-01'}).length,0);
  assert.equal(api.filterItems(items,'documents',{from:'2026-03-10'}).length,2);assert.equal(JSON.stringify(items),snapshot);
});

test('historial combina acción, responsable y fechas; revisión numérica busca versión exacta',()=>{
  const {api}=harness(),events=[{action:'transfer',actor:'Secretaría sintética',at:'2026-03-10T12:00:00Z'},{action:'enroll',actor:'Dirección sintética',at:'2026-03-11T12:00:00Z'}];
  assert.equal(api.filterItems(events,'events',{q:'cambio de curso',actor:'Secretaría sintética'}).length,1);assert.equal(api.filterItems(events,'events',{action:'transfer',actor:'Dirección sintética'}).length,0);
  const revisions=[{version:2,at:'2026-03-01T12:00:00Z'},{version:12,at:'2026-03-02T12:00:00Z'}];assert.deepEqual(plain(api.filterItems(revisions,'revisions',{q:'2'})).map(x=>x.version),[2]);assert.equal(api.filterItems(revisions,'revisions',{q:'2026'}).length,0);
  assert.equal(api.localDay('invalid'),'');assert.equal(api.normalize('  AUTORIZACIÓN  Escolar '),'autorizacion escolar');
});

test('cambiar la presentación conserva nodos, borrador, caret, autoguardado y permisos',()=>{
  const h=harness(),f=h.form(),original=f.inputs[0];let autoSaveCalls=0;f.container.addEventListener('input',()=>autoSaveCalls++);
  h.api.setContext({userId:'admin',recordId:'student-a',year:2026});h.api.enhanceRecordView(f.container,'ficha');
  original.value='Cambio local sin guardar';h.document.activeElement=original;f.container.emit('input',original);h.modeHandlers.get('record-form-view')('continuous');
  assert.equal(f.inputs[0],original);assert.equal(original.value,'Cambio local sin guardar');assert.equal(original.selectionStart,3);assert.equal(original.selectionEnd,3);assert.equal(autoSaveCalls,1);assert(f.sections.slice(0,2).every(x=>x.open));
  assert.equal(f.inputs[2].disabled,true);assert.equal(f.inputs[2].readOnly,true);assert.equal(f.inputs[3].label.hidden,true);
  h.modeHandlers.get('record-form-view')('sections');assert.equal(f.sections[0].open,true);assert.equal(f.sections[1].open,false);
  assert.deepEqual(h.writes.map(x=>[x.user,x.section,x.mode]),[['admin','record-form','continuous'],['admin','record-form','sections']]);
});

test('filtro sin respuesta conserva campo activo hasta blur y muestra vacío útil sin cambiar valores',()=>{
  const h=harness(),f=h.form();h.api.setContext({userId:'admin',recordId:'student-a',year:2026});h.api.enhanceRecordView(f.container,'ficha');
  const completion=f.toolbar.querySelector('[data-rv-completion]'),query=f.toolbar.querySelector('[data-rv-question-search]');completion.value='missing';h.document.activeElement=completion;f.container.emit('change',completion);
  assert.equal(f.inputs[0].label.hidden,true);assert.equal(f.inputs[1].label.hidden,false);const input=f.inputs[1];h.document.activeElement=input;input.value='correo@synthetic.invalid';input.selectionStart=8;f.container.emit('input',input);
  assert.equal(input.label.hidden,false);assert.equal(input.selectionStart,8);h.document.activeElement=query;f.container.emit('focusout',input);h.flush();assert.equal(input.label.hidden,true);assert.equal(f.toolbar.querySelector('.rv-question-empty').hidden,false);
  query.value='consulta inexistente';f.container.emit('input',query);assert.equal(input.value,'correo@synthetic.invalid');f.toolbar.querySelector('[data-rv-reset]').emit('click');assert.equal(input.label.hidden,false);assert.equal(f.inputs[3].label.hidden,true);
});

test('buscar preguntas no busca respuestas privadas; invalid revela el campo sin alterar validación',()=>{
  const h=harness(),f=h.form();h.api.enhanceRecordView(f.container,'ficha');const query=f.toolbar.querySelector('[data-rv-question-search]');h.document.activeElement=query;
  query.value='Ana sintética';f.container.emit('input',query);assert(f.inputs.slice(0,3).every(x=>x.label.hidden));
  query.value='correo';f.container.emit('input',query);assert.equal(f.inputs[1].label.hidden,false);assert.equal(f.inputs[0].label.hidden,true);
  f.container.emit('invalid',f.inputs[0]);assert.equal(f.inputs[0].label.hidden,false);assert.equal(f.sections[0].open,true);assert.equal(f.inputs[0].value,'Ana sintética');
});

test('controles de ficha no se duplican y sus filtros se aíslan por estudiante/año/cuenta y logout',()=>{
  const h=harness(),f=h.form();h.api.setContext({userId:'one',recordId:'record-a',year:2026});const first=h.api.enhanceRecordView(f.container,'ficha');assert.equal(h.api.enhanceRecordView(f.container,'ficha'),first);
  const query=f.toolbar.querySelector('[data-rv-question-search]');query.value='correo';h.document.activeElement=query;f.container.emit('input',query);
  h.api.setContext({userId:'one',recordId:'record-b',year:2026});const other=h.form();h.api.enhanceRecordView(other.container,'ficha');assert.equal(other.toolbar.querySelector('[data-rv-question-search]').value,'');
  h.api.setContext({userId:'one',recordId:'record-a',year:2026});const same=h.form();h.api.enhanceRecordView(same.container,'ficha');assert.equal(same.toolbar.querySelector('[data-rv-question-search]').value,'correo');
  h.api.reset();h.api.setContext({userId:'one',recordId:'record-a',year:2026});const after=h.form();h.api.enhanceRecordView(after.container,'ficha');assert.equal(after.toolbar.querySelector('[data-rv-question-search]').value,'');assert.deepEqual(h.writes,[]);
  h.api.enhanceRecordView(f.container,'documents');assert.equal(f.toolbar.removed,true);assert.equal(f.container.listeners.get('input').size,0);
});

test('documentos filtran desde la primera página y conservan los controles originales de descarga',()=>{
  const h=harness(),c=h.collection();h.api.setContext({userId:'admin',recordId:'record',year:2026});const documents=Array.from({length:12},(_,i)=>({id:'id-'+i,name:i===0?'Único.pdf':'Otro '+i+'.pdf',kind:'identity',at:'2026-03-01T12:00:00Z'}));
  const row=item=>`<div class="file-row"><strong>${item.name}</strong><button data-action="download-document" data-id="${item.id}" data-name="${item.name}">Descargar</button></div>`;
  h.api.paintDocuments(c.container,'record-documents',documents,row,{label:'documentos'});h.pageHandlers.get('record-documents')({page:2,pageSize:10});assert(c.results.innerHTML.includes('id-10'));assert(!c.results.innerHTML.includes('Único.pdf'));
  c.query.value='único';c.container.emit('input',c.query);assert(c.results.innerHTML.includes('data-id="id-0"'));assert(c.results.innerHTML.includes('data-name="Único.pdf"'));assert(!c.results.innerHTML.includes('id-10'));assert.equal(c.query.value,'único');
  h.modeHandlers.get('record-documents-view')('cards');assert.equal(c.results.className,'rv-collection-results rv-documents rv-mode-cards');assert.equal(c.query.value,'único');assert(c.results.innerHTML.includes('data-action="download-document"'));
  assert.deepEqual(h.writes.map(x=>[x.user,x.section,x.mode]),[['admin','record-documents','cards']]);
});

test('metadatos ausentes, colecciones vacías y texto inesperado no inventan registros',()=>{
  const h=harness(),c=h.collection();h.api.paintDocuments(c.container,'record-documents',[],()=>{throw Error('Invented a row');},{empty:'Sin documentos visibles con tus permisos.',label:'documentos'});
  assert(c.results.innerHTML.includes('Sin documentos visibles con tus permisos.'));assert.equal(c.nodes.get('.rv-result-status').textContent,'0 de 0 documentos');
  assert.equal(h.api.filterItems(null,'events',{}).length,0);assert.equal(h.api.filterItems([{name:'<script>',kind:'identity',at:null}],'documents',{from:'2026-01-01'}).length,0);
});
