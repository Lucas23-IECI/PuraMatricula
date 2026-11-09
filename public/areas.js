function areaDefinitions(){
  return [
    {view:'students',id:'students',label:'Estudiantes',description:'Encuentra una ficha o comienza una nueva matrícula.',short:'Buscar o matricular',icon:'records',actions:[
      ['new','Nueva matrícula','Ingresa los datos de un estudiante y prepara su ficha.','write','plus'],
      ['records','Expedientes','Busca, revisa y actualiza las fichas de tus cursos.','read','records']
    ]},
    {view:'followup',id:'followup',label:'Seguimiento',description:'Continúa el trabajo pendiente y revisa cómo avanza el año.',short:'Continuar y resolver',icon:'pending',actions:[
      ['records','Continuar borradores','Retoma las matrículas que aún están en preparación.','read','records','draft'],
      ['pending','Revisar pendientes','Encuentra los antecedentes que falta completar.','read','pending'],
      ['reports','Estadísticas','Consulta las cifras y descarga informes del año escolar.','read','reports']
    ]},
    {view:'organization',id:'organization',label:'Organización',description:'Prepara los cursos, las planillas y las fichas del colegio.',short:'Preparar el año',icon:'courses',actions:[
      ['courses','Cursos y años','Organiza los cursos del año actual o prepara el siguiente.','enroll','courses'],
      ['import','Importación','Revisa una planilla de estudiantes antes de incorporarla.','import','import'],
      ['templates','Plantillas','Configura las preguntas y las versiones de las fichas.','admin','templates']
    ]},
    {view:'administration',id:'admin',label:'Administración',description:'Administra los accesos y cuida la información del colegio.',short:'Cuidar el sistema',icon:'users',actions:[
      ['users','Cuentas y permisos','Crea cuentas individuales y define sus accesos.','admin','users'],
      ['audit','Auditoría','Revisa las consultas, cambios y descargas registradas.','audit','audit'],
      ['backup','Respaldo','Prepara una copia cifrada de la información.','backup','backup']
    ]}
  ];
}
function areaForView(view){
  const mapping={records:'students',pending:'followup',reports:'followup',courses:'organization',import:'organization',templates:'organization',users:'administration',audit:'administration',backup:'administration'};
  return areaDefinitions().find(area=>area.view===(mapping[view]||view));
}
function areaActionAttributes(action){const [destination,,,,,status]=action;return destination==='new'?'data-action="new"':'data-action="nav" data-view="'+destination+'" data-reset-filters="true"'+(status?' data-status="'+status+'"':'');}
function renderAreaHub(view){
  const area=areaForView(view),container=$('#content');if(!area||!viewAllowed(view))return;
  const actions=area.actions.filter(([, , ,permission])=>can(permission));
  const descriptions={new:'Crear una ficha de matrícula.',records:'Buscar y editar fichas.',draft:'Retomar matrículas en preparación.',pending:'Completar antecedentes pendientes.',reports:'Consultar cifras y descargar informes.',courses:'Preparar cursos y años.',import:'Revisar y cargar una planilla.',templates:'Editar las preguntas de la ficha.',users:'Gestionar cuentas y permisos.',audit:'Consultar el registro de actividad.',backup:'Crear una copia de seguridad.'};
  const arrow='<svg viewBox="0 0 160 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12h154m-10-9 10 9-10 9"/></svg>';
  container.removeAttribute('aria-busy');container.onpointerover=null;container.onfocusin=null;
  container.innerHTML='<section class="area-workspace" data-area="'+area.id+'" data-task-count="'+actions.length+'"><header class="area-heading"><div class="area-heading-copy"><h1 tabindex="-1">'+area.label+'</h1><p>'+(view==='administration'?'Gestión general':'Matrícula '+state.year)+'</p></div><span class="area-heading-mark" aria-hidden="true">'+homeIcon(area.icon)+'</span></header>'+(view==='students'?'<form class="area-search" id="area-search" role="search"><label class="sr-only" for="area-query">Encuentra a un estudiante</label><div>'+homeIcon('search')+'<input id="area-query" type="search" name="q" maxlength="160" autocomplete="off" placeholder="Buscar por nombre, apellido o RUN"><button class="primary" type="submit">Buscar estudiante '+homeIcon('arrow')+'</button></div></form>':'')+'<div class="area-actions" id="area-actions" aria-label="Tareas de '+area.label+'">'+actions.map((action,index)=>{const [destination,label,,,icon,status]=action;return '<button type="button" class="area-task" data-area-choice="'+index+'" aria-label="'+esc(label)+'" '+areaActionAttributes(action)+'><span class="area-task-icon" aria-hidden="true">'+homeIcon(icon)+'</span><span class="area-task-copy"><strong>'+esc(label)+'</strong><span>'+esc(descriptions[status==='draft'?'draft':destination])+'</span></span><span class="area-task-go" aria-hidden="true"><span>Abrir</span>'+arrow+'</span></button>';}).join('')+'</div></section>';
  if(view==='students')$('#area-search').onsubmit=async event=>{event.preventDefault();const q=$('#area-query').value.trim();if(await navigateTo('records',{reset:true,q}))$('#search')?.focus({preventScroll:true});};
}
let sidebarPreference='expanded',sidebarLastVisibleMode='expanded',sidebarMobileOpen=false;
try{const saved=localStorage.getItem('matricula-sidebar-mode');if(['expanded','compact','hidden'].includes(saved)){sidebarPreference=saved;if(saved!=='hidden')sidebarLastVisibleMode=saved;}}catch{}
function sidebarIsMobile(){return Boolean(window.matchMedia?.('(max-width: 780px)')?.matches);}
function applySidebarMode(mode=sidebarIsMobile()?(sidebarMobileOpen?'expanded':'hidden'):sidebarPreference,{persist=false}={}){
  const shell=document.querySelector('.shell'),sidebar=document.getElementById('main-sidebar');if(!shell||!sidebar)return;
  const mobile=sidebarIsMobile();
  if(persist){
    if(mobile)sidebarMobileOpen=mode!=='hidden';
    else{sidebarPreference=mode;if(mode!=='hidden')sidebarLastVisibleMode=mode;try{localStorage.setItem('matricula-sidebar-mode',mode);}catch{}}
  }
  shell.dataset.sidebar=mode;sidebar.inert=mode==='hidden';sidebar.setAttribute('aria-hidden',String(mode==='hidden'));
  const toggle=shell.querySelector('.sidebar-toggle'),compact=shell.querySelector('[data-action="sidebar-compact"]'),backdrop=shell.querySelector('.sidebar-backdrop');
  if(toggle){toggle.setAttribute('aria-expanded',String(mode!=='hidden'));toggle.setAttribute('aria-label',mode==='hidden'?'Mostrar menú lateral':'Ocultar menú lateral');toggle.title=toggle.getAttribute('aria-label');}
  if(compact){compact.setAttribute('aria-label',mode==='compact'?'Ampliar menú lateral':'Compactar menú lateral');compact.title=compact.getAttribute('aria-label');compact.setAttribute('aria-pressed',String(mode==='compact'));}
  if(backdrop)backdrop.hidden=!(mobile&&mode!=='hidden');
  document.body.classList.toggle('sidebar-drawer-open',mobile&&mode!=='hidden');
  if(mode==='hidden'&&(sidebar.contains(document.activeElement)||(persist&&mobile)))toggle?.focus({preventScroll:true});
}
function toggleSidebar(){const shell=document.querySelector('.shell');if(!shell)return;applySidebarMode(shell.dataset.sidebar==='hidden'?(sidebarIsMobile()?'expanded':sidebarLastVisibleMode):'hidden',{persist:true});}
function compactSidebar(){const shell=document.querySelector('.shell');if(shell)applySidebarMode(shell.dataset.sidebar==='compact'?'expanded':'compact',{persist:true});}
window.addEventListener('resize',()=>applySidebarMode());
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&sidebarIsMobile()&&sidebarMobileOpen&&!document.querySelector('dialog[open]')){applySidebarMode('hidden',{persist:true});document.querySelector('.sidebar-toggle')?.focus();}
});
