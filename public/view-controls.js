/* Only presentation preferences are persisted. Queries and records stay in memory. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeId=value=>/^[a-zA-Z][\w-]{0,79}$/.test(String(value))?String(value):'collection-view';
  const safeModes=modes=>Array.isArray(modes)?modes.filter(mode=>typeof mode==='string'&&/^[a-z][a-z-]{0,30}$/.test(mode)):[];
  const preferenceKey=(userId,section)=>'matricula-view-v1:'+encodeURIComponent(String(userId||'anonymous'))+':'+safeId(section);
  function get(userId,section,modes,fallback){
    const allowed=safeModes(modes),initial=allowed.includes(fallback)?fallback:allowed[0]||'table';
    try{const mode=window.localStorage.getItem(preferenceKey(userId,section));return allowed.includes(mode)?mode:initial;}catch{return initial;}
  }
  function set(userId,section,mode,modes){
    if(!safeModes(modes).includes(mode))return false;
    try{window.localStorage.setItem(preferenceKey(userId,section),mode);}catch{}
    return true;
  }
  function html({id,label='Vista',modes=[],value}={}){
    const key=safeId(id),choices=modes.filter(choice=>Array.isArray(choice)&&safeModes([choice[0]]).length);
    return '<div class="view-controls" data-view-controls="'+key+'" role="group" aria-label="'+esc(label)+'">'+choices.map(([mode,text])=>'<button type="button" data-view-mode="'+mode+'" aria-pressed="'+(mode===value)+'">'+esc(text)+'</button>').join('')+'</div>';
  }
  const reportError=error=>{if(typeof window.notice==='function')window.notice(error.message||'No se pudo cambiar la vista.');};
  function bind(root,id,onChange){
    const group=root?.querySelector?.('[data-view-controls="'+safeId(id)+'"]');if(!group)return;
    group.onclick=async event=>{
      const button=event.target.closest?.('[data-view-mode]');if(!button||!group.contains(button)||button.disabled||button.getAttribute('aria-pressed')==='true')return;
      const previous=group.querySelector('[aria-pressed="true"]'),hadFocus=group.contains(document.activeElement);
      group.querySelectorAll('[data-view-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      try{await onChange(button.dataset.viewMode);if(hadFocus&&button.isConnected===false){const current=(root.isConnected!==false?root:document).querySelector('[data-view-controls="'+safeId(id)+'"] [aria-pressed="true"]');current?.focus({preventScroll:true});}}catch(error){group.querySelectorAll('[data-view-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===previous)));reportError(error);}
    };
    group.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const controls=[...group.querySelectorAll('[data-view-mode]:not([disabled])')],index=controls.indexOf(document.activeElement);if(index<0)return;
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowRight'?1:-1)+controls.length)%controls.length;
      controls[next]?.focus();controls[next]?.click();
    };
  }
  function chips({id,items=[]}={}){
    if(!items.length)return '';
    return '<div class="filter-chips" data-filter-chips="'+safeId(id)+'" aria-label="Filtros activos">'+items.map(({key,label})=>'<button type="button" data-filter-remove="'+esc(key)+'" aria-label="Quitar filtro: '+esc(label)+'">'+esc(label)+'<span aria-hidden="true">×</span></button>').join('')+'<button type="button" class="filters-clear" data-filter-clear>Limpiar filtros</button></div>';
  }
  function bindChips(root,id,onChange){
    const group=root?.querySelector?.('[data-filter-chips="'+safeId(id)+'"]');if(!group)return;
    group.onclick=async event=>{const button=event.target.closest?.('[data-filter-remove],[data-filter-clear]');if(!button||!group.contains(button))return;try{await onChange({key:button.dataset.filterRemove,clear:button.hasAttribute('data-filter-clear')});}catch(error){reportError(error);}};
  }
  window.EnrollmentViews=Object.freeze({get,set,html,bind,chips,bindChips});
})();
