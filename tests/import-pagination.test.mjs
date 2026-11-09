import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
function syntheticPreview(count=70){
  return {ticket:'revision-sintetica',year:2026,canImport:true,summary:{new:0,unchanged:0,updates:count,review:0},
    rows:Array.from({length:count},(_,index)=>({sourceSheet:'Planilla ficticia',rowNumber:index+2,courseId:'curso-sintetico',data:{names:'Estudiante sintético '+index,surname:'Ejemplo',identifierType:'Otro',identifier:'FICTICIO-'+index},review:{kind:'update',changes:[{label:'Contacto ficticio',before:'Prueba anterior',after:'Prueba actual'}]}})),
    errors:Array.from({length:29},(_,index)=>({sheet:'Planilla ficticia',row:index+2,message:'Observación sintética '+index})),
    warnings:Array.from({length:35},(_,index)=>({sheet:'Planilla ficticia',row:index+2,message:'Advertencia sintética '+index})),
    coursesToCreate:Array.from({length:28},(_,index)=>({name:'Curso ficticio '+index})),courses:[{id:'curso-sintetico',name:'Curso de prueba'}]};
}
function fixture({data=syntheticPreview(),preferences=new Map()}={}){
  const state={user:{id:'persona-sintetica',allCourses:true},importKind:'school',importPreview:data,importTicket:'revision-sintetica'};
  const callbacks=new Map(),details={open:false,ontoggle:null};let refreshes=0;
  const preview={innerHTML:'',onchange:null,querySelector:selector=>selector==='[data-import-warnings]'?details:null};
  const viewKey=(user,section)=>JSON.stringify([user,section]);
  const views={get:(user,section,modes,fallback)=>modes.includes(preferences.get(viewKey(user,section)))?preferences.get(viewKey(user,section)):fallback,
    set:(user,section,mode)=>preferences.set(viewKey(user,section),mode),html:({id,value})=>`<div data-view-control="${id}" data-current-mode="${value}"></div>`,bind:(_root,id,onChange)=>callbacks.set('view:'+id,onChange),chips:()=>'',bindChips:(_root,id,onChange)=>callbacks.set('chips:'+id,onChange)};
  const context=createContext({window:{EnrollmentViews:views},EnrollmentViews:views,state,esc:escape,can:()=>true,courseName:()=> 'Curso ficticio',
    $:selector=>selector==='#import-preview'?preview:null,refreshImportCommit:()=>refreshes++});
  runInContext(read('pagination.js'),context);
  context.EnrollmentPagination={...context.window.EnrollmentPagination,bind:(_root,id,onChange)=>callbacks.set(id,onChange)};
  runInContext(read('import-preview.js')+'\nglobalThis.ui={renderImportPreview,selectedImportUpdates,selectedImportAnnual,importPreviewWorkspace};',context);
  const render=()=>context.ui.renderImportPreview();
  const page=(id,number,pageSize=id==='import-rows'?25:10)=>callbacks.get(id)({page:number,pageSize});
  const check=(index,checked=true)=>preview.onchange({target:{id:'',dataset:{importUpdate:String(index)},checked}});
  const selected=()=>Array.from(context.ui.selectedImportUpdates());
  const visible=()=>[...preview.innerHTML.matchAll(/data-import-update="(\d+)"/g)].map(match=>Number(match[1]));
  const filter=(key,value)=>preview.onchange({target:{id:'',dataset:{importFilter:key},value}});
  const listFilter=(key,value)=>preview.onchange({target:{id:'',dataset:{importListFilter:key},value}});
  const mode=value=>callbacks.get('view:import-preview-mode')(value);
  const removeFilter=key=>callbacks.get('chips:import-preview-filters')({key,clear:false});
  const clearFilters=()=>callbacks.get('chips:import-preview-filters')({clear:true});
  const workspace=()=>context.ui.importPreviewWorkspace();
  const visibleRows=()=>[...preview.innerHTML.matchAll(/data-import-row="(\d+)"/g)].map(match=>Number(match[1]));
  render();return {state,context,preview,details,page,check,selected,visible,visibleRows,render,filter,listFilter,mode,removeFilter,clearFilters,workspace,preferences,getRefreshes:()=>refreshes};
}

