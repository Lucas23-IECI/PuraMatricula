import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read = name => readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

function fixture(){
  const state={user:{id:'persona-a',permissions:['read','write','documents','enroll','export','admin','import','audit','backup']},meta:{},view:'reports',year:2026,record:null,tab:'ficha',conflict:false};
  const context=createContext({state,can:permission=>state.user?.permissions.includes(permission)});
  runInContext(read('help.js')+'\n'+read('reports.js')+'\nglobalThis.ui={reportsView,enrollmentHelpTopic,enrollmentHelpStepAllowed,enrollmentDialogHelpTopic,enrollmentHelpTopics};',context);
  return {state,context,ui:context.ui};
}

test('estadísticas conserva la selección al abrir detalle, volver a renderizar y paginar',()=>{
  const {ui}=fixture(),selection=ui.reportsView();
  Object.assign(selection,{course:'curso-a',status:'enrolled',q:'Ficticio',pending:'1',showRows:true,page:3});
  const next=ui.reportsView();
  assert.strictEqual(next,selection,'Un render de la misma pantalla no debe reemplazar la selección activa.');
  assert.equal(next.course,'curso-a');assert.equal(next.status,'enrolled');assert.equal(next.q,'Ficticio');
  assert.equal(next.pending,'1');assert.equal(next.showRows,true);assert.equal(next.page,3);
  next.page++;
  assert.equal(ui.reportsView().page,4);
});

test('estadísticas reinicia selección al cambiar persona, año o módulo sin heredar filtros ajenos',()=>{
  for(const change of ['person','year','view']){
    const {state,ui}=fixture(),previous=ui.reportsView();
    Object.assign(previous,{course:'privado-a',status:'withdrawn',q:'busqueda previa',pending:'1',showRows:true,page:5});
    if(change==='person')state.user={...state.user,id:'persona-b'};
    if(change==='year')state.year=2027;
    if(change==='view')state.view='pending';
    const next=ui.reportsView();
    assert.notStrictEqual(next,previous,change);
    assert.equal(next.userId,state.user.id);assert.equal(next.year,state.year);assert.equal(next.view,state.view);
    assert.equal(next.course,'');assert.equal(next.status,'');assert.equal(next.q,'');assert.equal(next.page,1);
    assert.equal(next.pending,change==='view'?'1':'');assert.equal(next.showRows,change==='view');
    assert.strictEqual(ui.reportsView(),next,'El nuevo contexto también conserva su propia selección.');
  }
});

test('ayuda identifica los nueve módulos y las cuatro áreas con contenido propio',()=>{
  const {state,ui}=fixture();
  for(const view of ['students','followup','organization','administration','records','pending','reports','courses','users','templates','import','audit','backup']){
    state.view=view;
    assert.equal(ui.enrollmentHelpTopic(),view);
    const steps=ui.enrollmentHelpTopics[view];
    assert.ok(steps?.length>=2,'Falta contenido suficiente para '+view);
    const visible=steps.filter(step=>ui.enrollmentHelpStepAllowed(step[2]));
    assert.ok(visible.length,'No hay ayuda visible en '+view);
    for(const [title,description] of visible){assert.ok(title.trim());assert.ok(description.trim().length>30);}
  }
});

