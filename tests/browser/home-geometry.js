async page=>{
  page.setDefaultTimeout(10000);
  const check=(value,message)=>{if(!value)throw Error(message);};
  const origin='http://127.0.0.1:4318',originalViewport=page.viewportSize();
  check(new URL(page.url()).origin===origin,'Esta prueba solo admite la demo local.');
  const health=await(await page.request.get(origin+'/api/health')).json();
  check(health.demo,'Se requieren datos sintéticos, nunca una instalación real.');
  const viewports=[{width:1366,height:768},{width:1600,height:900},{width:1920,height:1080},{width:1024,height:768},{width:768,height:1024},{width:375,height:812},{width:320,height:740}];
  const menuMeasurements=[],recordMeasurements=[];
  let phase='Inicio de la demo',touchContext;
  const settle=async()=>{
    await page.waitForFunction(()=>!document.getElementById('app')?.classList.contains('is-navigating'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const pager=()=>page.locator('[data-pagination="records"]');
  const readyRecords=async({size,number}={})=>{
    await page.waitForFunction(expected=>{
      const nav=document.querySelector('[data-pagination="records"]'),list=document.getElementById('list-table');
      return nav&&list&&nav.getAttribute('aria-busy')!=='true'&&list.getAttribute('aria-busy')!=='true'&&(!expected.size||Number(nav.dataset.pageSize)===expected.size)&&(!expected.number||Number(nav.dataset.page)===expected.number);
    },{size,number});
    await settle();
  };
  const home=async()=>{
    if(!await page.locator('.home-index-menu').isVisible())await page.locator('.sidebar [data-action="home"]').click();
    await page.locator('.home-index-menu').waitFor({state:'visible'});await settle();
  };
  const clearAreaFocus=async()=>{
    await page.mouse.move(-10,-10);await page.locator('.home-shell [data-action="home"]').first().focus();await settle();
  };
  const reveal=async group=>{
    await clearAreaFocus();await group.locator('.home-index-toggle[data-home-toggle]').click();
    await group.locator('.home-index-actions').waitFor({state:'visible'});await settle();
  };
  const homeAction=async(area,name)=>{
    await home();const group=page.locator('.home-index-menu section[data-home-group="'+area+'"]');
    await reveal(group);await group.getByRole('button',{name}).click();
  };
  const reachable=async(locator,label)=>{
    await locator.scrollIntoViewIfNeeded();
    const visible=await locator.evaluate(element=>{
      const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
      return rect.width>0&&rect.height>0&&x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&Boolean(hit&&(element===hit||element.contains(hit)));
    });
    check(visible,label+' está oculto, fuera de alcance o tapado.');
  };
  const indexGeometry=()=>page.evaluate(()=>{
    const bounds=element=>{const rect=element.getBoundingClientRect();return {top:rect.top+scrollY,left:rect.left,right:rect.right,width:rect.width,height:rect.height,bottom:rect.bottom+scrollY};};
    const stage=document.querySelector('.home-index-stage'),menu=document.querySelector('.home-index-menu');
    return {width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,documentWidth:document.documentElement.scrollWidth,
      stage:bounds(stage),menu:bounds(menu),menuClientHeight:menu.clientHeight,menuScrollHeight:menu.scrollHeight,menuClientWidth:menu.clientWidth,menuScrollWidth:menu.scrollWidth,
      panels:[...menu.querySelectorAll('section[data-home-group]')].map(element=>({group:element.dataset.homeGroup,...bounds(element)}))};
  });
  const checkIndexLayout=value=>{
    const label=value.width+'×'+value.height,panels=value.panels;
    check(panels.length===4,'El inicio debe mostrar cuatro paneles '+label);
    check(value.documentWidth<=value.width&&value.menuScrollWidth<=value.menuClientWidth+2,'Desborde horizontal del menú '+label);
    check(value.menuScrollHeight<=value.menuClientHeight+2,'El menú tiene scroll interno inesperado '+label);
    check(Math.abs(value.stage.top)<=2&&Math.abs(value.stage.left)<=2&&Math.abs(value.stage.width-value.width)<=2,'Los paneles no empiezan en el borde de la pantalla '+label);
    for(const panel of panels)check(panel.width>0&&panel.height>0&&panel.left>=value.stage.left-2&&panel.right<=value.stage.right+2&&panel.top>=value.stage.top-2&&panel.bottom<=value.stage.bottom+2,'Panel fuera de sus límites '+panel.group+' '+label);
    if(value.width>=600)check(Math.abs(value.stage.height-value.height)<=2&&value.documentHeight<=value.height+2,'El inicio no ocupa exactamente el alto disponible '+label);
    if(value.width>=1024){
      check(Math.max(...panels.map(panel=>panel.top))-Math.min(...panels.map(panel=>panel.top))<=2,'Los cuatro paneles no están en una misma fila '+label);
      for(const panel of panels)check(Math.abs(panel.height-value.height)<=2,'El panel no llena el alto de la pantalla '+panel.group+' '+label);
      for(let index=1;index<panels.length;index++)check(panels[index].left>=panels[index-1].right-2,'Paneles superpuestos '+label);
    }
    if(value.width>=600&&value.width<1024){
      check(Math.abs(panels[0].top-panels[1].top)<=2&&Math.abs(panels[2].top-panels[3].top)<=2&&panels[2].top>=panels[0].bottom-2,'La tableta no forma dos filas de dos paneles '+label);
      check(Math.abs(panels[0].left-panels[2].left)<=2&&Math.abs(panels[1].left-panels[3].left)<=2&&panels[1].left>=panels[0].right-2&&panels[3].left>=panels[2].right-2,'Las columnas de tableta se superponen o no están alineadas '+label);
    }
    if(value.width<600){
      check(Math.max(...panels.map(panel=>panel.left))-Math.min(...panels.map(panel=>panel.left))<=2,'Los paneles móviles no están alineados '+label);
      for(let index=1;index<panels.length;index++)check(panels[index].top>=panels[index-1].bottom-2,'Los paneles móviles no están apilados '+label);
      for(const panel of panels)check(Math.abs(panel.height-320)<=2,'Altura móvil distinta de 320 px '+panel.group+' '+label+': '+panel.height+'px');
    }
  };
  const checkRecordFilters=async expected=>{
    const actual=await page.evaluate(()=>({q:document.getElementById('search').value,course:document.getElementById('course-filter').value,status:document.getElementById('status-filter').value}));
    check(JSON.stringify(actual)===JSON.stringify(expected),'La paginación o navegación pierde filtros: '+JSON.stringify(actual));
  };
  const recordGeometry=()=>page.evaluate(()=>{
    const paging=document.querySelector('[data-pagination="records"]'),rect=paging.getBoundingClientRect();let ancestor=paging.parentElement,clippedBy=null;
    while(ancestor&&ancestor!==document.body&&ancestor!==document.documentElement){
      const style=getComputedStyle(ancestor),box=ancestor.getBoundingClientRect();
      if((['hidden','clip'].includes(style.overflowY)&&(rect.top<box.top-2||rect.bottom>box.bottom+2))||(['hidden','clip'].includes(style.overflowX)&&(rect.left<box.left-2||rect.right>box.right+2))){clippedBy=ancestor.id||ancestor.className;break;}
      ancestor=ancestor.parentElement;
    }
    return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,rows:document.querySelectorAll('#list-table tbody tr').length,clippedBy};
  });
  const sizeRecords=async size=>{await pager().locator('select[data-page-size]').selectOption(String(size));await readyRecords({size,number:1});};
  try{
    await page.context().clearCookies();await page.setViewportSize(viewports[0]);await page.goto(origin);
    await page.getByLabel('Usuario',{exact:true}).fill('demo-secretaria');await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
    await page.locator('.home-index-menu').waitFor({state:'visible'});await settle();
    await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.home-index-menu .home-panel-image')];return images.length===4&&images.every(image=>image.complete&&image.naturalWidth>0);});
    await page.locator('.home-index-menu .home-panel-image').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    check(await page.locator('#home-query,#home-results,#home-pagination,.home-year-overview,#year-select').count()===0,'El inicio conserva el buscador rápido, estadísticas o selector de año que se retiraron.');
    const environmentBanner=page.locator('.home-shell .environment');check(!await environmentBanner.count()||!await environmentBanner.isVisible(),'Inicio conserva la franja de entorno de pruebas.');
    for(const viewport of viewports){
      phase='Paneles '+viewport.width+'×'+viewport.height;await page.setViewportSize(viewport);await clearAreaFocus();
      const baseline=await indexGeometry();checkIndexLayout(baseline);
      const toggles=page.locator('.home-index-menu .home-index-toggle[data-home-toggle]');
      for(let index=0;index<4;index++)await reachable(toggles.nth(index),'Título del panel '+index+' '+viewport.width);
      for(const [area,destinations] of [['organization',['courses','import','templates']],['admin',['users','audit','backup']]]){
        const group=page.locator('.home-index-menu section[data-home-group="'+area+'"]');await reveal(group);
        for(const view of destinations){const action=group.locator('[data-view="'+view+'"]');check(await action.isVisible(),'Falta destino '+view+' en '+area);await reachable(action,view+' en '+area+' '+viewport.width);}
        const value=await indexGeometry();checkIndexLayout(value);
        const deltaDocument=Math.abs(value.documentHeight-baseline.documentHeight),deltaStage=Math.abs(value.stage.height-baseline.stage.height);
        check(deltaDocument<=2&&deltaStage<=2,'Revelar acciones cambia la geometría '+area+' '+viewport.width+': Δdocumento='+deltaDocument+', Δpanel='+deltaStage);
        menuMeasurements.push({area,...viewport,deltaDocument,deltaStage});
      }
    }
    await page.setViewportSize({width:1600,height:900});await clearAreaFocus();await page.screenshot({path:'output/playwright/home-index-desktop.png',fullPage:true});
    await page.setViewportSize({width:375,height:812});await clearAreaFocus();await page.screenshot({path:'output/playwright/home-index-mobile.png',fullPage:true});
    phase='Hover y teclado';await page.setViewportSize(viewports[0]);await clearAreaFocus();
    const organization=page.locator('.home-index-menu section[data-home-group="organization"]'),organizationToggle=organization.locator('.home-index-toggle[data-home-toggle]');
    await organization.locator('.home-index-actions').waitFor({state:'hidden'});
    const beforeHover=await indexGeometry();await organizationToggle.hover();await organization.locator('.home-index-actions').waitFor({state:'visible'});await settle();
    const afterHover=await indexGeometry();check(Math.abs(afterHover.stage.height-beforeHover.stage.height)<=2&&Math.abs(afterHover.documentHeight-beforeHover.documentHeight)<=2,'Hover cambia la geometría de los paneles.');
    await clearAreaFocus();await organization.locator('.home-index-actions').waitFor({state:'hidden'});
    for(let index=0;index<32&&!await organizationToggle.evaluate(element=>element===document.activeElement);index++)await page.keyboard.press('Tab');
    check(await organizationToggle.evaluate(element=>element===document.activeElement),'Tab no permite alcanzar Organización.');
    await organization.locator('.home-index-actions').waitFor({state:'visible'});await page.keyboard.press('Tab');
    check(await organization.locator('.home-index-actions').evaluate(element=>element.contains(document.activeElement)),'Tab no entra en las acciones del área.');
    await page.keyboard.press('Escape');check(await organizationToggle.evaluate(element=>element===document.activeElement),'Escape no devuelve el foco al título.');await organization.locator('.home-index-actions').waitFor({state:'hidden'});
    phase='Pantalla táctil';touchContext=await page.context().browser().newContext({storageState:await page.context().storageState(),viewport:{width:375,height:812},isMobile:true,hasTouch:true});
    const touchPage=await touchContext.newPage();await touchPage.goto(origin+'/#view=home&year=2026');await touchPage.locator('.home-index-menu').waitFor({state:'visible'});
    const touchGroup=touchPage.locator('.home-index-menu section[data-home-group="organization"]');await touchGroup.locator('.home-index-toggle').tap();await touchGroup.locator('.home-index-actions').waitFor({state:'visible'});
    await touchGroup.locator('[data-view="courses"]').tap();await touchPage.locator('.sidebar [data-view="courses"][aria-current="page"]').waitFor();await touchContext.close();touchContext=null;
    phase='Navegación de alumnos';await homeAction('students',/^Buscar una ficha/);await readyRecords();
    check(await page.locator('.sidebar [data-view="records"][aria-current="page"]').count()===1,'Buscar una ficha no abre Expedientes con su navegación.');await checkRecordFilters({q:'',course:'',status:''});
    await homeAction('students',/Nueva matrícula/);await page.locator('#dialog[open]').waitFor();
    check(await page.locator('#dialog-title').innerText()==='Nueva matrícula','Nueva matrícula no abre su formulario.');
    check(await page.locator('.sidebar [data-view="records"][aria-current="page"]').count()===1,'Nueva matrícula no entra en Expedientes.');await page.locator('#dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
    await homeAction('followup',/^Continuar borradores/);await readyRecords();await checkRecordFilters({q:'',course:'',status:'draft'});
    const drafts=await(await page.request.get(origin+'/api/records?year=2026&status=draft&page=1&pageSize=100')).json();
    check(drafts.total>=100,'La demo debe incluir al menos 100 borradores para comprobar las tres cantidades.');
    for(const viewport of viewports)for(const size of [25,50,100]){
      phase='Expedientes '+viewport.width+'×'+viewport.height+' / '+size;await page.setViewportSize(viewport);await sizeRecords(size);
      await checkRecordFilters({q:'',course:'',status:'draft'});const value=await recordGeometry();
      check(value.rows===Math.min(size,drafts.total),'La cantidad de expedientes no coincide con el selector '+phase);
      check(value.documentWidth<=value.width&&!value.clippedBy,'Expedientes desborda o recorta su paginador '+phase+': '+value.clippedBy);
      check(await page.locator('#list-table tbody .status.draft').count()===value.rows,'La paginación mezcla estados '+phase);
      await reachable(pager().locator('select[data-page-size]'),'Cantidad '+phase);
      if(Number(await pager().getAttribute('data-pages'))>1){await pager().getByRole('button',{name:'Página siguiente',exact:true}).click();await readyRecords({size,number:2});await checkRecordFilters({q:'',course:'',status:'draft'});}
      recordMeasurements.push({...viewport,size,documentHeight:value.documentHeight});
    }
    phase='Última página de expedientes';const pages=Number(await pager().getAttribute('data-pages'));
    if(Number(await pager().getAttribute('data-page'))!==pages){await pager().getByRole('button',{name:'Página '+pages+' de '+pages,exact:true}).click();await readyRecords({size:100,number:pages});}
    check(await pager().getByRole('button',{name:'Página siguiente',exact:true}).isDisabled(),'Siguiente no se deshabilita al final.');
    check(await page.locator('#list-table tbody tr').count()===drafts.total-(pages-1)*100,'La última página no muestra el remanente correcto.');
    phase='Filtros de curso y búsqueda';await page.setViewportSize(viewports[0]);await sizeRecords(25);
    const courseLabel=(await page.locator('#list-table tbody tr').first().locator('td').nth(1).innerText()).trim();
    const course=await page.locator('#course-filter option').evaluateAll((options,label)=>options.find(option=>option.textContent.trim()===label)?.value,courseLabel);check(Boolean(course),'El curso del primer borrador no aparece en el filtro.');
    const courseResponse=page.waitForResponse(response=>response.url().includes('/api/records?')&&new URL(response.url()).searchParams.get('course')===course);await page.locator('#course-filter').selectOption(course);await courseResponse;await readyRecords();
    const q=await page.locator('#list-table .student-button').first().evaluate(button=>button.firstChild.textContent.trim().split(/\s+/)[0]);
    const searchResponse=page.waitForResponse(response=>response.url().includes('/api/records?')&&new URL(response.url()).searchParams.get('q')===q);await page.locator('#search').fill(q);const filtered=await(await searchResponse).json();await readyRecords();check(filtered.total>0,'La búsqueda perdió el borrador elegido.');
    await sizeRecords(50);await checkRecordFilters({q,course,status:'draft'});
    check(await page.locator('#list-table tbody tr').count()===Math.min(50,filtered.total),'Cambiar la cantidad pierde el resultado filtrado.');
    await page.locator('.sidebar [data-view="courses"]').click();await page.locator('.sidebar [data-view="courses"][aria-current="page"]').waitFor();
    await page.locator('.sidebar [data-view="records"]').click();await readyRecords({size:50,number:1});await checkRecordFilters({q,course,status:'draft'});
    await homeAction('students',/^Ver todos los expedientes/);await readyRecords();await checkRecordFilters({q:'',course:'',status:''});
    phase='Paginador con pantalla corta';await page.setViewportSize({width:375,height:480});await sizeRecords(100);await reachable(pager().locator('select[data-page-size]'),'Cantidad en pantalla corta');check((await recordGeometry()).documentWidth<=375,'Expedientes desborda con pantalla corta.');
    phase='Movimiento reducido';await page.emulateMedia({reducedMotion:'reduce'});await home();
    const animations=await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity).length);check(animations===0,'La navegación conserva animaciones con movimiento reducido.');await page.emulateMedia({reducedMotion:'no-preference'});
    return {menuViewports:viewports.length,indexStates:menuMeasurements.length,recordStates:recordMeasurements.length,desktopFullscreenFourColumns:true,tabletTwoByTwo:true,mobileStack320:true,hoverFocusTouch:true,moduleNavigation:true,recordSizes:[25,50,100],filtersPreserved:true,lastPage:true,reducedMotion:true,maxIndexDocumentDelta:Math.max(...menuMeasurements.map(value=>value.deltaDocument)),maxIndexStageDelta:Math.max(...menuMeasurements.map(value=>value.deltaStage))};
  }catch(error){await page.screenshot({path:'output/playwright/home-geometry-failure.png',fullPage:true}).catch(()=>{});throw Error(phase+': '+error.message,{cause:error});}
  finally{if(touchContext)await touchContext.close();await page.emulateMedia({reducedMotion:'no-preference'});if(originalViewport)await page.setViewportSize(originalViewport);}
}
