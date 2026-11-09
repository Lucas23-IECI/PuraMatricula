let enrollmentTemplateDraft;
const templateViewModes=[['list','Lista'],['compact','Compacta'],['cards','Tarjetas']];
const templateTypeLabels={text:'Texto corto',textarea:'Texto amplio',date:'Fecha',email:'Correo',tel:'Teléfono',select:'Opciones',checkbox:'Casilla'};
const templateSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
const templateVersionFilterDefaults=()=>({q:'',state:'',from:'',to:''});
const templateQuestionFilterDefaults=()=>({q:'',type:'',section:'',visibility:'',sensitive:''});
function templateFilterDate(value){
  const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed);
}
function templateVersionRows(templates,filters,currentId){
  const q=templateSearch(filters.q);
  return templates.filter(template=>{
    const current=String(template.id)===String(currentId),day=template.created_at?templateFilterDate(template.created_at):'';
    return (!q||templateSearch(`${template.name} ${template.id}`).includes(q))&&(!filters.state||(filters.state==='current'?current:!current))&&(!filters.from||day&&day>=filters.from)&&(!filters.to||day&&day<=filters.to);
  });
}
function templateQuestionRows(fields,protectedKeys,filters){
  const q=templateSearch(filters.q);
  return fields.map((field,index)=>({field,index})).filter(({field})=>!protectedKeys.has(field.key)).map((entry,position)=>({...entry,position})).filter(({field})=>
    (!q||templateSearch(`${field.label} ${field.key}`).includes(q))&&(!filters.type||field.type===filters.type)&&(!filters.section||field.section===filters.section)&&(!filters.visibility||(filters.visibility==='hidden'?Boolean(field.hidden):!field.hidden))&&(!filters.sensitive||(filters.sensitive==='reserved'?Boolean(field.sensitive):!field.sensitive)));
}
function templatePresentation(draft,section){return EnrollmentViews.get(draft.owner,'template-'+section,templateViewModes.map(([value])=>value),'list');}
function resetTemplateViews(){if(enrollmentTemplateDraft){enrollmentTemplateDraft.versionsFilters=templateVersionFilterDefaults();enrollmentTemplateDraft.questionsFilters=templateQuestionFilterDefaults();enrollmentTemplateDraft.versionsPage=1;enrollmentTemplateDraft.questionsPage=1;}}

