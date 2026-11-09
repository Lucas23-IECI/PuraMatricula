async page=>{
  const revealAction=async action=>{
    const row=action.locator('xpath=ancestor::section[@data-home-group][1]'),toggle=row.locator('.home-index-toggle[data-home-toggle]');
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    await action.waitFor({state:'visible'});return action;
  };
  const origin='http://127.0.0.1:4318',check=(value,message)=>{if(!value)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Se requiere la demo local sintética');
  await page.context().clearCookies();await page.setViewportSize({width:320,height:844});await page.goto(origin);
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.getByRole('heading',{name:'Elige tu siguiente paso.',exact:true}).waitFor();
  const result={overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),groups:await page.locator('.home-index-row').count(),sidebar:await page.locator('.sidebar').count()};
  check(!result.overflow,'La portada móvil desborda horizontalmente');check(result.groups===4,'Faltan grupos autorizados');check(result.sidebar===0,'Inicio móvil no debe mostrar panel lateral');check(await page.locator('.home-person').count()===0,'Inicio carga alumnos sin pedirlos');
  for(const status of ['draft','']){await(await revealAction(page.locator('[data-home-open="'+status+'"]'))).click();await page.locator('.home-person').first().waitFor();check(await page.locator('#home-index-stage').getAttribute('data-mode')==='results','No abre resultados móviles');check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Desborde en resultados móviles');await page.locator('[data-home-layout="cards"]').click();check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Desborde en fichas móviles');await page.locator('[data-home-menu]').click();check(await page.locator('.home-index-row').count()===4,'Volver no recupera índice móvil');}
  await(await revealAction(page.locator('.home-index-menu [data-view="records"]'))).click();await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).click();await page.getByRole('heading',{name:'Elige tu siguiente paso.',exact:true}).waitFor();return {...result,returnHome:true};
}
