async page=>{
 const origin=new URL(page.url()).origin;
 if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!(await(await page.request.get(origin+'/api/health')).json()).demo)throw Error('Solo demo sintética.');
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},results=[];
 const inspect=async target=>{
  const button=target.getByRole('button',{name:'Ayuda de esta pantalla',exact:true});await button.click();const help=target.locator('#help-dialog'),titles=[];
  do{titles.push(await help.locator('#help-title').textContent());if(await help.getByRole('button',{name:'Listo',exact:true}).count()){await help.getByRole('button',{name:'Listo',exact:true}).click();break;}await help.getByRole('button',{name:'Siguiente',exact:true}).click();}while(titles.length<10);
  return titles;
 };
 const session=await(await page.request.get(origin+'/api/session')).json(),meta=await(await page.request.get(origin+'/api/meta')).json();
 const username='qa-doc-help-'+Date.now(),temporary='Temporal-documentos-2026!',personal='Personal-documentos-2026!';
 const create=await page.request.post(origin+'/api/users',{headers:{'X-CSRF-Token':session.csrf},data:{name:'Consulta documental sintética',username,password:temporary,permissions:['read','documents'],courses:[meta.courses.find(c=>c.year===2026).id],allCourses:false}});
 check(create.ok(),'No se preparó cuenta documental');
 for(const [user,password,write,documents] of [['demo-lector','Demo-matricula-2026!',false,false],['demo-profesor','Demo-matricula-2026!',true,true],[username,personal,false,true]]){
  const context=await page.context().browser().newContext();try{
   if(user===username){const login=await context.request.post(origin+'/api/login',{data:{username,password:temporary}});const data=await login.json();check(login.ok(),'No se preparó acceso temporal');check((await context.request.post(origin+'/api/account/password',{headers:{'X-CSRF-Token':data.csrf},data:{currentPassword:temporary,newPassword:personal}})).ok(),'No se preparó clave personal');}
   const target=await context.newPage();target.setDefaultTimeout(12000);await target.goto(origin);await target.getByLabel('Usuario',{exact:true}).fill(user);await target.getByLabel('Contraseña',{exact:true}).fill(password);await target.getByRole('button',{name:'Ingresar',exact:true}).click();await target.locator('.home-shell').waitFor();await target.getByRole('button',{name:'Ver todos los expedientes',exact:true}).click();await target.locator('.student-button').first().click();const titles=await inspect(target);
   check(titles.includes('Guarda tus cambios')===write,'Ayuda de guardado incorrecta '+user);check(!titles.includes('Gestiona la matrícula'),'Ofrece gestión sin permiso '+user);
   await target.getByRole('tab',{name:'Documentos',exact:true}).click();const docs=await inspect(target);check(docs.includes('Adjunta un respaldo')===(write&&documents),'Ayuda de carga incorrecta '+user);check((await target.locator('#upload').count()>0)===(write&&documents),'Ayuda y controles discrepan '+user);results.push({role:user===username?'consulta-documental':user,recordSteps:titles.length,documentSteps:docs.length});
  }finally{await context.close();}
 }
 return {passed:results};
}
