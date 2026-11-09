async page=>{
  page.setDefaultTimeout(14000);page.setDefaultNavigationTimeout(14000);
  const origin='http://127.0.0.1:4318',passed=[],pageErrors=[],unexpectedWrites=[];
  let failedSaveGuard=false,failedSaves=0,historyActions=0;
  const check=(value,message)=>{if(!value)throw Error(message);};
  check((await(await page.request.get(origin+'/api/health')).json()).demo,'Solo demo local sintética.');
  const trackWrite=request=>{
    const url=new URL(request.url());
    if(url.origin===origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD'].includes(request.method())&&!['/api/login','/api/logout'].includes(url.pathname)&&!(failedSaveGuard&&request.method()==='PATCH'&&/^\/api\/records\//.test(url.pathname)))unexpectedWrites.push(request.method()+' '+url.pathname);
  };
  const trackError=error=>pageErrors.push(error.message);
  page.on('request',trackWrite);page.on('pageerror',trackError);
  const homeReady=()=>page.locator('#home-index-stage .home-area-open').first().waitFor();
  const clean=async expected=>{
    const current=await page.evaluate(()=>({href:location.href,route:window.EnrollmentLoading.readRoute(),stored:sessionStorage.getItem(window.EnrollmentLoading.storageKey),history:history.state}));
    check(current.href===origin+'/','La dirección visible conserva rutas o consultas: '+current.href);
    check(JSON.stringify(Object.keys(current.route).sort())===JSON.stringify(['record','tab','view','year']),'La ruta contiene campos ajenos a navegación.');
    for(const [key,value] of Object.entries(expected))check(current.route[key]===value,'No se restauró '+key+' de la navegación.');
    if(current.stored){
      const stored=JSON.parse(current.stored);check(stored.version===2,'Versión de ruta desconocida.');
      check(typeof stored.epoch==='string'&&Number.isSafeInteger(stored.index),'La ruta carece de época o posición de historial.');
      check(JSON.stringify(Object.keys(stored).sort())===JSON.stringify(['epoch','index','route','version']),'La sesión de navegación contiene datos adicionales.');
      check(JSON.stringify(stored.route)===JSON.stringify(current.route),'Sesión y ruta interna discrepan.');
      check(JSON.stringify(current.history)===JSON.stringify({enrollmentRoute:stored}),'El historial no conserva únicamente la ruta sanitizada.');
    }
    return current;
  };
  const signIn=async(username='demo-secretaria')=>{
    await page.getByLabel('Usuario',{exact:true}).fill(username);
    await page.getByLabel('Contraseña',{exact:true}).fill('Demo-matricula-2026!');
    await page.getByRole('button',{name:'Ingresar',exact:true}).click();await homeReady();
  };
  const waitRoute=async expected=>{
    await page.waitForFunction(expected=>{
      const route=window.EnrollmentLoading?.readRoute();
      if(!route||!Object.entries(expected).every(([key,value])=>route[key]===value))return false;
      if(route.record)return document.querySelector('.tabs [data-tab="'+route.tab+'"][aria-selected="true"]')&&document.querySelector('.shell[data-screen="record"]');
      return route.view==='home'?document.querySelector('#home-index-stage .home-area-open'):document.querySelector('.shell[data-screen="'+route.view+'"]:not([aria-busy="true"])')&&!document.querySelector('#content>.skeleton-state');
    },expected);
    return clean(expected);
  };
  const move=async(direction,expected)=>{historyActions++;await page.evaluate(direction=>history[direction](),direction);await waitRoute(expected);};
  const reloadWithSkeleton=async(kind,ready)=>{
    let release,started,finished;
    const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>started=resolve),completed=new Promise(resolve=>finished=resolve);
    const handler=async request=>{started();await gate;try{await request.continue();}finally{finished();}};
    await page.route('**/app.js',handler);
    try{
      await page.reload({waitUntil:'commit'});await received;
      await page.locator('.skeleton-state[data-skeleton="'+kind+'"]').waitFor();
      check(new URL(page.url()).hash===''&&new URL(page.url()).search==='','El primer frame vuelve a publicar la ruta.');
    }finally{release();await completed;await page.unroute('**/app.js',handler);}
    await ready();
  };
  try{
    await page.setViewportSize({width:1440,height:960});await page.context().clearCookies();await page.goto(origin);
    await page.getByRole('heading',{name:'Bienvenido/a',exact:true}).waitFor();await signIn();
    const home=await clean({view:'home',record:null,tab:'ficha'});const selectedYear=home.route.year;
    check(selectedYear===2026,'La demo de esta prueba debe iniciar en el año sintético 2026.');
    passed.push('Ingreso: URL limpia y ruta de Inicio interna, sin datos de formulario.');

    await page.locator('.home-area-open[data-view="followup"]').click();
    await page.locator('.shell[data-screen="followup"] .area-workspace:not(.loading-area)').waitFor();await clean({view:'followup',year:selectedYear});
    await page.locator('#area-actions [data-view="reports"]').click();
    await page.getByRole('heading',{name:'Estadísticas de matrícula',exact:true}).waitFor();
    await page.locator('#year-select').selectOption(String(selectedYear));await page.locator('.report-indicators').waitFor();
    await clean({view:'reports',year:selectedYear,record:null});
    await reloadWithSkeleton('reports',()=>page.locator('.report-indicators').waitFor());
    check(await page.locator('#year-select').inputValue()===String(selectedYear),'Recargar estadísticas pierde el año seleccionado.');
    await clean({view:'reports',year:selectedYear,record:null});
    passed.push('Estadísticas: año 2026 y skeleton contextual conservados tras recargar sin hash.');

    const alternateYear=selectedYear+1;
    check(await page.locator('#year-select option[value="'+alternateYear+'"]').count()===1,'Falta el año sintético siguiente para comprobar el historial anual.');
    await page.locator('#year-select').selectOption(String(alternateYear));await waitRoute({view:'reports',year:alternateYear});
    await page.locator('#year-select').selectOption(String(selectedYear));await waitRoute({view:'reports',year:selectedYear});

    await page.locator('.sidebar [data-view="students"]').click();await page.locator('#area-search').waitFor();
    await page.locator('#area-actions [data-view="records"]').click();await page.locator('.student-button').first().waitFor();
    const student=page.locator('.student-button').first(),recordId=await student.getAttribute('data-id');
    await student.click();await page.getByRole('tab',{name:'Ficha del estudiante',exact:true}).waitFor();
    await clean({view:'records',year:selectedYear,record:recordId,tab:'ficha'});
    for(const [name,tab,kind] of [['Documentos','documents','documents'],['Historial','history','history']]){
      await page.getByRole('tab',{name,exact:true}).click();await clean({view:'records',record:recordId,tab});
      await reloadWithSkeleton(kind,()=>page.getByRole('tab',{name,exact:true,selected:true}).waitFor());
      await clean({view:'records',year:selectedYear,record:recordId,tab});
    }
    passed.push('Expediente: Documentos e Historial restauran la misma ficha y sus skeletons con URL limpia.');

    const routes=[
      {view:'home',year:selectedYear,record:null,tab:'ficha'},
      {view:'followup',year:selectedYear,record:null,tab:'ficha'},
      {view:'reports',year:selectedYear,record:null,tab:'ficha'},
      {view:'reports',year:alternateYear,record:null,tab:'ficha'},
      {view:'reports',year:selectedYear,record:null,tab:'ficha'},
      {view:'students',year:selectedYear,record:null,tab:'ficha'},
      {view:'records',year:selectedYear,record:null,tab:'ficha'},
      {view:'records',year:selectedYear,record:recordId,tab:'ficha'},
      {view:'records',year:selectedYear,record:recordId,tab:'documents'},
      {view:'records',year:selectedYear,record:recordId,tab:'history'}
    ];
    for(let index=routes.length-2;index>=0;index--)await move('back',routes[index]);
    for(let index=1;index<routes.length;index++)await move('forward',routes[index]);
    passed.push('Historial real: nueve Atrás y nueve Adelante recorren áreas, módulos, dos años y tres pestañas sin entradas repetidas ni hashes.');

    await move('back',routes[8]);await move('back',routes[7]);
    const originalAddress=await page.locator('#field-address').inputValue();
    const savedRecord=await(await page.request.get(origin+'/api/records/'+recordId)).json();
    const failSave=async route=>{
      if(route.request().method()==='PATCH'){failedSaves++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Prueba local: conexión interrumpida.'})});}
      else await route.continue();
    };
    failedSaveGuard=true;await page.route('**/api/records/'+recordId,failSave);
    try{
      await page.locator('#field-address').fill(originalAddress+' · prueba de navegación no persistida');
      historyActions++;await page.evaluate(()=>history.back());
      await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.includes('Prueba local: conexión interrumpida.'));
      await waitRoute(routes[7]);
      check(await page.locator('#field-address').inputValue()===originalAddress+' · prueba de navegación no persistida','Un Atrás con guardado fallido perdió el texto pendiente.');
      check(failedSaves===1,'El guardado del Atrás fallido se ejecutó varias veces.');
      const unchanged=await(await page.request.get(origin+'/api/records/'+recordId)).json();
      check(unchanged.version===savedRecord.version&&unchanged.data.address===savedRecord.data.address,'La simulación alteró el expediente guardado.');
      page.once('dialog',dialog=>dialog.accept());await page.reload();
      await page.locator('#field-address').waitFor();
      check(await page.locator('#field-address').inputValue()===originalAddress,'La recarga no descartó la edición exclusivamente local.');
    }finally{await page.unroute('**/api/records/'+recordId,failSave);failedSaveGuard=false;}
    await waitRoute(routes[7]);await move('forward',routes[8]);await move('forward',routes[9]);
    passed.push('Guardado fallido: Atrás se cancela, conserva el formulario y Adelante; la base sintética mantiene versión y datos.');

    const second=await page.context().newPage();try{
      await second.goto(origin);await second.locator('#home-index-stage .home-area-open').first().waitFor();
      check((await second.evaluate(()=>window.EnrollmentLoading.readRoute())).view==='home','Otra pestaña heredó el expediente anterior.');
      check(second.url()===origin+'/','La segunda pestaña publica su ruta.');
    }finally{await second.close();}
    passed.push('Aislamiento: otra pestaña autenticada comienza en Inicio y no hereda la ficha.');

    await page.goto(origin+'/?qa=legacy#view=reports&year='+selectedYear);
    await page.locator('.report-indicators').waitFor();await clean({view:'reports',year:selectedYear,record:null,tab:'ficha'});
    await page.reload();await page.locator('.report-indicators').waitFor();await clean({view:'reports',year:selectedYear});
    passed.push('Compatibilidad: enlace antiguo migra una vez, desaparecen consulta/hash y recarga desde la sesión.');

    await page.locator('.topbar [data-action="logout"]').click();await page.getByRole('heading',{name:'Bienvenido/a',exact:true}).waitFor();
    const cleared=await clean({view:'login',year:null,record:null,tab:'ficha'});
    check(cleared.stored===null&&cleared.history===null,'Salir conserva contexto en la sesión o el historial.');
    await page.reload();await page.getByRole('heading',{name:'Bienvenido/a',exact:true}).waitFor();
    await clean({view:'login',record:null,year:null});await signIn('demo-lector');
    await clean({view:'home',record:null,tab:'ficha'});
    check(await page.locator('#home-index-stage .home-area-open').count()===2,'El ingreso posterior no aplica los permisos de la nueva cuenta.');
    const reader=await clean({view:'home',record:null,tab:'ficha'}),readerEpoch=JSON.parse(reader.stored).epoch;
    for(let index=0;index<3;index++){
      historyActions++;await page.evaluate(()=>history.back());
      await page.waitForFunction(epoch=>history.state?.enrollmentRoute?.epoch===epoch,readerEpoch);
      await homeReady();await clean({view:'home',record:null,tab:'ficha'});
      check(await page.locator('#home-index-stage .home-area-open').count()===2,'Atrás reactivó permisos de la cuenta anterior.');
    }
    await page.locator('.home-account-menu summary').click();await page.locator('.home-account-menu [data-action="logout"]').click();
    await page.getByRole('heading',{name:'Bienvenido/a',exact:true}).waitFor();
    const final=await clean({view:'login',year:null,record:null});check(final.stored===null&&final.history===null,'El segundo cierre no limpió el contexto.');
    passed.push('Salida e ingreso de otra cuenta: contexto eliminado y permisos nuevos aplicados.');
    check(unexpectedWrites.length===0,'El recorrido intentó escrituras distintas de login/logout.');check(pageErrors.length===0,'Errores JavaScript: '+pageErrors.join(' | '));
    const result={passed,groups:passed.length,year:selectedYear,historyActions,failedSaveAttempts:failedSaves,pageErrors,unexpectedWrites};
    await page.evaluate(result=>window.__cleanRouteQA=result,result);return result;
  }finally{page.off('request',trackWrite);page.off('pageerror',trackError);}
}
