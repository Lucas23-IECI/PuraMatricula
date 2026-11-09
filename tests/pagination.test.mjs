import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../public/pagination.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const window={};runInContext(source,createContext({window}));return window.EnrollmentPagination;
}
function navigation({id='alumnos',page=2,pageSize=10,pages=8}={}){
  const attributes=new Map(),focus=[];
  return {dataset:{pagination:id,page:String(page),pageSize:String(pageSize),pages:String(pages)},focus,
    getAttribute:key=>attributes.get(key)??null,
    setAttribute:(key,value)=>attributes.set(key,String(value)),removeAttribute:key=>attributes.delete(key),
    querySelector:selector=>({focus:options=>focus.push({selector,options})})};
}
const click=(nav,page,{disabled=false}={})=>nav.onclick({target:{closest:()=>({dataset:{page:String(page)},disabled})}});

test('colección vacía mantiene una página navegable y rango cero, incluso con página fuera de límites',()=>{
  const api=fixture();
  assert.deepEqual(plain(api.normalize({total:0,page:99,pageSize:25})),{total:0,page:1,pageSize:25,pages:1,start:0,end:0});
  const html=api.html({id:'vacío',label:'alumnos',total:0,page:99,pageSize:25});
  assert.match(html,/0–0 de 0 alumnos/);assert.match(html,/Página 1 de 1/);
  assert.match(html,/data-page="0" aria-label="Página anterior" disabled/);
  assert.match(html,/data-page="2" aria-label="Página siguiente" disabled/);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
});

test('datos no finitos y negativos no producen Infinity, NaN ni tamaños de página sin límite',()=>{
  const api=fixture();
  for(const invalid of [Infinity,-Infinity,NaN,'no-numérico']){
    const result=plain(api.normalize({total:invalid,page:invalid,pageSize:invalid}));
    assert.deepEqual(result,{total:0,page:1,pageSize:10,pages:1,start:0,end:0},String(invalid));
  }
  const minimum=plain(api.normalize({total:-8,page:-2,pageSize:0}));
  assert.deepEqual(minimum,{total:0,page:1,pageSize:1,pages:1,start:0,end:0});
  assert.equal(api.normalize({total:250,page:100000,pageSize:100000}).pageSize,100);
  assert.deepEqual(plain(api.normalize({total:'42.9',page:'2.9',pageSize:'10.8'})),{total:42,page:2,pageSize:10,pages:5,start:11,end:20});
});

test('última página incompleta y cambio de total ajustan página y rango sin perder el último elemento',()=>{
  const api=fixture(),items=Array.from({length:23},(_,index)=>({id:'ficticio-'+(index+1)}));
  const result=api.slice(items,{page:300,pageSize:10});
  assert.deepEqual(plain(result),{total:23,page:3,pageSize:10,pages:3,start:21,end:23,items:items.slice(20)});
  const smaller=api.slice(items.slice(0,7),{page:3,pageSize:10});
  assert.equal(smaller.page,1);assert.equal(smaller.start,1);assert.equal(smaller.end,7);
  assert.equal(smaller.items.at(-1).id,'ficticio-7');assert.equal(items.length,23,'Paginar no modifica la colección original.');
});

