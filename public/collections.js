/* Local collection filters are applied before pagination. Only presentation
 * preferences are persisted by EnrollmentViews; searches stay in memory. */
const collectionViewContexts=new Map();
let collectionViewGeneration=0;
const collectionModes={courses:[['list','Lista'],['cards','Tarjetas']],users:[['table','Tabla'],['compact','Compacta'],['cards','Tarjetas']],audit:[['table','Tabla'],['compact','Compacta'],['timeline','Cronología']]};
const collectionText=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').trim();
const collectionMatches=(values,q)=>collectionText(q).split(/\s+/).filter(Boolean).every(word=>values.some(value=>collectionText(value).includes(word)));
const collectionCompare=(left,right)=>String(left??'').localeCompare(String(right??''),'es',{numeric:true,sensitivity:'base'});
const collectionModuleLabels={login:'Accesos',record:'Expedientes',enrollment:'Matrícula',document:'Documentos',import:'Importación',course:'Cursos',template:'Plantillas',user:'Cuentas',report:'Informes',backup:'Respaldos',audit:'Auditoría'};

function resetCollectionViews({yearOnly=false}={}){
  collectionViewGeneration++;
  if(!yearOnly){collectionViewContexts.clear();return;}
  for(const [key,context] of collectionViewContexts)if(context.section==='courses')collectionViewContexts.delete(key);
}
function collectionViewState(section){
  const owner=state.user?.id||'',scope=section==='courses'?Number(state.year):'global',key=JSON.stringify([owner,scope,section]);
  if(!collectionViewContexts.has(key)){
    const modes=collectionModes[section].map(([mode])=>mode),mode=EnrollmentViews.get(owner,section,modes,modes[0]);
    const filters=section==='courses'?{q:'',level:'',section:''}:section==='users'?{q:'',active:'',permission:'',scope:'',year:'',course:''}:{q:'',actor:'',action:'',module:'',from:'',to:''};
    collectionViewContexts.set(key,{owner,section,scope,mode,filters,page:1,pageSize:section==='audit'?50:10,snapshot:null,result:null,serial:0,advanced:false});
  }
  return collectionViewContexts.get(key);
}
function collectionIsCurrent(container,context,generation=collectionViewGeneration){return generation===collectionViewGeneration&&context.owner===state.user?.id&&container===$('#content')&&state.view===context.section;}
function collectionViewToolbar(context,id){return EnrollmentViews.html({id,label:'Vista',modes:collectionModes[context.section],value:context.mode});}
function bindCollectionView(root,context,id,draw){
  EnrollmentViews.bind(root,id,mode=>{
    if(!collectionIsCurrent(root,context)||context.mode===mode)return;
    EnrollmentViews.set(context.owner,context.section,mode,collectionModes[context.section].map(([value])=>value));context.mode=mode;draw();
  });
}
function collectionOption(value,label,selected){return `<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`;}
function collectionFilterChips(context,labels){return EnrollmentViews.chips({id:context.section+'-filters',items:Object.entries(context.filters).filter(([,value])=>value!=='').map(([key,value])=>({key,label:labels(key,value)}))});}
function bindCollectionFilterChips(root,context,apply){
  EnrollmentViews.bindChips(root,context.section+'-filters',({key,clear})=>{
    if(!collectionIsCurrent(root,context))return;
    if(clear)for(const field of Object.keys(context.filters))context.filters[field]='';
    else if(Object.hasOwn(context.filters,key))context.filters[key]='';
    context.page=1;if(context.section==='audit'){context.snapshot=null;context.result=null;}apply();
  });
}
function collectionPage(items,context){const result=EnrollmentPagination.slice(items,context);context.page=result.page;context.pageSize=result.pageSize;return result;}
function courseLevel(course){
  const name=collectionText(course.name);
  if(/^[1-8]\s*[º°o.]?\s*(?:basico|basica)(?:\s|$)/.test(name))return 'Básica';
  if(/^(?:[1-4]|i{1,3}|iv)\s*[º°o.]?\s*(?:medio|media)(?:\s|$)/.test(name))return 'Media';
  if(/^(?:pre\s*kinder|kinder|(?:educacion\s+)?parvularia|(?:nivel\s+)?transicion|nt\s*[12])(?:\s|$)/.test(name))return 'Parvularia';
  return '';
}
function courseSection(course){return courseLevel(course)?String(course.name??'').trim().toLocaleUpperCase('es').match(/\s([A-Z])$/)?.[1]||'':'';}
function filterCourseRows(items,filters){return items.filter(course=>collectionMatches([course.name],filters.q)&&(!filters.level||(filters.level==='unclassified'?!courseLevel(course):courseLevel(course)===filters.level))&&(!filters.section||(filters.section==='unassigned'?!courseSection(course):courseSection(course)===filters.section))).sort((left,right)=>collectionCompare(left.name,right.name)||collectionCompare(left.id,right.id));}
function filterUserRows(items,filters,catalog){
  const courseIds=new Set(catalog.filter(course=>(!filters.year||Number(course.year)===Number(filters.year))&&(!filters.course||course.id===filters.course)).map(course=>course.id));
  return items.filter(user=>collectionMatches([user.name,user.username],filters.q)
    &&(!filters.active||(filters.active==='active'?user.active:filters.active==='inactive'?!user.active:filters.active==='temporary'?user.active&&user.mustChangePassword:false))
    &&(!filters.permission||user.permissions.includes(filters.permission))
    &&(!filters.scope||(filters.scope==='all'?user.allCourses:filters.scope==='assigned'?!user.allCourses:false))
    &&(!(filters.year||filters.course)||(user.allCourses?courseIds.size>0:user.courses.some(id=>courseIds.has(id)))))
    .sort((left,right)=>collectionCompare(left.name,right.name)||collectionCompare(left.username,right.username));
}
function collectionStatus(user){return !user.active?'Desactivada':user.mustChangePassword?'Clave temporal':'Activa';}