test('importación muestra 25 filas con sus índices originales y pagina hasta la última',()=>{
  const f=fixture();assert.deepEqual(f.visible(),Array.from({length:25},(_,index)=>index));
  f.page('import-rows',2);assert.deepEqual(f.visible(),Array.from({length:25},(_,index)=>index+25));
  f.page('import-rows',99);assert.deepEqual(f.visible(),Array.from({length:20},(_,index)=>index+50));
  assert.match(f.preview.innerHTML,/data-pagination="import-rows" data-page="3"/);
  assert.equal(f.state.importPreview.rows.length,70,'Paginar no modifica el lote completo.');
});

test('selección de cambios de distintas páginas se conserva al regresar y se puede quitar',()=>{
  const f=fixture();f.check(2);f.page('import-rows',2);f.check(29);
  assert.deepEqual(f.selected(),[2,29]);
  f.page('import-warnings',2);assert.deepEqual(f.selected(),[2,29]);
  assert.match(f.preview.innerHTML,/data-import-update="29"[^>]*\bchecked\b/);
  f.page('import-rows',1);assert.match(f.preview.innerHTML,/data-import-update="2"[^>]*\bchecked\b/);
  f.check(2,false);assert.deepEqual(f.selected(),[29]);assert.ok(f.getRefreshes()>3);
});

test('observaciones, advertencias y cursos son accesibles completos, sin recortes definitivos',()=>{
  const f=fixture();
  assert.match(f.preview.innerHTML,/Observación sintética 0</);assert.doesNotMatch(f.preview.innerHTML,/Observación sintética 10</);
  f.page('import-errors',3);assert.match(f.preview.innerHTML,/Observación sintética 28</);assert.doesNotMatch(f.preview.innerHTML,/Observación sintética 0</);
  f.page('import-warnings',4);assert.match(f.preview.innerHTML,/Advertencia sintética 34</);assert.doesNotMatch(f.preview.innerHTML,/Advertencia sintética 0</);
  f.page('import-courses',3);assert.match(f.preview.innerHTML,/Curso ficticio 27</);assert.doesNotMatch(f.preview.innerHTML,/Curso ficticio 0</);
  assert.equal(f.state.importPreview.errors.length,29);assert.equal(f.state.importPreview.warnings.length,35);assert.equal(f.state.importPreview.coursesToCreate.length,28);
});

test('crear cursos y apertura de advertencias sobreviven a cambios de páginas independientes',()=>{
  const f=fixture();f.preview.onchange({target:{id:'create-import-courses',dataset:{},checked:true}});
  f.details.open=true;f.details.ontoggle();f.page('import-errors',2);f.page('import-warnings',3);
  assert.match(f.preview.innerHTML,/id="create-import-courses"[^>]*\bchecked\b/);
  assert.match(f.preview.innerHTML,/<details[^>]*data-import-warnings open>/);
  assert.match(f.preview.innerHTML,/data-pagination="import-errors" data-page="2"/);
  assert.match(f.preview.innerHTML,/data-pagination="import-warnings" data-page="3"/);
});

test('nueva previsualización o persona reinicia selección y páginas; ticket vencido no aplica cambios',()=>{
  const f=fixture();f.check(4);f.page('import-rows',2);f.state.importTicket=null;
  assert.deepEqual(f.selected(),[]);f.check(30);assert.deepEqual(f.selected(),[]);
  f.state.importTicket='revision-sintetica';assert.deepEqual(f.selected(),[4],'No debe incorporar una selección realizada después de invalidar la revisión.');
  f.state.importPreview=syntheticPreview();f.state.importTicket='revision-sintetica';f.render();
  assert.deepEqual(f.selected(),[]);assert.deepEqual(f.visible(),Array.from({length:25},(_,index)=>index));
  f.check(5);f.state.user={id:'otra-persona-sintetica',allCourses:true};f.render();assert.deepEqual(f.selected(),[]);
});

test('ignora índices manipulados y filas que no son actualizaciones aplicables',()=>{
  const f=fixture();f.state.importPreview.rows[3].review.kind='match';
  for(const index of [3,-1,70,2.5,'incorrecto'])f.check(index);
  assert.deepEqual(f.selected(),[]);
  f.check(2);f.state.importPreview.rows[2].review.kind='review';assert.deepEqual(f.selected(),[]);
});

