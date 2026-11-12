async page=>{
  if(!['localhost','127.0.0.1'].includes(new URL(page.url()).hostname))throw Error('Solo demo local sintética.');
  page.setDefaultTimeout(14000);
  const check=(ok,message)=>{if(!ok)throw Error(message);},passed=[];
  await page.reload();await page.getByLabel('Usuario',{exact:true}).or(page.locator('.home-shell')).or(page.getByRole('button',{name:'Plantillas',exact:true})).waitFor();
  if(await page.getByLabel('Usuario',{exact:true}).count()){
    await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  }
  await page.locator('.home-shell').or(page.getByRole('button',{name:'Plantillas',exact:true})).waitFor();
  if(await page.locator('.home-shell').count())await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
  await page.getByRole('button',{name:'Plantillas',exact:true}).click();await page.locator('#template-name').fill('Versión ficticia de prueba '+Date.now());await page.getByRole('button',{name:'Añadir pregunta',exact:true}).click();
  let modal=page.getByRole('dialog');await modal.getByLabel('Pregunta',{exact:true}).fill('Pregunta opcional de prueba');await modal.locator('button[type="submit"]').click();
  check(await page.getByRole('button',{name:'Publicar versión',exact:true}).count()===0,'Publicar aparece antes de vista previa');
  await page.getByRole('button',{name:'Previsualizar versión',exact:true}).click();await page.getByRole('button',{name:'Publicar versión',exact:true}).waitFor();
  const [pdf]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar vista previa PDF',exact:true}).click()]);check(!await pdf.failure(),'Vista previa PDF falló');
  await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await page.getByText('Versión publicada. Las fichas anteriores se conservan.',{exact:true}).waitFor();
  const questionPager=page.locator('[data-pagination="template-questions"]'),lastQuestionPage=await questionPager.getAttribute('data-pages');if(lastQuestionPage!==await questionPager.getAttribute('data-page')){await questionPager.locator('button[data-page="'+lastQuestionPage+'"]').click();await page.locator('[data-pagination="template-questions"][data-page="'+lastQuestionPage+'"]').waitFor();}await page.getByRole('button',{name:'Ocultar',exact:true}).last().click();await page.locator('#template-name').fill('Ocultación ficticia '+Date.now());await page.getByRole('button',{name:'Previsualizar versión',exact:true}).click();await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await page.getByText('Versión publicada. Las fichas anteriores se conservan.',{exact:true}).waitFor();passed.push('Borrador, pregunta adicional, vista previa PDF, publicación y ocultación');
  await page.getByRole('button',{name:'Importación',exact:true}).click();await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/usuarios-sinteticos.xlsx');
  const preview=page.getByRole('button',{name:'Previsualizar carga',exact:true});await preview.click();await page.getByRole('heading',{name:'3 filas de estudiantes detectadas',exact:true}).waitFor();
  const missing=page.getByLabel('Crear los cursos pendientes al guardar',{exact:true});if(await missing.count())await missing.check();
  const firstCommit=page.locator('[data-action="commit-import"]');if(await firstCommit.isEnabled()){await firstCommit.click();await page.getByText('3 fichas importadas como borradores.',{exact:true}).waitFor();}
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('combobox',{name:'Curso',exact:true}).selectOption('');await page.getByRole('searchbox').fill('UI-SYNTH-1');await page.locator('.student-button').first().waitFor();
  // Resolve the imported record through the same API so the test does not depend on fixture surnames.
  const importedId=await page.evaluate(async()=>{const session=await(await fetch('/api/session')).json();const response=await fetch('/api/records?year=2026&q=UI-SYNTH-1');const found=await response.json();if(found.items.length)return found.items[0].id;const all=await(await fetch('/api/records?year=2026&pageSize=100')).json();for(const row of all.items){const record=await(await fetch('/api/records/'+row.id)).json();if(record.data.sourceSheet==='Usuarios')return row.id;}return null;});
  check(importedId,'No se encontró la ficha importada');
  await page.locator(`[data-action="open"][data-id="${importedId}"]`).click();await page.locator('#field-address').fill('Domicilio que la planilla vacía no debe borrar');
  await page.locator('#field-studentPhone').fill('+56900000099');await page.locator('#field-email').fill('correo-modificado@example.test');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.startsWith('Guardado'));
  await page.getByRole('button',{name:'Importación',exact:true}).click();await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/usuarios-sinteticos.xlsx');await preview.click();await page.getByRole('heading',{name:'3 filas de estudiantes detectadas',exact:true}).waitFor();
  const selected=page.locator('[data-import-update]');check(await selected.count()>=1,'No se detectaron cambios');const commit=page.locator('[data-action="commit-import"]');check(await commit.isDisabled(),'Una actualización se aplicaría sin seleccionar');await selected.first().check();check(await commit.isEnabled(),'La selección no habilitó la confirmación');await commit.click();await page.getByText(/0 fichas nuevas, 1 actualizadas/).waitFor();
  const persisted=await page.evaluate(async id=>(await(await fetch('/api/records/'+id)).json()).data.address,importedId);check(persisted==='Domicilio que la planilla vacía no debe borrar','La celda vacía borró el domicilio');passed.push('Conciliación visible, selección explícita y vacíos sin borrado');
  return {passed};
}