function drawCourses(context){
  const container=$('#content');if(!collectionIsCurrent(container,context))return;
  const rows=courses(state.year),levels=[...new Set(rows.map(courseLevel).filter(Boolean))].sort(collectionCompare),sections=[...new Set(rows.map(courseSection).filter(Boolean))].sort(collectionCompare);
  const labels=(key,value)=>key==='q'?'Búsqueda: '+value:key==='level'?'Nivel: '+(value==='unclassified'?'Sin identificar':value):'Sección: '+(value==='unassigned'?'Sin identificar':value);
  $('#course-filter-area').innerHTML=`<form id="courses-filters" class="collection-filter-form"><div class="collection-primary-filters"><label>Buscar curso<input name="q" type="search" maxlength="100" autocomplete="off" placeholder="Nombre del curso" value="${esc(context.filters.q)}"></label><label>Nivel<select name="level"><option value="">Todos los niveles</option>${levels.map(value=>collectionOption(value,value,context.filters.level)).join('')}${rows.some(course=>!courseLevel(course))?collectionOption('unclassified','Sin nivel identificado',context.filters.level):''}</select></label><label>Sección<select name="section"><option value="">Todas las secciones</option>${sections.map(value=>collectionOption(value,value,context.filters.section)).join('')}${rows.some(course=>!courseSection(course))?collectionOption('unassigned','Sin sección identificada',context.filters.section):''}</select></label><button class="primary" type="submit">Aplicar filtros</button></div></form>${collectionFilterChips(context,labels)}`;
  $('#courses-filters').onsubmit=event=>{event.preventDefault();if(!collectionIsCurrent(container,context))return;const form=new FormData(event.currentTarget);for(const key of Object.keys(context.filters))context.filters[key]=String(form.get(key)||'').trim();context.page=1;drawCourses(context);};
  bindCollectionFilterChips(container,context,()=>drawCourses(context));
  const draw=()=>{
    if(!collectionIsCurrent(container,context))return;
    const result=collectionPage(filterCourseRows(rows,context.filters),context);
    $('#courses-views').innerHTML=collectionViewToolbar(context,'courses-view');
    $('#courses-count').textContent=`${result.total} de ${rows.length} cursos de ${state.year}`;
    const content=context.mode==='cards'?`<div class="collection-scroll collection-cards">${result.items.map(course=>`<article class="collection-card"><h3>${esc(course.name)}</h3><p>Año escolar ${esc(course.year)}</p><p class="muted">${esc([courseLevel(course),courseSection(course)&&'Sección '+courseSection(course)].filter(Boolean).join(' · ')||'Curso registrado')}</p></article>`).join('')}</div>`:`<div class="collection-scroll collection-course-list">${result.items.map(course=>`<div class="stat-line"><strong>${esc(course.name)}</strong><span class="muted">${esc(course.year)}</span></div>`).join('')}</div>`;
    $('#courses-list').innerHTML=(result.total?content:'<div class="empty">No hay cursos que coincidan con estos filtros.</div>')+EnrollmentPagination.html({id:'courses',label:'cursos',...result});
    EnrollmentPagination.bind(container,'courses',next=>{Object.assign(context,next);draw();});bindCollectionView(container,context,'courses-view',draw);
  };draw();
}
function renderCourses(){
  rememberLocation();const container=$('#content'),context=collectionViewState('courses'),max=schoolYearRange().max,nextYear=Math.min(Number(state.year)+1,max);
  container.innerHTML=heading('Cursos y años','Consulta los cursos del año seleccionado y prepara otros años sin trasladar estudiantes.','<button class="primary" data-action="new-course">Agregar curso</button>')+`<section class="panel collection-filter-panel" id="course-filter-area"></section><div class="collection-courses-layout"><section class="panel table-panel"><header class="collection-toolbar"><div><h2>Cursos de ${state.year}</h2><p id="courses-count" class="hint"></p></div><div id="courses-views"></div></header><div id="courses-list"></div></section><section class="panel collection-year-prepare"><h2>Preparar otro año</h2><p class="muted">Copia todos los cursos de ${state.year}. No traslada estudiantes ni cierra sus fichas.</p><form id="prepare-year"><label>Año de destino<input name="year" type="number" min="${nextYear}" max="${max}" value="${nextYear}" required ${Number(state.year)>=max?'disabled':''}></label><button class="primary spaced" ${!courses(state.year).length||Number(state.year)>=max?'disabled':''}>Preparar cursos</button><div id="prepare-error" class="error-text" role="alert"></div></form></section></div>`;
  drawCourses(context);
  $('#prepare-year').onsubmit=async event=>{
    event.preventDefault();const targetYear=Number(new FormData(event.currentTarget).get('year')),button=event.submitter,sourceCourses=courses(state.year).map(course=>({name:course.name}));
    if(!Number.isInteger(targetYear)||targetYear<=Number(state.year)||targetYear>max)return;
    setBusy(button,true,'Preparando cursos…');
    try{for(const course of sourceCourses)if(!state.meta.courses.some(item=>Number(item.year)===targetYear&&item.name===course.name))await api('/api/courses',{method:'POST',body:{year:targetYear,name:course.name}});const meta=await api('/api/meta');if(context.owner!==state.user?.id)return;state.meta=meta;if(container===$('#content')){applySchoolYear(targetYear);shell();renderCourses();}notice('Cursos del año '+targetYear+' preparados. Las matrículas existentes se conservan.');}
    catch(error){if(context.owner!==state.user?.id)return;const meta=await api('/api/meta').catch(()=>null);if(meta)state.meta=meta;if(container===$('#content')&&$('#prepare-error'))$('#prepare-error').textContent=error.message;else notice(error.message);}
    finally{setBusy(button,false);}
  };
}

