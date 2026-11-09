async page=>{
  const origin='http://127.0.0.1:4318',results=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  page.setDefaultTimeout(12000);
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo sintética');
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Content Security Policy'))errors.push(message.text());});
  const settle=async()=>{
    await page.waitForFunction(()=>!document.querySelector('#app.is-navigating'));
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));
  };
  const readyHome=async()=>{await page.locator('.home-index-menu').waitFor();await settle();};
  const home=async()=>{await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).click();await readyHome();};
  const revealAction=async action=>{
    const row=action.locator('xpath=ancestor::section[@data-home-group][1]'),toggle=row.locator('[data-home-toggle]');
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    await action.waitFor({state:'visible'});return action;
  };
  const openAction=async action=>{await(await revealAction(action)).click();};
  const readyRecords=async()=>{await page.locator('[data-pagination="records"]').waitFor();await settle();};
  const noHomeBands=async()=>{
    check(await page.locator('.home-heading,.home-portal-controls,.home-year-overview,#home-query,#year-select,.home-person,.home-feature,.sidebar').count()===0,'Inicio conserva bandas, búsqueda, resumen, alumnos o sidebar');
    check(await page.getByRole('tab').count()===0,'Inicio conserva pestañas antiguas');
  };
  await page.context().clearCookies();await page.addInitScript(()=>localStorage.setItem('matricula-theme','light'));await page.setViewportSize({width:1600,height:900});await page.goto(origin);
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');
  await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();await readyHome();
  check(await page.locator('.home-index-row').count()===4,'Faltan áreas de trabajo');await noHomeBands();
  await page.waitForFunction(()=>[...document.querySelectorAll('.home-panel-image')].length===4&&[...document.querySelectorAll('.home-panel-image')].every(image=>image.complete&&image.naturalWidth>0));
  const panels=await page.locator('.home-index-row').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}));
  check(panels.every(r=>Math.abs(r.top-panels[0].top)<1&&Math.abs(r.height-panels[0].height)<1&&r.top<1&&r.bottom>=899),'Las cuatro fotos no ocupan el mismo alto de pantalla');
  await page.mouse.move(-10,-10);await settle();await page.screenshot({path:'output/playwright/home-index-final-desktop.png',fullPage:true});
  results.push('Cuatro paneles fotográficos fullscreen, sin bandas ni resultados rápidos');

  const account=page.locator('.home-account-menu'),accountToggle=account.locator('summary');
  await accountToggle.click();
  for(const action of ['change-password','theme','logout'])check(await account.locator('[data-action="'+action+'"]').isVisible(),'Mi cuenta no contiene '+action);
  await account.locator('[data-action="theme"]').click();
  check(await page.locator('body').evaluate(element=>element.classList.contains('dark')),'Tema oscuro no se aplica');
  await account.press('Escape');check(!await account.evaluate(element=>element.open),'Escape no cierra Mi cuenta');
  await page.screenshot({path:'output/playwright/home-index-final-dark.png',fullPage:true});
  await accountToggle.click();await account.locator('[data-action="theme"]').click();
  if(!await account.evaluate(element=>element.open))await accountToggle.click();
  await account.locator('[data-action="change-password"]').click();
  await page.locator('#dialog[open] [name="currentPassword"]').waitFor();
  await page.locator('#dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  results.push('Mi cuenta agrupa contraseña, tema y salida; acciones reales y cierre del menú');

  await openAction(page.locator('.home-index-menu [data-action="new"]'));
  await page.getByRole('heading',{name:'Nueva matrícula',exact:true}).waitFor();
  check(await page.locator('.sidebar [data-view="records"][aria-current="page"]').count()===1,'Nueva matrícula no abre el módulo Expedientes');
  await page.locator('#dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await home();
  results.push('Nueva matrícula abre el módulo y su formulario cancelable');

  await openAction(page.locator('.home-index-menu [data-focus-search="true"]'));await readyRecords();
  check(await page.locator('#search').evaluate(element=>element===document.activeElement),'Buscar una ficha no enfoca la búsqueda del módulo');
  let searches=0;
  const track=request=>{if(request.url().includes('/api/records?')&&new URL(request.url()).searchParams.get('q')==='Ejemplo')searches++;};
  page.on('request',track);
  const searched=page.waitForResponse(response=>response.url().includes('/api/records?')&&new URL(response.url()).searchParams.get('q')==='Ejemplo');
  await page.locator('#search').fill('Ejem');await page.locator('#search').fill('Ejemplo');await searched;await readyRecords();
  check(searches===1,'La búsqueda con debounce repite la consulta');page.off('request',track);
  check(await page.locator('#search').evaluate(element=>element===document.activeElement),'La consulta pierde el foco');
  const filtered=page.waitForResponse(response=>response.url().includes('/api/records?')&&new URL(response.url()).searchParams.get('status')==='draft'&&new URL(response.url()).searchParams.get('q')==='Ejemplo');
  await page.locator('#status-filter').selectOption('draft');await filtered;await readyRecords();
  const pager=()=>page.locator('[data-pagination="records"]');
  await pager().locator('select').selectOption('25');await page.locator('[data-pagination="records"][data-page-size="25"]').waitFor();
  check(await page.locator('#list-table tbody .status:not(.draft)').count()===0,'El filtro mezcla estados');
  await pager().getByRole('button',{name:'Página siguiente',exact:true}).click();
  await page.locator('[data-pagination="records"][data-page="2"]').waitFor();
  check(await page.locator('#search').inputValue()==='Ejemplo'&&await page.locator('#status-filter').inputValue()==='draft','La paginación pierde consulta o estado');
  check(await page.locator('#list-table tbody tr').count()===25,'La página siguiente no conserva la cantidad');
  await home();await noHomeBands();
  await openAction(page.locator('.home-index-menu [data-view="records"][data-status="draft"]'));await readyRecords();
  check(await page.locator('#status-filter').inputValue()==='draft'&&await page.locator('#search').inputValue()==='','Continuar borradores no abre el filtro correcto');
  await home();results.push('Expedientes conserva búsqueda, filtro y paginación; Borradores abre su estado');

  const destinations=['records','pending','reports','courses','import','templates','users','audit','backup'];
  for(const view of destinations){
    const action=view==='records'?page.locator('.home-index-menu [data-home-group="students"] [data-view="records"]:not([data-focus-search])'):page.locator('.home-index-menu [data-view="'+view+'"]');
    await openAction(action);
    await page.locator('.sidebar [data-view="'+view+'"][aria-current="page"]').waitFor();await settle();
    if(view==='records')await readyRecords();
    await home();
  }
  results.push('Los nueve destinos reales abren su módulo con sidebar y regresan al inicio');

  await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();
  for(const target of ['.home-index-stage','.home-utilities']){
    check(await page.locator(target+'.help-highlight').count()===1,'Ayuda no señala '+target);
    await page.locator('#help-dialog [data-help="next"]').click();
  }
  check(await page.locator('.help-highlight').count()===0,'Ayuda no limpia resaltados');
  check(!await page.locator('#help-dialog').evaluate(element=>element.open),'Ayuda no finaliza tras dos pasos');
  results.push('Ayuda de dos pasos señala paneles y herramientas superpuestas');

  let resume;const wait=new Promise(resolve=>resume=resolve);
  await page.route('**/api/session',async route=>{await wait;await route.continue();});
  try{
    const reload=page.reload({waitUntil:'domcontentloaded'});await page.locator('.boot-home').waitFor();
    check(await page.locator('.loading-home-index-row').count()===4,'Skeleton no contiene cuatro paneles');
    check(await page.locator('.boot-home .sidebar,.boot-home .home-heading,.boot-home .home-portal-controls,.boot-home .home-year-overview,.loading-home-launcher-card,.loading-home-feature').count()===0,'Skeleton conserva bandas o composición anterior');
    await page.screenshot({path:'output/playwright/home-index-final-loading.png',fullPage:true});resume();await reload;
  }finally{resume();await page.unroute('**/api/session');}
  await readyHome();await page.setViewportSize({width:320,height:740});await noHomeBands();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Inicio móvil se desborda horizontalmente');
  check(await page.locator('.home-index-row').count()===4,'Móvil pierde áreas');
  await page.screenshot({path:'output/playwright/home-index-final-mobile.png',fullPage:true});await page.setViewportSize({width:1600,height:900});
  check(errors.length===0,'Errores JS/CSP: '+errors.join());
  results.push('Skeleton de cuatro paneles y móvil de 320 px, sin desbordes ni errores JS/CSP');
  return {passed:results.length,destinations,results};
}
