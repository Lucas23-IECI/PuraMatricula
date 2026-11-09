/* Local presentation controls for an already authorized student record. */
(function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
  const eventNames={created:'Ficha creada',enroll:'Matrícula confirmada',transfer:'Cambio de curso',withdraw:'Retiro registrado',renewed:'Preparación de otro año',imported:'Importación controlada','document.add':'Documento agregado','template.upgrade':'Plantilla actualizada',reenter:'Reingreso registrado','import.updated':'Contacto actualizado por importación'};
  const documentNames={identity:'Identificación',signed:'Ficha firmada',support:'Antecedente reservado'};
  const modes={form:[['sections','Por secciones'],['continuous','Vista continua']],documents:[['list','Lista'],['compact','Compacta'],['cards','Tarjetas']],events:[['timeline','Cronología'],['compact','Compacta'],['table','Tabla']],revisions:[['list','Lista'],['compact','Compacta']]};
  const sections={form:'record-form',documents:'record-documents',events:'history',revisions:'revisions'};
  const memory=new Map(),forms=new WeakMap(),collections=new WeakMap();let context={userId:'',recordId:'',year:''},generation=0;
  function setContext(next={}){context={userId:String(next.userId??''),recordId:String(next.recordId??''),year:String(next.year??'')};}
  function reset(){memory.clear();context={userId:'',recordId:'',year:''};generation++;}
  function stored(kind,pageSize=10){
    const key=JSON.stringify([context.userId,context.recordId,context.year,kind]);
    if(!memory.has(key)){if(memory.size>=100)memory.delete(memory.keys().next().value);memory.set(key,{q:'',completion:'all',kind:'',action:'',actor:'',from:'',to:'',page:1,pageSize});}
    return memory.get(key);
  }
  function getMode(kind,userId){const values=modes[kind].map(x=>x[0]);return window.EnrollmentViews?.get(userId,sections[kind],values,values[0])||values[0];}
  function saveMode(kind,userId,value){window.EnrollmentViews?.set(userId,sections[kind],value,modes[kind].map(x=>x[0]));}
  function modeHtml(kind,id,value){
    if(window.EnrollmentViews?.html)return window.EnrollmentViews.html({id,label:'Vista',modes:modes[kind],value});
    return `<div class="rv-mode-switch" role="group" aria-label="Vista">${modes[kind].map(([v,l])=>`<button type="button" data-rv-mode="${v}" aria-pressed="${v===value}">${l}</button>`).join('')}</div>`;
  }
  function bindMode(root,id,callback){
    if(window.EnrollmentViews?.bind){window.EnrollmentViews.bind(root,id,callback);return;}
    root.querySelectorAll('[data-rv-mode]').forEach(button=>button.addEventListener('click',()=>callback(button.dataset.rvMode)));
  }
  function chips(root,id,items,onClear){
    root.innerHTML=window.EnrollmentViews?.chips?window.EnrollmentViews.chips({id,items}):items.map(x=>`<button type="button" class="rv-chip" data-rv-clear="${escape(x.key)}">${escape(x.label)} <span aria-hidden="true">×</span></button>`).join('');
    if(window.EnrollmentViews?.bindChips)window.EnrollmentViews.bindChips(root,id,onClear);
    else root.querySelectorAll('[data-rv-clear]').forEach(button=>button.addEventListener('click',()=>onClear({key:button.dataset.rvClear,clear:false})));
  }
  function localDay(value){const date=new Date(value);if(!value||Number.isNaN(date.getTime()))return '';return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function filterItems(items,kind,filters={}){
    const q=normalize(filters.q),from=filters.from||'',to=filters.to||'';
    if(from&&to&&from>to)return [];
    return (Array.isArray(items)?items:[]).filter(item=>{
      const text=kind==='documents'?`${item.name||''} ${documentNames[item.kind]||item.kind||''}`:kind==='events'?`${eventNames[item.action]||item.action||''} ${item.actor||''}`:`Revisión ${item.version??''}`;
      if(q&&(kind==='revisions'&&/^\d+$/.test(q)?String(item.version)!==q:!normalize(text).includes(q)))return false;
      if(kind==='documents'&&filters.kind&&item.kind!==filters.kind)return false;
      if(kind==='events'&&((filters.action&&item.action!==filters.action)||(filters.actor&&item.actor!==filters.actor)))return false;
      const day=localDay(item.at);return !((from&&(!day||day<from))||(to&&(!day||day>to)));
    });
  }
  function selectHtml(attribute,label,values,selected,emptyLabel){return `<label>${label}<select ${attribute}><option value="">${emptyLabel}</option>${values.map(([value,text])=>`<option value="${escape(value)}" ${selected===value?'selected':''}>${escape(text)}</option>`).join('')}</select></label>`;}
  const unique=(items,key,label)=>[...new Set(items.map(x=>x[key]).filter(x=>typeof x==='string'&&x))].sort((a,b)=>String(label(a)).localeCompare(String(label(b)),'es')).map(value=>[value,label(value)]);
  function datesHtml(filters){return `<label>Desde<input type="date" data-rv-filter="from" value="${escape(filters.from)}"></label><label>Hasta<input type="date" data-rv-filter="to" value="${escape(filters.to)}"></label>`;}
  function historyTable(results){
    const list=results.querySelector('ul.timeline');if(!list)return;
    const document=results.ownerDocument,wrap=document.createElement('div'),table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr'),tbody=document.createElement('tbody');
    wrap.className='table-wrap rv-history-table';table.setAttribute('aria-label','Movimientos del expediente');
    for(const label of ['Movimiento','Responsable y fecha','Detalle']){const th=document.createElement('th');th.scope='col';th.textContent=label;tr.append(th);}thead.append(tr);table.append(thead,tbody);
    for(const entry of [...list.children]){
      const row=document.createElement('tr'),action=document.createElement('td'),who=document.createElement('td'),detail=document.createElement('td');
      const heading=[...entry.children].find(x=>x.tagName==='STRONG'),byline=[...entry.children].find(x=>x.tagName==='SPAN');
      if(heading)action.append(heading);else action.textContent='Movimiento';if(byline)who.append(byline);else who.textContent='—';
      while(entry.firstChild)detail.append(entry.firstChild);if(!detail.textContent.trim())detail.textContent='—';row.append(action,who,detail);tbody.append(row);
    }
    wrap.append(table);list.replaceWith(wrap);
  }
  function paint(kind,container,id,items,row,options={}){
    if(!container)return;const previous=collections.get(container);previous?.destroy();
    const authorized=Array.isArray(items)?items:[],selection=stored(kind,options.pageSize||10),userId=context.userId,version=generation;
    let mode=getMode(kind,userId);container.classList.add('rv-collection');container.dataset.rvCollection=kind;
    const title=kind==='documents'?'Buscar documento':kind==='events'?'Buscar movimiento o responsable':'Buscar revisión';
    container.innerHTML=`<div class="rv-collection-tools"><div class="rv-tool-heading">${modeHtml(kind,id+'-view',mode)}</div><div class="rv-collection-filters rv-${kind}-filters"><label class="rv-search">${title}<input type="search" data-rv-filter="q" autocomplete="off" placeholder="${kind==='documents'?'Ej. ficha firmada':kind==='events'?'Ej. cambio de curso':'Ej. revisión 2'}" value="${escape(selection.q)}"></label>${kind==='documents'?selectHtml('data-rv-filter="kind"','Tipo',unique(authorized,'kind',x=>documentNames[x]||x),selection.kind,'Todos los tipos'):kind==='events'?selectHtml('data-rv-filter="action"','Movimiento',unique(authorized,'action',x=>eventNames[x]||x),selection.action,'Todos los movimientos')+selectHtml('data-rv-filter="actor"','Responsable',unique(authorized,'actor',x=>x),selection.actor,'Todas las personas'):''}${datesHtml(selection)}</div><div class="rv-filter-summary"><p class="rv-result-status" role="status" aria-live="polite"></p><button type="button" class="text-button" data-rv-reset>Limpiar filtros</button></div><div class="rv-chips"></div></div><div class="rv-collection-results"></div>`;
    const results=container.querySelector('.rv-collection-results'),status=container.querySelector('.rv-result-status'),chipRoot=container.querySelector('.rv-chips'),resetButton=container.querySelector('[data-rv-reset]');
    const activeItems=()=>['q',...(kind==='documents'?['kind']:kind==='events'?['action','actor']:[]),'from','to'].filter(key=>selection[key]).map(key=>({key,label:`${{q:'Búsqueda',kind:'Tipo',action:'Movimiento',actor:'Responsable',from:'Desde',to:'Hasta'}[key]}: ${key==='kind'?documentNames[selection[key]]||selection[key]:key==='action'?eventNames[selection[key]]||selection[key]:selection[key]}`}));
    function render(){
      if(version!==generation)return;const filtered=filterItems(authorized,kind,selection),result=window.EnrollmentPagination.slice(filtered,selection);selection.page=result.page;selection.pageSize=result.pageSize;
      results.className=`rv-collection-results rv-${kind} rv-mode-${mode}`;
      results.innerHTML=(result.items.length?(options.before||'')+result.items.map(row).join('')+(options.after||''):`<div class="empty">${escape(authorized.length?'No hay resultados para estos filtros.':options.empty||'No hay registros visibles.')}</div>`)+window.EnrollmentPagination.html({id,label:options.label||'registros',...result});
      if(kind==='events'&&mode==='table')historyTable(results);
      status.textContent=selection.from&&selection.to&&selection.from>selection.to?'La fecha inicial debe ser anterior o igual a la final.':`${filtered.length} de ${authorized.length} ${options.label||'registros'}`;
      const active=activeItems();resetButton.hidden=!active.length;chips(chipRoot,id+'-filters',active,({key,clear})=>{if(clear)for(const field of ['q','kind','action','actor','from','to'])selection[field]='';else if(['q','kind','action','actor','from','to'].includes(key))selection[key]='';selection.page=1;syncControls();render();});
      window.EnrollmentPagination.bind(results,id,next=>{Object.assign(selection,next);render();});
    }
    function syncControls(){container.querySelectorAll('[data-rv-filter]').forEach(input=>{input.value=selection[input.dataset.rvFilter]||'';});}
    const filter=event=>{const input=event.target.closest?.('[data-rv-filter]');if(!input||!container.contains(input))return;if(event.type==='input'&&input.tagName==='SELECT')return;selection[input.dataset.rvFilter]=input.value;selection.page=1;render();};
    const resetClick=()=>{for(const key of ['q','kind','action','actor','from','to'])selection[key]='';selection.page=1;syncControls();render();};
    container.addEventListener('input',filter);container.addEventListener('change',filter);resetButton.addEventListener('click',resetClick);
    bindMode(container,id+'-view',value=>{if(!modes[kind].some(x=>x[0]===value))return;mode=value;saveMode(kind,userId,value);render();});
    const controller={destroy(){container.removeEventListener('input',filter);container.removeEventListener('change',filter);resetButton.removeEventListener('click',resetClick);}};collections.set(container,controller);render();return controller;
  }
  function questionText(label){const copy=label.cloneNode(true);copy.querySelectorAll('input,select,textarea').forEach(node=>node.remove());return copy.textContent;}
  function answered(input){return input.type==='checkbox'||input.type==='radio'?input.checked:!!String(input.value??'').trim();}
  function enhanceRecordView(container,tab){
    if(!container)return;const previous=forms.get(container);
    if(tab!=='ficha'){previous?.destroy();forms.delete(container);return;}
    const first=container.querySelector('details.section');if(previous?.first===first){previous.refresh();return previous;}previous?.destroy();
    const details=[...container.querySelectorAll('details.section')].filter(node=>!node.hidden&&node.getAttribute('aria-hidden')!=='true'),questions=[];
    for(const section of details){const title=section.querySelector('summary')?.textContent||'';for(const input of section.querySelectorAll('[data-field]')){const label=input.closest('label');if(!label||label.hidden||input.type==='hidden'||label.getAttribute('aria-hidden')==='true')continue;questions.push({input,label,section,text:normalize(title+' '+questionText(label))});}}
    if(!questions.length)return;const selection=stored('form'),userId=context.userId,version=generation,sectionOpen=new Map(details.map(node=>[node,node.open]));let mode=getMode('form',userId),timer;
    const document=container.ownerDocument,toolbar=document.createElement('section');toolbar.className='rv-form-tools';toolbar.setAttribute('aria-label','Vista y búsqueda de preguntas');
    toolbar.innerHTML=`<div class="rv-tool-heading">${modeHtml('form','record-form-view',mode)}</div><div class="rv-form-filters"><label>Buscar pregunta o sección<input type="search" data-rv-question-search autocomplete="off" placeholder="Ej. correo, domicilio o autorizaciones" value="${escape(selection.q)}"></label><label>Respuestas<select data-rv-completion><option value="all">Todas las preguntas</option><option value="missing" ${selection.completion==='missing'?'selected':''}>Sin respuesta</option><option value="filled" ${selection.completion==='filled'?'selected':''}>Con respuesta</option></select></label></div><div class="rv-filter-summary"><p class="rv-result-status" role="status" aria-live="polite"></p><button type="button" class="text-button" data-rv-reset>Limpiar filtros</button></div><div class="rv-chips"></div><p class="rv-question-empty" hidden>No hay preguntas para estos filtros. Limpia los filtros para volver a ver la ficha.</p>`;
    first.before(toolbar);const query=toolbar.querySelector('[data-rv-question-search]'),completion=toolbar.querySelector('[data-rv-completion]'),status=toolbar.querySelector('.rv-result-status'),empty=toolbar.querySelector('.rv-question-empty'),resetButton=toolbar.querySelector('[data-rv-reset]');
    function filtered(){return !!normalize(selection.q)||selection.completion!=='all';}
    function refresh(){
      if(version!==generation)return;const q=normalize(selection.q),active=document.activeElement;let visible=0,missing=0;
      for(const question of questions){const filled=answered(question.input);if(!filled)missing++;const match=(!q||question.text.includes(q))&&(selection.completion==='all'||(selection.completion==='filled'?filled:!filled));question.label.hidden=!(match||active===question.input);if(!question.label.hidden)visible++;}
      for(const section of details){section.hidden=!questions.some(question=>question.section===section&&!question.label.hidden);section.open=mode==='continuous'||filtered()?!section.hidden:sectionOpen.get(section);}
      container.classList.toggle('rv-form-continuous',mode==='continuous');status.textContent=`${visible} de ${questions.length} preguntas · ${missing} sin respuesta`;empty.hidden=visible>0;resetButton.hidden=!filtered();
      chips(toolbar.querySelector('.rv-chips'),'record-form-filters',[...(selection.q?[{key:'q',label:'Pregunta: '+selection.q}]:[]),...(selection.completion!=='all'?[{key:'completion',label:selection.completion==='missing'?'Sin respuesta':'Con respuesta'}]:[])],({key,clear})=>{if(clear||key==='q')selection.q='';if(clear||key==='completion')selection.completion='all';query.value=selection.q;completion.value=selection.completion;refresh();});
    }
    const filter=event=>{if(event.target===query)selection.q=query.value;else if(event.target===completion)selection.completion=completion.value;else if(!event.target.matches?.('[data-field]'))return;refresh();};
    const resetClick=()=>{selection.q='';selection.completion='all';query.value='';completion.value='all';refresh();};
    const blur=()=>{clearTimeout(timer);timer=window.setTimeout(refresh,0);};
    const invalid=event=>{const question=questions.find(x=>x.input===event.target);if(question){question.label.hidden=false;question.section.hidden=false;question.section.open=true;}};
    const summaryClick=event=>{const summary=event.target.closest?.('summary');if(mode==='continuous'&&summary&&details.some(section=>section.querySelector('summary')===summary))event.preventDefault();};
    const toggles=details.map(section=>{const handler=()=>{if(mode==='continuous'&&!section.hidden&&!section.open)section.open=true;else if(mode==='sections'&&!filtered()&&!section.hidden)sectionOpen.set(section,section.open);};section.addEventListener('toggle',handler);return [section,handler];});
    container.addEventListener('input',filter);container.addEventListener('change',filter);container.addEventListener('focusout',blur);container.addEventListener('invalid',invalid,true);container.addEventListener('click',summaryClick);resetButton.addEventListener('click',resetClick);
    bindMode(toolbar,'record-form-view',value=>{if(!modes.form.some(x=>x[0]===value))return;mode=value;saveMode('form',userId,value);refresh();});
    const controller={first,refresh,destroy(){clearTimeout(timer);container.removeEventListener('input',filter);container.removeEventListener('change',filter);container.removeEventListener('focusout',blur);container.removeEventListener('invalid',invalid,true);container.removeEventListener('click',summaryClick);resetButton.removeEventListener('click',resetClick);toggles.forEach(([section,handler])=>section.removeEventListener('toggle',handler));toolbar.remove();}};forms.set(container,controller);refresh();return controller;
  }
  window.EnrollmentRecordViews=Object.freeze({setContext,reset,enhanceRecordView,paintDocuments:(...args)=>paint('documents',...args),paintEvents:(...args)=>paint('events',...args),paintRevisions:(...args)=>paint('revisions',...args),filterItems,normalize,localDay});
})();