test('páginas numeradas mantienen extremos, página actual y saltos comprensibles sin un botón por cada página',()=>{
  const api=fixture(),html=api.html({id:'alumnos',label:'alumnos',total:1000,page:50,pageSize:10});
  assert.match(html,/491–500 de 1000 alumnos/);assert.match(html,/Página 50 de 100/);
  for(const page of [1,49,50,51,100])assert.match(html,new RegExp('data-page="'+page+'" aria-label="Página '+page+' de 100"'));
  assert.match(html,/data-page="50" aria-label="Página 50 de 100" aria-current="page"/);
  assert.equal((html.match(/class="pagination-gap"/g)||[]).length,2);
  assert.equal((html.match(/class="pagination-number/g)||[]).length,5,'La navegación no debe crecer con el total de páginas.');
  const last=api.html({id:'alumnos',label:'alumnos',total:23,page:3,pageSize:10});
  assert.match(last,/21–23 de 23 alumnos/);assert.match(last,/data-page="4" aria-label="Página siguiente" disabled/);
});

test('etiquetas e identificadores se escapan y tamaños repetidos o inválidos no generan opciones inseguras',()=>{
  const api=fixture(),label='alumnos <img src=x onerror="alert(1)"> & curso',id='listado" data-action="salir';
  const html=api.html({id,label,total:30,page:1,pageSize:7,sizes:[5,5,25,-1,0,101,Infinity,'10']});
  assert.doesNotMatch(html,/<img|data-action="salir/);
  assert.match(html,/data-pagination="listado&quot; data-action=&quot;salir"/);
  assert.match(html,/aria-label="Paginación de alumnos &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; curso"/);
  assert.match(html,/aria-label="Cantidad de alumnos &lt;img/);
  assert.deepEqual([...html.matchAll(/<option value="(\d+)"/g)].map(match=>Number(match[1])),[5,7,25]);
  assert.match(html,/<option value="7" selected>7<\/option>/);
});

test('vínculos de la página actual y botones deshabilitados no disparan cargas repetidas',async()=>{
  const api=fixture(),nav=navigation(),changes=[];
  api.bind({querySelectorAll:()=>[nav]},'alumnos',selection=>changes.push(plain(selection)));
  click(nav,2);click(nav,3,{disabled:true});await flush();
  assert.deepEqual(changes,[]);assert.equal(nav.getAttribute('aria-busy'),null);
  click(nav,3);await flush();assert.deepEqual(changes,[{page:3,pageSize:10}]);
  assert.equal(nav.getAttribute('aria-busy'),null);assert.equal(nav.focus[0].selector,'[aria-current="page"]');
});

test('cambiar cantidad vuelve a página uno, impide doble carga durante la espera y recupera foco en la navegación nueva',async()=>{
  const api=fixture(),oldNav=navigation({page:8}),newNav=navigation({page:1,pageSize:25}),other=navigation({id:'otra-lista'}),changes=[];
  let current=oldNav,complete;const pending=new Promise(resolve=>complete=resolve);
  const root={querySelectorAll:()=>[other,current]};
  api.bind(root,'alumnos',async selection=>{changes.push(plain(selection));await pending;current=newNav;});
  oldNav.onchange({target:{matches:selector=>selector==='select[data-page-size]',value:'25'}});
  assert.equal(oldNav.getAttribute('aria-busy'),'true');
  click(oldNav,7);oldNav.onchange({target:{matches:()=>true,value:'50'}});
  assert.deepEqual(changes,[{page:1,pageSize:25}]);
  complete();await flush();
  assert.equal(oldNav.getAttribute('aria-busy'),null);
  assert.equal(oldNav.focus.length,0);assert.equal(newNav.focus.length,1);assert.equal(other.focus.length,0);
  assert.deepEqual(plain(newNav.focus[0]),{selector:'select',options:{preventScroll:true}});
});

test('enlazar una colección ausente no instala controladores en otra lista',()=>{
  const api=fixture(),other=navigation({id:'otra-lista'});
  api.bind({querySelectorAll:()=>[other]},'alumnos',()=>{throw Error('No se debe invocar');});
  assert.equal(other.onclick,undefined);assert.equal(other.onchange,undefined);
});

test('una página tardía no quita el foco de la búsqueda ni enfoca un módulo abandonado',async()=>{
  for(const reason of ['search','detached']){
    const api=fixture(),nav=navigation(),body={},searchInput={};let complete;
    const pending=new Promise(resolve=>complete=resolve),document={body,activeElement:body};
    nav.contains=()=>false;
    const root={isConnected:true,ownerDocument:document,querySelectorAll:()=>[nav]};
    api.bind(root,'alumnos',()=>pending);
    click(nav,3);
    if(reason==='search')document.activeElement=searchInput;else root.isConnected=false;
    complete();await flush();
    assert.equal(nav.focus.length,0,reason);
    assert.equal(nav.getAttribute('aria-busy'),null,reason);
    if(reason==='search')assert.strictEqual(document.activeElement,searchInput);
  }
});

test('la navegación nueva recupera foco cuando el reemplazo dejó activo el cuerpo de la página',async()=>{
  const api=fixture(),oldNav=navigation(),newNav=navigation({page:3}),body={},document={body,activeElement:body};
  let current=oldNav;const root={isConnected:true,ownerDocument:document,querySelectorAll:()=>[current]};
  api.bind(root,'alumnos',()=>{current=newNav;});click(oldNav,3);await flush();
  assert.equal(newNav.focus.length,1);assert.equal(newNav.focus[0].selector,'[aria-current="page"]');
  assert.equal(oldNav.focus.length,0);
});
