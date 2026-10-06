async (page) => {
  page.setDefaultTimeout(10000);
  const check=(value,message)=>{if(!value)throw new Error(message);},results=[];
  await page.reload();
  if(await page.getByRole('textbox',{name:'Usuario',exact:true}).count()){
    await page.getByRole('textbox',{name:'Usuario',exact:true}).fill('demo-secretaria');
    await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('Demo-matricula-2026!');
    await page.getByRole('button',{name:'Ingresar'}).click();
  }
  await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');
  await page.getByRole('combobox',{name:'Curso',exact:true}).selectOption({label:'1° Básico A'});
  const courseId=await page.locator('#course-filter').inputValue();
  const [csv]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar curso',exact:true}).click()]);
  await csv.saveAs('.local/browser-curso-2026.csv');check(!await csv.failure(),'Exportación falló');results.push('CSV del curso desde la interfaz');
  await page.getByRole('button',{name:'Importación',exact:true}).click();
  const stamp=Date.now(),row={year:2026,courseId,origin:'qa-browser-sintetico',originId:'qa-'+stamp,data:{names:'Importación QA '+stamp,surname:'Sintético',identifierType:'Otro',identifier:'QA-IMPORT-'+stamp}};
  const upload=async rows=>{await page.getByLabel('Planilla de estudiantes').setInputFiles({name:'padron-sintetico.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rows))});await page.getByRole('button',{name:'Previsualizar carga',exact:true}).click();};
  await upload([row,row]);await page.getByText('Corrige la planilla y vuelve a previsualizar antes de importar.').waitFor();
  check(await page.getByRole('button',{name:/^Confirmar \d+ estudiantes$/}).isDisabled(),'Duplicado permitido');
  await upload([row]);await page.getByText('Revisa nombres, identificación y curso. Las filas se guardarán juntas como borradores.').waitFor();
  await page.getByRole('button',{name:'Confirmar importación revisada'}).click();await page.getByText('1 fichas importadas como borradores.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('searchbox').fill('QA-IMPORT-'+stamp);
  await page.getByRole('button',{name:new RegExp('Importación QA '+stamp)}).waitFor();results.push('Importación revisada y duplicados bloqueados');
  await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();await page.getByRole('button',{name:'+ Nueva cuenta'}).click();
  const username=page.getByRole('dialog').locator('[name=username]');await username.fill('qa-valido_1');
  check(await username.evaluate(el=>el.validity.valid),'Identificador permitido se rechazó');await username.fill('usuario con espacios');
  check(await username.evaluate(el=>el.validity.patternMismatch),'No se validó el formato de usuario');
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar'}).click();results.push('Validación HTML de cuenta sin error de expresión regular');
  await page.getByRole('button',{name:'Respaldo',exact:true}).click();await page.locator('#backup-form input').fill('Clave-sintetica-browser-2026!');
  const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('#backup-form button').click()]);
  check(/^matricula-completa-\d{4}-\d{2}-\d{2}\.dsmbak$/.test(backup.suggestedFilename()),'Nombre de copia completa incorrecto');
  await backup.saveAs('.local/browser-backup-final.dsmbak');results.push('Respaldo completo identificado por fecha');
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox',{name:'Curso',exact:true}).selectOption('');
  await page.waitForFunction(()=>document.querySelector('tbody')?.querySelectorAll('tr').length===25);
  return {passed:results};
}
