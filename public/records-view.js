/* The records view owns its presentation; loading, filters and caching remain in app.js. */
function recordsViewIcon(name){
  const paths={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',add:'<path d="M12 5v14M5 12h14"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',record:'<path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h5"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.record}</svg>`;
}
const recordsViews=()=>typeof EnrollmentViews==='object'?EnrollmentViews:{get:(_user,_section,_modes,fallback)=>fallback,html:()=>'',bind:()=>{},set:()=>{}};

async function renderRecords(){
  const content=$('#content');if(!content)return;
  content.classList.add('records-content');
  const views=recordsViews(),modes=[['table','Tabla'],['compact','Compacta'],['cards','Tarjetas']],mode=views.get(state.user?.id,'records',modes.map(([value])=>value),'table'),advanced=recordAdvancedFilters();
  const choice=(name,label,values,selected=advanced[name])=>`<label>${label}<select name="${name}"><option value="">Todos</option>${values.map(([value,text])=>`<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  const documentOptions=[['identity:present','Con identificación'],['identity:missing','Sin identificación visible'],...(can('sensitive')?[['signed:present','Con ficha firmada'],['signed:missing','Sin ficha firmada visible']]:[])];
  const documentKey=filters=>filters.documentKind&&filters.documentState?filters.documentKind+':'+filters.documentState:'';
  const renderDocument=()=>can('documents')?choice('document','Documento adjunto',documentOptions,documentKey(advanced)):'';
  const filterLabel={identifierType:'Identificación',pendingKey:'Pendiente',contact:'Contacto',document:'Documento',origin:'Origen',updatedFrom:'Desde',updatedTo:'Hasta',sort:'Orden'};
  const active=filters=>Object.entries({...filters,document:documentKey(filters)}).filter(([key,value])=>value&&!['documentKind','documentState'].includes(key)&&!(key==='sort'&&value==='name'));
  function updateChips(){
    const filters=active(recordAdvancedFilters());
    content.querySelector('.records-more-filters summary').textContent='Más filtros'+(filters.length?' · '+filters.length+' activos':'');
    content.querySelector('#records-filter-chips').innerHTML=filters.map(([key,value])=>{
      const control=content.querySelector('[name="'+key+'"]');
      const label=control?.selectedOptions?.[0]?.textContent||value;
      return '<button type="button" data-record-filter-clear="'+key+'" aria-label="Quitar '+esc(filterLabel[key]+': '+label)+'">'+esc(label)+' ×</button>';
    }).join('');
  }
  content.innerHTML=`<div id="records-view"><header class="records-heading"><div class="records-heading-copy"><p class="records-kicker">Año escolar ${esc(state.year)}</p><div class="records-title"><h1>Expedientes</h1><span id="records-total" class="records-total" role="status">Consultando…</span></div><p>Encuentra el estudiante y trabaja con la vista que te resulte más cómoda.</p></div><div class="records-actions">${can('write')?`<button type="button" class="primary" data-action="new">${recordsViewIcon('add')}<span>Nueva matrícula</span></button>`:''}${can('export')?`<button type="button" data-action="export-roster">${recordsViewIcon('download')}<span>Exportar lista</span></button><button type="button" data-action="export-course" aria-describedby="course-export-hint" ${!state.course?'disabled':''}>${recordsViewIcon('download')}<span>Exportar curso</span></button>`:''}</div></header><section class="records-filters" aria-label="Filtros de expedientes"><div class="records-filter-fields"><label class="records-search-label" for="search">Buscar estudiante<div class="records-search-control">${recordsViewIcon('search')}<input id="search" type="search" autocomplete="off" maxlength="100" placeholder="Nombre, identificación, correo o teléfono" value="${esc(state.q)}"></div></label><label for="course-filter">Curso<select id="course-filter"><option value="">Todos mis cursos</option>${options(courses(state.year),state.course)}</select></label><label for="status-filter">Estado<select id="status-filter"><option value="">Todos los estados</option>${Object.entries({draft:'Borrador',enrolled:'Matriculado',withdrawn:'Retirado'}).map(([value,label])=>`<option value="${value}" ${value===state.status?'selected':''}>${label}</option>`).join('')}</select></label></div><details class="records-more-filters" ${active(advanced).length?'open':''}><summary>Más filtros</summary><div class="fields">${choice('identifierType','Tipo de identificación',[['RUN','RUN'],['IPE','IPE'],['Pasaporte','Pasaporte'],['Otro','Otro'],['Provisional','Provisional']])}${choice('pendingKey','Antecedente pendiente',Object.entries({guardianName:'Nombre del apoderado',guardianPhone:'Teléfono del apoderado',emergencyPhone:'Teléfono de emergencia',imagesDecision:'Decisión sobre imágenes',outingsDecision:'Decisión sobre salidas',birthCertificate:'Documento identificatorio'}))}${renderDocument()}${choice('contact','Contacto del apoderado',[['missing-phone','Sin teléfono'],['missing-email','Sin correo'],['complete','Completo']])}${choice('origin','Origen',[['manual','Ingreso manual'],['imported','Importación']])}<label>Desde<input type="date" name="updatedFrom" value="${esc(advanced.updatedFrom)}"></label><label>Hasta<input type="date" name="updatedTo" value="${esc(advanced.updatedTo)}"></label>${choice('sort','Orden',[['name','Nombre'],['updated-desc','Más recientes'],['updated-asc','Más antiguas'],['course','Curso'],['status','Estado']])}</div><div class="records-more-actions"><button type="button" data-record-clear-all>Limpiar filtros adicionales</button><p class="hint" data-filter-error role="alert"></p></div></details><div class="filter-chips" id="records-filter-chips"></div>${can('export')?`<p id="course-export-hint" class="records-filter-hint">${state.course?'Se exportará el curso y los filtros actuales.':'Elige un curso para exportar su nómina.'}</p>`:''}</section><section class="records-panel table-panel" aria-label="Expedientes"><header class="records-list-caption"><div><h2>Estudiantes</h2><span>Selecciona un nombre para abrir su ficha</span></div><div id="records-view-control">${views.html({id:'records-mode',label:'Vista de expedientes',modes,value:mode})}</div></header><div id="list-table" aria-live="polite"></div></section></div>`;
  const loadCurrentList=async()=>{await loadList();if(content!==$('#content'))return;if(content.querySelector('#list-table .callout.error')){const total=$('#records-total');if(total)total.textContent='Sin actualizar';}};
  let searchTimer;
  const search=$('#search'),course=$('#course-filter'),status=$('#status-filter');
  const filterPanel=content.querySelector('.records-more-filters');
  const runAdvanced=()=>{
    const next={...recordFilterDefaults},error=filterPanel.querySelector('[data-filter-error]');
    for(const key of Object.keys(next)){const field=filterPanel.querySelector('[name="'+key+'"]');if(field)next[key]=field.value;}
    const [kind='',status='']=(filterPanel.querySelector('[name="document"]')?.value||'').split(':');next.documentKind=kind;next.documentState=status;
    if(next.updatedFrom&&next.updatedTo&&next.updatedFrom>next.updatedTo){error.textContent='La fecha inicial debe ser anterior o igual a la fecha final.';return;}
    error.textContent='';clearTimeout(searchTimer);state.recordFilters=next;state.page=1;updateChips();loadCurrentList();
  };
  filterPanel?.querySelectorAll('select,input').forEach(field=>field.addEventListener('change',runAdvanced));
  content.querySelector('[data-record-clear-all]')?.addEventListener('click',()=>{for(const field of filterPanel.querySelectorAll('select,input'))field.value=recordFilterDefaults[field.name]||'';runAdvanced();});
  content.querySelector('#records-filter-chips')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-record-filter-clear]');if(!button)return;
    const key=button.dataset.recordFilterClear,field=filterPanel.querySelector('[name="'+key+'"]');if(!field)return;
    field.value=recordFilterDefaults[key]||'';runAdvanced();filterPanel.querySelector('summary').focus();
  });
  if(filterPanel?.querySelector('summary')&&content.querySelector('#records-filter-chips'))updateChips();
  views.bind(content,'records-mode',next=>{views.set(state.user?.id,'records',next,modes.map(([value])=>value));const cached=recordsCache.get(recordsCacheKey(recordsSelection()));if(cached)paintListResult($('#list-table'),cached);else loadCurrentList();});
  const runSearch=()=>{clearTimeout(searchTimer);state.page=1;return loadCurrentList();};
  search.oninput=event=>{
    state.q=event.target.value;state.page=1;clearTimeout(searchTimer);listRequest++;
    const total=$('#records-total');if(total)total.textContent='Buscando…';
    showLoading($('#list-table'),'Buscando expedientes…');searchTimer=setTimeout(()=>loadCurrentList(),250);
  };
  search.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();runSearch();}};
  course.onchange=event=>{
    clearTimeout(searchTimer);state.course=event.target.value;state.page=1;
    const exportButton=content.querySelector('[data-action="export-course"]');if(exportButton)exportButton.disabled=!state.course||!can('export');
    const hint=$('#course-export-hint');if(hint)hint.textContent=state.course?'Se exportará el curso y los filtros actuales.':'Elige un curso para exportar su nómina.';
    loadCurrentList();
  };
  status.onchange=event=>{clearTimeout(searchTimer);state.status=event.target.value;state.page=1;loadCurrentList();};
  await loadCurrentList();
}

