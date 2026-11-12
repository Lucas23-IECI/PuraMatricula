let importPreviewPages;
const importPreviewModes=['table','compact','cards'];
const importEmptyFilters=()=>({q:'',kind:'',sheet:'',course:'',issues:''});
const importSearchText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const importIssueGroups=[['possibleIpe','Posibles IPE'],['identity','Otras identificaciones'],['duplicate','Duplicados'],['course','Otros problemas de curso'],['other','Otros problemas']];
const importIpeLocation=({sheet,row})=>JSON.stringify([sheet,row]);
function canReviewImportIpe(preview){return state.importKind==='school'&&state.importIpeReviewValid&&Array.isArray(preview.confirmedIpeRows)&&Array.isArray(state.importOptions?.confirmedIpeRows)&&Boolean(preview.ipeConfirmationToken)&&state.importOptions.ipeConfirmationToken===preview.ipeConfirmationToken;}
function importIssueGroup(issue){
  if(issue.reason==='possibleIpe')return 'possibleIpe';
  if(['RUT_INVALIDO','IDENTIDAD_AUSENTE','IDENTIFICADOR_LARGO','IDENTIFIER_TYPE_INVALID','IDENTIFIER_REQUIRED','RUN_INVALID'].includes(issue.code))return 'identity';
  if(issue.code==='DUPLICADO_IDENTIDAD')return 'duplicate';
  if(/^(CURSO_|COURSE_)/.test(issue.code||''))return 'course';
  return 'other';
}
function resetImportPreview(){importPreviewPages=undefined;}
function importPreviewWorkspace(){
  const preview=state.importPreview,owner=state.user?.id;
  if(!importPreviewPages||importPreviewPages.preview!==preview||importPreviewPages.owner!==owner){
    importPreviewPages={preview,owner,updates:new Set(),annual:new Set(),createCourses:false,warningsOpen:false,ipeOpen:false,filters:importEmptyFilters(),
      mode:typeof EnrollmentViews==='object'?EnrollmentViews.get(owner,'import-preview',importPreviewModes,'table'):'table',
      rows:{page:1,pageSize:25},errors:{page:1,pageSize:10,q:'',group:''},warnings:{page:1,pageSize:10,q:''},courses:{page:1,pageSize:10,q:''},ipe:{page:1,pageSize:10}};
  }
  return importPreviewPages;
}
function selectedImportUpdates(){
  const preview=state.importPreview,workspace=importPreviewWorkspace();
  if(state.importKind!=='school'||!preview?.ticket||state.importTicket!==preview.ticket)return [];
  return [...workspace.updates].filter(index=>Number.isInteger(index)&&preview.rows[index]?.review?.kind==='update').sort((a,b)=>a-b);
}
function selectedImportAnnual(){
  const preview=state.importPreview,workspace=importPreviewWorkspace();
  if(state.importKind!=='school'||!preview?.ticket||state.importTicket!==preview.ticket)return [];
  return [...workspace.annual].filter(index=>Number.isInteger(index)&&preview.rows[index]?.review?.kind==='annual').sort((a,b)=>a-b);
}
function importRowName(row){return [row.data?.names,row.data?.surname,row.data?.secondSurname].filter(Boolean).join(' ')||row.name||'Sin nombre';}
function importCourseKey(row){return row.courseId?'id:'+row.courseId:row.courseName?'proposal:'+JSON.stringify([row.courseName,row.section||'']):'unassigned';}
function importCourseLabel(preview,row){return row.courseId?(preview.courses||[]).find(course=>course.id===row.courseId)?.name||courseName(row.courseId):[row.courseName,row.section].filter(Boolean).join(' ')||'Curso por asignar';}
function importRowIssues(preview,school){
  const sets={errors:new Set(),warnings:new Set()},key=(sheet,row)=>JSON.stringify([String(sheet||''),Number(row)||0]);
  for(const kind of ['errors','warnings'])for(const issue of preview[kind]||[]){
    if(issue&&typeof issue==='object'&&(issue.sheet||issue.row))sets[kind].add(key(issue.sheet,issue.row));
  }
  return (row,index)=>{
    const sheet=school?row.sourceSheet:'',number=school?row.rowNumber:(row.index??index)+1;
    const has=kind=>sets[kind].has(key(sheet,number))||Boolean(sheet&&sets[kind].has(key(sheet,0)))||sets[kind].has(key('',number));
    return {errors:Boolean(row.issue)||has('errors'),warnings:has('warnings')};
  };
}
function importFilteredRows(preview,workspace,school=state.importKind==='school'){
  const filters=workspace.filters,query=importSearchText(filters.q),issuesFor=importRowIssues(preview,school);
  // Original indices identify signed rows and checkbox selections, including hidden rows.
  return preview.rows.map((row,index)=>({row,index})).filter(({row,index})=>{
    const kind=school?row.review?.kind:row.issue?'issue':'valid',issues=issuesFor(row,index);
    if(filters.kind&&kind!==filters.kind)return false;
    if(filters.sheet&&row.sourceSheet!==filters.sheet)return false;
    if(filters.course&&importCourseKey(row)!==filters.course)return false;
    if(filters.issues==='errors'&&!issues.errors||filters.issues==='warnings'&&!issues.warnings||filters.issues==='any'&&!issues.errors&&!issues.warnings||filters.issues==='clean'&&(issues.errors||issues.warnings))return false;
    return !query||importSearchText([importRowName(row),row.data?.identifier,row.identifier,row.sourceSheet,school?importCourseLabel(preview,row):''].filter(Boolean).join(' ')).includes(query);
  });
}
function importFilteredList(items,query){const q=importSearchText(query);return q?items.filter(item=>importSearchText(typeof item==='string'?item:[item.sheet,item.row?'fila '+item.row:'',item.message,item.name,item.firstSheet,item.firstRow?'fila '+item.firstRow:''].filter(Boolean).join(' ')).includes(q)):items;}
function importFilterLabel(key,value,choices){return key==='q'?'Buscar: '+value:key==='kind'?'Resultado: '+(choices.kinds.find(([id])=>id===value)?.[1]||value):key==='sheet'?'Hoja: '+value:key==='course'?'Curso: '+(choices.courses.find(([id])=>id===value)?.[1]||value):'Observaciones: '+(choices.issues.find(([id])=>id===value)?.[1]||value);}
function importFilterMarkup(preview,workspace,school){
  const filters=workspace.filters,kinds=school?[['new','Nuevas fichas'],['annual','Matrículas de otro año'],['update','Cambios de contacto'],['match','Coinciden · se omiten'],['review','Revisión manual']]:[['valid','Filas válidas'],['issue','Con observaciones']];
  const sheets=[...new Set(preview.rows.map(row=>row.sourceSheet).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const courses=[...new Map(preview.rows.map(row=>[importCourseKey(row),importCourseLabel(preview,row)])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'));
  const issues=[['errors','Con errores'],['warnings','Con advertencias'],['any','Con alguna observación'],['clean','Sin observaciones de fila']];
  const select=(key,label,values,all)=>'<label>'+label+'<select data-import-filter="'+key+'"><option value="">'+all+'</option>'+values.map(([id,name])=>'<option value="'+esc(id)+'" '+(filters[key]===id?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
  const chips=typeof EnrollmentViews==='object'?EnrollmentViews.chips({id:'import-preview-filters',items:Object.entries(filters).filter(([,value])=>value).map(([key,value])=>({key,label:importFilterLabel(key,value,{kinds,courses,issues})}))}):'';
  return '<form id="import-row-filters" class="import-row-filters" role="search" aria-label="Filtrar estudiantes revisados"><label class="import-filter-query">Buscar en la revisión<input type="search" data-import-filter="q" maxlength="160" placeholder="Nombre o identificación" value="'+esc(filters.q)+'"></label>'+select('kind','Resultado',kinds,'Todos los resultados')+(school?select('sheet','Hoja de origen',sheets.map(sheet=>[sheet,sheet]),'Todas las hojas')+select('course','Curso',courses,'Todos los cursos'):'')+select('issues','Observaciones',issues,'Todas las filas')+'</form>'+chips;
}
function importResultMarkup(preview,workspace,page,school,reviewable){
  const outcome=row=>({new:'Nueva ficha',annual:'Nueva matrícula anual '+preview.year,match:'Coincide · se omite',review:'Revisión manual · se omite',update:'Cambios de contacto'}[row.review?.kind]||row.issue||'Válida');
  const content=page.items.map(({row,index})=>{
    const name=importRowName(row),review=row.review||{},origin=school?[row.sourceSheet,'fila '+row.rowNumber].filter(Boolean).join(' · '):'Fila '+((row.index??index)+1),identifier=school?[row.data?.identifierType,row.data?.identifier].filter(Boolean).join(' · '):'—',course=school?importCourseLabel(preview,row):'—';
    const selection=review.kind==='update'?'<details><summary>'+review.changes.length+' campos con cambios</summary><ul>'+review.changes.map(change=>'<li><strong>'+esc(change.label)+':</strong> '+esc(change.before||'Sin dato')+' → '+esc(change.after)+'</li>').join('')+'</ul></details><label class="import-include"><input type="checkbox" data-import-update="'+index+'" aria-label="Aplicar cambios de '+esc(name)+'" '+(workspace.updates.has(index)?'checked ':'')+(!reviewable?'disabled':'')+'>Aplicar cambios</label>':review.kind==='annual'?'<label class="import-include"><input type="checkbox" data-import-annual="'+index+'" aria-label="Crear matrícula '+esc(preview.year)+' de '+esc(name)+'" '+(workspace.annual.has(index)?'checked ':'')+(!reviewable?'disabled':'')+'>Crear borrador de '+esc(preview.year)+' y conservar los otros años</label>':'';
    const result='<strong class="import-row-result" data-import-result="'+esc(review.kind||(row.issue?'issue':'valid'))+'">'+esc(outcome(row))+'</strong>'+(review.reason?'<p class="hint">'+esc(review.reason)+'</p>':'')+selection;
    if(workspace.mode==='cards')return '<article class="import-student-card collection-card" data-import-row="'+index+'"><header><h3>'+esc(name)+'</h3><span>'+esc(origin)+'</span></header><dl><div><dt>Identificación</dt><dd>'+esc(identifier)+'</dd></div>'+(school?'<div><dt>Curso</dt><dd>'+esc(course)+'</dd></div>':'')+'</dl><div class="import-card-result">'+result+'</div></article>';
    return '<tr data-import-row="'+index+'"><td>'+esc(origin)+'</td><td>'+esc(name)+'</td><td>'+esc(identifier)+'</td>'+(school?'<td>'+esc(course)+'</td>':'')+'<td>'+result+'</td></tr>';
  }).join('');
  if(!page.items.length)return '<div class="import-preview-empty" role="status"><strong>No hay estudiantes con estos filtros.</strong><p>Modifica los filtros para revisar otras filas. El archivo completo y sus observaciones se conservan.</p></div>';
  return '<div class="import-preview-results '+(workspace.mode==='cards'?'import-card-scroll':'table-wrap import-table')+'" data-import-mode="'+workspace.mode+'" tabindex="0" role="region" aria-label="Estudiantes de la revisión">'+(workspace.mode==='cards'?'<div class="import-student-grid collection-cards">'+content+'</div>':'<table class="'+(workspace.mode==='compact'?'collection-compact':'')+'"><thead><tr><th>Origen</th><th>Estudiante</th><th>Identificación</th>'+(school?'<th>Curso</th>':'')+'<th>Resultado</th></tr></thead><tbody>'+content+'</tbody></table>')+'</div>';
}
function renderImportPreview({focus=null}={}){
  const p=state.importPreview,preview=$('#import-preview');if(!p||!preview)return;
  const workspace=importPreviewWorkspace(),school=state.importKind==='school';
  const errors=school?(p.errors||[]):p.rows.filter(row=>row.issue).map(row=>({row:row.index+1,message:row.issue})),warnings=p.warnings||[],missing=p.coursesToCreate||[],canCreate=can('enroll')&&state.user.allCourses;
  const pendingCourse=school?errors.filter(error=>error.code==='CURSO_NO_RESUELTO'):[],blockers=school?errors.filter(error=>error.code!=='CURSO_NO_RESUELTO'):errors;
  const groups=school?importIssueGroups.map(([key,label])=>({key,label,count:blockers.filter(error=>importIssueGroup(error)===key).length})).filter(group=>group.count):[];
  const visibleErrors=workspace.errors.group?blockers.filter(error=>importIssueGroup(error)===workspace.errors.group):blockers;
  const location=value=>[value.sheet,value.row?'fila '+value.row:''].filter(Boolean).join(' · '),reviewable=school?Boolean(p.ticket)&&state.importTicket===p.ticket:p.canImport;
  const ipeEditable=canReviewImportIpe(p),appliedIpe=ipeEditable?p.confirmedIpeRows:[],draftIpe=ipeEditable?new Set(state.importOptions.confirmedIpeRows.map(importIpeLocation)):new Set();
  const appliedIpeKeys=new Set(appliedIpe.map(importIpeLocation));
  const pendingIpe=ipeEditable?[...draftIpe].filter(key=>!appliedIpeKeys.has(key)).length+[...appliedIpeKeys].filter(key=>!draftIpe.has(key)).length:0;
  if(!canCreate||!missing.length||!reviewable)workspace.createCourses=false;
  const filtered=importFilteredRows(p,workspace,school),rowPage=EnrollmentPagination.slice(filtered,workspace.rows),errorPage=EnrollmentPagination.slice(importFilteredList(visibleErrors,workspace.errors.q),workspace.errors),warningPage=EnrollmentPagination.slice(importFilteredList(warnings,workspace.warnings.q),workspace.warnings),coursePage=EnrollmentPagination.slice(importFilteredList(missing,workspace.courses.q),workspace.courses),ipePage=EnrollmentPagination.slice(appliedIpe,workspace.ipe);
  for(const [key,page] of [['rows',rowPage],['errors',errorPage],['warnings',warningPage],['courses',coursePage],['ipe',ipePage]])Object.assign(workspace[key],{page:page.page,pageSize:page.pageSize});
  const pager=(id,label,page,sizes=[5,10,25,50])=>EnrollmentPagination.html({id,label,...page,sizes});
  const listFilter=(key,label,items)=>items.length>10||workspace[key].q?'<label class="import-list-search">'+label+'<input type="search" data-import-list-filter="'+key+'" maxlength="160" value="'+esc(workspace[key].q)+'" placeholder="Buscar en esta lista"></label>':'';
  const counts=school&&p.summary?.new!==undefined?'<p class="hint">'+p.summary.new+' nuevas · '+(p.summary.annual||0)+' matrículas de otro año · '+p.summary.unchanged+' coinciden · '+p.summary.updates+' con cambios · '+p.summary.review+' para revisión manual</p>':'';
  const yearContext=p.yearContext,yearNotice=school&&Number.isInteger(p.year)&&yearContext?.resolvedYear!==null?'<div class="callout '+(yearContext?.conflict?'import-year-warning':'')+'" role="status"><strong>Año de destino: '+esc(p.year)+'</strong><p>'+(yearContext?.source==='file'?'Detectado en la planilla.'+(yearContext.conflict?' Habías seleccionado '+esc(yearContext.selectedYear)+'; esta carga se guardará en '+esc(p.year)+'.':''):'La planilla no indica un año único. Se usará el año elegido en el formulario.')+' El selector superior cambiará a '+esc(p.year)+' cuando confirmes la importación.</p></div>':'';
  const instructions=school?(reviewable?'Las fichas nuevas se guardarán como borradores. Marca las matrículas de otros años y los cambios de contacto que quieres aplicar. Solo se crearán cursos necesarios para las filas que se guarden. Las selecciones se conservan al cambiar de página. Las celdas vacías del Excel no borran datos guardados.':blockers.length?'Resuelve las observaciones y vuelve a previsualizar para habilitar el guardado.':'No hay fichas nuevas ni cambios aplicables en esta revisión.'):reviewable?'Revisa nombres, identificación y curso. Las filas se guardarán juntas como borradores.':'Corrige la planilla y vuelve a previsualizar antes de importar.';
  const modeControls=typeof EnrollmentViews==='object'?EnrollmentViews.html({id:'import-preview-mode',label:'Vista de estudiantes',modes:[['table','Tabla'],['compact','Compacta'],['cards','Tarjetas']],value:workspace.mode}):'';
  const selected=selectedImportUpdates().length+selectedImportAnnual().length;
  const detected=school&&Number.isSafeInteger(p.summary?.detectedRows)?p.summary.detectedRows:null,rejected=Number.isSafeInteger(p.summary?.rejectedRows)?p.summary.rejectedRows:null;
  const heading=detected===null?p.rows.length+' '+(p.rows.length===1?'estudiante revisado':'estudiantes revisados'):detected+' '+(detected===1?'fila de estudiante detectada':'filas de estudiantes detectadas');
  const groupedErrors=groups.length>1?'<label>Tipo de observación<select aria-label="Tipo de observación" data-import-issue-group="errors"><option value="">Todas ('+blockers.length+')</option>'+groups.map(({key,label,count})=>'<option value="'+key+'" '+(workspace.errors.group===key?'selected':'')+'>'+label+' ('+count+')</option>').join('')+'</select></label>':'';
  const ipeHint=groups.some(group=>group.key==='possibleIpe')?'<p class="import-diagnostic-hint">'+(ipeEditable?'Compara la identificación con el registro oficial y marca solo las filas confirmadas como IPE. La aplicación conserva el número original.':'Para marcar un IPE en pantalla, usa una vista previa vigente. También puedes indicar IPE en la columna Tipo de documento de la planilla.')+'</p>':'';
  const ipeControl=(item,index,attribute,label)=>'<label class="import-ipe-choice"><input type="checkbox" '+attribute+'="'+index+'" aria-label="'+esc(attribute==='data-import-ipe-confirm'?label+' · '+location(item):label)+'" '+(draftIpe.has(importIpeLocation(item))?'checked ':'')+(!ipeEditable?'disabled ':'')+'>'+esc(label)+'</label>';
  const reviewIpe=pendingIpe?'<div class="callout import-ipe-pending"><p role="status">'+pendingIpe+' '+(pendingIpe===1?'cambio de tipo de documento por revisar':'cambios de tipo de documento por revisar')+'. Aún no se ha guardado ninguna ficha.</p><button type="button" data-import-ipe-refresh>Volver a previsualizar</button></div>':'';
  const confirmedIpeMarkup=appliedIpe.length?'<details class="section" data-import-ipe-applied '+(workspace.ipeOpen?'open':'')+'><summary>IPE declarados en la revisión ('+appliedIpe.length+')</summary><div class="section-content"><p>Puedes desmarcar una fila y volver a previsualizar. Estas decisiones se aplican solo a esta carga.</p>'+ipePage.items.map(item=>ipeControl(item,appliedIpe.indexOf(item),'data-import-ipe-applied-row','Confirmé el IPE de '+location(item))).join('')+pager('import-applied-ipe','IPE declarados',ipePage)+'</div></details>':'';
  const issueMarkup=value=>'<div class="import-diagnostic-item"><p>'+(location(value)?'<strong>'+esc(location(value))+':</strong> ':'')+esc(value.message)+(value.firstSheet&&value.firstRow?' Revisa también '+esc(location({sheet:value.firstSheet,row:value.firstRow}))+'.':'')+'</p>'+(ipeEditable&&value.reason==='possibleIpe'?ipeControl(value,blockers.indexOf(value),'data-import-ipe-confirm','Confirmé que es un IPE'):'')+'</div>';
  const downloadButton=school&&typeof EnrollmentImportObservations==='object'&&EnrollmentImportObservations.hasDiagnostics(p)?'<div class="import-review-export"><button type="button" data-import-observations>Descargar observaciones</button><span class="hint">Incluye las ubicaciones de todo el lote para revisión interna.</span></div>':'';
  const countsMarkup=detected===null?'<span><strong>'+p.rows.length+'</strong> en el archivo</span>':'<span><strong>'+p.rows.length+'</strong> en la lista de revisión</span>'+(rejected?'<span><strong>'+rejected+'</strong> '+(rejected===1?'fila quedó fuera de la lista':'filas quedaron fuera de la lista')+'</span>':'');
  preview.innerHTML='<header class="import-review-heading"><h2 class="spaced" tabindex="-1">'+heading+'</h2><p class="import-review-totals" role="status">'+countsMarkup+'<span><strong>'+blockers.length+'</strong> '+(blockers.length===1?'observación':'observaciones')+' para resolver</span>'+(pendingCourse.length?'<span><strong>'+pendingCourse.length+'</strong> '+(pendingCourse.length===1?'fila sin curso asignado':'filas sin curso asignado')+'</span>':'')+'<span><strong>'+warnings.length+'</strong> '+(warnings.length===1?'advertencia':'advertencias')+'</span><span data-import-selected-total><strong>'+selected+'</strong> cambios o matrículas seleccionados</span></p></header>'+downloadButton+yearNotice+counts+reviewIpe+confirmedIpeMarkup+
    (errors.some(error=>error.code==='IMPORT_TEMPLATE_SOURCE_FIELDS_MISSING')&&can('admin')?'<button data-action="prepare-import-fields">Preparar campos de importación</button>':'')+
    (blockers.length?'<section class="callout error import-diagnostic" aria-label="Observaciones que bloquean el guardado"><h3>'+blockers.length+' '+(blockers.length===1?'observación por resolver':'observaciones por resolver')+'</h3>'+(school?'<p>Esta revisión no guarda fichas. Resuelve estas observaciones para continuar.</p>':'')+'<div class="import-diagnostic-filters">'+groupedErrors+listFilter('errors','Buscar observación',blockers)+'</div>'+ipeHint+errorPage.items.map(issueMarkup).join('')+(!errorPage.total?'<p>No hay observaciones con estos filtros. Los bloqueos de la planilla siguen vigentes.</p>':'')+pager('import-errors','observaciones',errorPage)+'</section>':'')+
    (warnings.length?'<details class="section" data-import-warnings '+(workspace.warningsOpen?'open':'')+'><summary>'+warnings.length+' advertencias de la planilla</summary><div class="section-content">'+listFilter('warnings','Buscar advertencia',warnings)+warningPage.items.map(value=>'<p class="small">'+esc(location(value))+' '+esc(value.message||value)+'</p>').join('')+(!warningPage.total?'<p>No hay advertencias con esta búsqueda.</p>':'')+pager('import-warnings','advertencias',warningPage)+'</div></details>':'')+
    (missing.length||pendingCourse.length?'<section class="callout import-diagnostic" aria-label="Cursos por asignar"><h3>'+ (missing.length?missing.length+' '+(missing.length===1?'curso por asignar':'cursos por asignar'):'Cursos por asignar')+'</h3>'+(pendingCourse.length?'<p>'+pendingCourse.length+' '+(pendingCourse.length===1?'fila necesita':'filas necesitan')+' un curso de destino. Revisa el curso y la sección de cada hoja.</p>':'')+'<button type="button" data-import-course-config>Revisar hojas y cursos</button>'+ (missing.length?listFilter('courses','Buscar curso por asignar',missing)+'<ul>'+coursePage.items.map(course=>'<li><strong>'+esc(course.name)+'</strong>'+(Number.isSafeInteger(course.count)?' · '+course.count+' '+(course.count===1?'fila':'filas'):'')+'</li>').join('')+'</ul>'+(!coursePage.total?'<p>No hay cursos con esta búsqueda. La asignación se aplica al lote completo.</p>':'')+pager('import-courses','cursos por asignar',coursePage)+(canCreate?'<button type="button" class="secondary spaced" data-action="create-import-courses" '+(!p.courseTicket?'disabled ':'')+'>Crear cursos pendientes ahora</button><p class="hint">Esto crea solo los cursos. No guarda estudiantes ni ignora las observaciones de identidad.</p><div class="checklist"><label><input id="create-import-courses" type="checkbox" '+(workspace.createCourses?'checked ':'')+(!reviewable?'disabled ':'')+'>Crear los cursos pendientes al guardar</label></div>'+(!reviewable&&blockers.length?'<p>El guardado queda habilitado después de resolver las observaciones y volver a previsualizar.</p>':''):'<p>Una cuenta con permisos de gestión y acceso a todos los cursos debe crearlos antes de importar.</p>'):'')+'</section>':'')+
    '<p class="hint">'+instructions+'</p><section class="import-student-review" aria-label="Estudiantes revisados">'+importFilterMarkup(p,workspace,school)+'<div class="import-preview-toolbar"><p role="status">'+filtered.length+' de '+p.rows.length+' estudiantes con estos filtros</p>'+modeControls+'</div>'+importResultMarkup(p,workspace,rowPage,school,reviewable)+pager('import-rows','estudiantes revisados',rowPage,[5,10,25,50,100])+'</section><p class="hint import-confirm-scope">La confirmación incluye las fichas nuevas del archivo y los cambios seleccionados, aunque estén ocultos por un filtro.</p><button data-action="commit-import" class="primary spaced" disabled>Confirmar '+p.rows.length+' estudiantes</button>';
  const active=()=>state.importPreview===p&&preview===$('#import-preview'),busy=()=>preview.querySelector('[data-action="commit-import"]')?.getAttribute('aria-busy')==='true';
  const updateFilter=input=>{
    const key=input.dataset.importFilter,list=input.dataset.importListFilter;
    if(key&&!Object.hasOwn(workspace.filters,key)||list&&!['errors','warnings','courses'].includes(list))return;
    if(busy()){input.value=key?workspace.filters[key]:workspace[list].q;return;}
    const value=String(input.value||'').slice(0,160),previous=key?workspace.filters[key]:workspace[list].q;if(previous===value)return;
    const focusState={attribute:key?'data-import-filter':'data-import-list-filter',key:key||list,start:input.selectionStart,end:input.selectionEnd};
    if(key){workspace.filters[key]=value;workspace.rows.page=1;}else{workspace[list].q=value;workspace[list].page=1;}
    renderImportPreview({focus:focusState});
  };
  preview.oninput=event=>{if(active()&&(event.target.dataset.importFilter==='q'||event.target.dataset.importListFilter))updateFilter(event.target);};
  preview.onchange=event=>{
    if(!active())return;const input=event.target;
    if(input.dataset.importFilter||input.dataset.importListFilter){updateFilter(input);return;}
    if(busy())return;
    if(input.dataset.importIssueGroup==='errors'){
      if(input.value&&!groups.some(group=>group.key===input.value))return;
      workspace.errors.group=input.value;workspace.errors.page=1;
      renderImportPreview({focus:{attribute:'data-import-issue-group',key:'errors'}});return;
    }
    if(input.dataset.importIpeConfirm!==undefined||input.dataset.importIpeAppliedRow!==undefined){
      const applied=input.dataset.importIpeAppliedRow!==undefined,index=Number(applied?input.dataset.importIpeAppliedRow:input.dataset.importIpeConfirm),item=(applied?appliedIpe:blockers)[index];
      if(!canReviewImportIpe(p)||!Number.isInteger(index)||!item?.sheet||!Number.isInteger(item.row)||(!applied&&item.reason!=='possibleIpe'))return;
      const key=importIpeLocation(item),draft=state.importOptions.confirmedIpeRows.filter(row=>importIpeLocation(row)!==key);
      if(input.checked)draft.push({sheet:item.sheet,row:item.row});
      state.importOptions.confirmedIpeRows=draft;
      invalidateImport({message:'Cambió la revisión de identificaciones. Vuelve a previsualizar antes de guardar.'});
      renderImportPreview({focus:{attribute:applied?'data-import-ipe-applied-row':'data-import-ipe-confirm',key:String(index)}});return;
    }
    if(input.id==='create-import-courses')workspace.createCourses=canCreate&&reviewable&&input.checked;
    else if(input.dataset.importUpdate!==undefined||input.dataset.importAnnual!==undefined){
      const annual=input.dataset.importAnnual!==undefined,index=Number(annual?input.dataset.importAnnual:input.dataset.importUpdate);
      if(!reviewable||state.importTicket!==p.ticket||!Number.isInteger(index)||p.rows[index]?.review?.kind!==(annual?'annual':'update'))return;
      const selection=annual?workspace.annual:workspace.updates;if(input.checked)selection.add(index);else selection.delete(index);
    }else return;
    const total=preview.querySelector('[data-import-selected-total] strong');if(total)total.textContent=String(selectedImportUpdates().length+selectedImportAnnual().length);
    refreshImportCommit();
  };
  const courseConfig=preview.querySelector('[data-import-course-config]');
  if(courseConfig)courseConfig.onclick=()=>{const details=$('#import-config .import-configuration');if(!active()||busy()||!details)return;details.open=true;details.querySelector('summary')?.focus();};
  const ipeRefresh=preview.querySelector('[data-import-ipe-refresh]');
  if(ipeRefresh)ipeRefresh.onclick=()=>{if(active()&&!busy()&&canReviewImportIpe(p))$('#import-form')?.requestSubmit($('#import-form > button.primary')||undefined);};
  const exportButton=preview.querySelector('[data-import-observations]');
  if(exportButton)exportButton.onclick=()=>{if(active()&&!busy())EnrollmentImportObservations.download(p);};
  const form=preview.querySelector('#import-row-filters');if(form)form.onsubmit=event=>{event.preventDefault();};
  const warningsDetails=preview.querySelector('[data-import-warnings]');if(warningsDetails)warningsDetails.ontoggle=()=>{if(active())workspace.warningsOpen=warningsDetails.open;};
  const ipeDetails=preview.querySelector('[data-import-ipe-applied]');if(ipeDetails)ipeDetails.ontoggle=()=>{if(active())workspace.ipeOpen=ipeDetails.open;};
  for(const [id,key] of [['import-rows','rows'],['import-errors','errors'],['import-warnings','warnings'],['import-courses','courses'],['import-applied-ipe','ipe']])EnrollmentPagination.bind(preview,id,selection=>{if(!active()||busy())return;Object.assign(workspace[key],selection);renderImportPreview();});
  if(typeof EnrollmentViews==='object'){
    EnrollmentViews.bind(preview,'import-preview-mode',mode=>{
      if(!active()||!importPreviewModes.includes(mode))return;
      if(busy()){preview.querySelectorAll('[data-view-controls="import-preview-mode"] [data-view-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.viewMode===workspace.mode)));return;}
      workspace.mode=mode;EnrollmentViews.set(state.user?.id,'import-preview',mode,importPreviewModes);renderImportPreview();
      preview.querySelector('[data-view-controls="import-preview-mode"] [data-view-mode="'+mode+'"]')?.focus({preventScroll:true});
    });
    EnrollmentViews.bindChips(preview,'import-preview-filters',({key,clear})=>{if(!active()||busy())return;if(clear)workspace.filters=importEmptyFilters();else if(Object.hasOwn(workspace.filters,key))workspace.filters[key]='';else return;workspace.rows.page=1;renderImportPreview();});
  }
  refreshImportCommit();
  if(focus){const control=preview.querySelector('['+focus.attribute+'="'+focus.key+'"]');control?.focus({preventScroll:true});if(typeof control?.setSelectionRange==='function'&&Number.isInteger(focus.start))control.setSelectionRange(focus.start,focus.end);}
}
