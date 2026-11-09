async page=>{
  page.setDefaultTimeout(10000);
  const origin='http://127.0.0.1:4318',originalViewport=page.viewportSize(),check=(value,message)=>{if(!value)throw Error(message);};
  check(new URL(page.url()).origin===origin,'Esta prueba solo admite la demo local.');
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Se requieren datos sintéticos.');
  const areas=[{id:'students',view:'students',label:'Estudiantes',modules:['records']},{id:'followup',view:'followup',label:'Seguimiento',modules:['records','pending','reports']},{id:'organization',view:'organization',label:'Organización',modules:['courses','import','templates']},{id:'admin',view:'administration',label:'Administración',modules:['users','audit','backup']}];
  let phase='Ingreso',releaseSession,sessionHandler;
  const settle=async()=>{
    await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('is-navigating'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));
  };
  const readyArea=async area=>{await page.locator('.area-workspace[data-area="'+area.id+'"] #area-actions').waitFor();await settle();};
  const readyRecords=async()=>{await page.locator('[data-pagination="records"]').waitFor();await page.waitForFunction(()=>document.getElementById('list-table')?.getAttribute('aria-busy')!=='true');await settle();};
  const toggle=()=>page.locator('.topbar .sidebar-toggle[data-action="sidebar-toggle"]');
  const home=async()=>{if(!await page.locator('.home-index-menu').isVisible())await page.locator('.workspace-breadcrumb [data-action="home"]').click();await page.locator('.home-index-menu').waitFor();await settle();};
  const sidebarState=()=>page.evaluate(()=>{
    const shell=document.querySelector('.shell'),sidebar=document.getElementById('main-sidebar'),workspace=shell.querySelector('.workspace');
    return {mode:shell.dataset.sidebar,left:workspace.getBoundingClientRect().left,width:sidebar.getBoundingClientRect().width,inert:sidebar.inert,hidden:sidebar.getAttribute('aria-hidden'),preference:localStorage.getItem('matricula-sidebar-mode'),documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  const checkMode=async(mode,width)=>{
    await page.waitForFunction(expected=>document.querySelector('.shell')?.dataset.sidebar===expected,mode);await settle();const value=await sidebarState();
    check(Math.abs(value.left-width)<=2,'Ancho de menú incorrecto: '+mode+' ocupa '+value.left+' px, se esperaban '+width+'.');
    check(value.inert===(mode==='hidden')&&value.hidden===String(mode==='hidden'),'El menú oculto conserva controles accesibles.');
    check(value.documentWidth<=value.viewport,'El espacio de trabajo desborda horizontalmente.');return value;
  };
  const filters=()=>page.evaluate(()=>({q:document.getElementById('search').value,course:document.getElementById('course-filter').value,status:document.getElementById('status-filter').value}));
  const checkFilters=async expected=>check(JSON.stringify(await filters())===JSON.stringify(expected),'Cambiar el menú o de ruta perdió los filtros.');
  const bootReload=async(mode,expectedWidth,expectedArea)=>{
    const gate=new Promise(resolve=>{releaseSession=resolve;});sessionHandler=async route=>{await gate;await route.continue();};
    await page.route('**/api/session',sessionHandler);
    try{
      await page.reload({waitUntil:'domcontentloaded'});await page.locator('.boot-shell').waitFor();
      const first=await page.locator('.boot-shell').evaluate(shell=>({mode:shell.dataset.sidebar,left:shell.querySelector('.workspace').getBoundingClientRect().left,skeleton:shell.querySelector('[data-skeleton]')?.dataset.skeleton}));
      check(first.mode===mode&&Math.abs(first.left-expectedWidth)<=2,'Primer frame con ancho equivocado: '+JSON.stringify(first));
      check(first.skeleton===expectedArea.view,'El primer frame muestra otra área: '+first.skeleton);
      if(mode==='compact')await page.screenshot({path:'output/playwright/areas-sidebar-boot-compact.png',fullPage:true});
      releaseSession();await readyArea(expectedArea);await checkMode(mode,expectedWidth);
    }catch(error){await page.screenshot({path:'output/playwright/areas-sidebar-boot-failure.png',fullPage:true}).catch(()=>{});throw error;}
    finally{releaseSession?.();await page.unroute('**/api/session',sessionHandler);releaseSession=null;sessionHandler=null;}
  };
  try{
    await page.context().clearCookies();await page.evaluate(()=>localStorage.removeItem('matricula-sidebar-mode'));await page.setViewportSize({width:1600,height:900});await page.goto(origin);
    await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-index-menu').waitFor();await settle();
    for(const area of areas){
      phase='Foto central → '+area.label;await home();const panel=page.locator('[data-home-group="'+area.id+'"]'),box=await panel.boundingBox();
      await panel.click({position:{x:box.width/2,y:box.height/2}});await readyArea(area);
      check(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('view')===area.view,'La foto no abre su área.');
      check((await page.locator('.area-heading h1').innerText())===area.label,'El área no presenta su encabezado.');
      const groups=page.locator('#main-sidebar .nav-group'),local=await groups.nth(0).locator('[data-view]').evaluateAll(items=>items.map(item=>item.dataset.view)),other=await groups.nth(1).locator('[data-view]').evaluateAll(items=>items.map(item=>item.dataset.view));
      check(JSON.stringify(local)===JSON.stringify([area.view,...area.modules]),'El menú mezcla tareas de otras áreas: '+JSON.stringify(local));
      check(JSON.stringify(other)===JSON.stringify(areas.filter(item=>item.view!==area.view).map(item=>item.view)),'El menú no permite cambiar entre las cuatro áreas.');
      check(await page.locator('#area-actions .area-task').count()===(area.id==='students'?2:3),'Faltan acciones del área.');await checkMode('expanded',240);
    }
    phase='Búsqueda desde Estudiantes';await home();await page.locator('[data-home-group="students"] .home-area-open').click();await readyArea(areas[0]);
    const sample=(await(await page.request.get(origin+'/api/records?year=2026&status=draft&pageSize=25&page=1')).json()).items[0];check(Boolean(sample),'La demo necesita un borrador para comprobar la búsqueda.');const q=sample.name.trim().split(/\s+/)[0];
    await page.locator('#area-query').fill(q);await page.locator('#area-search').getByRole('button',{name:/Buscar estudiante/}).click();await readyRecords();
    check((await page.locator('#search').inputValue())===q,'La búsqueda del área no llega a Expedientes.');
    check(await page.locator('#search').evaluate(element=>element===document.activeElement),'Buscar desde el área no enfoca el filtro de Expedientes.');
    await page.locator('#status-filter').selectOption('draft');await readyRecords();await page.locator('#course-filter').selectOption(sample.courseId);await readyRecords();const expected={q,course:sample.courseId,status:'draft'};
    phase='Panel compacto';await page.locator('.sidebar-compact').click();await checkMode('compact',72);await checkFilters(expected);
    check((await sidebarState()).preference==='compact','El modo compacto no se guarda.');
    phase='Ocultar y recuperar menú';await toggle().click();await checkMode('hidden',0);await checkFilters(expected);await toggle().click();await checkMode('compact',72);await checkFilters(expected);
    phase='Navegar con menú compacto';await page.locator('#main-sidebar [data-view="organization"]').click();await readyArea(areas[2]);await checkMode('compact',72);
    await page.locator('#main-sidebar [data-view="courses"]').click();await page.locator('.shell[data-screen="courses"]').waitFor();await settle();await checkMode('compact',72);
    await page.locator('#main-sidebar [data-view="students"]').click();await readyArea(areas[0]);await page.locator('#main-sidebar [data-view="records"]').click();await readyRecords();await checkFilters(expected);await checkMode('compact',72);
    phase='Preferencia y primer frame compacto';await page.locator('#main-sidebar [data-view="students"]').click();await readyArea(areas[0]);await bootReload('compact',72,areas[0]);
    phase='Preferencia y primer frame oculto';await toggle().click();await checkMode('hidden',0);await bootReload('hidden',0,areas[0]);
    phase='Preferencia y primer frame ampliado';await toggle().click();await checkMode('expanded',240);await bootReload('expanded',240,areas[0]);
    phase='Drawer móvil';await page.setViewportSize({width:375,height:812});await checkMode('hidden',0);const saved=(await sidebarState()).preference;
    await toggle().click();await page.waitForFunction(()=>document.querySelector('.shell')?.dataset.sidebar==='expanded');await settle();
    check(await page.locator('.sidebar-backdrop').isVisible(),'El menú móvil no muestra fondo para cerrar.');check(await page.evaluate(()=>document.body.classList.contains('sidebar-drawer-open')),'El menú móvil deja desplazarse el fondo.');
    await page.keyboard.press('Escape');await checkMode('hidden',0);check(await toggle().evaluate(element=>element===document.activeElement),'Escape no devuelve el foco al control del menú.');
    await toggle().click();await page.waitForFunction(()=>document.querySelector('.shell')?.dataset.sidebar==='expanded');await settle();await page.locator('#main-sidebar [data-view="students"]').focus();
    await page.locator('.sidebar-backdrop').click({position:{x:365,y:400}});await checkMode('hidden',0);check(await toggle().evaluate(element=>element===document.activeElement),'Cerrar con el fondo no devuelve el foco al control del menú.');
    check((await sidebarState()).preference===saved,'El drawer móvil reemplazó la preferencia del escritorio.');
    phase='Primer frame móvil oculto';await bootReload('hidden',0,areas[0]);await page.screenshot({path:'output/playwright/areas-sidebar-mobile.png',fullPage:true});
    return {photoCenters:4,areaMenusScoped:4,hubSearch:true,desktopModes:['expanded:240','compact:72','hidden:0'],filtersPreserved:true,bootModes:['compact','hidden','expanded','mobile-hidden'],mobileEscape:true,mobileBackdrop:true,mobileFocusRestored:true};
  }catch(error){await page.screenshot({path:'output/playwright/areas-sidebar-failure.png',fullPage:true}).catch(()=>{});throw Error(phase+': '+error.message,{cause:error});}
  finally{releaseSession?.();if(sessionHandler)await page.unroute('**/api/session',sessionHandler);if(originalViewport)await page.setViewportSize(originalViewport);}
}