function paintListResult(container,result){
  const oldPage=container.dataset?.recordsPage,oldSize=container.dataset?.recordsPageSize;
  const previousScroll=container.querySelector?.('.table-wrap')?.scrollTop||0;
  container.removeAttribute('aria-busy');state.page=result.page;state.pageSize=result.pageSize;
  if(container.dataset){container.dataset.recordsPage=String(result.page);container.dataset.recordsPageSize=String(result.pageSize);}
  const total=$('#records-total');if(total)total.textContent=`${Number(result.total).toLocaleString('es-CL')} expediente${result.total===1?'':'s'}`;
  const mode=recordsViews().get(state.user?.id,'records',['table','compact','cards'],'table');
  const rowHtml=record=>`<article class="collection-card records-card"><div class="records-card-top"><span class="records-student-symbol">${recordsViewIcon('record')}</span><span class="status ${esc(record.status)}">${esc(statusLabel(record.status))}</span></div><button type="button" class="student-button records-name-button" data-action="open" data-id="${esc(record.id)}" title="${esc(record.name)}">${esc(record.name)}</button><p>${esc(courseName(record.courseId))}</p><small>${esc(date(record.updatedAt))}${record.origin==='imported'?' · Importación':''}</small><button type="button" class="records-card-open" data-action="open" data-id="${esc(record.id)}" aria-label="Abrir ficha de ${esc(record.name)}">Abrir ficha ${recordsViewIcon('arrow')}</button></article>`;
  const compact=record=>`<div class="records-compact-row"><button type="button" class="student-button" data-action="open" data-id="${esc(record.id)}">${esc(record.name)}</button><span>${esc(courseName(record.courseId))}</span><span class="status ${esc(record.status)}">${esc(statusLabel(record.status))}</span><span>${esc(date(record.updatedAt))}</span></div>`;
  const table=result.items.length?`<div class="records-mode-${mode}">${mode==='cards'?`<div class="collection-cards records-cards">${result.items.map(rowHtml).join('')}</div>`:mode==='compact'?`<div class="records-compact">${result.items.map(compact).join('')}</div>`:`<div class="table-wrap records-table-scroll" tabindex="0" role="region" aria-label="Lista de estudiantes"><table class="records-table"><thead><tr><th scope="col">Estudiante</th><th scope="col">Curso</th><th scope="col">Estado</th><th scope="col">Última actualización</th><th class="records-open-column" scope="col"><span class="sr-only">Abrir ficha</span></th></tr></thead><tbody>${result.items.map(record=>`<tr><td><button type="button" class="student-button records-name-button" data-action="open" data-id="${esc(record.id)}" title="${esc(record.name)}"><span class="records-student-symbol">${recordsViewIcon('record')}</span><span>${esc(record.name)}</span></button></td><td class="records-course">${esc(courseName(record.courseId))}</td><td><span class="status ${esc(record.status)}">${esc(statusLabel(record.status))}</span></td><td class="records-updated"><time datetime="${esc(record.updatedAt||'')}">${esc(date(record.updatedAt))}</time></td><td class="records-open-column"><button type="button" class="records-open-button" data-action="open" data-id="${esc(record.id)}" aria-label="Abrir ficha de ${esc(record.name)}">${recordsViewIcon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>`}</div>`:`<div class="empty records-empty">${recordsViewIcon('search')}<strong>No hay expedientes en esta selección</strong><p>Prueba otro nombre, curso o estado${can('write')?', o crea una nueva matrícula':''}.</p></div>`;
  container.innerHTML=table+EnrollmentPagination.html({id:'records',label:'expedientes',...result});
  if(oldPage===String(result.page)&&oldSize===String(result.pageSize)){const tableScroll=container.querySelector?.('.table-wrap');if(tableScroll)tableScroll.scrollTop=previousScroll;}
  EnrollmentPagination.bind(container,'records',async next=>{state.page=next.page;state.pageSize=next.pageSize;await loadList();});
}