function renderTemplateEditor(){
  const current=state.meta.templates[0],protectedKeys=new Set(state.meta.templateProtectedKeys||[]);
  const owner=state.user.id,container=$('#content');
  if(!enrollmentTemplateDraft||enrollmentTemplateDraft.owner!==owner||enrollmentTemplateDraft.baseTemplateId!==current.id)enrollmentTemplateDraft={owner,baseTemplateId:current.id,name:'',fields:structuredClone(current.fields),preview:null,versionsPage:1,versionsPageSize:10,questionsPage:1,questionsPageSize:10};
  const draft=enrollmentTemplateDraft;
  draft.versionsPage??=1;draft.versionsPageSize??=10;draft.questionsPage??=1;draft.questionsPageSize??=10;
  draft.versionsFilters??=templateVersionFilterDefaults();draft.questionsFilters??=templateQuestionFilterDefaults();
  const optional=()=>draft.fields.map((field,index)=>({field,index})).filter(({field})=>!protectedKeys.has(field.key));
  const payload=()=>({baseTemplateId:draft.baseTemplateId,name:draft.name,fields:draft.fields});
  const stillHere=()=>container===$('#content')&&state.view==='templates'&&draft===enrollmentTemplateDraft;
  const invalidate=()=>{draft.preview=null;container.querySelector('#template-preview')?.replaceChildren();};
  const showPreview=()=>{
    const p=draft.preview,target=container.querySelector('#template-preview');if(!p||!target)return;
    const sections=Object.entries(state.meta.sections).map(([key,label])=>({label,fields:p.fields.filter(f=>f.section===key&&!f.hidden)})).filter(s=>s.fields.length);
    target.innerHTML=`<div class="callout"><strong>${esc(p.name)}</strong><p>Vista previa con campos vacíos. Publicar aplica esta versión a las nuevas fichas. Las anteriores conservan sus datos y versión.</p></div><div class="template-preview-fields">${sections.map(s=>`<details class="section"><summary>${esc(s.label)} · ${s.fields.length}</summary><ul>${s.fields.map(f=>`<li>${esc(f.label)}${f.sensitive?' · reservado':''}${f.options?.length?` (${esc(f.options.join(', '))})`:''}</li>`).join('')}</ul></details>`).join('')}</div><div class="actions"><button type="button" id="template-pdf">Descargar vista previa PDF</button><button type="button" class="primary" id="template-publish">Publicar versión</button></div>`;
    const preview=draft.preview;
    target.querySelector('#template-pdf').onclick=async event=>{const b=event.currentTarget;setBusy(b,true,'Preparando PDF…');try{await download('/api/templates/preview-pdf',{method:'POST',body:{...payload(),previewToken:preview.previewToken}},'plantilla-vista-previa.pdf');}catch(error){notice(error.message);}finally{setBusy(b,false);}};
    target.querySelector('#template-publish').onclick=async event=>{const b=event.currentTarget;if(draft.preview!==preview||b.disabled)return;setBusy(b,true,'Publicando…');try{await api('/api/templates',{method:'POST',body:{...payload(),previewToken:preview.previewToken}});enrollmentTemplateDraft=null;state.meta=await api('/api/meta');if(container===$('#content')&&state.view==='templates')renderTemplateEditor();notice('Versión publicada. Las fichas anteriores se conservan.');}catch(error){notice(error.message);}finally{setBusy(b,false);}};
  };
  const filterDefaults={versions:templateVersionFilterDefaults,questions:templateQuestionFilterDefaults};
  const filterChips=(kind,filters)=>Object.entries(filters).filter(([,value])=>value).map(([key,value])=>({key,label:({q:'Búsqueda',state:'Versiones',from:'Desde',to:'Hasta',type:'Tipo',section:'Sección',visibility:'Visibilidad',sensitive:'Reserva'}[key]||key)+': '+({current:'Vigente',previous:'Anteriores',active:'Visibles',hidden:'Ocultas',reserved:'Reservadas',ordinary:'No reservadas'}[value]||templateTypeLabels[value]||state.meta.sections[value]||value)}));
  const selectOptions=(items,value)=>items.map(([key,label])=>'<option value="'+esc(key)+'" '+(value===key?'selected':'')+'>'+esc(label)+'</option>').join('');
  const dateRangeError=filters=>{for(const key of ['from','to'])if(filters[key]){const value=filters[key],parsed=new Date(value+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return 'Indica fechas válidas.';}return filters.from&&filters.to&&filters.from>filters.to?'La fecha inicial no puede ser posterior a la final.':'';};
  const draw=()=>{
    const extras=optional().map((entry,position)=>({...entry,position})),filteredExtras=templateQuestionRows(draft.fields,protectedKeys,draft.questionsFilters);
    const versionRows=templateVersionRows(state.meta.templates,draft.versionsFilters,current.id);
    const versions=EnrollmentPagination.slice(versionRows,{page:draft.versionsPage,pageSize:draft.versionsPageSize});
    const questions=EnrollmentPagination.slice(filteredExtras,{page:draft.questionsPage,pageSize:draft.questionsPageSize});
    const versionsMode=templatePresentation(draft,'versions'),questionsMode=templatePresentation(draft,'questions');
    draft.versionsPage=versions.page;draft.versionsPageSize=versions.pageSize;draft.questionsPage=questions.page;draft.questionsPageSize=questions.pageSize;
    const versionRowsHtml=versions.items.map(t=>'<article class="template-version '+(versionsMode==='cards'?'collection-card':'file-row')+'"><div><strong>'+esc(t.name)+'</strong><small class="muted">v'+esc(t.id)+' · '+date(t.created_at)+'</small></div>'+(String(t.id)===String(current.id)?'<span class="badge">Vigente para fichas nuevas</span>':'<span class="template-version-state">Anterior</span>')+'</article>').join('');
    const questionsHtml=questions.items.map(({field,index,position})=>'<article class="template-question '+(questionsMode==='cards'?'collection-card':'file-row')+'" data-question-key="'+esc(field.key)+'"><div class="template-question-copy"><strong>'+esc(field.label)+'</strong><small class="muted">'+esc(templateTypeLabels[field.type]||field.type)+' · '+esc(state.meta.sections[field.section]||field.section)+' · '+(field.hidden?'Oculta':field.sensitive?'Visible · Reservada':'Visible')+(field.hidden&&field.sensitive?' · Reservada':'')+'</small></div><div class="actions template-question-actions"><button type="button" data-template="edit" data-index="'+index+'">Editar</button><button type="button" data-template="up" data-index="'+index+'" aria-label="Subir '+esc(field.label)+'" title="Subir en la plantilla" '+(position===0?'disabled':'')+'>↑</button><button type="button" data-template="down" data-index="'+index+'" aria-label="Bajar '+esc(field.label)+'" title="Bajar en la plantilla" '+(position===extras.length-1?'disabled':'')+'>↓</button><button type="button" data-template="toggle" data-index="'+index+'">'+(field.hidden?'Mostrar':'Ocultar')+'</button></div></article>').join('');
    const vf=draft.versionsFilters,qf=draft.questionsFilters,types=[...new Set(extras.map(({field})=>field.type))],sections=[...new Set(extras.map(({field})=>field.section))];
    container.innerHTML=heading('Plantillas de ficha','Prepara una versión, revisa cómo quedará y publícala cuando esté lista.',state.meta.importFieldsReady?'':'<button data-action="prepare-import-fields">Preparar campos de importación</button>')+'<div class="template-layout"><section class="panel template-version-panel"><div class="template-section-heading"><h2>Versiones publicadas</h2>'+EnrollmentViews.html({id:'template-versions-view',label:'Vista de versiones',modes:templateViewModes,value:versionsMode})+'</div><form id="template-version-filters" class="template-filters" aria-label="Filtros de versiones"><div class="template-filter-primary"><label>Buscar versión<input type="search" name="q" maxlength="100" placeholder="Nombre o número de versión" value="'+esc(vf.q)+'"></label><label>Versiones<select name="state"><option value="">Todas</option>'+selectOptions([['current','Vigente'],['previous','Anteriores']],vf.state)+'</select></label></div><details class="template-more-filters" '+(draft.versionsMoreOpen?'open':'')+'><summary>Más filtros de versiones</summary><div class="fields"><label>Publicada desde<input type="date" name="from" value="'+esc(vf.from)+'"></label><label>Publicada hasta<input type="date" name="to" value="'+esc(vf.to)+'"></label></div></details><div class="actions"><button type="submit">Aplicar filtros</button><button type="button" data-template-clear="versions">Limpiar filtros</button></div><p class="error-text" data-filter-error role="alert"></p></form>'+EnrollmentViews.chips({id:'template-version-chips',items:filterChips('versions',vf)})+'<p class="template-result-count" role="status">'+versions.total+' de '+state.meta.templates.length+' versiones</p><div class="template-collection '+(versionsMode==='cards'?'collection-cards':versionsMode==='compact'?'collection-compact':'')+'" data-template-view="'+versionsMode+'">'+(versionRowsHtml||'<p class="empty">No hay versiones que coincidan con los filtros.</p>')+'</div>'+EnrollmentPagination.html({id:'template-versions',label:'versiones publicadas',...versions})+'</section><section class="panel template-draft-panel"><div class="template-section-heading"><h2>Borrador de plantilla</h2>'+EnrollmentViews.html({id:'template-questions-view',label:'Vista de preguntas',modes:templateViewModes,value:questionsMode})+'</div><p class="hint">La ficha base y los campos de importación se conservan. Puedes ajustar, ordenar u ocultar las preguntas adicionales.</p><label>Nombre de la nueva versión<input id="template-name" maxlength="120" value="'+esc(draft.name)+'"></label><form id="template-question-filters" class="template-filters spaced" aria-label="Filtros de preguntas"><div class="template-filter-primary"><label>Buscar pregunta<input type="search" name="q" maxlength="100" placeholder="Pregunta o identificador del campo" value="'+esc(qf.q)+'"></label><label>Visibilidad<select name="visibility"><option value="">Todas</option>'+selectOptions([['active','Visibles'],['hidden','Ocultas']],qf.visibility)+'</select></label></div><details class="template-more-filters" '+(draft.questionsMoreOpen?'open':'')+'><summary>Más filtros de preguntas</summary><div class="fields"><label>Tipo de respuesta<select name="type"><option value="">Todos los tipos</option>'+selectOptions(types.map(type=>[type,templateTypeLabels[type]||type]),qf.type)+'</select></label><label>Sección<select name="section"><option value="">Todas las secciones</option>'+selectOptions(sections.map(section=>[section,state.meta.sections[section]||section]),qf.section)+'</select></label><label>Reserva<select name="sensitive"><option value="">Todas</option>'+selectOptions([['reserved','Reservadas'],['ordinary','No reservadas']],qf.sensitive)+'</select></label></div></details><div class="actions"><button type="submit">Aplicar filtros</button><button type="button" data-template-clear="questions">Limpiar filtros</button></div></form>'+EnrollmentViews.chips({id:'template-question-chips',items:filterChips('questions',qf)})+'<p class="template-result-count" role="status">'+questions.total+' de '+extras.length+' preguntas adicionales</p><div class="template-collection template-question-collection '+(questionsMode==='cards'?'collection-cards':questionsMode==='compact'?'collection-compact':'')+'" data-template-view="'+questionsMode+'">'+(questionsHtml||'<p class="empty">'+(extras.length?'No hay preguntas que coincidan con los filtros.':'Todavía no hay preguntas adicionales.')+'</p>')+'</div>'+EnrollmentPagination.html({id:'template-questions',label:'preguntas adicionales',...questions})+'<div class="actions spaced"><button type="button" data-template="add">Añadir pregunta</button><button type="button" class="primary" data-template="preview">Previsualizar versión</button></div><div id="template-preview" class="spaced" aria-live="polite"></div></section></div>';
    container.querySelector('#template-name').oninput=e=>{draft.name=e.target.value;invalidate();};
    for(const kind of ['versions','questions']){
      const section=kind==='versions'?'template-versions-view':'template-questions-view';
      EnrollmentViews.bind(container,section,mode=>{if(!stillHere())return;EnrollmentViews.set(owner,'template-'+kind,mode,templateViewModes.map(([value])=>value));draw();});
      const form=container.querySelector(kind==='versions'?'#template-version-filters':'#template-question-filters');
      form.onsubmit=event=>{event.preventDefault();if(!stillHere())return;const values=new FormData(form),next=filterDefaults[kind]();for(const key of Object.keys(next))next[key]=String(values.get(key)||'').trim().slice(0,100);if(kind==='versions'){const error=dateRangeError(next);if(error){form.querySelector('[data-filter-error]').textContent=error;return;}}draft[kind+'Filters']=next;draft[kind+'Page']=1;draw();};
      const more=form.querySelector('details');more.ontoggle=()=>{draft[kind+'MoreOpen']=more.open;};
      container.querySelector('[data-template-clear="'+kind+'"]').onclick=()=>{if(!stillHere())return;draft[kind+'Filters']=filterDefaults[kind]();draft[kind+'Page']=1;draw();};
      EnrollmentViews.bindChips(container,kind==='versions'?'template-version-chips':'template-question-chips',({key,clear})=>{if(!stillHere())return;if(clear)draft[kind+'Filters']=filterDefaults[kind]();else if(Object.hasOwn(draft[kind+'Filters'],key))draft[kind+'Filters'][key]='';draft[kind+'Page']=1;draw();});
    }
    EnrollmentPagination.bind(container,'template-versions',({page,pageSize})=>{draft.versionsPage=page;draft.versionsPageSize=pageSize;draw();});
    EnrollmentPagination.bind(container,'template-questions',({page,pageSize})=>{draft.questionsPage=page;draft.questionsPageSize=pageSize;draw();});
    showPreview();
  };
  container.onclick=async event=>{
    const b=event.target.closest('[data-template]');if(!b||b.disabled||!stillHere())return;
    const action=b.dataset.template,index=Number(b.dataset.index),field=draft.fields[index];
    if(['edit','toggle','up','down'].includes(action)&&(!Number.isInteger(index)||!field||protectedKeys.has(field.key)))return;
    if(action==='preview'){
      if(!draft.name.trim()){notice('Indica el nombre de la nueva versión.');container.querySelector('#template-name').focus();return;}
      const snapshot=JSON.stringify(payload());setBusy(b,true,'Revisando…');try{const p=await api('/api/templates/preview',{method:'POST',body:JSON.parse(snapshot)});if(stillHere()&&snapshot===JSON.stringify(payload())){draft.preview=p;showPreview();container.querySelector('#template-preview')?.scrollIntoView({block:'nearest'});}}catch(error){notice(error.message);}finally{setBusy(b,false);}return;
    }
    if(action==='add'||action==='edit'){
      const previous=action==='edit'?field:null;
      const sensitiveLocked=Boolean(previous&&current.fields.some(published=>published.key===previous.key&&published.sensitive));
      dialog(previous?'Editar pregunta':'Añadir pregunta',`<label>Pregunta<input name="label" maxlength="120" required value="${esc(previous?.label)}"></label><label class="spaced">Tipo de respuesta<select name="type">${[['text','Texto corto'],['textarea','Texto amplio'],['date','Fecha'],['email','Correo'],['tel','Teléfono'],['select','Opciones']].map(([key,label])=>`<option value="${key}" ${previous?.type===key?'selected':''}>${label}</option>`).join('')}</select></label><div id="question-options" class="spaced" ${previous?.type==='select'?'':'hidden'}><label>Opciones separadas por coma<input name="options" value="${esc(previous?.options?.join(', '))}" ${previous?.type==='select'?'required':'disabled'}></label><p class="hint">Escribe hasta 30 alternativas diferentes, de hasta 120 caracteres cada una.</p></div><div class="checklist"><label><input type="checkbox" name="sensitive" ${previous?.sensitive===false?'':'checked'} ${sensitiveLocked?'disabled aria-describedby="question-sensitive-hint"':''}>Antecedente reservado</label></div>${sensitiveLocked?'<p id="question-sensitive-hint" class="hint">Esta pregunta ya es reservada y mantendrá su acceso restringido.</p>':''}`,fd=>{
        const type=fd.get('type'),choices=String(fd.get('options')||'').split(',').map(v=>v.trim()).filter(Boolean),label=String(fd.get('label')).trim();
        if(!label||type==='select'&&!choices.length)throw new Error('Indica la pregunta y, si corresponde, al menos una opción.');
        if(type==='select'&&(choices.length>30||choices.some(choice=>choice.length>120)||new Set(choices).size!==choices.length))throw new Error('Usa hasta 30 alternativas diferentes, de hasta 120 caracteres cada una.');
        const next={key:previous?.key||'extra'+crypto.randomUUID().replaceAll('-',''),label,section:previous?.section||'adicionales',type,sensitive:sensitiveLocked||fd.has('sensitive'),...(type==='select'?{options:choices}:{}),...(previous?.hidden?{hidden:true}:{})};
        if(previous)draft.fields[index]=next;else{draft.fields.push(next);const matches=templateQuestionRows(draft.fields,protectedKeys,draft.questionsFilters),position=matches.findIndex(({field})=>field.key===next.key);if(position>=0)draft.questionsPage=Math.floor(position/draft.questionsPageSize)+1;else notice('Pregunta añadida. No coincide con los filtros actuales.');}invalidate();draw();
      });
      const form=$('#dialog-form'),type=form.elements.type,options=form.elements.options;
      const updateOptions=()=>{
        const select=type.value==='select';
        form.querySelector('#question-options').hidden=!select;
        options.disabled=!select;options.required=select;
      };
      type.addEventListener('change',updateOptions);updateOptions();return;
    }
    if(action==='toggle'&&field){field.hidden=!field.hidden;invalidate();draw();return;}
    if((action==='up'||action==='down')&&field){const extras=optional(),position=extras.findIndex(x=>x.index===index),other=extras[position+(action==='up'?-1:1)];if(other){[draft.fields[index],draft.fields[other.index]]=[draft.fields[other.index],draft.fields[index]];const filteredPosition=templateQuestionRows(draft.fields,protectedKeys,draft.questionsFilters).findIndex(({field:question})=>question.key===field.key);if(filteredPosition>=0)draft.questionsPage=Math.floor(filteredPosition/draft.questionsPageSize)+1;invalidate();draw();}}
  };
  draw();
}
