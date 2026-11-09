async page=>{
 const base=new URL(page.url()).origin, passed=[], errors=[];
 if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Solo localhost');
 if(!(await(await page.request.get(base+'/api/health')).json()).demo)throw Error('Solo demo local');
 const check=(condition,message)=>{if(!condition)throw Error(message);};
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(9000);
 await page.context().clearCookies();
 async function login(user){
  await page.goto(base);await page.getByLabel('Usuario',{exact:true}).fill(user);await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.locator('#login button[type=submit]').click();await page.locator('.home-shell').waitFor();
 }
 async function nav(area,view,selector){
  await page.setViewportSize({width:1440,height:920});
  const from=page.locator('.sidebar [data-view="'+area+'"]');
  const target=page.locator('.sidebar [data-view="'+view+'"]');
  if(await page.locator('.home-shell').count())await page.locator('.home-area-open[data-view="'+area+'"]').click();
  else if(!(await target.count()))await from.click();
  await target.click();await page.locator(selector).first().waitFor();
 }
 await page.setViewportSize({width:1440,height:920});await login('demo-secretaria');
 await nav('students','records','#list-table .student-button');
 await page.setViewportSize({width:390,height:844});
 await page.locator('.records-more-filters summary').click();
 const response=page.waitForResponse(r=>r.url().includes('documentKind=identity')&&r.url().includes('documentState=missing')&&r.ok());
 await page.locator('.records-more-filters [name=document]').selectOption('identity:missing');await response;
 await page.locator('#records-filter-chips button').getByText('Sin identificación visible',{exact:false}).waitFor();
 await page.locator('[name=pendingKey]').selectOption('imagesDecision');await page.locator('[name=contact]').selectOption('missing-email');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expedientes desborda en móvil');
 await page.locator('#records-filter-chips [data-record-filter-clear=document]').click();check(await page.locator('[name=document]').inputValue()==='','Filtro de documento no se quitó');
 await page.locator('[data-record-clear-all]').click();check(await page.locator('#records-filter-chips button').count()===0,'Filtros no se limpiaron');
 passed.push('Expedientes: filtros combinados y sin desborde móvil');
 await page.setViewportSize({width:1440,height:920});
 await page.locator('#search').fill('DEMO-001');await page.locator('.student-button').filter({hasText:'Ejemplo 001'}).click();
 const address=page.locator('#field-address');
 await page.locator('[data-action=edit-record]').waitFor();check(!(await address.isEditable()),'Consulta permite editar');
 await page.locator('[data-action=edit-record]').click();check(await address.isEditable(),'No abre editor');
 check(await page.locator('#hint-email').isVisible(),'Falta ejemplo gris de correo');
 const original=await address.inputValue(),newAddress=original+' QA';
 await address.fill('Cambio descartado QA');
 await page.locator('[data-action=cancel-record-edit]').click();await page.getByRole('button',{name:'Descartar cambios',exact:true}).click();await page.locator('[data-action=edit-record]').waitFor();check(await address.inputValue()===original,'Cancelar modificó la ficha');
 await page.locator('[data-action=edit-record]').click();await address.fill(newAddress);
 await page.locator('[data-action=back]').click();await page.locator('#dialog').getByRole('button',{name:'Cancelar',exact:true}).click();check(await address.inputValue()===newAddress,'Volver perdió el texto');
 const patch=page.waitForRequest(r=>r.method()==='PATCH'&&r.url().includes('/api/records/'));
 await page.locator('[data-action=save]').click();
 const payload=(await patch).postDataJSON();check(Object.keys(payload.data).join(',')==='address','Se envían campos que no cambiaron');
 await page.locator('[data-action=edit-record]').waitFor();
 await page.reload();await page.locator('[data-action=edit-record]').waitFor();check(await address.inputValue()===newAddress,'Cambios no persistieron');
 passed.push('Consulta, edición, cancelar, aviso al salir, guardado parcial y reapertura');
 await page.locator('[data-action=back]').click();
 for(const [area,view,selector] of [['followup','pending','#report-list-title'],['followup','reports','.report-indicators'],['organization','courses','#courses-filters'],['organization','templates','#template-question-filters'],['organization','import','#import-form'],['administration','users','#users-filters'],['administration','audit','#audit-filters'],['administration','backup','#backup-form']]){
  await nav(area,view,selector);
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' desborda a '+width);await page.screenshot({path:'.local/edition-'+view+'-'+width+'.png'});}
  passed.push(view);
 }
 await nav('organization','import','#import-form');
 await page.locator('#import-form [name=file]').setInputFiles('.local/xlsx-fixtures/matricula-por-cursos-sintetica.xlsx');
 await page.locator('#import-form button.primary').click();
 await page.locator('#import-preview').filter({hasText:/curso|estudiante/i}).waitFor();
 passed.push('Previsualización del Excel sintético por curso');
 await page.locator('.session-exit').click();await page.locator('#login').waitFor();
 await login('demo-lector');await nav('students','records','#list-table .student-button');
 check(await page.locator('.records-more-filters [name=document]').count()===0,'Cuenta de lectura ve filtro de adjuntos');
 await page.locator('.student-button').first().click();await page.locator('.record-readonly-banner').waitFor();
 check(await page.locator('[data-action=edit-record]').count()===0&&!(await page.locator('#field-address').isEditable()),'Cuenta de lectura puede editar');
 passed.push('Permisos de solo consulta');
 check(errors.length===0,'Errores JS: '+errors.join('; '));return {passed,errors};
}
