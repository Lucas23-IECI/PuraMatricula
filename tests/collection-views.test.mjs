import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../public/collections.js',import.meta.url),'utf8');
const paginationSource=readFileSync(new URL('../public/pagination.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const element=()=>({innerHTML:'',textContent:'',values:{},elements:{},setAttribute(){},removeAttribute(){},querySelector(){return null;}});
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};

function fixture({view='courses',api:requestApi}={}){
  const courses=Array.from({length:34},(_,index)=>({id:'course-'+index,year:2026,name:`${index%8+1}° ${index%2?'Medio':'Básico'} ${index<25?'A':'B'}`}));
  courses.push({id:'past',year:2019,name:'1° Básico A'},{id:'future',year:2030,name:'1° Medio B'});
  const users=Array.from({length:35},(_,index)=>({id:'person-'+index,name:'Persona sintética '+String(index).padStart(2,'0'),username:'usuario-'+index,active:index%3!==0,mustChangePassword:index%5===0,permissions:index%2?['read','write']:['read'],allCourses:index%7===0,courses:index%7===0?[]:[index<25?'course-1':'past']}));
  const state={user:{id:'owner-a'},view,year:2026,page:1,auditSnapshot:null,meta:{courses,permissions:['read','write','admin'],permissionLabels:{read:'Consultar',write:'Editar',admin:'Administrar'}},users,accountCourses:courses};
  const elements=new Map(['#content','#course-filter-area','#courses-filters','#courses-views','#courses-count','#courses-list','#prepare-year','#prepare-error','#users-filter-area','#users-filters','#users-views','#users-count','#users-list','#audit-filter-area','#audit-filters','#audit-views','#audit-count','#audit-list','#audit-integrity','#audit-refresh','#audit-filter-error'].map(id=>[id,element()]));
  elements.get('#users-filters').elements={year:element(),course:element()};
  const pagerContext=createContext({window:{}});runInContext(paginationSource,pagerContext);const pager=pagerContext.window.EnrollmentPagination;
  const views=new Map(),chips=new Map(),pages=new Map(),preferences=new Map(),calls=[];
  const response={items:Array.from({length:50},(_,index)=>({id:index+1,at:'2026-11-08T15:00:00Z',actor:'owner-a',actorName:'Persona sintética',action:'record.edit',target:'reference-'+index,detail:{year:2026}})),page:1,pageSize:50,total:125,snapshot:900,integrity:true,facets:{actors:[{id:'owner-a',name:'Persona sintética'}],actions:['record.edit'],modules:['record']}};
  const context=createContext({state,URLSearchParams,FormData:class{constructor(form){this.values=form.values;}get(key){return this.values[key]??'';}},viewRequest:0,
    $:selector=>elements.get(selector)||null,esc:escape,date:value=>value,heading:(title,text,actions='')=>`<h1>${escape(title)}</h1><p>${escape(text)}</p>${actions}`,
    courses:year=>state.meta.courses.filter(course=>course.year===Number(year)),rememberLocation(){},schoolYearRange:()=>({min:1950,max:2100}),setBusy(){},notice(){},applySchoolYear(year){state.year=year;},shell(){},
    showLoading(node){node.innerHTML='Cargando';},loadingError(node,error){node.innerHTML='Error: '+error.message;},
    auditActivityLabels:{'record.edit':'Ficha actualizada'},auditSummary:item=>'Año '+item.detail.year,
    api:async(path,options)=>{calls.push({path,options});if(requestApi)return requestApi(path,options);return path==='/api/users'?{users:structuredClone(users),courses:structuredClone(courses)}:structuredClone(response);},
    EnrollmentViews:{get:(user,id,modes,fallback)=>preferences.get(user+':'+id)||fallback,set:(user,id,mode)=>{preferences.set(user+':'+id,mode);},html:({id,value})=>`<div data-view-control="${id}" data-mode="${value}"></div>`,bind:(_root,id,callback)=>views.set(id,callback),chips:({id,items})=>`<div data-chips="${id}">${items.map(item=>escape(item.label)).join('|')}</div>`,bindChips:(_root,id,callback)=>chips.set(id,callback)},
    EnrollmentPagination:{slice:pager.slice,html:values=>pager.html(values),bind:(_root,id,callback)=>pages.set(id,callback)}
  });
  runInContext(source+'\nglobalThis.ui={collectionViewState,resetCollectionViews,collectionPage,courseLevel,courseSection,filterCourseRows,filterUserRows,renderCourses,renderUsers,renderAudit,drawCourses,drawUsers,drawAuditResult,auditQuery};',context);
  return {state,context,ui:context.ui,elements,views,chips,pages,preferences,calls,response,courses,users,content:elements.get('#content')};
}

test('cursos combina nivel, sección y búsqueda antes de paginar sin incluir otros años',()=>{
  const f=fixture();f.ui.renderCourses();const selection=f.ui.collectionViewState('courses');
  f.elements.get('#courses-filters').values={q:'básico',level:'Básica',section:'B'};
  f.elements.get('#courses-filters').onsubmit({preventDefault(){},currentTarget:f.elements.get('#courses-filters')});
  const rows=f.ui.filterCourseRows(f.courses.filter(course=>course.year===2026),selection.filters);
  assert.ok(rows.length>0);assert.ok(rows.every(course=>course.name.includes('Básico B')));assert.equal(selection.page,1);
  assert.match(f.elements.get('#courses-list').innerHTML,/Básico B/);assert.doesNotMatch(f.elements.get('#courses-list').innerHTML,/Básico A|Medio|2019/);
  assert.equal(f.calls.length,0,'Filtrar cursos locales no necesita otra consulta.');
  assert.equal(f.ui.courseLevel({name:'Apoyo al medio ambiente'}),'');assert.equal(f.ui.courseSection({name:'Taller A'}),'');
  const unknown=f.ui.filterCourseRows([{id:'unknown',name:'Taller A'},{id:'known',name:'1° Básico A'}],{q:'',level:'unclassified',section:'unassigned'});
  assert.deepEqual(plain(unknown).map(course=>course.id),['unknown']);
});

test('cambiar lista y tarjetas conserva filtros y página sin nuevas consultas',()=>{
  const f=fixture();f.ui.renderCourses();const context=f.ui.collectionViewState('courses');
  f.pages.get('courses')({page:3,pageSize:10});assert.equal(context.page,3);
  f.views.get('courses-view')('cards');assert.equal(context.page,3);assert.equal(context.mode,'cards');assert.match(f.elements.get('#courses-list').innerHTML,/collection-card/);
  f.views.get('courses-view')('list');assert.equal(context.page,3);assert.equal(context.mode,'list');assert.equal(f.calls.length,0);
  assert.deepEqual(plain(context.filters),{q:'',level:'',section:''});assert.equal(f.preferences.get('owner-a:courses'),'list');
});

test('los filtros de cuentas cruzan nombre, estado, permiso y asignaciones de todo el conjunto',()=>{
  const f=fixture({view:'users'}),filters={q:'sintetica',active:'active',permission:'write',scope:'assigned',year:'2019',course:'past'};
  const rows=f.ui.filterUserRows(f.users,filters,f.courses);
  assert.ok(rows.length>0);assert.ok(rows.every(user=>Number(user.id.slice(7))>=25&&user.active&&!user.allCourses&&user.permissions.includes('write')));
  const all=f.ui.filterUserRows(f.users,{...filters,q:'',permission:'',scope:'all',active:''},f.courses);
  assert.ok(all.length>0);assert.ok(all.every(user=>user.allCourses),'El alcance global incluye los cursos autorizados de ese año.');
  assert.equal(f.ui.filterUserRows(f.users,{...filters,year:'2050',course:''},f.courses).length,0);
});

test('cuentas cambia de presentación sobre la respuesta cargada y pagina los filtros completos',async()=>{
  const f=fixture({view:'users'});await f.ui.renderUsers();assert.equal(f.calls.length,1);
  const form=f.elements.get('#users-filters');form.values={q:'',active:'',permission:'',scope:'assigned',year:'2019',course:'past'};
  form.onsubmit({preventDefault(){},currentTarget:form});const selection=f.ui.collectionViewState('users');
  const expected=f.ui.filterUserRows(f.users,selection.filters,f.courses).length;assert.ok(expected>0);assert.match(f.elements.get('#users-count').textContent,new RegExp('^'+expected+' de 35'));
  f.views.get('users-view')('compact');f.views.get('users-view')('cards');assert.equal(f.calls.length,1);assert.match(f.elements.get('#users-list').innerHTML,/collection-card/);assert.equal(selection.filters.year,'2019');
  f.chips.get('users-filters')({clear:true});assert.deepEqual(plain(selection.filters),{q:'',active:'',permission:'',scope:'',year:'',course:''});assert.equal(selection.page,1);
});

test('los contextos separan personas y años, sin persistir búsquedas',()=>{
  const f=fixture(),first=f.ui.collectionViewState('courses');first.filters.q='Nombre privado';first.page=3;
  f.state.year=2019;const old=f.ui.collectionViewState('courses');assert.notStrictEqual(first,old);assert.equal(old.filters.q,'');
  f.state.year=2026;assert.strictEqual(f.ui.collectionViewState('courses'),first);
  f.state.user={id:'owner-b'};assert.equal(f.ui.collectionViewState('courses').filters.q,'');
  f.state.user={id:'owner-a'};f.ui.resetCollectionViews();assert.equal(f.ui.collectionViewState('courses').filters.q,'');assert.equal(f.preferences.size,0);
});

test('reiniciar solo el año conserva filtros administrativos globales pero renueva cursos',()=>{
  const f=fixture(),course=f.ui.collectionViewState('courses'),users=f.ui.collectionViewState('users');course.filters.q='Curso previo';users.filters.active='inactive';
  f.ui.resetCollectionViews({yearOnly:true});assert.equal(f.ui.collectionViewState('courses').filters.q,'');assert.strictEqual(f.ui.collectionViewState('users'),users);assert.equal(users.filters.active,'inactive');
});

test('auditoría conserva corte y página al cambiar vista, y manda filtros antes de paginar',async()=>{
  const f=fixture({view:'audit'});await f.ui.renderAudit();const selection=f.ui.collectionViewState('audit');assert.equal(selection.snapshot,900);
  await f.pages.get('audit')({page:2,pageSize:50});assert.equal(f.calls.length,2);assert.match(f.calls[1].path,/snapshot=900/);
  f.response.page=2;selection.page=2;const before=f.calls.length;
  f.views.get('audit-view')('timeline');f.views.get('audit-view')('compact');assert.equal(f.calls.length,before);assert.equal(selection.page,2);assert.equal(selection.snapshot,900);
  const form=f.elements.get('#audit-filters');form.values={q:'sintético',actor:'owner-a',action:'record.edit',module:'record',from:'2026-11-01',to:'2026-11-08'};
  f.response.page=1;await form.onsubmit({preventDefault(){},currentTarget:form});const query=new URL(f.calls.at(-1).path,'http://127.0.0.1').searchParams;
  assert.equal(query.get('q'),'sintético');assert.equal(query.get('actor'),'owner-a');assert.equal(query.get('module'),'record');assert.equal(query.get('from'),'2026-11-01');assert.equal(query.get('to'),'2026-11-08');assert.equal(query.get('page'),'1');assert.equal(query.has('snapshot'),false);assert.equal(selection.mode,'compact');
});

test('respuesta administrativa anterior a salir o cambiar persona no vuelve a poblar estado',async()=>{
  const pending=deferred(),f=fixture({view:'users',api:()=>pending.promise});const rendering=f.ui.renderUsers();
  f.ui.resetCollectionViews();f.state.user={id:'owner-b'};f.state.users=[];pending.resolve({users:f.users,courses:f.courses});await rendering;
  assert.deepEqual(f.state.users,[]);assert.equal(f.content.innerHTML,'Cargando');
});

test('una respuesta de auditoría obsoleta no cambia el corte de la búsqueda más nueva',async()=>{
  const first=deferred(),second=deferred();let count=0;const f=fixture({view:'audit',api:()=>++count===1?first.promise:second.promise});
  const initial=f.ui.renderAudit(),form=f.elements.get('#audit-filters');form.values={q:'nueva',actor:'',action:'',module:'',from:'',to:''};
  const later=form.onsubmit({preventDefault(){},currentTarget:form});second.resolve({...f.response,snapshot:902,total:1,items:[f.response.items[0]]});await later;first.resolve({...f.response,snapshot:901});await initial;
  assert.equal(f.ui.collectionViewState('audit').snapshot,902);assert.match(f.elements.get('#audit-count').textContent,/^1 eventos/);
});
