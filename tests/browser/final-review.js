async page=>{
 if(!['localhost','127.0.0.1'].includes(new URL(page.url()).hostname))throw Error('Solo demo local sintética.');
 await page.setViewportSize({width:1440,height:960});
 await page.locator('.home-shell').or(page.getByRole('button',{name:'Estadísticas',exact:true})).waitFor();
 if(await page.locator('.home-shell').count())await page.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();
 await page.getByRole('button',{name:'Estadísticas',exact:true}).click();await page.getByRole('heading',{name:'Por curso',exact:true}).waitFor();await page.screenshot({path:'.local/qa-ampliacion-qX6vCv/dashboard.png'});
 await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();await page.screenshot({path:'.local/qa-ampliacion-qX6vCv/ayuda.png'});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Cuentas y permisos',exact:true}).click();await page.getByRole('heading',{name:'Cuentas y permisos',exact:true}).waitFor();await page.screenshot({path:'.local/qa-ampliacion-qX6vCv/cuentas.png'});
 await page.getByRole('button',{name:'Plantillas',exact:true}).click();await page.screenshot({path:'.local/qa-ampliacion-qX6vCv/plantillas.png'});
 await page.getByRole('button',{name:'Respaldo',exact:true}).click();await page.locator('#backup-password').fill('Clave-respaldo-ficticio-2026!');
 const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#backup-form button.primary').click()]);await file.saveAs('.local/qa-ampliacion-qX6vCv/operaciones-respaldo.dsmbak');if(await file.failure())throw Error('Respaldo fallido');
 await page.getByRole('button',{name:'Salir',exact:true}).click();await page.getByRole('heading',{name:'Bienvenido/a'}).waitFor();return {screenshots:4,backup:true,logout:true};
}
