async page=>{
 const origin=new URL(page.url()).origin;if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!(await(await page.request.get(origin+'/api/health')).json()).demo)throw Error('Solo demo sintética.');
 page.setDefaultTimeout(12000);await page.context().clearCookies();await page.goto(origin);
 await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-shell').waitFor();await page.locator('[data-home-group="students"] .home-index-toggle[data-home-toggle]').click();await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await page.locator('.student-button').first().waitFor();
 const immediate=await page.locator('#search').evaluate(input=>{input.value='DEMO-002';input.dispatchEvent(new Event('input',{bubbles:true}));return {rows:document.querySelectorAll('.student-button').length,busy:document.querySelector('#list-table').getAttribute('aria-busy')};});
 if(immediate.rows!==0||immediate.busy!=='true')throw Error('La búsqueda conserva resultados anteriores activos durante su espera.');
 await page.getByRole('button',{name:/Ejemplo 002 Sintético/}).click();await page.getByRole('heading',{name:/Ejemplo 002 Sintético/}).waitFor();if(await page.locator('#field-identifier').inputValue()!=='DEMO-002')throw Error('Se abrió otra ficha');
 return {passed:['Búsqueda retira resultados anteriores inmediatamente','El resultado abre la identidad solicitada']};
}
