const reportLabels={draft:'Borradores',enrolled:'Matrícula vigente',withdrawn:'Retirados'};
const reportMovementLabels={enroll:'Confirmaciones',renewed:'Renovaciones',transfer:'Traslados',withdraw:'Retiros',reenter:'Reingresos'};
const reportNumber=value=>Number(value||0).toLocaleString('es-CL');
const reportWhen=value=>new Date(value).toLocaleString('es-CL',{timeZone:'America/Santiago'});
let reportSelection={},reportSerial=0,reportResultCache=new WeakMap();
function resetReportsContext(){reportSelection={};reportSerial++;reportResultCache=new WeakMap();}

function reportParams(values,extra={}){
  return new URLSearchParams(Object.fromEntries(Object.entries({...values,...extra}).filter(([,value])=>value!==''&&value!==false&&value!=null)));
}

function openRosterDownloads(values){
  const selection=values&&values.year?values:typeof recordsFilterQuery==='function'?recordsFilterQuery():{year:state.year,course:state.course,status:state.status,q:state.q};
  dialog('Exportar nómina',`<p>Se aplican los filtros de la lista y el acceso autorizado a cursos.</p><div class="fields"><label>Formato<select name="format"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></select></label><label>Organización de Excel<select name="layout" aria-describedby="roster-layout-hint"><option value="">Una sola nómina</option><option value="by-course">Una hoja por curso</option></select></label></div><p id="roster-layout-hint" class="hint spaced"></p>`,async fd=>{
    const format=fd.get('format'), params=reportParams(selection,{format,layout:format==='xlsx'?fd.get('layout'):''});
    await download('/api/reports/roster?'+params,{},`nomina-${selection.year}.${format}`);
    notice('Nómina descargada.');
  });
  const form=$('#dialog-form'),format=form.elements.format,layout=form.elements.layout;
  const updateLayout=()=>{
    const csv=format.value==='csv';
    layout.disabled=csv;
    form.querySelector('#roster-layout-hint').textContent=csv?'CSV se descarga como una sola tabla. La organización por curso solo está disponible en Excel.':'En Excel puedes reunir la nómina en una tabla o crear una hoja por curso.';
  };
  format.addEventListener('change',updateLayout);updateLayout();
  form.querySelector('button[type="submit"]').textContent='Descargar';
}

function openRecordDownloads(){
  const record=state.record;
  if(!record)return;
  const revisions=(record.revisions||[]).filter(item=>item.version!==record.version);
  dialog('Descargas de la ficha',`<p class="muted">${esc(record.name)} · Año ${record.year}</p><div class="fields"><label>Documento<select name="kind"><option value="ficha">Ficha de matrícula</option>${record.status==='enrolled'?'<option value="constancia">Constancia de matrícula</option>':''}</select></label><label>Formato<select name="format"><option value="pdf">PDF para imprimir</option><option value="docx">Word editable (.docx)</option></select></label><label>Revisión<select name="version"><option value="${record.version}">Revisión vigente (${record.version})</option>${revisions.map(item=>`<option value="${item.version}">Revisión ${item.version} · ${esc(date(item.at))}</option>`).join('')}</select></label></div><p class="hint spaced">El Word es una copia editable. Los documentos firmados se conservan en la pestaña Documentos.</p>`,async fd=>{
    const kind=fd.get('kind'),format=fd.get('format'),version=fd.get('version');
    await download(`/api/records/${record.id}/download?`+reportParams({format,kind,version}),{},`${kind}-${record.year}-r${version}.${format}`);
    notice('Documento descargado.');
  });
  const form=$('#dialog-form'),kind=form.elements.kind,version=form.elements.version;
  version.onchange=()=>{
    const option=[...kind.options].find(item=>item.value==='constancia');
    if(!option)return;
    option.disabled=Number(version.value)!==record.version;
    if(option.disabled&&kind.value==='constancia')kind.value='ficha';
  };
  form.querySelector('button[type="submit"]').textContent='Descargar';
}

