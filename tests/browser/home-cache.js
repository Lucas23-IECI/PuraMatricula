async page=>{
  const revealAction=async action=>{
    const row=action.locator('xpath=ancestor::section[@data-home-group][1]'),toggle=row.locator('.home-index-toggle[data-home-toggle]');
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    await action.waitFor({state:'visible'});return action;
  };
  const origin='http://127.0.0.1:4318',check=(value,message)=>{if(!value)throw Error(message);};check((await(await page.request.get(origin+'/api/health')).json()).demo,'Se requiere la demo local sintética');
  await page.context().clearCookies();await page.goto(origin);await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await page.getByRole('heading',{name:'Elige tu siguiente paso.',exact:true}).waitFor();await(await revealAction(page.locator('.home-index-menu [data-view="records"]'))).click();await page.locator('.student-button').first().waitFor();
  await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).click();await page.getByRole('heading',{name:'Elige tu siguiente paso.',exact:true}).waitFor();
  const groups=await page.locator('.home-index-row').count();await(await revealAction(page.locator('.home-index-menu [data-view="records"]'))).click();await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
  const immediate=await page.locator('#list-table').getAttribute('aria-busy');check(immediate!=='true','Expedientes mostró skeleton con caché');await page.locator('#list-table').evaluate(element=>element.dataset.qaHomeCache='true');await page.locator('.sidebar [data-view="records"]').click();check(await page.locator('#list-table').getAttribute('data-qa-home-cache')==='true','Repetir Expedientes reconstruyó la lista');
  await page.getByRole('button',{name:'Ir al inicio de matrícula',exact:true}).click();await(await revealAction(page.locator('[data-home-open=""]'))).click();await page.locator('.home-person').first().waitFor();await page.locator('[data-home-menu]').click();await(await revealAction(page.locator('[data-home-open=""]'))).click();check(await page.locator('#home-results').getAttribute('aria-busy')!=='true','Bandeja mostró skeleton con caché');
  return {home:true,recordsCacheUsed:immediate!=='true',trayCacheUsed:true,repeatedNavigationPreserved:true,groups};
}
