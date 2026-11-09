async page=>{
  const origin='http://127.0.0.1:4318',check=(value,message)=>{if(!value)throw Error(message);},results=[],errors=[];
  page.setDefaultTimeout(10000);await page.emulateMedia({reducedMotion:'no-preference'});
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo sintética');
  page.on('pageerror',error=>errors.push(error.message));await page.context().clearCookies();await page.evaluate(()=>localStorage.removeItem('matricula-sidebar-mode'));await page.setViewportSize({width:1600,height:900});await page.goto(origin);
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('[data-home-group]').first().waitFor();
  const settled=()=>page.waitForFunction(()=>!document.getElementById('app').classList.contains('is-navigating'));
  check(await page.locator('.home-heading,.home-portal-controls,.home-year-overview,.home-header #year-select').count()===0,'Inicio conserva bandas');
  const stage=await page.locator('#home-index-stage').boundingBox();check(stage.x===0&&stage.y===0&&stage.width===1600&&stage.height===900,'Paneles no llenan la pantalla');
  await page.waitForFunction(()=>[...document.querySelectorAll('.home-panel-image')].every(image=>image.complete&&image.naturalWidth>0));
  await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).hover();
  await page.waitForFunction(()=>document.getElementById('app').getAnimations({subtree:true}).every(animation=>animation.playState==='finished'));
  await page.screenshot({path:'output/playwright/home-fullscreen-final.png',fullPage:true});
  const openRecords=async()=>{
    await page.locator('[data-home-group="students"] .home-area-open').click();
    await page.locator('#area-actions [data-view="records"]').waitFor();await settled();await page.locator('#area-query').fill('');await page.locator('#area-search button').click();
    await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();await settled();
  };
  await openRecords();check(await page.locator('#search').evaluate(el=>el===document.activeElement),'Buscar no dirige el foco al módulo');
  await page.evaluate(()=>applySidebarMode('expanded',{persist:true}));
  await page.waitForFunction(()=>document.getElementById('app').getAnimations({subtree:true}).every(animation=>animation.playState==='finished'));
  const mid=await page.evaluate(async()=>{
    document.querySelector('.sidebar [data-action="home"]').click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const sidebar=document.querySelector('.sidebar'),workspace=document.querySelector('.workspace');
    return {sidebar:Boolean(sidebar),home:Boolean(document.querySelector('.home-shell')),sidebarTransform:getComputedStyle(sidebar).transform,sidebarOpacity:Number(getComputedStyle(sidebar).opacity),workspaceTransform:getComputedStyle(workspace).transform};
  });
  check(mid.sidebar&&!mid.home,'Se cambió el DOM antes de recoger la barra');
  check(mid.sidebarTransform!=='none'&&mid.sidebarOpacity<1&&mid.sidebarOpacity>0,'La barra no se recoge progresivamente: '+JSON.stringify(mid));
  check(mid.workspaceTransform!=='none','El contenido no se compacta');
  await page.screenshot({path:'output/playwright/home-return-middle.png',fullPage:true});
  await page.locator('[data-home-group]').first().waitFor();await settled();
  check(await page.locator('.sidebar').count()===0,'Barra residual');check(await page.locator('#home-title').evaluate(el=>el===document.activeElement),'Regreso no coloca el foco en Inicio');
  results.push('Regreso real: barra se recoge, contenido se compacta y luego entra Inicio');
  await openRecords();
  const rapid=await page.evaluate(async()=>{
    const first=navigateTo('home',{reset:true});await new Promise(resolve=>setTimeout(resolve,40));const second=navigateTo('users',{reset:true});
    await Promise.all([first,second]);return {view:state.view,home:Boolean(document.querySelector('.home-shell')),busy:document.getElementById('app').classList.contains('is-navigating')};
  });
  check(rapid.view==='users'&&!rapid.home&&!rapid.busy,'Una transición anterior reemplazó el último destino');
  results.push('Clics rápidos conservan el último destino y limpian la animación anterior');
  const guarded=await page.evaluate(async()=>{
    const original=saveRecord;let calls=0;saveRecord=async()=>{calls++;return false;};state.dirty=true;
    try{await navigateTo('home',{reset:true});return {view:state.view,calls,home:Boolean(document.querySelector('.home-shell')),busy:document.getElementById('app').classList.contains('is-navigating')};}
    finally{saveRecord=original;state.dirty=false;}
  });
  check(guarded.view==='users'&&guarded.calls===1&&!guarded.home&&!guarded.busy,'Guardado fallido abandonó el módulo');
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(async()=>{const at=performance.now();await navigateTo('home',{reset:true});return {ms:performance.now()-at,animations:document.getElementById('app').getAnimations({subtree:true}).length};});
  check(reduced.animations===0&&reduced.ms<160,'Movimiento reducido conserva una espera de animación');
  results.push('Guardado fallido conserva el módulo; movimiento reducido vuelve sin animación ni demora');
  await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Mi contraseña',exact:true}).click();await page.locator('#dialog[open]').waitFor();
  check(await page.locator('#dialog input[name="currentPassword"]').count()===1,'Cuenta perdió contraseña');
  await page.getByRole('button',{name:'Cerrar formulario',exact:true}).click();
  await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();
  for(const selector of ['.home-index-row','.home-utilities']){check(await page.locator(selector+'.help-highlight').count()===1,'Ayuda no resalta '+selector);await page.locator('#help-dialog [data-help="next"]').click();}
  check(await page.locator('.help-highlight').count()===0,'Ayuda no limpia resaltado');
  results.push('Cuenta y ayuda accesibles sin reintroducir bandas');
  check(errors.length===0,'Errores JS: '+errors.join());
  return {passed:results.length,results,mid,reduced};
}
