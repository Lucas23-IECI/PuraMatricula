async page=>{
  page.setDefaultTimeout(12000);
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const origin='http://127.0.0.1:4318';
  check(new URL(page.url()).origin===origin,'Solo se permite la demo local sintética.');
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'La instalación debe identificarse como demo sintética.');
  await page.context().clearCookies();await page.goto(origin);
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');
  await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
  await page.getByRole('button',{name:'Importación',exact:true}).click();
  const meta=await(await page.request.get(origin+'/api/meta')).json(),course=meta.courses.find(item=>item.year===2026)||meta.courses[0];
  check(course,'Se necesita un curso ficticio de la demo.');
  const rows=Array.from({length:55},(_,index)=>({sourceSheet:'QA paginación sintética',rowNumber:index+2,courseId:course.id,data:{names:'Alumno paginado '+index,surname:'Sintético',identifierType:'Otro',identifier:'QA-PAGINA-'+index},review:{kind:'update',changes:[{label:'Teléfono ficticio',before:'Prueba anterior',after:'Prueba nueva'}]}}));
  const warnings=Array.from({length:35},(_,index)=>({sheet:'QA paginación sintética',row:index+2,message:'Advertencia paginada '+index}));
  const missing=Array.from({length:23},(_,index)=>({name:'Curso pendiente paginado '+index,year:2026}));
  let previewCount=0,commitRequests=0;
  const previewRoute=async route=>{
    previewCount++;
    const errors=previewCount===1?[]:Array.from({length:35},(_,index)=>({sheet:'QA paginación sintética',row:index+2,code:'QA_REVISAR',message:'Observación paginada '+index}));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({year:2026,rows,courses:meta.courses,coursesToCreate:missing,sheetSummaries:[],mappingTargets:[],warnings,errors,summary:{new:0,unchanged:0,updates:55,review:0},ticket:previewCount===1?'ticket-qa-sintetico':null,canImport:previewCount===1})});
  };
  const commitRoute=async route=>{commitRequests++;await route.abort();};
  await page.route('**/api/import/school/preview',previewRoute);
  await page.route('**/api/import/school/commit',commitRoute);
  const pager=id=>page.locator('[data-pagination="'+id+'"]');
  const next=id=>pager(id).getByRole('button',{name:'Página siguiente',exact:true}).click();
  try{
    await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/usuarios-sinteticos.xlsx');
    const previsualize=page.getByRole('button',{name:'Previsualizar carga',exact:true});
    await previsualize.click();await page.getByRole('heading',{name:'55 estudiantes revisados',exact:true}).waitFor();
    check(await page.locator('[data-import-update]').count()===25,'La primera página no contiene 25 alumnos.');
    const commit=page.locator('[data-action="commit-import"]');check(await commit.isDisabled(),'La carga se habilitó sin seleccionar ni aprobar cursos.');
    await page.locator('[data-import-update="0"]').check();await next('import-rows');
    await page.locator('[data-import-update="25"]').check();
    check(await commit.isDisabled(),'Crear cursos debe requerir aprobación explícita.');
    await page.getByLabel('Crear estos cursos al confirmar la carga',{exact:true}).check();
    check(await commit.isEnabled(),'Las selecciones válidas no habilitaron el control.');
    check(await commit.textContent()==='Guardar 0 nuevos y 2 cambios','No conserva los cambios de páginas diferentes.');
    await page.locator('[data-import-warnings] > summary').click();
    await next('import-warnings');await next('import-warnings');await next('import-warnings');
    check(await page.getByText(/Advertencia paginada 34$/).count()===1,'La última advertencia quedó inaccesible.');
    check(await page.locator('[data-import-warnings]').getAttribute('open')!==null,'Las advertencias se cerraron al paginar.');
    await next('import-courses');await next('import-courses');
    check(await page.getByText('Curso pendiente paginado 22',{exact:true}).count()===1,'El último curso quedó inaccesible.');
    check(await page.getByLabel('Crear estos cursos al confirmar la carga',{exact:true}).isChecked(),'Se perdió la aprobación para crear cursos.');
    check(await page.locator('[data-import-update="25"]').isChecked(),'Se perdió la selección de la página 2.');
    await pager('import-rows').getByRole('button',{name:'Página anterior',exact:true}).click();
    check(await page.locator('[data-import-update="0"]').isChecked(),'Se perdió la selección de la página 1.');
    check(await commit.isEnabled(),'Paginar otra colección deshabilitó selecciones válidas.');
    check(await commit.textContent()==='Guardar 0 nuevos y 2 cambios','La confirmación perdió el total seleccionado.');
    await previsualize.click();await page.getByText('35 observaciones',{exact:true}).waitFor();
    check(await pager('import-rows').getAttribute('data-page')==='1','Una nueva revisión conservó la página anterior.');
    check(await page.locator('[data-import-update]:checked').count()===0,'Una nueva revisión heredó selecciones.');
    check(!await page.getByLabel('Crear estos cursos al confirmar la carga',{exact:true}).isChecked(),'Una nueva revisión heredó la aprobación de cursos.');
    check(await commit.isDisabled(),'Una revisión con errores habilitó confirmar.');
    await next('import-errors');await next('import-errors');await next('import-errors');
    check(await page.getByText(/Observación paginada 34$/).count()===1,'La última observación quedó inaccesible.');
    check(await page.locator('[data-import-update]:checked').count()===0,'Paginar errores recuperó selecciones de otra revisión.');
    check(commitRequests===0,'La prueba intentó confirmar una importación.');
    await page.screenshot({path:'output/playwright/import-pagination-review.png',fullPage:true});
    return {passed:4,results:['55 alumnos paginados y selecciones de páginas 1/2 conservadas','35 advertencias y 23 cursos accesibles completos','Nueva revisión reinicia selecciones, páginas y aprobación','35 observaciones accesibles y confirmación bloqueada'],previews:previewCount,commitRequests};
  }finally{
    await page.unroute('**/api/import/school/preview',previewRoute);
    await page.unroute('**/api/import/school/commit',commitRoute);
  }
}
