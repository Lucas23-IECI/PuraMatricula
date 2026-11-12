// Synthetic fixture workbooks live in output/playwright/school-years-{2019,2030,mixed}.xlsx.
// Run only against scripts/demo.mjs; this deliberately creates synthetic annual drafts.
async page=>{
  page.setDefaultTimeout(18000);page.setDefaultNavigationTimeout(18000);
  const origin='http://127.0.0.1:4318',passed=[],pageErrors=[];
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const errorListener=error=>pageErrors.push(error.message);page.on('pageerror',errorListener);
  const health=await(await page.request.get(origin+'/api/health')).json();check(health.demo===true,'Solo demostración local sintética.');
  const api=async(path,body)=>{
    const result=await page.evaluate(async({path,body})=>{
      const session=await(await fetch('/api/session')).json();
      const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session.csrf}:{},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,data:await response.json()};
    },{path,body});
    check(result.status<400,'API '+path+': '+JSON.stringify(result.data));return result.data;
  };
  const clean=async(view,year)=>{
    check(page.url()===origin+'/','Se publicaron datos de navegación en la dirección.');
    const route=await page.evaluate(()=>window.EnrollmentLoading.readRoute());
    check(route.view===view&&route.year===year,'Se perdió contexto de módulo/año: '+JSON.stringify(route));
  };
  const home=async()=>{
    if(!await page.locator('.home-shell').count())await page.locator('.topbar [data-action="home"]').first().click();
    await page.locator('#home-index-stage .home-area-open').first().waitFor();
  };
  const area=async view=>{await home();await page.locator('.home-area-open[data-view="'+view+'"]').click();await page.locator('.shell[data-screen="'+view+'"] .area-workspace:not(.loading-area)').waitFor();};
  const records=async()=>{await area('students');await page.locator('#area-actions [data-view="records"]').click();await page.locator('#records-total').waitFor();await page.waitForFunction(()=>!document.querySelector('#list-table')?.hasAttribute('aria-busy'));};
  const reports=async()=>{await area('followup');await page.locator('#area-actions [data-view="reports"]').click();await page.locator('.report-indicators').waitFor();};
  const imports=async()=>{await area('organization');await page.locator('#area-actions [data-view="import"]').click();await page.locator('#import-form').waitFor();};
  const choose=async year=>{
    const select=page.locator('#year-select');
    if(await select.locator('option[value="'+year+'"]').count())await select.selectOption(String(year));
    else{
      await select.selectOption('other');const dialog=page.getByRole('dialog',{name:'Consultar otro año',exact:true});await dialog.waitFor();
      await dialog.locator('[name="year"]').fill(String(year));await dialog.locator('button[type="submit"]').click();await dialog.waitFor({state:'hidden'});
    }
    await page.waitForFunction(year=>document.querySelector('#year-select')?.value===String(year),year);
  };
  const stats=year=>api('/api/reports/statistics?year='+year);
  const preview=async fixture=>{
    await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('output/playwright/school-years-'+fixture+'.xlsx');
    const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/import/school/preview'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Previsualizar carga',exact:true}).click();const result=await response;check(result.ok(),'La vista previa falló: '+await result.text());
    const payload=await result.json();await page.getByRole('heading',{name:payload.summary.detectedRows+' '+(payload.summary.detectedRows===1?'fila de estudiante detectada':'filas de estudiantes detectadas'),exact:true}).waitFor();return payload;
  };
  const confirmAnnual=async year=>{
    const confirm=page.locator('[data-action="commit-import"]');check(await confirm.isDisabled(),'La matrícula anual se aplicaría sin seleccionarla.');
    const create=page.locator('#create-import-courses');if(await create.count())await create.check();
    await page.locator('[data-import-annual]').first().check();check(await confirm.isEnabled(),'Seleccionar la matrícula anual no habilita la confirmación.');
    const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/import/school/commit'&&response.request().method()==='POST');
    await confirm.click();const result=await response;check(result.ok(),'La carga anual falló: '+await result.text());const payload=await result.json();
    await page.waitForFunction(year=>document.querySelector('#year-select')?.value===String(year),year);await page.locator('#import-form').waitFor();return payload;
  };
  try{
    await page.setViewportSize({width:1440,height:960});await page.context().clearCookies();await page.goto(origin);
    await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-shell').waitFor();await home();
    await imports();await choose(2026);
    const initial=await preview(2019);check(initial.year===2019&&initial.yearContext?.source==='file'&&initial.yearContext.conflict,'La planilla no detectó el año histórico distinto al elegido.');
    check(await page.locator('#year-select').inputValue()==='2026','Previsualizar cambió el año antes de confirmar.');
    check((await page.locator('#import-preview').innerText()).includes('Habías seleccionado 2026'),'La diferencia de año no quedó visible.');
    const data=initial.rows[0].data;check(initial.rows[0].review.kind==='new','Regenera las fixtures sintéticas para ejecutar este recorrido de nuevo.');
    const meta=await api('/api/meta'),course=meta.courses.find(course=>course.year===2026&&course.name==='1° Básico A');check(course,'Falta el curso de demostración actual.');
    const current=await api('/api/records',{year:2026,courseId:course.id,data:{names:data.names,surname:data.surname,secondSurname:data.secondSurname||'',identifierType:data.identifierType,identifier:data.identifier,birthDate:data.birthDate}});
    const before={};for(const year of [2019,2026,2030])before[year]=(await stats(year)).total;
    const old=await preview(2019);check(old.year===2019&&old.summary.annual===1&&old.rows[0].review.kind==='annual','La misma persona no propone su expediente anual antiguo.');
    const oldResult=await confirmAnnual(2019);check(oldResult.created===1,'No se creó exactamente un expediente de 2019.');await clean('import',2019);
    check((await api('/api/meta')).availableYears.includes(2019),'El año incorporado no aparece en metadatos.');
    check(await page.locator('#year-select option[value="2019"]').count()===1,'El selector no incorporó 2019.');
    passed.push('Excel histórico detecta2019, advierte frente2026 y exige selección anual explícita antes de guardar/cambiar selector.');

    await records();await page.locator('#search').fill(data.identifier);await page.locator('.student-button').first().waitFor();await clean('records',2019);
    const oldRecordId=await page.locator('.student-button').first().getAttribute('data-id');check(oldRecordId!==current.id,'La importación sobrescribió el expediente2026.');
    await choose(2026);await page.locator('.student-button').first().waitFor();check(await page.locator('#search').inputValue()==='','Cambiar año conserva la búsqueda anterior.');
    await page.locator('#search').fill(data.identifier);await page.locator('.student-button').first().waitFor();check(await page.locator('.student-button').first().getAttribute('data-id')===current.id,'El año2026 no conserva su expediente original.');
    check((await api('/api/records/'+current.id)).year===2026,'Se alteró el año del registro actual.');
    passed.push('Expedientes cambia de cohortes, limpia filtros y conserva la ficha original2026 separada de2019.');

    await reports();await choose(2019);await page.locator('.report-indicators').waitFor();
    const oldStats=await stats(2019);check(oldStats.total===before[2019]+1,'2019 no cuenta exactamente la nueva matrícula.');
    check((await page.locator('.report-cut').innerText()).includes('Año escolar 2019'),'El informe no identifica visiblemente el año consultado.');
    await choose(2026);await page.locator('.report-indicators').waitFor();check((await stats(2026)).total===before[2026],'La matrícula histórica contaminó las cifras2026.');
    await choose(2050);await page.locator('.report-indicators').waitFor();check((await stats(2050)).total===0,'El año futuro vacío muestra estudiantes ajenos.');
    await page.reload();await page.locator('.report-indicators').waitFor();check(await page.locator('#year-select').inputValue()==='2050','Recargar un año vacío lo sustituyó por el año actual.');await clean('reports',2050);
    passed.push('Estadísticas separadaspor año y año vacío2050 con ceros conserva selección al recargar sin publicar hash.');

    await imports();await choose(2026);const future=await preview(2030);check(future.year===2030&&future.summary.annual===1,'El Excel futuro no propone la matrícula2030 independiente.');
    await confirmAnnual(2030);await clean('import',2030);
    check((await stats(2030)).total===before[2030]+1,'2030 no cuenta su matrícula anual.');check((await stats(2026)).total===before[2026],'La matrícula futura altera2026.');check((await stats(2019)).total===oldStats.total,'La matrícula futura altera2019.');
    const actualMeta=await api('/api/meta');check([2019,2026,2030].every(year=>actualMeta.availableYears.includes(year)),'El catálogo no conserva todos los años incorporados.');
    passed.push('Excel futuro2030 crea otra matrícula anual; catálogo y estadísticas de2019/2026/2030 permanecen separados.');

    await choose(2026);const mixed=await preview('mixed');check(!mixed.ticket&&mixed.errors.some(error=>/YEAR|AÑO|ANIO/.test(error.code)),'Un Excel con años mezclados no quedó bloqueado.');
    check(await page.locator('[data-action="commit-import"]').isDisabled(),'Excel de varios años permite confirmar.');check(await page.locator('#year-select').inputValue()==='2026','El archivo inválido alteró el año activo.');
    passed.push('Un libro que mezcla2019/2030 no se guarda ni cambia el contexto activo.');

    await reports();await choose(2019);await page.locator('.report-indicators').waitFor();
    let release,arrived,finished;const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>arrived=resolve),done=new Promise(resolve=>finished=resolve);
    const delayOld=async route=>{if(new URL(route.request().url()).searchParams.get('year')!=='2026')return route.continue();arrived();await gate;try{await route.continue();}finally{finished();}};
    await page.route('**/api/reports/statistics?**',delayOld);
    try{
      await page.locator('#year-select').selectOption('2026');await received;
      await choose(2030);await page.locator('.report-indicators').waitFor();
      const oldResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/reports/statistics'&&new URL(response.url()).searchParams.get('year')==='2026');
      release();await done;await oldResponse;await page.waitForFunction(()=>document.querySelector('.report-cut')?.textContent.includes('Año escolar 2030'));
      await clean('reports',2030);check(await page.locator('#year-select').inputValue()==='2030','Una respuesta antigua sustituyó el último año elegido.');
    }finally{release();await page.unroute('**/api/reports/statistics?**',delayOld);}
    passed.push('Una respuesta retrasada2026 no sustituye las estadísticas ni la selección2030 más reciente.');

    await page.setViewportSize({width:390,height:844});await page.locator('#year-select').waitFor();await choose(2019);await page.locator('.report-indicators').waitFor();
    const mobile=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,year:document.querySelector('#year-select')?.getBoundingClientRect().toJSON()}));
    check(mobile.year.width>=80&&mobile.year.x>=0&&mobile.year.right<=mobile.width,'El selector de año no es utilizable en móvil.');
    passed.push('Selector de año utilizable en móvil390px con actualización de estadísticas.');
    await page.screenshot({path:'output/playwright/school-years-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:960});await imports();await choose(2026);
    const repeated=await preview(2019);check(repeated.summary.unchanged===1&&repeated.summary.annual===0&&repeated.ticket===null,'La misma matrícula histórica no se reconoce como coincidencia.');
    check(await page.locator('[data-action="commit-import"]').isDisabled(),'La recarga del mismo Excel permite duplicar una matrícula anual.');
    check((await stats(2019)).total===oldStats.total,'Revisar nuevamente la planilla duplicó el año histórico.');
    await page.locator('#import-preview').screenshot({path:'output/playwright/school-years-preview.png'});
    passed.push('Volver a subir la misma matrícula2019 se reconoce como coincidencia y no admite confirmación ni duplica cifras.');
    await page.locator('#year-select').selectOption('other');const invalidDialog=page.getByRole('dialog',{name:'Consultar otro año',exact:true});
    await invalidDialog.locator('[name="year"]').fill('1949');await invalidDialog.locator('button[type="submit"]').click();
    check(await invalidDialog.locator('[name="year"]').evaluate(input=>input.validity.rangeUnderflow),'El formulario acepta un año fuera de rango.');
    check(await page.locator('#year-select').inputValue()==='2026','La entrada inválida modificó el contexto activo.');await invalidDialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    passed.push('Consultar año rechaza1949 y conserva el contexto2026 sin escribir datos.');
    check(pageErrors.length===0,'Errores JavaScript: '+pageErrors.join(' | '));
    return {groups:passed.length,passed,pageErrors,counts:{before,after:{2019:(await stats(2019)).total,2026:(await stats(2026)).total,2030:(await stats(2030)).total}},synthetic:true};
  }finally{page.off('pageerror',errorListener);}
}