test('ayuda distingue acceso, contraseña temporal, cuenta sin módulos y estados del expediente',()=>{
  const {state,ui}=fixture();
  state.user=null;state.meta=null;
  assert.equal(ui.enrollmentHelpTopic(),'login');
  state.user={id:'persona',permissions:['read'],mustChangePassword:true};
  assert.equal(ui.enrollmentHelpTopic(),'password');
  state.user.mustChangePassword=false;state.meta={};state.view='empty';
  assert.equal(ui.enrollmentHelpTopic(),'empty');
  assert.notDeepEqual(Array.from(ui.enrollmentHelpTopics.empty),Array.from(ui.enrollmentHelpTopics.records));
  state.view='home';state.user.permissions=[];
  assert.equal(ui.enrollmentHelpTopic(),'homeEmpty');
  assert.equal(ui.enrollmentHelpTopics.homeEmpty.length,1);
  state.user.permissions=['admin'];assert.equal(ui.enrollmentHelpTopic(),'home');
  state.user.permissions=['read'];assert.equal(ui.enrollmentHelpTopic(),'home');
  state.record={status:'enrolled'};
  for(const [tab,expected] of [['ficha','record'],['documents','documents'],['history','history']]){
    state.tab=tab;assert.equal(ui.enrollmentHelpTopic(),expected);
  }
  state.tab='ficha';state.record.status='withdrawn';
  assert.equal(ui.enrollmentHelpTopic(),'withdrawn');
  const retired=ui.enrollmentHelpTopics.withdrawn;
  assert.ok(retired.some(step=>/reingreso/i.test(step[0]+' '+step[1])));
  assert.ok(!retired.some(step=>step[2]==='edit-record'));
  state.record.status='enrolled';state.conflict=true;
  assert.equal(ui.enrollmentHelpTopic(),'conflict');
  assert.ok(ui.enrollmentHelpTopics.conflict.some(step=>/copia/i.test(step[1])));
});

test('ayuda de edición y carga solo ofrece acciones disponibles para los permisos y el estado',()=>{
  const {state,ui}=fixture();
  for(const status of ['draft','enrolled','withdrawn']){
    state.record={status};
    for(const permissions of [[],['write'],['documents'],['write','documents']]){
      state.user.permissions=permissions;
      assert.equal(Boolean(ui.enrollmentHelpStepAllowed('edit-record')),permissions.includes('write')&&status!=='withdrawn');
      assert.equal(Boolean(ui.enrollmentHelpStepAllowed('upload-record')),permissions.includes('write')&&permissions.includes('documents')&&status!=='withdrawn');
      assert.equal(Boolean(ui.enrollmentHelpStepAllowed('export')),false);
      assert.equal(ui.enrollmentHelpStepAllowed(),true);
    }
  }
  state.user.permissions=['read'];state.record={status:'enrolled'};
  const visible=ui.enrollmentHelpTopics.record.filter(step=>ui.enrollmentHelpStepAllowed(step[2]));
  assert.ok(visible.length);assert.ok(visible.every(step=>!step[2]),'Solo consulta no debe recomendar acciones de edición o exportación.');
});

test('cada diálogo real tiene ayuda específica y el formulario prevalece sobre la página de fondo',()=>{
  const {state,context,ui}=fixture(),titles=new Set();
  // Read actual call sites, including ternary titles and numbered revisions.
  // Evaluating their first argument does not invoke forms, API requests or DOM code.
  for(const file of ['app.js','accounts.js','templates.js','reports.js']){
    for(const match of read(file).matchAll(/\bdialog\(([^,\n]+),/g)){
      const expression=match[1].trim();
      if(expression==='title')continue; // Function declaration, not a call.
      for(const values of [{action:'transfer',id:null,previous:null,revision:{version:1}},{action:'withdraw',id:'cuenta',previous:{},revision:{version:42}}]){
        Object.assign(context,values);
        const title=runInContext(expression,context);titles.add(title);
        const topic=ui.enrollmentDialogHelpTopic(title);
        assert.notEqual(topic,'dialog','Sin tema específico para '+title);
        assert.notEqual(topic,'unavailable','Sin ayuda para '+title);
        assert.ok(ui.enrollmentHelpTopics[topic]?.length,'Tema sin contenido: '+title);
        state.view='empty';state.record={status:'withdrawn'};state.tab='ficha';
        assert.equal(ui.enrollmentHelpTopic({closest:selector=>selector==='#dialog'?{dataset:{helpTopic:topic}}:null}),topic,'El formulario debe prevalecer sobre el expediente de fondo.');
      }
    }
  }
  assert.ok(titles.size>=16,'La revisión no encontró todos los títulos de los formularios.');
  assert.equal(ui.enrollmentDialogHelpTopic('Revisión 999'),'revision');
});
