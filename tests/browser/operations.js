async page=>{
  if(!['localhost','127.0.0.1'].includes(new URL(page.url()).hostname))throw Error('Solo demo local con datos ficticios.');
  page.setDefaultTimeout(14000);
  const expect=(condition,message)=>{if(!condition)throw Error(message);},out=[];
  const capture=async(button,extension)=>{const [file]=await Promise.all([page.waitForEvent('download'),button.click()]);expect(file.suggestedFilename().endsWith(extension),'Tipo de archivo incorrecto');expect(!await file.failure(),'Falló la descarga');};
  const login=async()=>{
    await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-shell').waitFor();await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
  };
  await page.reload();await page.getByLabel('Usuario',{exact:true}).or(page.locator('.home-shell')).or(page.getByRole('heading',{name:'Expedientes',exact:true})).waitFor();
  if(await page.getByLabel('Usuario',{exact:true}).count()){
    await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();await page.getByRole('heading',{name:'Ingresa con tu cuenta'}).waitFor();await page.keyboard.press('Escape');
    expect(await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).evaluate(button=>button===document.activeElement),'Ayuda no restauró foco');await login();
  }
  await page.locator('.home-shell').or(page.getByRole('heading',{name:'Expedientes',exact:true})).waitFor();
  if(await page.locator('.home-shell').count())await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
  await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');
  await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();await page.getByRole('heading',{name:'Elige el año escolar'}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByRole('heading',{name:'Abre un expediente'}).waitFor();await page.keyboard.press('Escape');out.push('Ayuda contextual y navegación por teclado');

  await page.getByRole('button',{name:'Estadísticas',exact:true}).click();await page.getByRole('heading',{name:'Por curso',exact:true}).waitFor();
  await page.locator('[data-report-status="enrolled"]').first().click();await page.getByRole('heading',{name:'Expedientes de la selección'}).waitFor();
  await capture(page.getByRole('button',{name:'Informe PDF',exact:true}),'.pdf');await capture(page.getByRole('button',{name:'Informe Excel',exact:true}),'.xlsx');
  await page.getByRole('button',{name:'Exportar nómina',exact:true}).click();await capture(page.getByRole('dialog').getByRole('button',{name:'Descargar',exact:true}),'.xlsx');out.push('Estadísticas, detalle filtrado y descargas PDF/Excel');

  await page.getByRole('button',{name:'Pendientes',exact:true}).click();await page.getByRole('heading',{name:'Bandeja de pendientes'}).waitFor();await page.getByRole('heading',{name:'Expedientes de la selección'}).waitFor();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desborde móvil en pendientes');await page.setViewportSize({width:1440,height:960});out.push('Bandeja de pendientes en móvil');

  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('searchbox').fill('Ejemplo 002');await page.getByRole('button',{name:/Ejemplo 002 Sintético/}).click();
  await page.getByRole('button',{name:'Más descargas',exact:true}).click();await page.getByRole('dialog').locator('select[name="format"]').selectOption('docx');await capture(page.getByRole('dialog').getByRole('button',{name:'Descargar',exact:true}),'.docx');
  await page.getByRole('button',{name:'Más descargas',exact:true}).click();await page.getByRole('dialog').locator('select[name="kind"]').selectOption('constancia');await capture(page.getByRole('dialog').getByRole('button',{name:'Descargar',exact:true}),'.pdf');out.push('Word editable y constancia PDF');

  await page.getByRole('button',{name:'Registrar retiro',exact:true}).click();let modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2026-11-03');await modal.getByLabel('Motivo',{exact:true}).fill('Retiro ficticio de prueba');await modal.locator('button[type="submit"]').click();
  await page.getByRole('button',{name:'Registrar reingreso',exact:true}).click();modal=page.getByRole('dialog');await modal.getByLabel('Fecha de reingreso',{exact:true}).fill('2026-11-04');await modal.getByLabel('Motivo',{exact:true}).fill('Reingreso ficticio de prueba');await modal.locator('button[type="submit"]').click();
  await page.getByRole('tab',{name:'Historial',exact:true}).click();await page.getByText('Reingreso registrado',{exact:true}).waitFor();await page.getByText('Retiro registrado',{exact:true}).waitFor();out.push('Retiro y reingreso conservan ambos movimientos');
  return {passed:out};
}