function userFilterLabels(context,catalog){
  return (key,value)=>({q:'Búsqueda: '+value,active:'Estado: '+({active:'Activa',inactive:'Desactivada',temporary:'Clave temporal'}[value]||value),permission:'Permiso: '+(state.meta.permissionLabels?.[value]||value),scope:'Alcance: '+(value==='all'?'Todos los cursos':'Cursos asignados'),year:'Año asignado: '+value,course:'Curso: '+(catalog.find(course=>course.id===value)?.name||'Curso seleccionado')}[key]);
}
function drawUsers(context){
  const container=$('#content');if(!collectionIsCurrent(container,context))return;
  const catalog=state.accountCourses||[],years=[...new Set(catalog.map(course=>Number(course.year)))].sort((a,b)=>b-a),courseChoices=catalog.filter(course=>!context.filters.year||Number(course.year)===Number(context.filters.year));
  $('#users-filter-area').innerHTML=`<form id="users-filters" class="collection-filter-form"><div class="collection-primary-filters"><label>Buscar cuenta<input name="q" type="search" maxlength="100" autocomplete="off" placeholder="Nombre o usuario" value="${esc(context.filters.q)}"></label><label>Estado<select name="active"><option value="">Todos los estados</option>${[['active','Activa'],['inactive','Desactivada'],['temporary','Clave temporal']].map(([value,label])=>collectionOption(value,label,context.filters.active)).join('')}</select></label><button class="primary" type="submit">Aplicar filtros</button></div><details class="collection-advanced-filters" ${context.advanced?'open':''}><summary>Más filtros</summary><div class="fields"><label>Permiso<select name="permission"><option value="">Cualquier permiso</option>${(state.meta.permissions||[]).map(value=>collectionOption(value,state.meta.permissionLabels?.[value]||value,context.filters.permission)).join('')}</select></label><label>Alcance<select name="scope"><option value="">Todos los alcances</option>${[['all','Todos los cursos'],['assigned','Cursos asignados']].map(([value,label])=>collectionOption(value,label,context.filters.scope)).join('')}</select></label><label>Año asignado<select name="year"><option value="">Todos los años</option>${years.map(year=>collectionOption(year,year,context.filters.year)).join('')}</select></label><label>Curso asignado<select name="course"><option value="">Todos los cursos</option>${courseChoices.map(course=>collectionOption(course.id,`${course.name} · ${course.year}`,context.filters.course)).join('')}</select></label></div></details></form>${collectionFilterChips(context,userFilterLabels(context,catalog))}`;
  const form=$('#users-filters');
  form.onsubmit=event=>{event.preventDefault();if(!collectionIsCurrent(container,context))return;const values=new FormData(event.currentTarget);for(const key of Object.keys(context.filters))context.filters[key]=String(values.get(key)||'').trim();context.page=1;drawUsers(context);};
  const advanced=form.querySelector?.('details');if(advanced)advanced.ontoggle=()=>{context.advanced=advanced.open;};
  const yearField=form.elements?.year;if(yearField)yearField.onchange=()=>{const choices=catalog.filter(course=>!yearField.value||Number(course.year)===Number(yearField.value)),field=form.elements.course,current=field.value;field.innerHTML='<option value="">Todos los cursos</option>'+choices.map(course=>collectionOption(course.id,`${course.name} · ${course.year}`,current)).join('');};
  bindCollectionFilterChips(container,context,()=>drawUsers(context));
  const draw=()=>{
    if(!collectionIsCurrent(container,context))return;
    const rows=state.users||[],result=collectionPage(filterUserRows(rows,context.filters,catalog),context);
    $('#users-views').innerHTML=collectionViewToolbar(context,'users-view');$('#users-count').textContent=`${result.total} de ${rows.length} cuentas`;
    const cells=user=>`<td><strong>${esc(user.name)}</strong><span class="student-id">${esc(user.username)}</span></td><td><span class="collection-account-status ${user.active?'active':'inactive'}">${esc(collectionStatus(user))}</span></td><td>${user.allCourses?'Todos los cursos':`${user.courses.length} curso(s) asignado(s)`}<span class="student-id">${user.permissions.length} permisos</span></td><td><button data-action="edit-user" data-id="${esc(user.id)}">Configurar</button></td>`;
    const markup=context.mode==='cards'?`<div class="collection-scroll collection-cards">${result.items.map(user=>`<article class="collection-card"><div class="collection-card-heading"><h3>${esc(user.name)}</h3><span class="collection-account-status ${user.active?'active':'inactive'}">${esc(collectionStatus(user))}</span></div><p class="muted">${esc(user.username)}</p><dl class="collection-card-facts"><div><dt>Alcance</dt><dd>${user.allCourses?'Todos los cursos':`${user.courses.length} curso(s) asignado(s)`}</dd></div><div><dt>Permisos</dt><dd>${user.permissions.length}</dd></div></dl><button data-action="edit-user" data-id="${esc(user.id)}">Configurar cuenta</button></article>`).join('')}</div>`:`<div class="table-wrap collection-scroll"><table class="collection-table ${context.mode==='compact'?'is-compact':''}"><thead><tr><th>Persona</th><th>Estado</th><th>Alcance</th><th>Acciones</th></tr></thead><tbody>${result.items.map(user=>'<tr>'+cells(user)+'</tr>').join('')}</tbody></table></div>`;
    $('#users-list').innerHTML=(result.total?markup:'<div class="empty">No hay cuentas que coincidan con estos filtros.</div>')+EnrollmentPagination.html({id:'users',label:'cuentas',...result});
    EnrollmentPagination.bind(container,'users',next=>{Object.assign(context,next);draw();});bindCollectionView(container,context,'users-view',draw);
  };draw();
}
async function renderUsers(){
  const container=$('#content'),request=++viewRequest,generation=collectionViewGeneration,context=collectionViewState('users');showLoading(container,'Cargando cuentas y permisos…','users');
  try{const result=await api('/api/users');if(request!==viewRequest||!collectionIsCurrent(container,context,generation))return;state.users=result.users;state.accountCourses=result.courses;container.removeAttribute('aria-busy');container.innerHTML=heading('Cuentas y permisos','Asigna acciones y cursos a cada persona. Una cuenta no concede acceso a todos los expedientes.','<button class="primary" data-action="new-user">+ Nueva cuenta</button>')+'<section class="panel collection-filter-panel" id="users-filter-area"></section><section class="panel table-panel"><header class="collection-toolbar"><div><h2>Cuentas</h2><p class="hint" id="users-count"></p></div><div id="users-views"></div></header><div id="users-list"></div></section>';drawUsers(context);}
  catch(error){if(request===viewRequest&&collectionIsCurrent(container,context,generation))loadingError(container,error);}
}

