// Presentation QA: the preview response is synthetic and intercepted; no commit is sent.
async page=>{
  page.setDefaultTimeout(16000);const origin='http://127.0.0.1:4318',passed=[],runtime=[],writes=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo local sintética.');
  const trackError=error=>runtime.push(error.message),trackWrites=request=>{const path=new URL(request.url()).pathname;if(!['GET','HEAD'].includes(request.method())&&path.startsWith('/api/')&&!['/api/login','/api/logout','/api/import/school/preview'].includes(path))writes.push(path);};
  page.on('pageerror',trackError);page.on('request',trackWrites);
  let showGlobalError=false;
  const rows=Array.from({length:500},(_,index)=>({sourceSheet:index%2?'Hoja B':'Hoja A',rowNumber:index+2,courseId:index%3?'qa-course-a':'qa-course-b',data:{names:'Estudiante sintético '+index,surname:'Ejemplo',identifierType:'Otro',identifier:'FICTICIO-'+index},review:{kind:['update','annual','new','match','review'][index%5],changes:[{label:'Contacto de prueba',before:'Anterior',after:'Actual'}]}}));rows[499].review.kind='annual';
  const payload=()=>({year:2026,yearContext:{selectedYear:2026,sourceYears:[],resolvedYear:2026,source:'selection',conflict:false},rows:structuredClone(rows),ticket:showGlobalError?null:'preview-sintetico-sin-confirmacion',summary:{new:100,annual:101,unchanged:100,updates:100,review:99},errors:showGlobalError?[{code:'IMPORT_YEARS_MIXED',message:'ERROR GLOBAL SINTÉTICO: revise el año del archivo.'}]:[],warnings:Array.from({length:35},(_,index)=>({sheet:rows[index].sourceSheet,row:rows[index].rowNumber,message:'Advertencia sintética '+index})),courses:[{id:'qa-course-a',name:'Curso sintético A',year:2026},{id:'qa-course-b',name:'Curso sintético B',year:2026}],coursesToCreate:[],sheetSummaries:[],canImport:!showGlobalError});
  const intercept=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload())});
  const preview=async()=>{
    await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/usuarios-sinteticos.xlsx');await page.getByRole('button',{name:'Previsualizar carga',exact:true}).click();await page.getByRole('heading',{name:'500 estudiantes revisados',exact:true}).waitFor();
  };
  const changeMode=async mode=>{await page.locator('[data-view-controls="import-preview-mode"] [data-view-mode="'+mode+'"]').click();await page.locator('[data-import-mode="'+mode+'"]').waitFor();};
  const clear=async()=>{const button=page.locator('[data-filter-chips="import-preview-filters"] [data-filter-clear]');if(await button.count())await button.click();};
  const selected=()=>page.evaluate(()=>({updates:selectedImportUpdates(),annual:selectedImportAnnual(),total:state.importRows.length,ticket:state.importTicket,mode:importPreviewWorkspace().mode,page:importPreviewWorkspace().rows.page,filters:{...importPreviewWorkspace().filters}}));
  try{
    await page.context().clearCookies();await page.setViewportSize({width:1440,height:960});await page.goto(origin);await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-area-open').first().waitFor();await page.locator('.home-area-open[data-view="organization"]').click();await page.locator('.area-task[data-view="import"]').click();await page.locator('#import-form').waitFor();
    check(await page.evaluate(()=>typeof EnrollmentViews)==='object','Falta cargar el control compartido de vistas.');await page.route('**/api/import/school/preview',intercept);await preview();
    await page.locator('[data-import-update="5"]').check();const query=page.locator('[data-import-filter="q"]');await query.pressSequentially('FICTICIO-499');
    check(await query.inputValue()==='FICTICIO-499','Buscar perdió caracteres o el foco al repintar.');check(await query.evaluate(el=>el===document.activeElement),'Buscar perdió el foco al filtrar.');
    check(await page.locator('[data-import-row]').count()===1,'La búsqueda no se aplicó a las 500 filas.');check(await page.locator('[data-import-row]').getAttribute('data-import-row')==='499','El filtro cambió el índice original.');await page.locator('[data-import-annual="499"]').check();
    for(const mode of ['cards','compact','table']){await changeMode(mode);const state=await selected();check(state.updates[0]===5&&state.annual[0]===499&&state.total===500,'Cambiar de vista perdió selecciones ocultas o filtró el lote real.');check(await page.locator('[data-import-annual="499"]').isChecked(),'La selección anual no se representa en '+mode);}
    passed.push('Búsqueda sobre500filas sin perder foco; índices5/499 seleccionados se conservan ocultos y en las tres vistas.');

    await clear();await page.locator('[data-pagination="import-rows"] button[data-page="20"]').click();await page.locator('[data-import-row="499"]').waitFor();
    for(const mode of ['cards','compact','table']){await changeMode(mode);const state=await selected();check(state.page===20,'El modo reinició la página.');const height=await page.locator('.import-preview-results').evaluate(el=>el.getBoundingClientRect().height);check(height<=461,'La vista '+mode+' alarga la página al mostrar25filas.');}
    await page.locator('[data-view-controls="import-preview-mode"] [data-view-mode="table"]').focus();await page.keyboard.press('ArrowRight');await page.locator('[data-import-mode="compact"]').waitFor();await page.keyboard.press('ArrowRight');await page.locator('[data-import-mode="cards"]').waitFor();
    check(await page.locator('[data-view-mode="cards"]').evaluate(el=>el===document.activeElement),'Las flechas del selector pierden el foco al cambiar vista.');
    passed.push('Paginación20 preservada al cambiar vista; alturaacotada460px y navegación porflechas continuada.');

    await page.locator('[data-import-filter="kind"]').selectOption('annual');await page.locator('[data-import-filter="sheet"]').selectOption('Hoja B');await page.locator('[data-import-filter="course"]').selectOption('id:qa-course-a');
    let state=await selected();check(state.page===1&&state.filters.kind==='annual'&&state.filters.sheet==='Hoja B'&&state.filters.course==='id:qa-course-a','Los filtros no se combinan ni reinician página.');
    const visible=await page.locator('[data-import-row]').evaluateAll(items=>items.map(el=>Number(el.dataset.importRow)));check(visible.length>0&&visible.every(index=>rows[index].review.kind==='annual'&&rows[index].sourceSheet==='Hoja B'&&rows[index].courseId==='qa-course-a'),'La colección visible no respeta los tres filtros.');await clear();
    await page.locator('[data-import-filter="issues"]').selectOption('warnings');check((await page.locator('.import-preview-toolbar>p').innerText()).includes('35 de 500'),'El filtro de advertencias no enlaza hoja/fila.');await clear();
    passed.push('Resultado, hoja, curso y observaciones filtran la colección completa con chips para restablecer.');

    await changeMode('cards');await page.locator('.import-student-review').screenshot({path:'output/playwright/import-preview-cards.png'});
    await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tarjetas desbordan horizontalmente en390px.');await page.locator('.import-student-review').screenshot({path:'output/playwright/import-preview-cards-mobile.png'});
    await page.setViewportSize({width:1440,height:960});await preview();state=await selected();check(state.mode==='cards'&&state.page===1&&!state.filters.q&&!state.filters.kind&&state.updates.length===0&&state.annual.length===0,'Otra revisión hereda selecciones/filtros o pierde la preferencia de vista.');
    showGlobalError=true;await preview();await page.locator('[data-import-filter="q"]').fill('ninguna persona coincide');check(await page.locator('[data-import-row]').count()===0,'La búsqueda vacía no oculta las filas.');
    check((await page.locator('.import-review-totals').innerText()).includes('1 observación para resolver'),'El total global desaparece al no haber resultados.');check(await page.getByText('ERROR GLOBAL SINTÉTICO: revise el año del archivo.',{exact:false}).isVisible(),'Un filtro ocultó el error global.');check(await page.locator('[data-action="commit-import"]').isDisabled(),'Ocultar filas eliminó el bloqueo del lote completo.');check((await selected()).total===500,'Los filtros modificaron las filas del lote.');
    passed.push('Móvil390 sin desborde; nueva revisión limpia selecciones/filtros y conserva vista; ceroresultados conserva errorglobal ybloqueo.');
    check(runtime.length===0,'Errores JavaScript: '+runtime.join(' | '));check(writes.length===0,'Se envió una mutación de datos: '+writes.join(', '));
    return {groups:passed.length,passed,runtime,writes,previewMocked:true,commits:0};
  }finally{await page.unroute('**/api/import/school/preview',intercept);page.off('pageerror',trackError);page.off('request',trackWrites);}
}
