async page=>{
  page.setDefaultTimeout(10000);
  const origin='http://127.0.0.1:4318',check=(value,message)=>{if(!value)throw new Error(message);},results=[],runtime=[],mutations=[];
  const health=await(await page.request.get(origin+'/api/health')).json();check(health.demo,'Solo se permite la demo sintética local');
  page.on('pageerror',error=>runtime.push(error.message));
  page.on('request',request=>{if(!['GET','HEAD'].includes(request.method())&&/\/api\/(records|courses|templates|import|users)(?:[/?]|$)/.test(new URL(request.url()).pathname))mutations.push(request.method()+' '+new URL(request.url()).pathname);});
  const settle=async locator=>locator.evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
  const login=async username=>{
    await page.context().clearCookies();await page.goto(origin);await page.evaluate(()=>{localStorage.removeItem('matricula-sidebar-mode');localStorage.setItem('matricula-theme','light');});await page.reload();
    await page.getByLabel('Usuario',{exact:true}).fill(username);await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('.home-area-open').first().waitFor();
  };
  const home=async()=>{if(!await page.locator('.home-area-open').count())await page.locator('.workspace-breadcrumb [data-action="home"]').click();await page.locator('.home-area-open').first().waitFor();};
  const area=async(view)=>{await home();await page.locator('.home-area-open[data-view="'+view+'"]').click();await page.locator('.area-workspace').waitFor();};
  const sidebar=async mode=>{
    const shell=page.locator('.shell'),current=await shell.getAttribute('data-sidebar');
    if(mode===current)return;
    if(mode==='hidden'){await page.locator('.sidebar-toggle').click();}
    else{
      if(current==='hidden')await page.locator('.sidebar-toggle').click();
      if(await shell.getAttribute('data-sidebar')!==mode)await page.locator('[data-action="sidebar-compact"]').click();
    }
    await settle(shell);check(await shell.getAttribute('data-sidebar')===mode,'No cambió el menú a '+mode);
  };
  const geometry=async()=>page.locator('.area-workspace').evaluate(root=>{
    const r=element=>{const b=element.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
    const outside=(inner,outer)=>inner.left<outer.left-1||inner.right>outer.right+1||inner.top<outer.top-1||inner.bottom>outer.bottom+1;
    const issues=[];
    for(const [index,task] of [...root.querySelectorAll('.area-task')].entries()){
      const box=r(task),copy=r(task.querySelector('.area-task-copy')),go=r(task.querySelector('.area-task-go')),top=r(task.querySelector('.area-task-top'));
      if(outside(copy,box)||outside(go,box)||outside(top,box))issues.push('Tarea '+index+' recorta su contenido');
      if(copy.bottom>go.top-6)issues.push('Tarea '+index+' superpone texto y Abrir');
      if(copy.top<top.bottom+8)issues.push('Tarea '+index+' superpone iconos y texto');
      for(const text of task.querySelectorAll('.area-task-copy>strong,.area-task-copy>span'))if(text.scrollWidth>text.clientWidth+1)issues.push('Tarea '+index+' corta texto horizontal');
    }
    const heading=root.querySelector('h1');if(heading.scrollWidth>heading.clientWidth+1)issues.push('Título de área recortado');
    return {issues,viewport:innerWidth,scroll:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight,area:r(root),columns:getComputedStyle(root.querySelector('.area-actions')).gridTemplateColumns,sidebar:document.querySelector('.shell').dataset.sidebar,sidebarWidth:document.querySelector('.shell').getBoundingClientRect().width-document.querySelector('.workspace').getBoundingClientRect().width,count:root.querySelectorAll('.area-task').length};
  });
  await login('demo-secretaria');
  const areas=[['students',2],['followup',3],['organization',3],['administration',3]],sizes=[[1600,900],[1366,768],[1024,768],[768,1024],[375,812],[320,740]],colors=[];
  for(const [view,count] of areas){
    await page.setViewportSize({width:1600,height:900});await area(view);
    check(await page.locator('.area-task').count()===count,'Cantidad de tareas incorrecta en '+view);
    colors.push(await page.locator('.area-workspace').evaluate(element=>getComputedStyle(element).getPropertyValue('--area-panel-color').trim()));
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height});
      const modes=width>780?['expanded','compact','hidden']:['hidden'];
      for(const mode of modes){
        await sidebar(mode);const g=await geometry();check(g.scroll<=g.viewport,'Desborde horizontal '+view+' '+width+' '+mode);check(!g.issues.length,view+' '+width+' '+mode+': '+g.issues.join('; '));
        if(width>780)check(Math.abs(g.sidebarWidth-({expanded:240,compact:72,hidden:0}[mode]))<2,'Ancho incorrecto de menú '+view+' '+width+' '+mode);
        if(width>1100)check(g.documentHeight<=g.viewportHeight+2,'El portal de escritorio sobrepasa la altura de ventana '+view+' '+width+' '+mode);
      }
      if(width===1600||width===320){await page.mouse.move(1,1);await page.screenshot({path:'output/playwright/area-portal-'+view+'-'+width+'.png',fullPage:true});}
      if(width<=780){await page.locator('.sidebar-toggle').click();await settle(page.locator('.shell'));check(await page.locator('.shell').getAttribute('data-sidebar')==='expanded','No abre menú móvil');await page.keyboard.press('Escape');check(await page.locator('.shell').getAttribute('data-sidebar')==='hidden','Escape no cierra menú móvil');}
    }
    await page.setViewportSize({width:1600,height:900});await sidebar('expanded');
    const task=page.locator('.area-task').first();await page.mouse.move(1,1);await settle(task);
    const idle=await task.evaluate(element=>({opacity:getComputedStyle(element,'::before').opacity,filter:getComputedStyle(element.querySelector('.area-task-photo')).filter}));
    await task.hover();await settle(task);const hovered=await task.evaluate(element=>({opacity:getComputedStyle(element,'::before').opacity,filter:getComputedStyle(element.querySelector('.area-task-photo')).filter}));
    check(Number(hovered.opacity)>Number(idle.opacity),'Hover no resalta '+view);check(hovered.filter!==idle.filter,'La fotografía no cambia al apuntar '+view);
    await page.mouse.move(1,1);await task.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');const focus=await task.evaluate(element=>({visible:element.matches(':focus-visible'),outline:getComputedStyle(element).outlineStyle,width:getComputedStyle(element).outlineWidth}));check(focus.visible&&focus.outline!=='none'&&parseFloat(focus.width)>=2,'Foco invisible '+view);
    await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();check(await page.locator('body').evaluate(element=>element.classList.contains('dark')),'No activó tema oscuro');const dark=await geometry();check(!dark.issues.length&&dark.scroll<=dark.viewport,'Desborde en oscuro '+view);await page.screenshot({path:'output/playwright/area-portal-'+view+'-dark.png',fullPage:true});await page.getByRole('button',{name:'Cambiar tema claro u oscuro'}).click();
    await page.emulateMedia({reducedMotion:'reduce'});await task.hover();const reduced=await task.evaluate(element=>({transition:getComputedStyle(element.querySelector('.area-task-photo')).transitionDuration,copy:getComputedStyle(element.querySelector('.area-task-copy')).transform}));check(reduced.transition.split(',').every(value=>parseFloat(value)===0),'Movimiento reducido conserva animación '+view);check(reduced.copy==='none','Movimiento reducido desplaza texto '+view);await page.emulateMedia({reducedMotion:'no-preference'});
    results.push(view+': seis tamaños, tres modos de menú de escritorio, oscuro, foco y movimiento reducido');
  }
  check(new Set(colors).size===4,'Las cuatro áreas no tienen colores de interacción diferentes');
  await page.setViewportSize({width:1600,height:900});
  for(const [view,target] of [['students','records'],['followup','pending'],['organization','courses'],['administration','users']]){await area(view);await page.locator('.area-task[data-view="'+target+'"]').click();await page.locator('.sidebar [data-view="'+target+'"][aria-current="page"]').waitFor();check(await page.locator('.area-workspace').count()===0,'La tarea no abrió su módulo '+target);}
  await area('students');await page.getByRole('button',{name:'Nueva matrícula',exact:true}).click();await page.getByRole('heading',{name:'Nueva matrícula',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();check(await page.locator('#dialog').evaluate(element=>!element.open),'Cancelar no cerró el formulario');
  await area('students');await page.locator('#area-query').fill('Ejemplo 001');await page.locator('#area-query').press('Enter');await page.locator('.student-button').first().waitFor();check(await page.locator('#search').inputValue()==='Ejemplo 001','La búsqueda no conservó el texto');check((await page.locator('.student-button').allTextContents()).every(text=>text.includes('Ejemplo 001')),'Búsqueda muestra otros alumnos');
  results.push('Cuatro tareas abren módulos; alta cancelada y búsqueda conservada sin mutaciones');
  await login('demo-lector');await page.setViewportSize({width:1600,height:900});await area('students');
  check(await page.locator('.area-task').count()===1,'Consulta de lectura muestra acciones de escritura');check(await page.locator('.area-workspace').getAttribute('data-task-count')==='1','La distribución no se adapta a una tarea');
  const single=await page.locator('.area-actions').evaluate(element=>({columns:getComputedStyle(element).gridTemplateColumns.split(' ').length,width:element.getBoundingClientRect().width,task:element.querySelector('.area-task').getBoundingClientRect().width}));check(single.columns===1&&Math.abs(single.width-single.task)<2,'La cuenta lectora deja huecos en la grilla');await page.screenshot({path:'output/playwright/area-portal-reader.png',fullPage:true});
  check(!mutations.length,'Se emitieron mutaciones de datos: '+mutations.join(', '));check(!runtime.length,'Errores JS: '+runtime.join(', '));results.push('Lector: una acción ocupa todo el espacio sin altas ni huecos');
  return {passed:results.length,results,writeRequests:mutations.length,runtimeErrors:runtime.length};
}