test('matrículas anuales requieren selección explícita, conservan páginas y no se confunden con cambios de contacto',()=>{
  const f=fixture();f.state.importPreview.year=2019;f.state.importPreview.summary.annual=2;
  for(const index of [2,29])f.state.importPreview.rows[index].review={kind:'annual',reason:'Nueva matrícula anual 2019'};
  f.render();assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[]);
  const choose=index=>f.preview.onchange({target:{id:'',dataset:{importAnnual:String(index)},checked:true}});
  choose(2);f.page('import-rows',2);choose(29);choose(0);choose(-1);
  assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[2,29]);assert.deepEqual(f.selected(),[]);
  f.page('import-rows',1);assert.match(f.preview.innerHTML,/data-import-annual="2"[^>]*\bchecked\b/);
  assert.match(f.preview.innerHTML,/conservar los otros años/);
  f.state.importTicket=null;assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[]);
});

test('año detectado diferente al elegido queda visible antes de confirmar sin cambiar el contexto global',()=>{
  const f=fixture();f.state.year=2026;Object.assign(f.state.importPreview,{year:2019,yearContext:{selectedYear:2026,sourceYears:[2019],resolvedYear:2019,source:'file',conflict:true}});
  f.render();assert.match(f.preview.innerHTML,/Año de destino: 2019/);assert.match(f.preview.innerHTML,/Habías seleccionado 2026/);
  assert.match(f.preview.innerHTML,/selector superior cambiará a 2019 cuando confirmes/);assert.equal(f.state.year,2026);
});

test('una matrícula anual omitida no obliga a crear su curso al guardar otra ficha válida',()=>{
  const f=fixture(),source=read('app.js');
  runInContext(source.slice(source.indexOf('function importReady(){'),source.indexOf('function refreshImportCommit('))+'\nglobalThis.canCommit=importReady;',f.context);
  const p=f.state.importPreview;f.state.importRows=p.rows;
  p.summary.new=1;p.rows[0].review={kind:'new'};p.rows[2].review={kind:'annual'};p.rows[2].courseId=null;
  p.errors=[{code:'CURSO_NO_RESUELTO',row:4}];
  assert.equal(f.context.canCommit(),true,'La nueva ficha ya tiene curso y la anual está omitida.');
  f.preview.onchange({target:{id:'',dataset:{importAnnual:'2'},checked:true}});
  assert.equal(f.context.canCommit(),false,'Seleccionar la anual exige confirmar su curso faltante.');
  f.preview.onchange({target:{id:'',dataset:{importAnnual:'2'},checked:false}});
  assert.equal(f.context.canCommit(),true);
});

test('filtrar busca en las 500 filas originales y reinicia solo la página de estudiantes',()=>{
  const f=fixture({data:syntheticPreview(500)}),rows=f.state.importPreview.rows,ticket=f.state.importTicket;
  f.page('import-rows',12);f.page('import-errors',3);f.page('import-warnings',4);
  f.filter('q','ficticio-499');assert.deepEqual(f.visibleRows(),[499]);assert.deepEqual(f.visible(),[499]);
  assert.equal(f.workspace().rows.page,1);assert.equal(f.workspace().errors.page,3);assert.equal(f.workspace().warnings.page,4);
  assert.strictEqual(f.state.importPreview.rows,rows);assert.equal(f.state.importPreview.rows.length,500);assert.equal(f.state.importTicket,ticket);
  f.filter('q','ninguna persona corresponde');assert.deepEqual(f.visibleRows(),[]);
  assert.match(f.preview.innerHTML,/500 estudiantes revisados/);assert.match(f.preview.innerHTML,/29 observaciones/);assert.match(f.preview.innerHTML,/35 advertencias/);
  f.filter('q','');f.page('import-rows',20);assert.deepEqual(f.visibleRows(),Array.from({length:25},(_,i)=>475+i));
});

test('resultado, hoja y curso propuesto combinan filtros sin confundir cursos resueltos',()=>{
  const p=syntheticPreview();
  for(const [index,row] of p.rows.entries()){
    row.sourceSheet=index%3===0?'Hoja B':'Hoja A';row.review={kind:['new','annual','update','match','review'][index%5],changes:[]};
    if(index%2){row.courseId=null;row.courseName='7° Básico';row.section='B';}
  }
  const f=fixture({data:p});
  f.filter('kind','annual');f.filter('sheet','Hoja B');f.filter('course','proposal:'+JSON.stringify(['7° Básico','B']));
  assert.deepEqual(f.visibleRows(),[21,51]);
  f.filter('q','SINTÉTICO 51');assert.deepEqual(f.visibleRows(),[51]);
  f.filter('q','');f.filter('course','id:curso-sintetico');assert.deepEqual(f.visibleRows(),[6,36,66]);
  assert.equal(p.rows.length,70);assert.equal(p.rows[51].review.kind,'annual');
});

