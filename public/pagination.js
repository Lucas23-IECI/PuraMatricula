/* One navigation contract for server and in-memory collections. */
(function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const integer=(value,fallback)=>Number.isFinite(Number(value))?Math.floor(Number(value)):fallback;
  function normalize({total=0,page=1,pageSize=10}={}){
    total=Math.max(0,integer(total,0));pageSize=Math.min(100,Math.max(1,integer(pageSize,10)));
    const pages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(pages,Math.max(1,integer(page,1)));
    return {total,page,pageSize,pages,start:total?(page-1)*pageSize+1:0,end:Math.min(page*pageSize,total)};
  }
  function slice(items,selection={}){
    const result=normalize({...selection,total:items.length});
    return {...result,items:items.slice((result.page-1)*result.pageSize,result.page*result.pageSize)};
  }
  function html({id,label='registros',sizes=[5,10,25,50,100],...selection}){
    const {total,page,pageSize,pages,start,end}=normalize(selection);
    const numbers=[...new Set([1,...Array.from({length:3},(_,i)=>page+i-1).filter(n=>n>0&&n<=pages),pages])].sort((a,b)=>a-b);
    const buttons=numbers.map((number,index)=>`${index&&number>numbers[index-1]+1?'<span class="pagination-gap" aria-hidden="true">…</span>':''}<button type="button" class="pagination-number${Math.abs(number-page)>1?' pagination-boundary':''}" data-page="${number}" aria-label="Página ${number} de ${pages}" ${number===page?'aria-current="page"':''}>${number}</button>`).join('');
    const choices=[...new Set([...sizes,pageSize])].filter(n=>Number.isInteger(n)&&n>0&&n<=100).sort((a,b)=>a-b);
    return `<nav class="pagination" data-pagination="${escape(id)}" data-page="${page}" data-page-size="${pageSize}" data-pages="${pages}" aria-label="Paginación de ${escape(label)}"><div class="pagination-summary"><span>${start}–${end} de ${total} ${escape(label)}</span><small>Página ${page} de ${pages}</small></div><div class="pagination-navigation"><button type="button" class="pagination-step" data-page="${page-1}" aria-label="Página anterior" ${page<=1?'disabled':''}><span aria-hidden="true">‹</span><span class="pagination-step-text">Anterior</span></button>${buttons}<button type="button" class="pagination-step" data-page="${page+1}" aria-label="Página siguiente" ${page>=pages?'disabled':''}><span class="pagination-step-text">Siguiente</span><span aria-hidden="true">›</span></button></div>${choices.length>1?`<label class="pagination-size">Por página<select aria-label="Cantidad de ${escape(label)} por página" data-page-size>${choices.map(size=>`<option value="${size}" ${size===pageSize?'selected':''}>${size}</option>`).join('')}</select></label>`:''}</nav>`;
  }
  function bind(root,id,onChange){
    const find=()=>[...root.querySelectorAll('[data-pagination]')].find(node=>node.dataset.pagination===id);
    const nav=find();if(!nav)return;
    const change=async(next,size,fromSelect=false)=>{
      if(nav.getAttribute('aria-busy')==='true')return;
      nav.setAttribute('aria-busy','true');
      try{await onChange({page:next,pageSize:size});}
      finally{
        nav.removeAttribute('aria-busy');const current=find();
        if(root.isConnected===false)return;
        const active=root.ownerDocument?.activeElement;
        if(active&&active!==root.ownerDocument.body&&!current?.contains(active))return;
        const focus=fromSelect?current?.querySelector('select'):current?.querySelector('[aria-current="page"]');
        focus?.focus({preventScroll:true});
      }
    };
    nav.onclick=event=>{const button=event.target.closest('button[data-page]');if(!button||button.disabled)return;const next=Number(button.dataset.page);if(next===Number(nav.dataset.page))return;change(next,Number(nav.dataset.pageSize));};
    nav.onchange=event=>{if(event.target.matches('select[data-page-size]'))change(1,Number(event.target.value),true);};
  }
  window.EnrollmentPagination=Object.freeze({normalize,slice,html,bind});
})();
