async (page) => {
  page.setDefaultTimeout(10000);
  const check=(value,message)=>{if(!value)throw new Error(message);};const results=[];
  await page.reload();await page.setViewportSize({width:1440,height:960});
  if(await page.getByRole('textbox',{name:'Usuario',exact:true}).count()){
    await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('demo-secretaria');
    await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Demo-matricula-2026!');
    await page.getByRole('button',{name:'Ingresar'}).click();
  }
  await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');
  await page.getByRole('searchbox').fill('Ejemplo 001');await page.waitForFunction(()=>document.querySelector('tbody')?.querySelectorAll('tr').length===1);
  await page.getByRole('button',{name:/Ejemplo 001 Sintético/}).click();await page.locator('#field-address').waitFor();
  const context=await page.context().browser().newContext({viewport:{width:1440,height:960}}),teacher=await context.newPage();teacher.setDefaultTimeout(10000);
  try{
    await teacher.goto('http://127.0.0.1:4318');await teacher.getByRole('textbox',{name:'Usuario',exact:true}).fill('demo-profesor');await teacher.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Demo-matricula-2026!');await teacher.getByRole('button',{name:'Ingresar'}).click();
    await teacher.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
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
  await page.getByRole('button',{name:'Plantillas',exact:true}).click();await page.locator('#template-form [name=name]').fill('Pregunta sintética QA '+Date.now());await page.locator('#template-form [name=label]').fill('Pregunta de prueba no institucional');await page.locator('#template-form button').click();await page.getByText('Nueva versión creada. Las fichas anteriores conservan su plantilla.').waitFor();results.push('Nueva pregunta en versión futura');
  await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();await page.getByRole('button',{name:'+ Nueva cuenta'}).click();const dialog=page.getByRole('dialog');await dialog.locator('[name=name]').fill('Cuenta QA sintética');await dialog.locator('[name=username]').fill('qa-'+Date.now());await dialog.locator('[name=password]').fill('Cuenta-sintetica-2026!');await dialog.getByRole('button',{name:'Continuar'}).click();await page.getByRole('cell',{name:/Cuenta QA sintética/}).waitFor();results.push('Cuenta individual nueva con permisos mínimos');
  await page.getByRole('button',{name:'Auditoría',exact:true}).click();await page.getByText('Integridad de la cadena verificada.').waitFor();check((await page.locator('tbody').textContent()).includes('user.configure'),'Auditoría sin cambio de cuenta');results.push('Auditoría visible e integridad verificada');
  await page.getByRole('button',{name:'Respaldo',exact:true}).click();await page.locator('#backup-form input').fill('Clave-sintetica-browser-2026!');const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#backup-form button').click()]);await backup.saveAs('.local/browser-backup.dsmbak');check(!await backup.failure(),'Descarga respaldo falló');results.push('Respaldo cifrado desde interfaz');
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');await page.getByRole('searchbox').fill('');await page.waitForFunction(()=>document.querySelector('tbody')?.querySelectorAll('tr').length===25);
  console.log(JSON.stringify({passed:results}));return {passed:results};
}