test('observaciones enlazan hoja y fila, incluyen avisos de hoja completa y no se cruzan entre hojas',()=>{
  const p=syntheticPreview(6);p.coursesToCreate=[];
  for(const [index,row] of p.rows.entries()){row.sourceSheet=index<3?'Hoja A':'Hoja B';row.rowNumber=index%3+2;}
  p.errors=[{sheet:'Hoja A',row:2,code:'DATO_INVALIDO',message:'Error solo en A2'},{sheet:'Hoja B',row:0,code:'HOJA_NO_RECONOCIDA',message:'Toda la hoja B'},{code:'ERROR_GLOBAL',message:'Una revisión global'}];
  p.warnings=[{sheet:'Hoja A',row:3,message:'Aviso solo en A3'}];
  const f=fixture({data:p});
  f.filter('issues','errors');assert.deepEqual(f.visibleRows(),[0,3,4,5]);
  f.filter('issues','warnings');assert.deepEqual(f.visibleRows(),[1]);
  f.filter('issues','any');assert.deepEqual(f.visibleRows(),[0,1,3,4,5]);
  f.filter('issues','clean');assert.deepEqual(f.visibleRows(),[2]);
  assert.match(f.preview.innerHTML,/Una revisión global/);assert.match(f.preview.innerHTML,/3 observaciones/);
});

test('selecciones de índices ocultos sobreviven a las tres vistas y a sus filtros sin alterar el ticket completo',()=>{
  const p=syntheticPreview(500);p.errors=[];p.warnings=[];p.rows[499].review={kind:'annual'};
  const f=fixture({data:p}),serialized=JSON.stringify(p),ticket=f.state.importTicket;
  f.check(4);f.page('import-rows',20);f.preview.onchange({target:{id:'',dataset:{importAnnual:'499'},checked:true}});
  f.preview.onchange({target:{id:'create-import-courses',dataset:{},checked:true}});
  for(const mode of ['cards','compact','table']){
    f.mode(mode);f.filter('q','FICTICIO-499');assert.deepEqual(f.visibleRows(),[499]);assert.deepEqual(f.selected(),[4]);assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[499]);
    assert.match(f.preview.innerHTML,/data-import-annual="499"[^>]*\bchecked\b/);
    f.filter('q','FICTICIO-4');assert.ok(f.visibleRows().includes(4));assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[499]);
    assert.equal(f.workspace().mode,mode);assert.equal(f.workspace().createCourses,true);
  }
  assert.equal(JSON.stringify(p),serialized);assert.equal(f.state.importTicket,ticket);assert.strictEqual(f.state.importRows,undefined);
  f.state.importTicket=null;f.mode('cards');f.filter('q','FICTICIO-499');assert.deepEqual(f.selected(),[]);assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[]);
});

test('cambiar vista conserva página, filtros y confirmación de cursos; otra revisión reinicia filtros y conserva la preferencia de esa persona',()=>{
  const f=fixture();f.check(2);f.filter('q','sintético');f.page('import-rows',2);f.mode('cards');
  assert.equal(f.workspace().rows.page,2);assert.equal(f.workspace().filters.q,'sintético');assert.deepEqual(f.selected(),[2]);
  f.state.importPreview=syntheticPreview();f.render();assert.equal(f.workspace().mode,'cards');assert.equal(f.workspace().rows.page,1);assert.equal(f.workspace().filters.q,'');assert.deepEqual(f.selected(),[]);
  f.filter('kind','update');f.state.user={id:'otra-persona',allCourses:true};f.render();assert.equal(f.workspace().mode,'table');assert.equal(f.workspace().filters.kind,'');assert.deepEqual(f.selected(),[]);
  f.mode('compact');f.state.user={id:'persona-sintetica',allCourses:true};f.render();assert.equal(f.workspace().mode,'cards');
});

