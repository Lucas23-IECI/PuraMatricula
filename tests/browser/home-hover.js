async page=>{
  const origin='http://127.0.0.1:4318',check=(ok,message)=>{if(!ok)throw Error(message);},results=[],errors=[];
  page.setDefaultTimeout(10000);
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo sintética');
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().clearCookies();await page.setViewportSize({width:1600,height:900});await page.goto(origin);
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-index-menu').waitFor();
  await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).hover();
  await page.waitForFunction(()=>[...document.querySelectorAll('.home-index-actions')].every(el=>el.inert&&getComputedStyle(el).visibility==='hidden'));
  const rows=page.locator('.home-index-row'),toggles=page.locator('[data-home-toggle]');
  check(await rows.count()===4,'Faltan áreas');check(await page.locator('.environment').count()===0,'Persiste franja superior');
  await page.waitForFunction(()=>[...document.querySelectorAll('.home-panel-image')].length===4&&[...document.querySelectorAll('.home-panel-image')].every(image=>image.complete&&image.naturalWidth>0));
  const bounds=()=>rows.evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}));
  const before=await bounds();
  check(before.every(r=>r.top>=0&&r.bottom<=900),'No caben las cuatro áreas');
  check(before.every(r=>Math.abs(r.top-before[0].top)<1&&Math.abs(r.bottom-before[0].bottom)<1),'Los paneles no están en la misma fila');
  check(await page.locator('.home-index-stage').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Índice tiene scroll interno');
  check(await toggles.evaluateAll(elements=>elements.every(el=>el.getAttribute('aria-expanded')==='false')),'Áreas inicialmente abiertas');
  check(await page.locator('.home-index-actions').evaluateAll(elements=>elements.every(el=>el.inert&&getComputedStyle(el).visibility==='hidden')),'Opciones cerradas siguen accesibles');
  await page.screenshot({path:'output/playwright/home-hover-idle-desktop.png',fullPage:true});
  const colors=[];
  for(const group of ['students','followup','organization','admin']){
    const row=page.locator('[data-home-group="'+group+'"]'),toggle=row.locator('[data-home-toggle]'),actions=row.locator('.home-index-actions');
    const rest=await row.evaluate(el=>getComputedStyle(el,'::before').opacity);
    await row.hover();
    await page.waitForFunction(id=>{const row=document.querySelector('[data-home-group="'+id+'"]');return row.classList.contains('is-open')&&getComputedStyle(row.querySelector('.home-index-actions')).opacity==='1';},group);
    check(await toggle.getAttribute('aria-expanded')==='true','Hover no actualiza estado');
    check(await actions.evaluate(el=>!el.inert),'Hover deja acciones inertes');
    const tint=await row.evaluate(el=>getComputedStyle(el,'::before').backgroundColor);check(await row.evaluate(el=>Number(getComputedStyle(el,'::before').opacity))>Number(rest),'No aparece el velo de color');colors.push(tint);
    check(JSON.stringify(await bounds())===JSON.stringify(before),'Hover cambia altura de las áreas');
    await row.locator('.home-index-actions button').last().hover();check(await toggle.getAttribute('aria-expanded')==='true','Opciones desaparecen al mover mouse');
    if(group==='organization')await page.screenshot({path:'output/playwright/home-hover-organization-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).hover();await page.waitForFunction(id=>document.querySelector('[data-home-group="'+id+'"] [data-home-toggle]').getAttribute('aria-expanded')==='false',group);
  }
  check(new Set(colors).size===4,'Áreas sin colores distintos');results.push('Cuatro áreas estables; hover revela opciones, colores distintos y salida cierra');
  await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).focus();for(let step=0;step<3;step++)await page.keyboard.press('Tab');
  check(await toggles.first().evaluate(el=>el===document.activeElement),'Tab no entra al índice');
  check(await toggles.first().getAttribute('aria-expanded')==='true','Teclado no abre opciones');
  await page.keyboard.press('Tab');check(await rows.first().locator('.home-index-actions button').first().evaluate(el=>el===document.activeElement),'Tab no entra a opciones');
  await page.keyboard.press('Escape');check(await toggles.first().evaluate(el=>el===document.activeElement),'Escape pierde foco');
  check(await toggles.first().getAttribute('aria-expanded')==='false','Escape no cierra');
  await page.keyboard.press('Tab');check(await toggles.nth(1).evaluate(el=>el===document.activeElement),'Acciones cerradas permanecen en orden Tab');
  await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).focus();await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();await page.keyboard.press('Escape');await rows.first().hover();
  await page.screenshot({path:'output/playwright/home-hover-dark-desktop.png',fullPage:true});
  check(await rows.first().locator('[data-home-toggle]').getAttribute('aria-expanded')==='true','Hover falla en oscuro');
  await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});check(await rows.first().evaluate(el=>getComputedStyle(el).transitionDuration)==='0s','No respeta movimiento reducido');await page.emulateMedia({reducedMotion:'no-preference'});
  results.push('Teclado, Escape, orden de foco, tema oscuro y movimiento reducido');
  const context=await page.context().browser().newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,storageState:await page.context().storageState()});
  try{
    const touch=await context.newPage();await touch.goto(origin);await touch.locator('.home-index-menu').waitFor();
    const org=touch.locator('[data-home-group="organization"]'),toggle=org.locator('[data-home-toggle]');
    await toggle.tap();check(await toggle.getAttribute('aria-expanded')==='true','Primer toque no abre');
    check(await org.locator('[data-view="courses"]').isVisible(),'Toque no revela opciones');
    await touch.screenshot({path:'output/playwright/home-hover-touch-mobile.png',fullPage:true});
    await toggle.tap();check(await toggle.getAttribute('aria-expanded')==='false','Segundo toque no cierra');
    check(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Móvil se desborda');
    await toggle.tap();await org.locator('[data-view="courses"]').tap();await touch.locator('.sidebar [data-view="courses"][aria-current="page"]').waitFor();
    check(await touch.locator('.environment').count()===0,'Franja persiste en módulos');
    results.push('Toque abre/cierra y navega al módulo; móvil sin desborde');
  }finally{await context.close();}
  check(errors.length===0,'Errores JS: '+errors.join());
  return {passed:results.length,results,colors,areaBounds:before};
}
