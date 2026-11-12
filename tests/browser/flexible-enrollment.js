async page=>{
  if(!['localhost','127.0.0.1'].includes(new URL(page.url()).hostname))throw new Error('Usar solo demo local sintética.');
  page.setDefaultTimeout(12000);
  const check=(ok,message)=>{if(!ok)throw new Error(message);},passed=[];
  const waitSaved=()=>page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.startsWith('Guardado'));
  await page.reload();await page.getByLabel('Usuario',{exact:true}).or(page.locator('.home-shell')).or(page.getByRole('heading',{name:'Expedientes',exact:true})).waitFor();
  if(await page.getByLabel('Usuario',{exact:true}).count()){
    await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
  }
  await page.locator('.home-shell').or(page.getByRole('heading',{name:'Expedientes',exact:true})).waitFor();
  if(await page.locator('.home-shell').count())await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
  await page.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Año escolar',exact:true}).selectOption('2026');await page.locator('.student-button').first().waitFor();
  await page.locator('.student-button').first().click();await page.locator('#field-address').waitFor();if(await page.getByRole('button',{name:'Actualizar plantilla de esta ficha',exact:true}).count()){await page.getByRole('button',{name:'Actualizar plantilla de esta ficha',exact:true}).click();
  await page.getByRole('dialog').locator('button[type="submit"]').click();await page.getByText('Plantilla actualizada. El historial anterior se conserva.',{exact:true}).waitFor();}
  await page.getByRole('tab',{name:'Historial',exact:true}).click();await page.getByText('Plantilla actualizada',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Ficha del estudiante',exact:true}).click();await page.locator('#field-address').fill('Domicilio de ficha actualizada');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await waitSaved();
  passed.push('Actualizar plantilla de una ficha anterior y conservar historial y edición');

  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('button',{name:'+ Nueva matrícula',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Nombres',{exact:true}).fill('Alta manual flexible');await dialog.getByLabel('Apellido paterno',{exact:true}).fill('Sintético');await dialog.getByRole('combobox',{name:'Identificación',exact:true}).selectOption('Otro');
  await dialog.getByLabel('Identificador',{exact:true}).fill('FLEX-MANUAL-'+Date.now());await dialog.locator('button[type="submit"]').click();
  await page.locator('#field-commune').fill('Comuna manual ficticia');await page.locator('#field-guardianName').fill('Persona ficticia de contacto');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await waitSaved();
  await page.getByRole('button',{name:'← Volver a expedientes'}).click();await page.getByRole('searchbox').fill('Alta manual flexible');await page.getByRole('button',{name:/Alta manual flexible/}).click();
  check(await page.locator('#field-commune').inputValue()==='Comuna manual ficticia','Alta manual perdió comuna');
  passed.push('Alta manual, comuna, apoderado, guardado y reapertura');

  await page.getByRole('button',{name:'Importación',exact:true}).click();
  await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/matricula-por-cursos-sintetica.xlsx');
  const preview=page.getByRole('button',{name:'Previsualizar carga',exact:true});await preview.click();
  await page.getByRole('heading',{name:'14 filas de estudiantes detectadas',exact:true}).waitFor();check(await page.locator('.import-sheet').count()===14,'Se perdió alguna hoja');
  await page.getByText('Columnas y titularidad de los contactos',{exact:true}).click();
  await page.locator('[data-import-owner="contactOwner"]').selectOption('guardian');await page.locator('[data-import-owner="addressOwner"]').selectOption('student');
  check(await page.locator('[data-action="commit-import"]').isDisabled(),'Cambiar configuración no invalidó ticket');
  await preview.click();await page.getByRole('heading',{name:'14 filas de estudiantes detectadas',exact:true}).waitFor();
  await page.getByLabel('Crear los cursos pendientes al guardar',{exact:true}).check();await page.locator('[data-action="commit-import"]').click();await page.getByText('14 fichas importadas como borradores.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('searchbox').fill('Alumno flexible 01');await page.getByRole('button',{name:/Alumno flexible 01/}).click();
  check(await page.locator('#field-guardianPhone').inputValue()==='+56911112222','Contacto no se asignó al apoderado');check(await page.locator('#field-commune').inputValue()==='Comuna ficticia','Comuna no se asignó al estudiante');
  await page.locator('#field-address').fill('Domicilio importado corregido');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await waitSaved();
  await page.locator('summary').filter({hasText:'Datos de origen de la importación'}).click();
  check(await page.locator('#field-sourceRow').inputValue()==='3','Fila de origen incorrecta');
  await page.screenshot({path:'.local/flexible-ficha.png'});passed.push('Importación real de14hojas, titularidad explícita y edición posterior');

  await page.getByRole('button',{name:'Importación',exact:true}).click();await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/columnas-flexibles-sinteticas.xlsx');await preview.click();
  await page.locator('.import-sheet').waitFor();await page.getByText('Columnas y titularidad de los contactos',{exact:true}).click();
  for(const [target,header] of Object.entries({names:'Persona',surname:'Primer apellido',identifier:'Documento',contactPhone:'Celular',commune:'Distrito',address:'Direccion',contactEmail:'Contacto correo'}))await page.locator(`[data-import-column="${target}"]`).selectOption(header);
  await page.locator('[data-sheet-include="0"]').check();await page.locator('[data-sheet-course="0"]').selectOption({label:'1° Básico A · 2026'});
  await page.locator('[data-import-owner="contactOwner"]').selectOption('guardian');await page.locator('[data-import-owner="addressOwner"]').selectOption('guardian');
  await preview.click();await page.getByRole('heading',{name:'1 fila de estudiante detectada',exact:true}).waitFor();
  await page.locator('[data-action="commit-import"]').click();await page.getByText('1 fichas importadas como borradores.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('searchbox').fill('Alumno columnas');await page.getByRole('button',{name:/Alumno columnas/}).click();
  check(await page.locator('#field-guardianCommune').inputValue()==='Comuna ficticia','Mapping perdió comuna del apoderado');passed.push('Mapeo de encabezados distintos y asignación a curso existente');
  await page.getByRole('button',{name:'Importación',exact:true}).click();await page.getByLabel('Planilla de estudiantes',{exact:true}).setInputFiles('.local/xlsx-fixtures/matricula-por-cursos-sintetica.xlsx');await preview.click();await page.getByRole('heading',{name:'14 filas de estudiantes detectadas',exact:true}).waitFor();
  check(await page.locator('[data-action="commit-import"]').isDisabled(),'Reimportación duplicada habilitada');
  await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Importación desborda en móvil');await page.screenshot({path:'.local/flexible-import-mobile.png'});
  await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();await page.screenshot({path:'.local/flexible-import-dark.png'});passed.push('Duplicados bloqueados, móvil390 y tema oscuro');
  await page.getByRole('button',{name:'Salir',exact:true}).click();await page.getByRole('heading',{name:'Bienvenido/a'}).waitFor();
  return {passed};
}
