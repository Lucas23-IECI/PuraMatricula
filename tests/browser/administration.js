async (page) => {
  page.setDefaultTimeout(10000);
  const check=(value,message)=>{if(!value)throw new Error(message);};const results=[];
  const revealPaged=async(id,target)=>{
    const pager=page.locator('[data-pagination="'+id+'"]');await pager.waitFor();if(await target.count())return;
    if(await pager.getAttribute('data-page')!=='1'){await pager.locator('button[data-page="1"]').click();await page.locator('[data-pagination="'+id+'"][data-page="1"]').waitFor();}
    while(!await target.count()){
      const next=pager.getByRole('button',{name:'Página siguiente',exact:true});check(await next.isEnabled(),'No se encontró la nueva cuenta entre las páginas');
      const expected=Number(await pager.getAttribute('data-page'))+1;await next.click();await page.locator('[data-pagination="'+id+'"][data-page="'+expected+'"]').waitFor();
    }
  };
  await page.reload();await page.setViewportSize({width:1440,height:960});
  await page.getByLabel('Usuario',{exact:true}).or(page.locator('.home-shell')).or(page.getByRole('heading',{name:'Expedientes',exact:true})).waitFor();
  if(await page.getByLabel('Usuario',{exact:true}).count()){
    await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('demo-secretaria');
    await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
    await page.getByRole('button',{name:'Ingresar'}).click();
  }
  await page.locator('.home-shell').or(page.getByRole('heading',{name:'Expedientes',exact:true})).waitFor();
  if(await page.locator('.home-shell').count())await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
  await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');
  await page.getByRole('searchbox').fill('Ejemplo 001');await page.waitForFunction(()=>document.querySelector('tbody')?.querySelectorAll('tr').length===1);
  await page.getByRole('button',{name:/Ejemplo 001 Sintético/}).click();await page.locator('#field-address').waitFor();
  const context=await page.context().browser().newContext({viewport:{width:1440,height:960}}),teacher=await context.newPage();teacher.setDefaultTimeout(10000);
  try{
    await teacher.goto(page.url());await teacher.getByRole('textbox',{name:'Usuario',exact:true}).fill('demo-profesor');await teacher.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await teacher.getByRole('button',{name:'Ingresar'}).click();
    await teacher.locator('.home-shell').waitFor();await teacher.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await teacher.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
    check(await teacher.getByRole('button',{name:'Auditoría',exact:true}).count()===0,'Profesor ve auditoría');
    await teacher.getByRole('searchbox').fill('Ejemplo 002');await teacher.getByText('No hay expedientes en esta selección').waitFor();
    await teacher.getByRole('searchbox').fill('Ejemplo 001');await teacher.getByRole('button',{name:/Ejemplo 001 Sintético/}).click();await teacher.locator('#field-address').waitFor();
    check(await teacher.locator('#field-allergies').count()===0,'Profesor recibió salud');results.push('Profesor limitado a su curso y sin datos reservados');
    await page.locator('#field-address').fill('Cambio desde Secretaría '+Date.now());await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.startsWith('Guardado'));
    await teacher.locator('#field-address').fill('Cambio de profesor con versión antigua');await teacher.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await teacher.getByRole('button',{name:'Guardar copia de mis cambios'}).waitFor();check(await teacher.locator('#field-address').inputValue()==='Cambio de profesor con versión antigua','Conflicto perdió texto del profesor');results.push('Dos cuentas concurrentes: conflicto visible y formulario conservado');
    await teacher.screenshot({path:'.local/browser-conflict.png'});
  }finally{await context.close();}
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();
  await page.getByRole('button',{name:'Cursos y años',exact:true}).click();await page.getByRole('heading',{name:'Preparar otro año',exact:true}).waitFor();await page.locator('#prepare-year input').fill('2028');await page.locator('#prepare-year button').click();await page.waitForFunction(()=>document.querySelector('#year-select')?.value==='2028');check(await page.locator('.stat-line').count()===8,'No se prepararon ocho cursos');results.push('Preparación de cursos 2028 sin mover fichas');
  await page.getByRole('button',{name:'Plantillas',exact:true}).click();await page.locator('#template-name').fill('Pregunta sintética QA '+Date.now());await page.getByRole('button',{name:'Añadir pregunta',exact:true}).click();await page.getByRole('dialog').getByLabel('Pregunta',{exact:true}).fill('Pregunta de prueba no institucional');await page.getByRole('dialog').locator('button[type="submit"]').click();await page.getByRole('button',{name:'Previsualizar versión',exact:true}).click();await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await page.getByText('Versión publicada. Las fichas anteriores se conservan.').waitFor();results.push('Nueva pregunta en versión futura');
  await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();await page.getByRole('button',{name:'+ Nueva cuenta'}).click();const dialog=page.getByRole('dialog'),createdUsername='qa-'+Date.now();await dialog.locator('[name=name]').fill('Cuenta QA sintética');await dialog.locator('[name=username]').fill(createdUsername);await dialog.locator('[name=password]').fill('Cuenta-sintetica-2026!');await dialog.locator('button[type="submit"]').click();await dialog.waitFor({state:'hidden'});const createdRow=page.getByRole('row').filter({hasText:createdUsername});await revealPaged('users',createdRow);await createdRow.getByRole('cell',{name:/Cuenta QA sintética/}).waitFor();results.push('Cuenta individual nueva con permisos mínimos');
  await page.getByRole('button',{name:'Auditoría',exact:true}).click();await page.getByText('Integridad de la cadena verificada.').waitFor();check((await page.locator('tbody').textContent()).includes('user.configure'),'Auditoría sin cambio de cuenta');results.push('Auditoría visible e integridad verificada');
  await page.getByRole('button',{name:'Respaldo',exact:true}).click();await page.locator('#backup-form input').fill('Clave-sintetica-browser-2026!');const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#backup-form button.primary').click()]);await backup.saveAs('.local/browser-backup.dsmbak');check(!await backup.failure(),'Descarga respaldo falló');results.push('Respaldo cifrado desde interfaz');
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');await page.getByRole('searchbox').fill('');await page.waitForFunction(()=>document.querySelector('tbody')?.querySelectorAll('tr').length===25);
  console.log(JSON.stringify({passed:results}));return {passed:results};
}
