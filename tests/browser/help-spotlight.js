async page=>{
  page.setDefaultTimeout(12000);
  const origin='http://127.0.0.1:4318',check=(value,message)=>{if(!value)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo sintética local');
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const sample=async points=>{
    const screenshot=await page.screenshot({animations:'disabled'});
    return page.evaluate(async({data,points})=>{
      const bytes=Uint8Array.from(atob(data),value=>value.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
      return points.map(({x,y})=>Array.from(context.getImageData(Math.floor(x),Math.floor(y),1,1).data).slice(0,3));
    },{data:screenshot.toString('base64'),points});
  };
  const layout=()=>page.locator('#help-dialog').evaluate(dialog=>{
    const target=document.querySelector('[data-help-highlight="true"]'),tooltip=dialog.querySelector('.help-tooltip'),mask=dialog.querySelector('.help-focus-frame');
    const rectangle=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    return {target:target?rectangle(target):null,tooltip:rectangle(tooltip),mask:{x:Number(mask.getAttribute('x')),y:Number(mask.getAttribute('y')),width:Number(mask.getAttribute('width')),height:Number(mask.getAttribute('height'))},overlap:dialog.dataset.spotlightOverlap,background:getComputedStyle(dialog).backgroundColor,backdrop:getComputedStyle(dialog,'::backdrop').backgroundColor};
  });
  const settled=async()=>{await page.waitForFunction(()=>document.querySelector('#help-dialog')?.dataset.spotlight==='true');await frames();};
  const openHelp=async({form=false}={})=>{const trigger=form?page.locator('#dialog').getByRole('button',{name:'Ayuda de este formulario',exact:true}):page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true});await trigger.click();await settled();return trigger;};
  const inspectSteps=async topic=>{
    await openHelp();const dialog=page.locator('#help-dialog');check(await dialog.getAttribute('data-topic')===topic,'Tema incorrecto '+topic);
    let count=0;
    while(true){await settled();const geometry=await layout();check(geometry.target,'Falta objetivo '+topic+' '+count);check(geometry.overlap==='false','Tooltip cubre objetivo '+topic+' '+count);if((topic==='students'&&count===1)||(['followup','organization','administration'].includes(topic)&&count===0))check(await page.locator('[data-help-highlight]').evaluate(element=>element.matches('#area-actions .area-task')),'La ayuda debe señalar una tarea real, no toda el área '+topic);count++;const next=dialog.locator('[data-help="next"]');if(await next.textContent()==='Listo'){await next.click();break;}await next.click();check(count<12,'Pasos sin fin');}
    check(await page.locator('.help-highlight').count()===0,'Resaltado sin limpiar '+topic);return count;
  };
  await page.context().clearCookies();await page.setViewportSize({width:1440,height:960});await page.goto(origin);await page.getByLabel('Usuario',{exact:true}).waitFor();
  const input=await page.getByLabel('Usuario',{exact:true}).boundingBox(),inputPoint={x:input.x+input.width-18,y:input.y+input.height/2},outside={x:1428,y:948};
  const before=await sample([inputPoint,outside]),loginTrigger=await openHelp(),after=await sample([inputPoint,outside]),loginGeometry=await layout();
  check(before[0].every((value,index)=>Math.abs(value-after[0][index])<=1),'El objetivo se oscurece: '+JSON.stringify({before:before[0],after:after[0]}));
  check(after[1].reduce((a,b)=>a+b,0)<before[1].reduce((a,b)=>a+b,0)-60,'El exterior no se atenúa');
  check(loginGeometry.background==='rgba(0, 0, 0, 0)'&&loginGeometry.backdrop==='rgba(0, 0, 0, 0)','Hay un backdrop opaco');
  check(loginGeometry.overlap==='false','Ayuda de acceso cubre campo');
  await page.screenshot({path:'output/playwright/help-hole-login.png'});
  for(let index=0;index<8;index++){await page.keyboard.press('Tab');check(await page.evaluate(()=>Boolean(document.activeElement?.closest('#help-dialog'))),'Foco salió del modal');}
  await page.keyboard.press('Escape');await page.locator('#help-dialog').waitFor({state:'hidden'});check(await loginTrigger.evaluate(element=>element===document.activeElement),'No devolvió el foco');
  await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-index-row').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.home-panel-image')].every(image=>image.complete&&image.naturalWidth));
  await page.mouse.move(1420,5);await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).focus();
  const panel=await page.locator('.home-index-row').first().boundingBox(),photoPoint={x:panel.x+panel.width/2,y:panel.y+panel.height*.35};
  const photoBefore=await sample([photoPoint]);await openHelp();const photoAfter=await sample([photoPoint]);check(photoBefore[0].every((value,index)=>Math.abs(value-photoAfter[0][index])<=1),'El panel fotográfico se atenúa dentro del hueco');
  check((await layout()).overlap==='false','Tooltip cubre panel inicial');await page.screenshot({path:'output/playwright/help-hole-home.png'});
  await page.setViewportSize({width:375,height:900});await frames();await settled();const resized=await layout();check(Math.abs(resized.mask.width-Math.min(375,resized.target.width+12))<1,'Hueco no se redimensiona');check(resized.overlap==='false','Tooltip móvil cubre panel');
  const priorY=resized.mask.height;await page.evaluate(()=>scrollTo(0,140));await frames();const scrolled=await layout();check(scrolled.mask.height<priorY,'Hueco no sigue scroll');await page.screenshot({path:'output/playwright/help-hole-mobile.png'});await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));await page.setViewportSize({width:1440,height:960});
  const modules=['records','pending','reports','courses','users','templates','import','audit','backup'],steps={};
  for(const view of modules){await page.goto(origin+'/#view='+view+'&year=2026');await page.reload();await page.locator('#content h1').first().waitFor();steps[view]=await inspectSteps(view);}
  const areaViews=await page.evaluate(()=>['students','followup','organization','administration'].filter(view=>Object.prototype.hasOwnProperty.call(viewPermissions,view)));
  for(const view of areaViews){await page.goto(origin+'/#view='+view+'&year=2026');await page.reload();await page.locator('#area-actions').waitFor();steps[view]=await inspectSteps(view);}
  await page.setViewportSize({width:375,height:900});await page.emulateMedia({reducedMotion:'reduce'});const mobileSteps={};
  for(const view of [...modules,...areaViews]){await page.goto(origin+'/#view='+view+'&year=2026');await page.reload();await page.locator('#content h1').first().waitFor();mobileSteps[view]=await inspectSteps(view);}
  await page.setViewportSize({width:1440,height:960});
  await page.goto(origin+'/#view=records&year=2026');await page.reload();await page.locator('.student-button').first().waitFor();await page.locator('#content [data-action="new"]').click();await page.locator('#dialog [name="names"]').fill('Campo sintético conservado');
  const formInput=await page.locator('#dialog [name="names"]').boundingBox(),formPoint={x:formInput.x+formInput.width-16,y:formInput.y+formInput.height/2},formBefore=await sample([formPoint]);await openHelp({form:true});const formAfter=await sample([formPoint]);check(formBefore[0].every((value,index)=>Math.abs(value-formAfter[0][index])<=1),'El campo del formulario se atenúa');check((await layout()).overlap==='false','Tooltip cubre campo del formulario');await page.screenshot({path:'output/playwright/help-hole-form.png'});await page.keyboard.press('Escape');check(await page.locator('#dialog').isVisible(),'Escape cerró el formulario inferior');check(await page.locator('#dialog [name="names"]').inputValue()==='Campo sintético conservado','Ayuda perdió datos');await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.locator('.student-button').first().click();await page.locator('#record-tab').waitFor();steps.record=await inspectSteps('record');await page.getByRole('tab',{name:'Documentos',exact:true}).click();steps.documents=await inspectSteps('documents');await page.getByRole('tab',{name:'Historial',exact:true}).click();steps.history=await inspectSteps('history');
  await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();await settled();await page.locator('#help-dialog [data-help="close"]').click();check(await page.locator('.help-highlight').count()===0,'Cierre no limpia marcador');
  return {targetPixelUnchanged:true,photoPixelUnchanged:true,formPixelUnchanged:true,outsideDimmed:true,resize:true,scroll:true,nativeFocusTrap:true,nestedModalRetained:true,steps,mobileSteps,loginPixels:{before,after}};
}
