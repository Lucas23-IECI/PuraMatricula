async page => {
  page.setDefaultTimeout(10000);
  const origin=new URL(page.url()).origin;
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw new Error('Esta prueba solo se ejecuta en un servidor local de prueba.');
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  const revealPaged=async(id,target)=>{
    const pager=page.locator('[data-pagination="'+id+'"]');await pager.waitFor();
    if(await target.count())return;
    if(await pager.getAttribute('data-page')!=='1'){await pager.locator('button[data-page="1"]').click();await page.locator('[data-pagination="'+id+'"][data-page="1"]').waitFor();}
    while(!await target.count()){
      const next=pager.getByRole('button',{name:'Página siguiente',exact:true});check(await next.isEnabled(),'No se encontró la cuenta entre las páginas');
      const expected=Number(await pager.getAttribute('data-page'))+1;await next.click();await page.locator('[data-pagination="'+id+'"][data-page="'+expected+'"]').waitFor();
    }
  };
  const login=async(target,username,password)=>{
    await target.getByLabel('Usuario',{exact:true}).fill(username);
    await target.getByLabel('Contraseña',{exact:true}).fill(password);
    await target.getByRole('button',{name:'Ingresar',exact:true}).click();
  };
  const demo=await (await page.request.get(origin+'/api/health')).json();
  check(demo.demo,'Se requiere una base demo con datos ficticios.');
  const loginButton=page.getByRole('button',{name:'Ingresar',exact:true});
  if(await loginButton.count())await login(page,'demo-secretaria','Demo-matricula-2026!');
  await page.locator('.home-shell').or(page.getByRole('button',{name:'Cuentas y permisos',exact:true})).waitFor();
  if(await page.locator('.home-shell').count())await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
  await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();
  await page.getByRole('button',{name:'+ Nueva cuenta',exact:true}).click();
  const dialog=page.getByRole('dialog'),username='qa-cuenta-'+Date.now();
  const temporary='Temporal-sintetica-2026!',personal='Personal-sintetica-2026!',replacement='Reemplazo-sintetico-2026!',reset='Restablecida-sintetica-2026!';
  await dialog.getByLabel('Nombre',{exact:true}).fill('Cuenta de prueba UI');
  await dialog.getByLabel('Usuario',{exact:true}).fill(username);
  await dialog.getByLabel('Contraseña temporal',{exact:true}).fill(temporary);
  await dialog.getByRole('combobox',{name:'Perfil sugerido',exact:true}).selectOption('profesor');
  check(await dialog.getByLabel('Editar fichas',{exact:true}).isChecked(),'El perfil no aplicó los permisos sugeridos.');
  check(!(await dialog.getByLabel('Ver y editar antecedentes reservados',{exact:true}).isChecked()),'El perfil concedió datos reservados.');
  const course=dialog.getByLabel('1° Básico A',{exact:true}).first();
  if(!(await course.isVisible()))await dialog.locator('summary').first().click();
  await course.check();
  await dialog.locator('button[type="submit"]').click();
  const accountRow=page.getByRole('row').filter({hasText:username});
  await dialog.waitFor({state:'hidden'});await revealPaged('users',accountRow);
  await accountRow.getByText('Clave temporal',{exact:true}).waitFor();

  const context=await page.context().browser().newContext({viewport:{width:390,height:844}});
  try{
    const accountPage=await context.newPage();
    accountPage.setDefaultTimeout(10000);
    await accountPage.goto(origin);
    await login(accountPage,username,temporary);
    await accountPage.getByRole('heading',{name:'Cambia tu contraseña temporal',exact:true}).waitFor();
    check(!(await accountPage.getByRole('navigation',{name:'Principal'}).count()),'La cuenta temporal vio la navegación.');
    await accountPage.getByLabel('Contraseña actual',{exact:true}).fill(temporary);
    await accountPage.getByLabel('Nueva contraseña',{exact:true}).fill(personal);
    await accountPage.getByLabel('Repetir nueva contraseña',{exact:true}).fill(replacement);
    await accountPage.getByRole('button',{name:'Guardar nueva contraseña',exact:true}).click();
    await accountPage.getByText('Las nuevas contraseñas no coinciden.',{exact:true}).waitFor();
    await accountPage.getByLabel('Repetir nueva contraseña',{exact:true}).fill(personal);
    await accountPage.getByRole('button',{name:'Guardar nueva contraseña',exact:true}).click();
    await accountPage.getByRole('button',{name:'Ingresar',exact:true}).waitFor();
    await login(accountPage,username,personal);
    await accountPage.locator('.home-shell').waitFor();await accountPage.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await accountPage.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();
    check(!(await accountPage.getByRole('button',{name:'Cuentas y permisos',exact:true}).count()),'El perfil de profesor vio Administración.');
    await accountPage.getByRole('button',{name:'Cambiar contraseña',exact:true}).click();
    const passwordDialog=accountPage.getByRole('dialog');
    await passwordDialog.getByLabel('Contraseña actual',{exact:true}).fill(personal);
    await passwordDialog.getByLabel('Nueva contraseña',{exact:true}).fill(replacement);
    await passwordDialog.getByLabel('Repetir nueva contraseña',{exact:true}).fill(replacement);
    await passwordDialog.locator('button[type="submit"]').click();
    await accountPage.getByRole('button',{name:'Ingresar',exact:true}).waitFor();
    await login(accountPage,username,replacement);
    await accountPage.locator('.home-shell').waitFor();await accountPage.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await accountPage.getByRole('heading',{name:'Expedientes',exact:true}).waitFor();

    await accountRow.getByRole('button',{name:'Configurar',exact:true}).click();
    await dialog.getByLabel('Nueva clave temporal (opcional)',{exact:true}).fill(reset);
    await dialog.locator('button[type="submit"]').click();
    await dialog.waitFor({state:'hidden'});
    await accountPage.reload();
    await accountPage.getByRole('button',{name:'Ingresar',exact:true}).waitFor();
    await login(accountPage,username,reset);
    await accountPage.getByRole('heading',{name:'Cambia tu contraseña temporal',exact:true}).waitFor();
  }finally{await context.close();}
  return {passed:['Perfil sugerido editable y asignación de curso','Primer acceso restringido y confirmación de contraseña','Cambio propio en móvil','Restablecimiento de clave y revocación de sesiones']};
}
