async page=>{
 const origin=new URL(page.url()).origin;if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!(await(await page.request.get(origin+'/api/health')).json()).demo)throw Error('Solo demo ficticia local.');
 page.setDefaultTimeout(12000);const passed=[],check=(ok,msg)=>{if(!ok)throw Error(msg);},modal=()=>page.locator('#dialog');
 await page.context().clearCookies();await page.goto(origin);await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-shell').waitFor();await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await page.locator('.student-button').first().waitFor();if(await page.evaluate(()=>document.body.classList.contains('dark')))await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();
 const modules=[['Expedientes','records','.student-button'],['Pendientes','pending','#report-list-title'],['Estadísticas','reports','.report-indicators'],['Cursos y años','courses','#prepare-year'],['Cuentas y permisos','users','[data-action="edit-user"]'],['Plantillas','templates','#template-name'],['Importación','import','#import-form'],['Auditoría','audit','#content tbody tr'],['Respaldo','backup','#backup-form']];
 await page.setViewportSize({width:1440,height:960});
 for(const [name,view,ready] of modules){
  await page.getByRole('button',{name,exact:true}).click();await page.locator(ready).first().waitFor();
  check(await page.getByRole('button',{name:'Salir',exact:true}).count()===1,'Salida duplicada en '+view);
  check(await page.locator('nav [aria-current="page"]').getAttribute('data-view')===view,'Navegación no identifica '+view);
  check(await page.locator('.topbar-title').textContent()===name,'Contexto incorrecto '+view);
  check(await page.locator('.topbar-controls').evaluate(el=>el.getBoundingClientRect().width<700),'Controles dispersos '+view);
  await page.screenshot({path:'.local/uiux-qa-YL0PlE/'+view+'-desktop.png'});
 }
 passed.push('Nueve módulos con herramientas agrupadas, contexto y una sola salida');
 for(const width of [320,375,768,1024,1440]){
  await page.setViewportSize({width,height:960});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desborde de página '+width);
  const exit=page.getByRole('button',{name:'Salir',exact:true});check(await exit.isVisible(),'Salida oculta '+width);check(await exit.evaluate(el=>el.getBoundingClientRect().height>=44),'Salida pequeña '+width);
  check(await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).isVisible(),'Ayuda oculta '+width);check(await page.locator('#year-select').isVisible(),'Año oculto '+width);
  if(width===320){check(await page.locator('.mobile-account').isVisible(),'No se identifica cuenta móvil');check(await page.getByRole('button',{name:'Cambiar contraseña',exact:true}).count()===1,'Contraseña móvil ambigua');await page.screenshot({path:'.local/uiux-qa-YL0PlE/header-320.png'});}
 }
 passed.push('320, 375, 768, 1024 y 1440 px sin desborde ni salida escondida');
 async function colors(){
  const metrics=await page.locator('.session-exit').evaluate(el=>{
   const css=getComputedStyle(el),body=getComputedStyle(document.body);
   const rgb=value=>value.match(/[0-9.]+/g).slice(0,3).map(Number);
   const luminance=value=>rgb(value).map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   const a=luminance(css.color),b=luminance(css.backgroundColor);
   return {color:css.color,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),body:parseFloat(body.fontSize)};
  });
  check(metrics.contrast>=4.5,'Salir sin contraste '+JSON.stringify(metrics));check(metrics.body>=16,'Texto base demasiado pequeño');
  return metrics;
 }
 const light=await colors();await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();const dark=await colors();check(light.color!==dark.color,'Tema no adapta rojo');await page.screenshot({path:'.local/uiux-qa-YL0PlE/dark-desktop.png'});await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();passed.push('Texto 16 px y salida roja con contraste en ambos temas');
 await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();await page.getByRole('button',{name:'+ Nueva cuenta',exact:true}).click();check(await modal().locator('button[type="submit"]').textContent()==='Crear cuenta','Acción de cuenta ambigua');
 check(await modal().getByLabel('Nombre',{exact:true}).evaluate(el=>el===document.activeElement),'Foco inicial no está en el formulario');await modal().getByLabel('Nombre',{exact:true}).fill('Texto sin guardar');
 await modal().getByRole('button',{name:'Ayuda de este formulario'}).click();await page.keyboard.press('Escape');check(await modal().getByLabel('Nombre',{exact:true}).inputValue()==='Texto sin guardar','Ayuda perdió formulario');
 await page.setViewportSize({width:320,height:844});check(await modal().evaluate(el=>el.scrollWidth<=el.clientWidth),'Modal desborda');await page.screenshot({path:'.local/uiux-qa-YL0PlE/account-dialog-320.png'});await modal().getByRole('button',{name:'Cerrar formulario'}).click();await modal().waitFor({state:'hidden'});
 passed.push('Formularios con verbos claros, foco inicial y cierre sin perder contexto');
 await page.setViewportSize({width:1440,height:960});await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('button',{name:'Exportar lista',exact:true}).click();await modal().locator('[name="format"]').selectOption('csv');check(await modal().locator('[name="layout"]').isDisabled(),'CSV deja opciones Excel activas');await modal().locator('[name="format"]').selectOption('xlsx');check(await modal().locator('[name="layout"]').isEnabled(),'Excel no recupera opciones');await modal().getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByRole('button',{name:'Plantillas',exact:true}).click();await page.getByRole('button',{name:'Añadir pregunta',exact:true}).click();check(await modal().locator('#question-options').isHidden(),'Texto muestra opciones innecesarias');await modal().getByRole('combobox',{name:'Tipo de respuesta',exact:true}).selectOption('select');check(await modal().locator('#question-options').isVisible(),'Opciones no aparecen');check(await modal().locator('[name="options"]').getAttribute('required')!==null,'Opciones no son requeridas');await modal().getByRole('button',{name:'Cancelar',exact:true}).click();passed.push('Opciones de CSV y preguntas solo cuando corresponden');
 await page.getByRole('button',{name:'Expedientes',exact:true}).click();await page.getByRole('searchbox').fill('DEMO-002');await page.getByRole('button',{name:/Ejemplo 002 Sintético/}).click();await page.getByRole('tab',{name:'Historial',exact:true}).click();await page.locator('[data-action="revision"]').first().click();await modal().waitFor({state:'visible'});await modal().getByRole('heading',{name:/^Revisión \d+$/}).waitFor();check(await modal().locator('button[type="submit"]').count()===0,'Revisión histórica ofrece guardar');await modal().getByRole('button',{name:'Cerrar',exact:true}).click();passed.push('Consulta de revisión sin acciones de guardado');
 await page.getByRole('button',{name:'Auditoría',exact:true}).click();await page.getByText('Consulta de auditoría',{exact:true}).first().waitFor();check(await page.locator('.audit-technical:not([open])').count()>0,'Códigos técnicos dominan auditoría');await page.screenshot({path:'.local/uiux-qa-YL0PlE/audit-readable.png'});passed.push('Auditoría legible con detalles técnicos plegados');
 await page.getByRole('button',{name:'Salir',exact:true}).click();await page.getByRole('heading',{name:'Bienvenido/a'}).waitFor();check(new URL(page.url()).hash==='','Salir no limpia ubicación');passed.push('Salida funciona y limpia la sesión');
 return {passed,contrast:{light:light.contrast,dark:dark.contrast}};
}