function reportsView(){
  const pendingView=state.view==='pending',year=Number(state.year);
  if(reportSelection.view!==state.view||reportSelection.year!==year||reportSelection.userId!==state.user?.id){
    const modes=pendingView?['table','compact','cards']:['summary','charts','table'];
    const mode=typeof EnrollmentViews==='object'?EnrollmentViews.get(state.user?.id,state.view,modes,modes[0]):modes[0];
    reportSelection={view:state.view,userId:state.user?.id,year,course:'',status:'',q:'',pending:pendingView?'1':'',...reportAdvancedDefaults(),mode,showRows:pendingView,page:1,pageSize:25,coursePage:1,coursePageSize:10,moreFiltersOpen:false};
  }
  return reportSelection;
}

const reportPendingLabels={guardianName:'Nombre del apoderado',guardianPhone:'Teléfono del apoderado',emergencyPhone:'Teléfono de emergencia',imagesDecision:'Decisión sobre imágenes',outingsDecision:'Decisión sobre salidas',birthCertificate:'Documento identificatorio'};
const reportAdvancedChoices={identifierType:[['RUN','RUN'],['IPE','IPE'],['Pasaporte','Pasaporte'],['Otro','Otro'],['Provisional','Provisional']],pendingKey:Object.entries(reportPendingLabels),contact:[['missing-phone','Apoderado sin teléfono'],['missing-email','Apoderado sin correo'],['complete','Apoderado con teléfono y correo']],origin:[['manual','Ingreso manual'],['imported','Importación']],sort:[['name','Nombre'],['updated-desc','Actualización más reciente'],['updated-asc','Actualización más antigua'],['course','Curso'],['status','Estado']]};
const reportAdvancedLabels={identifierType:'Identificación',pendingKey:'Antecedente pendiente',contact:'Contacto del apoderado',origin:'Origen',updatedFrom:'Actualizado desde',updatedTo:'Actualizado hasta',sort:'Orden'};
function reportAdvancedDefaults(){return {identifierType:'',pendingKey:'',documentKind:'',documentState:'',contact:'',origin:'',updatedFrom:'',updatedTo:'',sort:'name'};}
function reportChoice(name,label,selection,choices,empty='Todos'){
  return `<label>${label}<select name="${name}">${empty!==null?`<option value="">${empty}</option>`:''}${choices.map(([value,text])=>`<option value="${esc(value)}" ${selection[name]===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
}
function reportFilterChips(selection){
  const items=[];
  if(selection.course)items.push({key:'course',label:'Curso: '+(courses(selection.year).find(course=>course.id===selection.course)?.name||'Curso seleccionado')});
  if(selection.status)items.push({key:'status',label:'Estado: '+reportLabels[selection.status]});
  if(selection.q)items.push({key:'q',label:'Búsqueda: '+selection.q});
  if(selection.pending&&selection.view!=='pending')items.push({key:'pending',label:'Con pendientes'});
  for(const key of Object.keys(reportAdvancedLabels)){
    const value=selection[key];if(!value||(key==='sort'&&value==='name'))continue;
    const label=reportAdvancedChoices[key]?.find(([choice])=>choice===value)?.[1]||value;
    items.push({key,label:reportAdvancedLabels[key]+': '+label});
  }
  if(selection.documentKind&&selection.documentState)items.push({key:'documentKind',label:(selection.documentKind==='signed'?'Ficha firmada':'Documento identificatorio')+': '+(selection.documentState==='present'?'presente para mi cuenta':'sin documento visible')});
  return items;
}
function reportFilterValues(values,pendingView=false){
  const next={course:String(values.get('course')||''),status:String(values.get('status')||''),q:String(values.get('q')||'').trim(),pending:pendingView?'1':values.get('pending')||''};
  for(const key of Object.keys(reportAdvancedDefaults()))next[key]=String(values.get(key)||(key==='sort'?'name':''));
  if(next.updatedFrom&&next.updatedTo&&next.updatedFrom>next.updatedTo)throw new Error('La fecha inicial debe ser anterior o igual a la fecha final.');
  if(Boolean(next.documentKind)!==Boolean(next.documentState))throw new Error('Elige el tipo de documento y si está presente o faltante.');
  return next;
}
function reportModes(selection){return selection.view==='pending'?[['table','Tabla'],['compact','Compacta'],['cards','Tarjetas']]:[['summary','Resumen'],['charts','Gráficos'],['table','Tabla']];}
function reportModeControl(selection){
  const modes=reportModes(selection);
  if(typeof EnrollmentViews==='object')return EnrollmentViews.html({id:'report-mode',label:'Vista',modes,value:selection.mode||modes[0][0]});
  return `<div class="view-controls" role="group" aria-label="Vista">${modes.map(([value,label])=>`<button type="button" data-report-action="mode" data-mode="${value}" aria-pressed="${selection.mode===value}">${label}</button>`).join('')}</div>`;
}
function changeReportMode(selection,mode,container,results){
  const allowed=reportModes(selection).map(([value])=>value);if(!allowed.includes(mode))return;
  selection.mode=mode;selection.showRows=selection.view==='pending'||mode==='table';
  if(typeof EnrollmentViews==='object')EnrollmentViews.set(selection.userId,selection.view,mode,allowed);
  const data=reportResultCache.get(selection);if(data)drawReportResults(container,results,selection,data);
}

async function renderReports(){
  const selection=reportsView(),pendingView=selection.view==='pending',container=$('#content');
  const title=pendingView?'Bandeja de pendientes':'Estadísticas de matrícula';
  container.innerHTML=heading(title,pendingView?'Revisa los expedientes con antecedentes administrativos pendientes.':'Consulta los resultados actuales por curso, año y estado. Cada estudiante cuenta una vez por año.');
  const advancedCount=reportFilterChips(selection).filter(item=>!['course','status','q','pending'].includes(item.key)).length;
  container.insertAdjacentHTML('beforeend',`<section class="panel report-filters"><form id="report-filters"><div class="fields report-basic-fields"><label>Curso<select name="course"><option value="">Todos mis cursos</option>${options(courses(selection.year),selection.course)}</select></label><label>Estado<select name="status"><option value="">Todos los estados</option>${Object.entries(reportLabels).map(([key,label])=>`<option value="${key}" ${selection.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Buscar estudiante<input name="q" maxlength="100" type="search" placeholder="Nombre, identificación, correo o teléfono" value="${esc(selection.q)}"></label></div><details class="report-more-filters" ${selection.moreFiltersOpen?'open':''}><summary>Más filtros${advancedCount?` · ${advancedCount} activos`:''}</summary><div class="fields">${reportChoice('identifierType','Tipo de identificación',selection,reportAdvancedChoices.identifierType,'Todos los tipos')}${reportChoice('pendingKey','Antecedente pendiente',selection,reportAdvancedChoices.pendingKey,'Cualquier antecedente')}${reportChoice('contact','Contacto del apoderado',selection,reportAdvancedChoices.contact,'Cualquier contacto')}${reportChoice('origin','Origen de la ficha',selection,reportAdvancedChoices.origin,'Todos los orígenes')}${can('documents')?reportChoice('documentKind','Documento',selection,[['identity','Documento identificatorio'],['signed','Ficha firmada']],'Cualquier documento')+reportChoice('documentState','Estado del documento visible',selection,[['missing','Sin documento visible'],['present','Presente para mi cuenta']],'Elige un estado'):''}<label>Actualizado desde<input type="date" name="updatedFrom" value="${esc(selection.updatedFrom)}"></label><label>Actualizado hasta<input type="date" name="updatedTo" value="${esc(selection.updatedTo)}"></label>${reportChoice('sort','Ordenar por',selection,reportAdvancedChoices.sort,null)}</div><p class="hint">Las fechas corresponden a la última actualización de la ficha, en horario de Chile. La ausencia de documento se refiere a los que tu cuenta puede ver.</p></details><div class="report-filter-actions">${pendingView?'':`<label class="report-check"><input name="pending" type="checkbox" value="1" ${selection.pending?'checked':''}>Solo fichas con pendientes</label>`}<div class="actions"><button class="primary" type="submit">Aplicar filtros</button><button type="button" data-report-action="clear-filters">Limpiar filtros</button></div></div><p id="report-filter-error" class="error-text" role="alert"></p></form><div id="report-active-filters"></div></section><div id="report-results" class="spaced"></div>`);
  const form=$('#report-filters'),results=$('#report-results');
  const refreshChips=()=>{
    const count=reportFilterChips(selection).filter(item=>!['course','status','q','pending'].includes(item.key)).length;
    const summary=form.querySelector?.('.report-more-filters > summary');if(summary)summary.textContent='Más filtros'+(count?' · '+count+' activos':'');
    const target=$('#report-active-filters');if(!target||typeof EnrollmentViews!=='object')return;
    target.innerHTML=EnrollmentViews.chips({id:'report-filters',items:reportFilterChips(selection)});
    EnrollmentViews.bindChips(target,'report-filters',async({key,clear})=>{
      if(clear)Object.assign(selection,{course:'',status:'',q:'',pending:pendingView?'1':'',...reportAdvancedDefaults()});
      else if(key==='documentKind'){selection.documentKind='';selection.documentState='';}
      else if(Object.hasOwn(reportFilters(selection),key))selection[key]=key==='sort'?'name':'';
      selection.page=1;selection.coursePage=1;await renderReports();
    });
  };
  refreshChips();
  const more=form.querySelector?.('.report-more-filters');if(more)more.ontoggle=()=>{selection.moreFiltersOpen=more.open;};
  form.onsubmit=async event=>{
    event.preventDefault();
    const error=$('#report-filter-error');if(error)error.textContent='';
    try{Object.assign(selection,reportFilterValues(new FormData(form),pendingView),{page:1,coursePage:1});refreshChips();await loadReportResults(container,results,selection);}
    catch(failure){if(error)error.textContent=failure.message;else notice(failure.message);}
  };
  container.onclick=async event=>{
    const button=event.target.closest('[data-report-action]');if(!button)return;
    const action=button.dataset.reportAction;
    try{
      if(action==='details'){
        if(button.hasAttribute('data-report-status'))selection.status=button.dataset.reportStatus;
        if(button.hasAttribute('data-report-course'))selection.course=button.dataset.reportCourse;
        if(button.dataset.reportPending==='1')selection.pending='1';
        selection.showRows=true;selection.mode='table';selection.page=1;selection.coursePage=1;
        if(typeof EnrollmentViews==='object')EnrollmentViews.set(selection.userId,selection.view,'table',reportModes(selection).map(([mode])=>mode));
        await renderReports();
        $('#report-list-title')?.focus();
      }else if(action==='hide-rows'){
        changeReportMode(selection,'summary',container,results);
      }else if(action==='mode'){
        changeReportMode(selection,button.dataset.mode,container,results);
      }else if(action==='clear-filters'){
        Object.assign(selection,{course:'',status:'',q:'',pending:pendingView?'1':'',...reportAdvancedDefaults(),page:1,coursePage:1});await renderReports();
      }else if(action==='previous'||action==='next'){
        selection.page+=action==='next'?1:-1;await loadReportResults(container,results,selection);
      }else if(action==='roster')openRosterDownloads(reportFilters(selection));
      else if(action==='summary'){
        const format=button.dataset.format;setBusy(button,true,'Preparando archivo…');
        try{
          await download('/api/reports/summary?'+reportParams(reportFilters(selection),{format}),{},`estadisticas-${selection.year}.${format}`);
          notice('Informe descargado.');
        }finally{setBusy(button,false);}
      }
    }catch(error){notice(error.message);}
  };
  await loadReportResults(container,results,selection);
}

function reportFilters(selection){const {year,course,status,q,pending}=selection,filters={year,course,status,q,pending};for(const key of Object.keys(reportAdvancedDefaults()))if(selection[key]&&(key!=='sort'||selection[key]!=='name'))filters[key]=selection[key];return filters;}

async function loadReportResults(container,results,selection){
  const serial=++reportSerial;
  showLoading(results,'Cargando resultados de matrícula…',selection.view==='pending'?'pending':'reports');
  try{
    const data=await api('/api/reports/statistics?'+reportParams(reportFilters(selection),{includeRecords:'1',page:selection.page,pageSize:selection.pageSize}));
    if(serial!==reportSerial||container!==$('#content')||results!==$('#report-results'))return;
    drawReportResults(container,results,selection,data);
  }catch(error){if(serial===reportSerial&&results===$('#report-results'))loadingError(results,error);}
}

function drawReportResults(container,results,selection,data){
  reportResultCache.set(selection,data);
  results.removeAttribute('aria-busy');
  if(data.items){selection.page=data.page;selection.pageSize=data.pageSize;}
  const coursePage=EnrollmentPagination.slice(data.byCourse,{page:selection.coursePage,pageSize:selection.coursePageSize});
  selection.coursePage=coursePage.page;selection.coursePageSize=coursePage.pageSize;
  const indicators=[['Matrícula vigente',data.byStatus.enrolled,'enrolled'],['Borradores',data.byStatus.draft,'draft'],['Retirados',data.byStatus.withdrawn,'withdrawn'],['Con pendientes',data.pending,null]];
  const toolbar=can('export')?`<div class="actions"><button data-report-action="roster">Exportar nómina</button>${selection.view==='pending'?'':'<button data-report-action="summary" data-format="pdf">Informe PDF</button><button data-report-action="summary" data-format="xlsx">Informe Excel</button>'}</div>`:'';
  const dashboard=selection.view==='pending'||selection.mode==='table'?'':selection.mode==='charts'?reportCharts(data,coursePage):`<div class="report-indicators">${indicators.map(([label,value,status])=>`<button class="report-indicator" data-report-action="details" ${status!==null?`data-report-status="${status}"`:'data-report-pending="1"'}><span>${label}</span><strong>${reportNumber(value)}</strong><small>Ver expedientes</small></button>`).join('')}</div><section class="panel spaced"><h2>Por curso</h2><div class="table-wrap"><table><thead><tr><th>Curso</th><th>Expedientes</th><th>Vigentes</th><th>Borradores</th><th>Retirados</th><th>Con pendientes</th></tr></thead><tbody>${coursePage.items.map(course=>`<tr><td><button class="student-button" data-report-action="details" data-report-course="${esc(course.id)}" data-report-status="">${esc(course.name)}</button></td><td>${reportNumber(course.total)}</td><td>${reportNumber(course.enrolled)}</td><td>${reportNumber(course.draft)}</td><td>${reportNumber(course.withdrawn)}</td><td>${reportNumber(course.pending)}</td></tr>`).join('')||'<tr><td colspan="6">No hay expedientes en esta selección.</td></tr>'}</tbody></table></div>${EnrollmentPagination.html({id:'report-courses',label:'cursos del informe',...coursePage})}</section><section class="panel spaced"><h2>Movimientos de los expedientes seleccionados</h2><p class="hint">Incluyen el historial de estas fichas. No se suman a la matrícula vigente.</p><div class="report-movements">${Object.entries(reportMovementLabels).map(([key,label])=>`<div class="stat-line"><span>${label}</span><strong>${reportNumber(data.movements[key])}</strong></div>`).join('')}</div></section>`;
  const records=!data.items||(!selection.showRows&&selection.mode!=='table'&&selection.view!=='pending')?'':reportRecordCollection(selection,data);
  results.innerHTML=`<div class="report-cut"><p role="status">Año escolar ${selection.year} · ${reportNumber(data.total)} expediente${Number(data.total)===1?'':'s'} · Generado ${esc(reportWhen(data.generatedAt))}</p>${toolbar}</div><div class="report-view-toolbar">${reportModeControl(selection)}</div>${dashboard}${records}`;
  const stillHere=()=>container===$('#content')&&results===$('#report-results');
  EnrollmentPagination.bind(results,'report-courses',({page,pageSize})=>{
    if(!stillHere())return;
    selection.coursePage=page;selection.coursePageSize=pageSize;
    drawReportResults(container,results,selection,data);
  });
  EnrollmentPagination.bind(results,'report-records',async({page,pageSize})=>{
    if(!stillHere())return;
    selection.page=page;selection.pageSize=pageSize;
    await loadReportResults(container,results,selection);
  });
  if(typeof EnrollmentViews==='object')EnrollmentViews.bind(results,'report-mode',mode=>changeReportMode(selection,mode,container,results));
}

function reportRecordCollection(selection,data){
  const items=data.items,mode=selection.view==='pending'?selection.mode||'table':'table';
  let body;
  if(mode==='cards')body=`<div class="collection-cards report-record-cards">${items.map(item=>`<article class="collection-card"><div class="report-record-meta"><span>${esc(item.courseName)}</span><span class="status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></div><button class="student-button report-record-name" data-action="open" data-id="${esc(item.id)}">${esc(item.name)}</button><p>${item.pending.map(esc).join(' · ')||'Sin antecedentes pendientes'}</p><button type="button" data-action="open" data-id="${esc(item.id)}" aria-label="Abrir expediente de ${esc(item.name)}">Abrir expediente</button></article>`).join('')||'<p class="empty">No hay expedientes en esta selección.</p>'}</div>`;
  else if(mode==='compact')body=`<div class="collection-compact report-record-compact">${items.map(item=>`<div class="report-compact-row"><div><button class="student-button" data-action="open" data-id="${esc(item.id)}">${esc(item.name)}</button><span>${esc(item.courseName)} · ${esc(statusLabel(item.status))}</span></div><p>${item.pending.map(esc).join(' · ')||'Sin pendientes'}</p></div>`).join('')||'<p class="empty">No hay expedientes en esta selección.</p>'}</div>`;
  else body=`<div class="table-wrap"><table><thead><tr><th>Estudiante</th><th>Curso</th><th>Estado</th><th>Antecedentes pendientes</th></tr></thead><tbody>${items.map(item=>`<tr><td><button class="student-button" data-action="open" data-id="${esc(item.id)}">${esc(item.name)}</button></td><td>${esc(item.courseName)}</td><td>${esc(statusLabel(item.status))}</td><td>${item.pending.map(esc).join(' · ')||'—'}</td></tr>`).join('')||'<tr><td colspan="4">No hay expedientes en esta selección.</td></tr>'}</tbody></table></div>`;
  return `<section class="panel spaced report-records-panel"><h2 id="report-list-title" tabindex="-1">${selection.view==='pending'?'Expedientes pendientes':'Expedientes de la selección'}</h2>${body}${EnrollmentPagination.html({id:'report-records',label:selection.view==='pending'?'expedientes pendientes':'expedientes del informe',total:data.total,page:data.page,pageSize:data.pageSize})}</section>`;
}
function reportBar(label,value,total,attributes=''){
  const count=Number(value)||0,denominator=Math.max(0,Number(total)||0),percent=denominator?Math.max(0,Math.min(100,Math.round(count*100/denominator))):0;
  return `<button type="button" class="report-chart-row" data-report-action="details" ${attributes}><span class="report-chart-label">${esc(label)}</span><meter min="0" max="${Math.max(1,denominator)}" value="${count}" aria-label="${esc(label)}: ${reportNumber(count)} de ${reportNumber(denominator)}">${percent}%</meter><strong>${reportNumber(count)}</strong><span class="report-chart-percent">${percent}%</span></button>`;
}
function reportCharts(data,coursePage){
  return `<section class="panel spaced report-chart"><h2>Distribución por estado</h2><p class="hint">Proporción sobre los ${reportNumber(data.total)} expedientes del conjunto filtrado.</p><div class="report-chart-rows">${Object.entries(reportLabels).map(([status,label])=>reportBar(label,data.byStatus[status],data.total,`data-report-status="${status}"`)).join('')}</div></section><section class="panel spaced report-chart"><h2>Expedientes por curso</h2><p class="hint">Cada barra representa la proporción del curso sobre los ${reportNumber(data.total)} expedientes de toda la selección. Pulsa un curso para abrir sus expedientes.</p><div class="report-chart-rows">${coursePage.items.map(course=>reportBar(course.name,course.total,data.total,`data-report-course="${esc(course.id)}" data-report-status=""`)).join('')||'<p class="empty">No hay cursos con expedientes en esta selección.</p>'}</div>${EnrollmentPagination.html({id:'report-courses',label:'cursos del informe',...coursePage})}</section>`;
}
