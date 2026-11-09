async page=>{
  page.setDefaultTimeout(16000);page.setDefaultNavigationTimeout(16000);
  const origin='http://127.0.0.1:4318',passed=[],runtime=[],mutations=[],geometryResults=[];
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo local sintética.');
  const trackError=error=>runtime.push(error.message),trackWrite=request=>{const path=new URL(request.url()).pathname;if(!['GET','HEAD'].includes(request.method())&&path.startsWith('/api/')&&!['/api/login','/api/logout'].includes(path))mutations.push(request.method()+' '+path);};
  page.on('pageerror',trackError);page.on('request',trackWrite);
  const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('#app')?.classList.contains('is-navigating'));await page.evaluate(async()=>{await Promise.all(document.getElementById('app').getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});};
  const route=()=>page.evaluate(()=>window.EnrollmentLoading.readRoute());
  const clean=async(view)=>{check(page.url()===origin+'/','La navegación publicó hash/consultas.');check((await route()).view===view,'Contexto interno incorrecto: '+view);};
  const login=async username=>{
    await page.context().clearCookies();await page.goto(origin);await page.evaluate(()=>{localStorage.removeItem('matricula-sidebar-mode');localStorage.setItem('matricula-theme','light');});await page.reload();
    await page.getByLabel('Usuario',{exact:true}).fill(username);await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-area-open').first().waitFor();await settle();
  };
  const home=async()=>{if(!await page.locator('.home-shell').count())await page.locator('.workspace-breadcrumb [data-action="home"]').click();await page.locator('.home-area-open').first().waitFor();await settle();};
  const open=async view=>{await home();await page.locator('.home-area-open[data-view="'+view+'"]').click();await page.locator('.area-workspace:not(.loading-area) #area-actions').waitFor();await settle();await clean(view);};
  const sidebar=async mode=>{
    const shell=page.locator('.shell'),current=await shell.getAttribute('data-sidebar');if(current===mode)return;
    if(mode==='hidden')await page.locator('.sidebar-toggle').click();
    else{if(current==='hidden')await page.locator('.sidebar-toggle').click();if(await shell.getAttribute('data-sidebar')!==mode)await page.locator('[data-action="sidebar-compact"]').click();}
    await settle();check(await shell.getAttribute('data-sidebar')===mode,'No cambia el menú a '+mode);
  };
  const geometry=()=>page.locator('.area-workspace').evaluate(root=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};},issues=[];
    for(const text of root.querySelectorAll('h1,.area-task-copy strong,.area-task-copy>span'))if(text.scrollWidth>text.clientWidth+1)issues.push('Texto horizontal recortado: '+text.textContent);
    for(const button of root.querySelectorAll('button')){const b=rect(button);if(b.width<43||b.height<43)issues.push('Acción menor a44px: '+button.textContent.trim());}
    return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,area:rect(root),taskCount:root.querySelectorAll('.area-task').length,images:root.querySelectorAll('img').length,columns:getComputedStyle(root.querySelector('.area-actions')).gridTemplateColumns,sidebar:document.querySelector('.shell').dataset.sidebar,issues};
  });
  const help=async view=>{
    await page.getByRole('button',{name:'Ayuda de esta pantalla',exact:true}).click();const dialog=page.locator('#help-dialog');let steps=0;
    while(true){await page.waitForFunction(()=>document.querySelector('#help-dialog')?.dataset.spotlight==='true');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      check(await dialog.getAttribute('data-topic')===view,'Tema de ayuda incorrecto: '+view);check(await page.locator('[data-help-highlight="true"]').count()===1,'Falta una parte destacada en '+view);
      check(await dialog.getAttribute('data-spotlight-overlap')==='false','La ayuda tapa el objetivo en '+view);steps++;const next=dialog.locator('[data-help="next"]');if((await next.textContent())==='Listo'){await next.click();break;}await next.click();check(steps<10,'Ayuda sin fin');
    }
    check(await page.locator('[data-help-highlight="true"]').count()===0,'La ayuda dejó resaltado residual');return steps;
  };
  try{
    await page.setViewportSize({width:1600,height:900});await login('demo-secretaria');
    const areas=[['students',2],['followup',3],['organization',3],['administration',3]],colors=[],helpCounts={};
    for(const [view,count] of areas){
      await page.setViewportSize({width:1600,height:900});await open(view);await sidebar('expanded');
      check(await page.locator('.area-task').count()===count,'Cantidad de acciones incorrecta: '+view);check(await page.locator('.area-workspace img,.area-preview,.area-guide-map,.area-section-number').count()===0,'El área conserva fotografías, tutoriales, tarjetas de guía o números decorativos.');
      colors.push(await page.locator('.area-workspace').evaluate(el=>getComputedStyle(el).getPropertyValue('--area-color').trim()));
      const choices=page.locator('.area-task');
      for(let index=0;index<count;index++){
        const choice=choices.nth(index),label=await choice.getAttribute('aria-label'),beforeView=(await route()).view;
        await page.mouse.move(1,1);await page.locator('.sidebar-toggle').focus();await settle();const idle=await choice.evaluate(el=>getComputedStyle(el).backgroundColor);
        await choice.hover();await settle();const hovered=await choice.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,opacity:getComputedStyle(el.querySelector('.area-task-go>span')).opacity}));
        check(hovered.background!==idle&&hovered.color==='rgb(255, 255, 255)'&&Number(hovered.opacity)===1,'Hover no invierte el color y muestra Abrir en '+view+' '+label);check((await route()).view===beforeView,'Hover abrió un módulo sin pulsarlo.');
        await page.mouse.move(1,1);await choice.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');await settle();
        const focus=await choice.evaluate(el=>({focused:el===document.activeElement,visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle}));check(focus.focused&&focus.visible&&focus.outline!=='none','El foco no es visible en '+view);
        check(await choice.evaluate(el=>getComputedStyle(el).color==='rgb(255, 255, 255)'),'El foco de teclado no resalta la tarea.');
      }
      await page.mouse.move(1,1);await page.locator('.area-task').first().focus();await settle();
      check(await page.locator('.area-task').first().evaluate(el=>getComputedStyle(el).color==='rgb(255, 255, 255)'),'El foco de teclado no resalta de forma independiente al hover.');
      await page.screenshot({path:'output/playwright/area-index-'+view+'-1600.png',fullPage:true});
      helpCounts[view]=await help(view);
      for(const [width,height] of [[1600,900],[1366,768],[1024,768],[768,1024],[390,844],[320,740],[2400,1300]]){
        await page.setViewportSize({width,height});const modes=width>780?['expanded','compact','hidden']:['hidden'];
        for(const mode of modes){await sidebar(mode);const result=await geometry();check(result.documentWidth<=width,'Desborde horizontal '+view+' '+width+' '+mode);check(result.images===0,'El área conserva fotografía.');check(!result.issues.length,view+' '+width+' '+mode+': '+result.issues.join('; '));geometryResults.push({view,width,mode,areaWidth:result.area.width});}
        if(width===390){await page.screenshot({path:'output/playwright/area-index-'+view+'-390.png',fullPage:true});await help(view);}
        if(width===2400)await page.screenshot({path:'output/playwright/area-index-'+view+'-wide.png',fullPage:true});
      }
      await page.setViewportSize({width:1600,height:900});await sidebar('expanded');await page.getByRole('button',{name:'Cambiar tema claro u oscuro',exact:true}).click();const dark=await geometry();check(!dark.issues.length&&dark.documentWidth<=1600,'Tema oscuro recorta el área '+view);await page.screenshot({path:'output/playwright/area-index-'+view+'-dark.png',fullPage:true});await page.getByRole('button',{name:'Cambiar tema claro u oscuro',exact:true}).click();
      await page.emulateMedia({reducedMotion:'reduce'});await choices.last().hover();const motion=await choices.last().evaluate(el=>getComputedStyle(el).transitionDuration);check(motion.split(',').every(v=>parseFloat(v)===0),'Movimiento reducido no respeta preferencia');await page.emulateMedia({reducedMotion:'no-preference'});
      passed.push(view+': hover y teclado resaltan cada fila sin navegar; siete tamaños, menú, ayuda, oscuro y movimiento reducido.');
    }
    check(new Set(colors).size===4,'Las áreas no tienen identidad de color distinta.');
    await page.setViewportSize({width:1600,height:900});
    for(const [view,destination] of [['students','records'],['followup','pending'],['organization','courses'],['administration','users']]){
      await open(view);await page.locator('.area-task[data-view="'+destination+'"]').click();await page.locator('.sidebar [data-view="'+destination+'"][aria-current="page"]').waitFor();await clean(destination);check(await page.locator('.area-workspace').count()===0,'La tarea requiere otro paso para abrir su módulo.');
    }
    await open('students');await page.locator('.area-task[data-action="new"]').click();await page.locator('#dialog [name="names"]').waitFor();await page.locator('#dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
    await open('students');await page.locator('#area-query').fill('Ejemplo 001');await page.locator('#area-query').press('Enter');await page.locator('.student-button').first().waitFor();check(await page.locator('#search').inputValue()==='Ejemplo 001','Se perdió la búsqueda del área.');
    passed.push('Las cuatro áreas abren módulos con un clic; Nueva matrícula abre/cancela y la búsqueda llega filtrada.');
    await open('organization');await page.locator('.area-task[data-view="import"]').click();await page.locator('#import-form').waitFor();
    await page.goBack();await page.locator('.area-workspace[data-area="organization"] .area-task').first().waitFor();await clean('organization');
    await page.goForward();await page.locator('#import-form').waitFor();await clean('import');
    await page.reload();await page.locator('#import-form').waitFor();await page.goBack();await page.locator('.area-workspace[data-area="organization"] .area-task').first().waitFor();await clean('organization');
    passed.push('Atrás/Adelante del navegador conserva área y módulo con URL limpia, también después de recargar.');
    await login('demo-lector');await open('students');check(await page.locator('.area-task').count()===1,'Lector ve alta o acciones ajenas.');check(await page.locator('.area-task').getAttribute('data-view')==='records','El contexto del lector permite crear fichas.');check(await page.locator('.sidebar [data-view="organization"],.sidebar [data-view="administration"]').count()===0,'Lector ve áreas administrativas.');
    await page.reload();await page.locator('.area-workspace:not(.loading-area) .area-task').waitFor();check(await page.locator('.area-task').count()===1,'Recargar concede acciones adicionales.');await clean('students');passed.push('Permisos: lector conserva una única acción autorizada y contexto correcto después de recargar.');
    check(runtime.length===0,'Errores JavaScript: '+runtime.join(' | '));check(mutations.length===0,'Se enviaron escrituras no autorizadas: '+mutations.join(', '));
    return {groups:passed.length,passed,geometryChecks:geometryResults.length,helpCounts,runtimeErrors:runtime,mutations};
  }finally{page.off('pageerror',trackError);page.off('request',trackWrite);}
}
