async page=>{
  page.setDefaultTimeout(12000);
  const origin='http://127.0.0.1:4318',results=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo local sintética');
  await page.setViewportSize({width:1440,height:960});
  const errors=[],unexpectedWrites=[];
  const trackWrite=request=>{
    const url=new URL(request.url());
    if(url.origin===origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD'].includes(request.method())&&url.pathname!=='/api/login')unexpectedWrites.push(request.method()+' '+url.pathname);
  };
  page.on('request',trackWrite);page.on('pageerror',error=>errors.push(error.message));
  const homeReady=()=>page.locator('#home-index-stage [data-home-group]').first().waitFor();
  const signIn=async username=>{
    await page.context().clearCookies();await page.goto(origin);
    await page.getByLabel('Usuario',{exact:true}).fill(username);
    await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
    await page.getByRole('button',{name:'Ingresar',exact:true}).click();await homeReady();
  };
  const currentView=()=>new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view');
  const home=async()=>{await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).click();await homeReady();};
  const areaReady=async(view,id=view)=>{
    await page.locator('.shell[data-screen="'+view+'"] .area-workspace[data-area="'+id+'"]:not(.loading-area) #area-actions .area-task').first().waitFor();
    check(currentView()===view,'Ruta de área incorrecta: '+view);
  };
  const openArea=async(view,id=view)=>{await page.locator('#home-index-stage .home-area-open[data-view="'+view+'"]').click();await areaReady(view,id);};
  const checkNoAdministrativeNavigation=async()=>{
    check(await page.locator('.sidebar nav [data-view="organization"],.sidebar nav [data-view="administration"],.sidebar nav [data-view="users"],.sidebar nav [data-view="audit"],.sidebar nav [data-view="backup"],.sidebar nav [data-view="courses"],.sidebar nav [data-view="import"],.sidebar nav [data-view="templates"]').count()===0,'Lector ve navegación o iconos administrativos');
  };

  await signIn('demo-lector');
  check(JSON.stringify(await page.locator('#home-index-stage [data-home-group]').evaluateAll(rows=>rows.map(row=>row.dataset.homeGroup)))===JSON.stringify(['students','followup']),'Lector no ve exactamente sus dos áreas');
  check(await page.locator('.sidebar,.home-portal-controls,.home-year-overview,.home-search-panel,.home-footer,#home-query,.home-shell .environment').count()===0,'Inicio conserva bandas, alumnos o navegación lateral');
  const account=page.locator('.home-account-menu');await account.locator('summary').click();
  check(await account.locator('[data-action="theme"]').isVisible()&&await account.locator('[data-action="logout"]').isVisible(),'Inicio oculta tema o Salir de Mi cuenta');
  const wasDark=await page.locator('body').evaluate(element=>element.classList.contains('dark'));
  await account.locator('[data-action="theme"]').click();
  check(await page.locator('body').evaluate(element=>element.classList.contains('dark'))!==wasDark,'Tema de Mi cuenta no funciona');
  await account.locator('[data-action="theme"]').click();await account.locator('summary').click();
  await openArea('students');check(await page.locator('[data-action="new"]').count()===0,'Lector puede crear desde su área');await checkNoAdministrativeNavigation();
  await page.reload();await areaReady('students');check(await page.locator('[data-action="new"]').count()===0,'Refresh concede alta al lector');
  await page.locator('#area-actions [data-view="records"]').click();await page.locator('[data-pagination="records"]').waitFor();
  const records=await(await page.request.get(origin+'/api/records?year=2026&pageSize=100')).json();
  const visibleTotal=Number((await page.locator('[data-pagination="records"] .pagination-summary>span').textContent()).match(/ de (\d+) /)?.[1]);
  check(records.total===50&&records.items.length===50&&visibleTotal===50,'Lector no conserva sus 50 expedientes autorizados');
  check(await page.locator('[data-action="new"],[data-action="export-roster"],[data-action="export-course"]').count()===0,'Lector ve acciones de escritura o exportación');await checkNoAdministrativeNavigation();
  await page.locator('.sidebar [data-view="followup"]').click();await areaReady('followup');await page.reload();await areaReady('followup');await checkNoAdministrativeNavigation();
  await page.locator('.sidebar-toggle').click();check(await page.locator('.shell').getAttribute('data-sidebar')==='hidden','No se oculta el menú lateral');
  check(await page.locator('.topbar [data-action="theme"]').isVisible()&&await page.locator('.topbar [data-action="logout"]').isVisible(),'Ocultar menú lateral oculta las opciones de cuenta');
  await page.locator('.sidebar-toggle').click();
  results.push('Lector: dos áreas, 50 expedientes, rutas restaurables y ninguna acción administrativa');

  await signIn('demo-secretaria');
  check(await page.locator('#home-index-stage [data-home-group]').count()===4,'Secretaría no ve sus cuatro áreas');
  for(const [view,id] of [['students','students'],['followup','followup'],['organization','organization'],['administration','admin']]){
    await openArea(view,id);await page.reload();await areaReady(view,id);await home();
  }
  await openArea('students');check(await page.locator('#area-actions [data-action="new"]').isEnabled(),'Secretaría no dispone de nueva matrícula');
  await page.locator('#area-actions [data-view="records"]').click();await page.locator('[data-pagination="records"]').waitFor();
  check(await page.locator('[data-action="new"]').isEnabled()&&await page.locator('[data-action="export-roster"]').isEnabled(),'Secretaría pierde alta o exportación autorizada');
  results.push('Secretaría: cuatro áreas se restauran al actualizar; alta y exportación autorizadas');

  await page.route('**/api/records?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fallo sintético del listado de expedientes'})}));
  await page.locator('#status-filter').selectOption('draft');await page.locator('#list-table [role="alert"]').waitFor();
  const course=await page.locator('#course-filter option').nth(1).getAttribute('value');
  await page.locator('#course-filter').selectOption(course);await page.locator('#list-table [role="alert"]').waitFor();
  await page.locator('#search').fill('Ejemplo');await page.locator('#list-table [role="alert"]').waitFor();
  await page.unroute('**/api/records?*');
  const retried=page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/records'&&url.searchParams.get('q')==='Ejemplo'&&url.searchParams.get('status')==='draft'&&url.searchParams.get('course')===course;});
  await page.locator('#list-table [data-action="retry"]').click();await retried;await page.locator('[data-pagination="records"]').waitFor();
  check(await page.locator('#search').inputValue()==='Ejemplo'&&await page.locator('#status-filter').inputValue()==='draft'&&await page.locator('#course-filter').inputValue()===course,'Reintentar pierde filtros');
  results.push('Error 503 y reintento conservan búsqueda, curso y estado');

  await home();let pupilRequests=0;
  const trackPupils=request=>{if(/\/api\/(?:records\?|reports\/statistics)/.test(request.url()))pupilRequests++;};
  await page.route('**/api/session',async route=>{const response=await route.fetch(),data=await response.json();data.user.permissions=['admin'];await route.fulfill({response,json:data});});
  await page.route('**/api/meta',async route=>{const response=await route.fetch(),data=await response.json();data.testEnvironment=false;await route.fulfill({response,json:data});});
  page.on('request',trackPupils);await page.reload();await homeReady();
  check(JSON.stringify(await page.locator('#home-index-stage [data-home-group]').evaluateAll(rows=>rows.map(row=>row.dataset.homeGroup)))===JSON.stringify(['organization','admin']),'Admin sin lectura ve áreas de alumnos');
  check(pupilRequests===0,'Admin sin lectura consulta alumnos al abrir inicio');
  check(await page.locator('.home-index-menu [data-view="students"],.home-index-menu [data-view="followup"]').count()===0,'Admin sin lectura ofrece áreas de alumnos');
  for(const [view,id,allowed] of [['organization','organization','templates'],['administration','admin','users']]){
    await openArea(view,id);check(await page.locator('#area-actions [data-view]').count()===1&&await page.locator('#area-actions [data-view="'+allowed+'"]').count()===1,'Admin sin lectura ve tareas no autorizadas en '+view);
    check(await page.locator('.sidebar nav [data-view="students"],.sidebar nav [data-view="followup"],.sidebar nav [data-view="records"],.sidebar nav [data-view="audit"],.sidebar nav [data-view="backup"],.sidebar nav [data-view="courses"],.sidebar nav [data-view="import"]').count()===0,'Admin sin lectura conserva navegación no autorizada');
    await page.reload();await areaReady(view,id);await home();
  }
  await page.evaluate(()=>{location.hash='view=records&year=2026';});await page.reload();await homeReady();
  check(currentView()==='home','Ruta directa sin permiso no vuelve al inicio');
  check(pupilRequests===0,'Admin sin lectura consulta alumnos durante áreas, refresh o ruta directa');
  check(await page.locator('.student-button,.records-content,.home-person,#area-query,[data-action="new"]').count()===0,'Admin sin lectura muestra controles o alumnos');
  page.off('request',trackPupils);await page.unroute('**/api/session');await page.unroute('**/api/meta');
  results.push('Admin sin lectura: solo Organización/Administración, tareas permitidas y cero consultas de alumnos');
  check(errors.length===0,'Errores de JavaScript: '+errors.join());check(unexpectedWrites.length===0,'Se realizaron escrituras no autorizadas: '+unexpectedWrites.join());
  page.off('request',trackWrite);
  return {passed:results.length,results,readerAuthorizedTotal:visibleTotal,adminPupilRequests:pupilRequests,unexpectedWrites:unexpectedWrites.length};
}
