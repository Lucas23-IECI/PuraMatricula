import {fail} from './service.mjs';

const modulePrefixes={
  login:['login','logout'],record:['record','records','revision'],enrollment:['enrollment'],
  document:['document','pdf','docx','xlsx','csv','json','odt','txt'],import:['import'],
  course:['course'],template:['template'],user:['user'],report:['report'],backup:['backup'],audit:['audit']
};
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'});
const dayBoundaries=new Map();
const validActor=/^[A-Za-z0-9_.-]{1,120}$/;
const validAction=/^[A-Za-z0-9_.-]{1,80}$/;
const invalid=message=>fail(400,message,'AUDIT_FILTER_INVALID');

function localDay(at){
  const parts=Object.fromEntries(dateFormat.formatToParts(at).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const day=new Date(0);day.setUTCFullYear(parts.year,parts.month-1,parts.day);return day.getTime();
}

// Find the first instant of the civil day. Chile has both skipped midnights and
// repeated hours, so a fixed UTC offset or adding 24 hours is not a date filter.
function chileDayBoundary(day){
  if(dayBoundaries.has(day))return dayBoundaries.get(day);
  let low=day-36*3600000,high=day+36*3600000;
  while(low<high){const middle=Math.floor((low+high)/2);if(localDay(middle)<day)low=middle+1;else high=middle;}
  const result=new Date(low).toISOString();
  if(dayBoundaries.size>=64)dayBoundaries.delete(dayBoundaries.keys().next().value);
  dayBoundaries.set(day,result);return result;
}

function dateValue(value,label){
  if(!value)return null;
  const day=Date.parse(value+'T00:00:00.000Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==value||value.startsWith('0000'))invalid(`La fecha ${label} debe ser válida y usar AAAA-MM-DD.`);
  return day;
}

export function parseAuditFilters(params){
  const filters={};
  for(const key of ['q','actor','action','module','from','to']){
    if(params.getAll(key).length>1)invalid('Use un solo valor por filtro de auditoría.');
    filters[key]=(params.get(key)||'').trim();
  }
  if(filters.q.length>160||/[\u0000-\u001f\u007f]/.test(filters.q))invalid('La búsqueda de auditoría admite hasta 160 caracteres de texto.');
  if(filters.actor&&!validActor.test(filters.actor))invalid('Seleccione una cuenta válida para la auditoría.');
  if(filters.action&&!validAction.test(filters.action))invalid('Seleccione una actividad válida para la auditoría.');
  if(filters.module&&!Object.hasOwn(modulePrefixes,filters.module))invalid('Seleccione un área válida para la auditoría.');
  const from=dateValue(filters.from,'inicial'),to=dateValue(filters.to,'final');
  if(from!==null&&to!==null&&from>to)invalid('La fecha inicial no puede ser posterior a la fecha final.');
  return {filters,from:from===null?null:chileDayBoundary(from),to:to===null?null:chileDayBoundary(to+86400000)};
}

export function auditWhere(parsed,snapshot){
  const {filters}=parsed,clauses=['a.id<=?'],args=[snapshot];
  if(filters.q){
    const pattern='%'+filters.q.toLowerCase().replace(/[!%_]/g,'!$&')+'%';
    clauses.push("(lower(coalesce(u.name,a.actor)) LIKE ? ESCAPE '!' OR lower(a.action) LIKE ? ESCAPE '!' OR lower(a.target) LIKE ? ESCAPE '!')");
    args.push(pattern,pattern,pattern);
  }
  if(filters.actor){clauses.push('a.actor=?');args.push(filters.actor);}
  if(filters.action){clauses.push('a.action=?');args.push(filters.action);}
  if(filters.module){
    clauses.push('('+modulePrefixes[filters.module].map(()=>'(a.action=? OR a.action LIKE ?)').join(' OR ')+')');
    for(const prefix of modulePrefixes[filters.module])args.push(prefix,prefix+'.%');
  }
  if(parsed.from){clauses.push('a.at>=?');args.push(parsed.from);}
  if(parsed.to){clauses.push('a.at<?');args.push(parsed.to);}
  return {sql:clauses.join(' AND '),args};
}

export async function auditFacets(store,snapshot){
  const actors=await store.db.prepare('SELECT a.actor AS id,coalesce(u.name,a.actor) AS name FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE a.id<=? GROUP BY a.actor,u.name ORDER BY lower(coalesce(u.name,a.actor)),a.actor').all(snapshot);
  const actions=(await store.db.prepare('SELECT DISTINCT action FROM audit WHERE id<=? ORDER BY action').all(snapshot)).map(row=>row.action);
  const prefixes=new Set(actions.map(action=>action.split('.')[0]));
  return {actors:actors.filter(actor=>validActor.test(actor.id)),actions:actions.filter(action=>validAction.test(action)),modules:Object.entries(modulePrefixes).filter(([,values])=>values.some(prefix=>prefixes.has(prefix))).map(([name])=>name)};
}
