async (page) => {
  if(!['localhost','127.0.0.1'].includes(new URL(page.url()).hostname))throw new Error('Este recorrido solo modifica la demo local sintética.');
  page.setDefaultTimeout(12000);
  const passed=[],check=(value,message)=>{if(!value)throw new Error(message);};
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function hold(pattern){
    let release,started,finished;const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>started=resolve),completed=new Promise(resolve=>finished=resolve);
    const handler=async route=>{started();await gate;try{await route.continue();}finally{finished();}};
    await page.route(pattern,handler);
    return {received,release:async()=>{release();await completed;await page.unroute(pattern,handler);}};
  }
  const startup=await hold('**/api/session');
  await page.reload();await startup.received;
  await page.locator('.boot-loading[aria-busy="true"] .skeleton-state').waitFor();
  await startup.release();await page.getByRole('heading',{name:'Bienvenido/a'}).waitFor();
  passed.push('Skeleton inicial al recargar');

  const password=page.locator('#login-password'),eye=page.getByRole('button',{name:'Mostrar contraseña',exact:true});
  await password.fill('Clave ficticia para el ojo');await eye.click();
  check(await password.getAttribute('type')==='text','El ojo no muestra la contraseña');
  check(await password.inputValue()==='Clave ficticia para el ojo','El ojo cambió la contraseña');
  await page.getByRole('button',{name:'Ocultar contraseña',exact:true}).press('Space');
  check(await password.getAttribute('type')==='password','El teclado no oculta la contraseña');
  check(await page.locator('#login-error').textContent()==='','El ojo envió el formulario');
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desborde en acceso móvil');
  await page.screenshot({path:'.local/loading-login-mobile.png'});
  passed.push('Ojo por mouse y teclado, valor conservado y acceso móvil');

  const login=await hold('**/api/login');
  await page.getByLabel('Usuario',{exact:true}).fill('usuario-inexistente-qa');
  await password.fill('Clave ficticia para rechazo');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  await login.received;await page.locator('#login button[type="submit"][aria-busy="true"] .button-spinner').waitFor();
  await login.release();await page.waitForFunction(()=>document.querySelector('#login-error')?.textContent.length>0);
  check(await page.getByRole('button',{name:'Ingresar',exact:true}).isEnabled(),'Login quedó bloqueado tras error');
  passed.push('Indicador de acceso y recuperación tras credenciales inválidas');

  const records=await hold('**/api/records?*');
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await password.fill('Demo-matricula-2026!');
  await page.getByRole('button',{name:'Ingresar',exact:true}).click();await records.received;
  await page.locator('#list-table[aria-busy="true"] .skeleton-state').waitFor();
  await records.release();await page.locator('.student-button').first().waitFor();
  check(await page.locator('#list-table').getAttribute('aria-busy')===null,'Lista quedó ocupada');
  await page.setViewportSize({width:1440,height:960});
  const pagination=await hold('**/api/records?*');await page.getByRole('button',{name:'Siguiente',exact:true}).click();
  await pagination.received;await page.locator('#list-table .skeleton-state').waitFor();
  await page.screenshot({path:'.local/loading-list-desktop.png'});
  await pagination.release();await page.waitForFunction(()=>document.querySelector('.table-foot')?.textContent.includes('página 2'));
  passed.push('Skeleton de expedientes y paginación');

  let releaseOld,oldStarted;const oldGate=new Promise(resolve=>releaseOld=resolve),oldRequest=new Promise(resolve=>oldStarted=resolve);
  const oldHandler=async route=>{if(new URL(route.request().url()).searchParams.get('q')!=='__vieja__')return route.continue();oldStarted();await oldGate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Error viejo ficticio'})});};
  await page.route('**/api/records?*',oldHandler);await page.getByRole('searchbox').fill('__vieja__');await oldRequest;
  await page.getByRole('searchbox').fill('');await page.locator('.student-button').first().waitFor();
  const oldResponse=page.waitForResponse(response=>response.url().includes('__vieja__'));
  releaseOld();await oldResponse;await settle();await page.unroute('**/api/records?*',oldHandler);
  check(await page.locator('.student-button').count()>0,'Un error viejo reemplazó la búsqueda nueva');
  passed.push('Una respuesta obsoleta no reemplaza resultados nuevos');

  const users=await hold('**/api/users');await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();
  await users.received;await page.locator('#content[aria-busy="true"] .skeleton-state').waitFor();
  await page.getByRole('button',{name:'Auditoría',exact:true}).click();await page.getByRole('heading',{name:'Auditoría',exact:true}).waitFor();
  const usersResponse=page.waitForResponse('**/api/users');await users.release();await usersResponse;await settle();
  check(await page.getByRole('heading',{name:'Auditoría',exact:true}).count()===1,'Cuentas tardías reemplazaron otra vista');
  const audit=await hold('**/api/audit?*');await page.getByRole('button',{name:'Auditoría',exact:true}).click();
  await audit.received;await page.locator('#content .skeleton-state').waitFor();
  await page.getByRole('button',{name:'Cursos y años',exact:true}).click();
  const auditResponse=page.waitForResponse('**/api/audit?*');await audit.release();await auditResponse;await settle();
  check(await page.getByRole('heading',{name:'Cursos y años',exact:true}).count()===1,'Auditoría tardía reemplazó otra vista');
  await page.route('**/api/users',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Error de carga ficticio"}'}));
  await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();
  check(await page.locator('#content').getAttribute('aria-busy')===null,'Error dejó skeleton activo');
  await page.unroute('**/api/users');await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.getByRole('heading',{name:'Cuentas y permisos',exact:true}).waitFor();
  await page.getByRole('button',{name:'+ Nueva cuenta',exact:true}).click();await page.locator('#account-password').fill('Clave ficticia de cuenta');
  await page.getByRole('dialog').getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
  check(await page.locator('#account-password').getAttribute('type')==='text','Cuenta sin ojo funcional');await page.keyboard.press('Escape');
  passed.push('Cuentas/auditoría lentas, navegación y reintento; ojo en cuentas');

  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.locator('.student-button').first().waitFor();
  const record=await hold('**/api/records/*');await page.locator('.student-button').first().click();await record.received;
  await page.locator('#content .skeleton-form').first().waitFor();await page.screenshot({path:'.local/loading-record-desktop.png'});
  await record.release();await page.locator('#field-address').waitFor();
  const save=await hold('**/api/records/*');await page.locator('#field-address').fill('Domicilio ficticio de prueba de espera');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await save.received;
  await page.locator('[data-action="save"][aria-busy="true"] .button-spinner').waitFor();
  check(await page.locator('#field-address').inputValue()==='Domicilio ficticio de prueba de espera','Guardado reemplazó formulario');
  await save.release();await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.startsWith('Guardado'));
  check(await page.getByRole('button',{name:'Guardar cambios',exact:true}).isEnabled(),'Guardar quedó bloqueado');
  passed.push('Skeleton de ficha y guardado sin perder campos');

  const pdf=await hold('**/api/records/*/pdf');const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar ficha PDF',exact:true}).click();await pdf.received;
  await page.locator('[data-action="pdf"][aria-busy="true"] .button-spinner').waitFor();await pdf.release();
  check(!(await (await download).failure()),'Descarga PDF falló');await settle();
  check(await page.getByRole('button',{name:'Descargar ficha PDF',exact:true}).isEnabled(),'PDF quedó bloqueado');
  passed.push('Indicador durante PDF y botón restaurado');

  await page.getByRole('button',{name:'Respaldo',exact:true}).click();await page.locator('#backup-password').fill('Clave ficticia de respaldo');
  await page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
  check(await page.locator('#backup-password').getAttribute('type')==='text','Respaldo sin ojo funcional');
  await page.locator('#backup-form').evaluate(form=>form.reset());
  check(await page.locator('#backup-password').getAttribute('type')==='password','Reset no ocultó la clave');
  passed.push('Ojo de respaldo y ocultación al limpiar');

  await page.getByRole('button',{name:'Importación',exact:true}).click();
  await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('tests/fixtures/usuarios-sinteticos.xlsx');
  const preview=await hold('**/api/import/school/preview');await page.getByRole('button',{name:'Previsualizar carga',exact:true}).click();
  await preview.received;await page.locator('#import-preview[aria-busy="true"] .skeleton-state').waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await page.locator('#import-preview .skeleton-line').first().evaluate(el=>getComputedStyle(el,'::after').animationName)==='none','Skeleton ignora movimiento reducido');
  await page.setViewportSize({width:320,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Skeleton desborda en 320px');
  await page.locator('#import-preview').scrollIntoViewIfNeeded();
  await page.screenshot({path:'.local/loading-import-mobile.png'});
  await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();
  check(await page.locator('#import-preview .skeleton-line').first().evaluate(el=>getComputedStyle(el).backgroundColor==='rgb(49, 68, 87)'),'Skeleton no utiliza los colores del tema oscuro');
  await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();
  await preview.release();await page.getByRole('heading',{name:'3 estudiantes revisados',exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Previsualizar carga',exact:true}).isEnabled(),'Preview quedó bloqueado');
  await page.route('**/api/import/school/preview',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Error de revisión ficticio"}'}));
  await page.getByRole('button',{name:'Previsualizar carga',exact:true}).click();await page.getByText('Error de revisión ficticio',{exact:true}).waitFor();
  check(await page.locator('#import-preview .skeleton-state').count()===0,'Preview mantiene skeleton tras error');
  check(await page.getByRole('button',{name:'Previsualizar carga',exact:true}).isEnabled(),'Error de preview dejó botón bloqueado');
  await page.unroute('**/api/import/school/preview');
  await page.getByRole('button',{name:'Salir',exact:true}).click();await page.getByRole('heading',{name:'Bienvenido/a'}).waitFor();
  passed.push('Excel lento y fallido, skeleton móvil y movimiento reducido');
  return {passed};
}