function auditQuery(context){return new URLSearchParams({...context.filters,page:context.page,...(context.snapshot?{snapshot:context.snapshot}:{})});}
function auditFilterLabels(context){return (key,value)=>({q:'Búsqueda: '+value,actor:'Persona: '+(context.result?.facets?.actors?.find(actor=>actor.id===value)?.name||value),action:'Acción: '+(auditActivityLabels[value]||value),module:'Sección: '+(collectionModuleLabels[value]||value),from:'Desde: '+value,to:'Hasta: '+value}[key]);}
function drawAuditFilters(context){
  const container=$('#content');if(!collectionIsCurrent(container,context))return;
  const facets=context.result?.facets||{actors:[],actions:[],modules:[]};
  $('#audit-filter-area').innerHTML=`<form id="audit-filters" class="collection-filter-form"><div class="collection-primary-filters"><label>Buscar actividad<input name="q" type="search" maxlength="100" autocomplete="off" placeholder="Persona, acción o referencia" value="${esc(context.filters.q)}"></label><label>Persona<select name="actor"><option value="">Todas las personas</option>${facets.actors.map(actor=>collectionOption(actor.id,actor.name,context.filters.actor)).join('')}</select></label><label>Sección<select name="module"><option value="">Todas las secciones</option>${facets.modules.map(module=>collectionOption(module,collectionModuleLabels[module]||module,context.filters.module)).join('')}</select></label><button class="primary" type="submit">Aplicar filtros</button></div><details class="collection-advanced-filters" ${context.advanced?'open':''}><summary>Más filtros</summary><div class="fields"><label>Acción<select name="action"><option value="">Todas las acciones</option>${facets.actions.map(action=>collectionOption(action,auditActivityLabels[action]||action,context.filters.action)).join('')}</select></label><label>Desde<input name="from" type="date" value="${esc(context.filters.from)}"></label><label>Hasta<input name="to" type="date" value="${esc(context.filters.to)}"></label></div></details><div id="audit-filter-error" class="error-text" role="alert"></div></form>${collectionFilterChips(context,auditFilterLabels(context))}`;
  const form=$('#audit-filters');form.onsubmit=async event=>{event.preventDefault();if(!collectionIsCurrent(container,context))return;const values=new FormData(event.currentTarget);for(const key of Object.keys(context.filters))context.filters[key]=String(values.get(key)||'').trim();context.page=1;context.snapshot=null;context.result=null;state.auditSnapshot=null;await loadAuditCollection(container,context);};
  const details=form.querySelector?.('details');if(details)details.ontoggle=()=>{context.advanced=details.open;};
  bindCollectionFilterChips(container,context,()=>loadAuditCollection(container,context));
}
function auditTechnical(item){return `<details class="audit-technical"><summary>Detalle técnico</summary><code>${esc(item.action)}</code><pre>${esc(JSON.stringify(item.detail,null,2))}</pre></details>`;}
function drawAuditResult(context){
  const container=$('#content'),result=context.result;if(!result||!collectionIsCurrent(container,context))return;
  $('#audit-views').innerHTML=collectionViewToolbar(context,'audit-view');$('#audit-count').textContent=`${result.total} eventos en este corte`;
  const content=context.mode==='timeline'?`<div class="collection-scroll"><ol class="collection-audit-timeline">${result.items.map(item=>`<li><time datetime="${esc(item.at)}">${esc(date(item.at))}</time><div><strong>${esc(auditActivityLabels[item.action]||'Actividad registrada')}</strong><p>${esc(item.actorName)} · ${esc(auditSummary(item))}</p>${auditTechnical(item)}</div></li>`).join('')}</ol></div>`:`<div class="table-wrap collection-scroll"><table class="collection-table ${context.mode==='compact'?'is-compact':''}"><thead><tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${result.items.map(item=>`<tr><td class="small">${esc(date(item.at))}</td><td>${esc(item.actorName)}</td><td>${esc(auditActivityLabels[item.action]||'Actividad registrada')}${item.target?`<span class="student-id">Referencia ${esc(item.target.slice(0,8))}</span>`:''}</td><td class="audit-detail"><p>${esc(auditSummary(item))}</p>${auditTechnical(item)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#audit-list').innerHTML=(result.total?content:'<div class="empty">No hay actividad que coincida con estos filtros.</div>')+EnrollmentPagination.html({id:'audit',label:'eventos',...result,sizes:[50]});
  EnrollmentPagination.bind(container,'audit',async next=>{Object.assign(context,next);state.page=next.page;await loadAuditCollection(container,context);});bindCollectionView(container,context,'audit-view',()=>drawAuditResult(context));
}
async function loadAuditCollection(container,context){
  const request=++context.serial,generation=collectionViewGeneration,results=$('#audit-list');if(!results)return;
  showLoading(results,'Cargando actividad…','audit');
  try{
    const result=await api('/api/audit?'+auditQuery(context));if(request!==context.serial||!collectionIsCurrent(container,context,generation)||results!==$('#audit-list'))return;
    context.result=result;context.page=result.page;context.pageSize=result.pageSize;context.snapshot=result.snapshot;state.page=result.page;state.auditSnapshot=result.snapshot;
    if(result.filters)for(const key of Object.keys(context.filters))if(Object.hasOwn(result.filters,key))context.filters[key]=String(result.filters[key]??'');
    const integrity=$('#audit-integrity');integrity.className='callout '+(result.integrity?'':'error');integrity.textContent=result.integrity?'Integridad de la cadena verificada.':'La cadena no superó la verificación de integridad.';
    results.removeAttribute('aria-busy');drawAuditFilters(context);drawAuditResult(context);
  }catch(error){if(request!==context.serial||!collectionIsCurrent(container,context,generation))return;results.removeAttribute('aria-busy');if(context.result)drawAuditResult(context);else loadingError(results,error);const target=$('#audit-filter-error');if(target)target.textContent=error.message;}
}
async function renderAudit(){
  const container=$('#content'),context=collectionViewState('audit');
  container.innerHTML=heading('Auditoría','Consulta acciones por persona, sección y fecha. Los filtros no alteran el registro.','<button type="button" id="audit-refresh">Actualizar registro</button>')+'<div id="audit-integrity" class="callout">Comprobando integridad…</div><section class="panel collection-filter-panel" id="audit-filter-area"></section><section class="panel table-panel"><header class="collection-toolbar"><div><h2>Actividad</h2><p class="hint" id="audit-count"></p></div><div id="audit-views"></div></header><div id="audit-list"></div></section>';
  drawAuditFilters(context);
  $('#audit-refresh').onclick=async()=>{if(!collectionIsCurrent(container,context))return;context.snapshot=null;context.page=1;state.auditSnapshot=null;await loadAuditCollection(container,context);};
  if(context.result)drawAuditResult(context);
  await loadAuditCollection(container,context);
}