test('buscar en observaciones, advertencias y cursos solo reinicia su propia paginación y no borra totales',()=>{
  const f=fixture();f.page('import-rows',3);f.page('import-errors',3);f.page('import-warnings',4);f.page('import-courses',3);
  f.listFilter('errors','Observación sintética 28');assert.match(f.preview.innerHTML,/Observación sintética 28</);assert.doesNotMatch(f.preview.innerHTML,/Observación sintética 27</);
  assert.equal(f.workspace().errors.page,1);assert.equal(f.workspace().rows.page,3);assert.equal(f.workspace().warnings.page,4);assert.equal(f.workspace().courses.page,3);
  f.listFilter('warnings','Advertencia sintética 34');assert.match(f.preview.innerHTML,/Advertencia sintética 34</);assert.equal(f.workspace().warnings.page,1);
  f.listFilter('courses','Curso ficticio 27');assert.match(f.preview.innerHTML,/Curso ficticio 27</);assert.equal(f.workspace().courses.page,1);
  assert.match(f.preview.innerHTML,/29 observaciones/);assert.match(f.preview.innerHTML,/35 advertencias/);assert.equal(f.state.importPreview.coursesToCreate.length,28);
});

test('ningún filtro ni modo elimina un error global que bloquea la confirmación del lote',()=>{
  const p=syntheticPreview();p.summary.new=1;p.rows[0].review={kind:'new'};p.errors=[{code:'IMPORT_YEARS_MIXED',message:'El lote mezcla años y requiere corrección.'}];
  const f=fixture({data:p}),source=read('app.js');f.state.importRows=p.rows;
  runInContext(source.slice(source.indexOf('function importReady(){'),source.indexOf('function refreshImportCommit('))+'\nglobalThis.canCommit=importReady;',f.context);
  for(const mode of ['table','compact','cards']){f.mode(mode);f.filter('issues','clean');f.filter('q','nadie coincide');assert.equal(f.context.canCommit(),false);assert.match(f.preview.innerHTML,/El lote mezcla años y requiere corrección/);assert.equal(f.state.importRows.length,70);}
});

test('la revisión JSON conserva búsqueda, filas originales y observaciones en las tres vistas',()=>{
  const f=fixture(),p={canImport:false,rows:[{index:4,name:'Álvaro Ficticio',issue:''},{index:8,name:'Persona con observación',issue:'Falta un campo obligatorio.'}]};
  f.state.importKind='json';f.state.importPreview=p;f.state.importTicket=null;f.render();
  for(const mode of ['table','compact','cards']){
    f.mode(mode);f.filter('q','ALVARO');assert.deepEqual(f.visibleRows(),[0]);assert.match(f.preview.innerHTML,/Álvaro Ficticio/);assert.match(f.preview.innerHTML,/Falta un campo obligatorio/);
    f.filter('q','');f.filter('issues','errors');assert.deepEqual(f.visibleRows(),[1]);f.filter('issues','');
  }
  assert.equal(p.rows[0].index,4);assert.equal(p.rows[1].index,8);assert.deepEqual(f.selected(),[]);assert.deepEqual(Array.from(f.context.ui.selectedImportAnnual()),[]);
});

test('quitar un filtro o limpiarlos todos conserva la vista, los tamaños y las selecciones del lote',()=>{
  const f=fixture(),ticket=f.state.importTicket,original=f.state.importPreview.rows;
  f.check(2);f.page('import-rows',2);f.check(29);f.mode('compact');
  f.filter('kind','update');f.filter('sheet','Planilla ficticia');f.filter('q','FICTICIO-2');f.page('import-rows',2,5);
  f.removeFilter('q');assert.equal(f.workspace().filters.q,'');assert.equal(f.workspace().filters.kind,'update');assert.equal(f.workspace().filters.sheet,'Planilla ficticia');assert.equal(f.workspace().rows.page,1);assert.equal(f.workspace().rows.pageSize,5);
  f.clearFilters();assert.deepEqual(JSON.parse(JSON.stringify(f.workspace().filters)),{q:'',kind:'',sheet:'',course:'',issues:''});
  assert.equal(f.workspace().mode,'compact');assert.equal(f.workspace().rows.pageSize,5);assert.deepEqual(f.selected(),[2,29]);assert.equal(f.state.importTicket,ticket);assert.strictEqual(f.state.importPreview.rows,original);
});
