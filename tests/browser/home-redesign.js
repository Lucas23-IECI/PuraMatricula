async page=>{
  const revealAction=async action=>{
    const row=action.locator('xpath=ancestor::section[@data-home-group][1]'),toggle=row.locator('.home-index-toggle[data-home-toggle]');
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    await action.waitFor({state:'visible'});return action;
  };
  const origin='http://127.0.0.1:4318',check=(value,message)=>{if(!value)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Se requiere la demo local sintética');
  await page.context().clearCookies();await page.setViewportSize({width:1600,height:1000});await page.goto(origin);
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await page.getByRole('heading',{name:'Elige tu siguiente paso.',exact:true}).waitFor();await page.locator('.home-year-overview>button').first().waitFor();
  check(await page.locator('.home-person').count()===0,'El índice no debe abrir alumnos automáticamente');check(await page.locator('.home-index-row').count()===4,'Faltan grupos del índice');check(await page.locator('.sidebar').count()===0,'La portada debe abrir sin panel lateral');
  await page.screenshot({path:'output/playwright/home-index-desktop.png',fullPage:true});
  const destinations=[];
  for(const view of ['records','pending','reports','courses','import','templates','users','audit','backup']){
    await(await revealAction(page.locator('.home-index-menu [data-view="'+view+'"]'))).click();await page.locator('.sidebar [data-view="'+view+'"][aria-current="page"]').waitFor();
    await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).click();await page.getByRole('heading',{name:'Elige tu siguiente paso.',exact:true}).waitFor();check(await page.locator('.sidebar').count()===0,'El regreso dejó panel lateral');destinations.push(view);
  }
  await(await revealAction(page.locator('[data-home-open=""]'))).click();await page.locator('.home-person').first().waitFor();
  check(await page.locator('.home-person').count()===4,'Bandeja debe mostrar cuatro alumnos en la primera página');check(await page.locator('#home-results').getAttribute('data-layout')==='list','Bandeja debe abrir en vista Lista');check(await page.locator('[data-pagination="home-students"]').getAttribute('data-page-size')==='4','Paginador no refleja cuatro alumnos');
  await page.locator('[data-home-layout="cards"]').click();check(await page.locator('#home-results').getAttribute('data-layout')==='cards','No cambia a Fichas');await page.locator('[data-home-menu]').click();
  const result={home:true,destinations,statusLinks:await page.locator('.home-year-overview>button').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};check(!result.overflow,'La portada desborda horizontalmente');return result;
}
