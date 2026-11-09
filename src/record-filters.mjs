import {normalizeIdentifier,pendingFields} from './fields.mjs';

export const pendingLabels=Object.freeze({guardianName:'Nombre del apoderado',guardianPhone:'Teléfono del apoderado',emergencyPhone:'Teléfono de emergencia',imagesDecision:'Decisión sobre imágenes',outingsDecision:'Decisión sobre salidas',birthCertificate:'Documento identificatorio'});
export const recordFilterOptions=Object.freeze({
  identifierType:['RUN','IPE','Pasaporte','Otro','Provisional'],
  pendingKey:Object.keys(pendingLabels),documentKind:['identity','signed'],documentState:['missing','present'],
  contact:['missing-phone','missing-email','complete'],origin:['manual','imported'],sort:['name','updated-desc','updated-asc','course','status'],
});
const statuses=['draft','enrolled','withdrawn'];
const searchKeys=['names','surname','secondSurname','identifier','email','guardianName','guardianIdentifier','guardianPhone','guardianEmail','alternateName','alternateIdentifier','alternatePhone','alternateEmail','emergencyName','emergencyPhone','emergencyEmail','fatherName','fatherIdentifier','fatherPhone','motherName','motherIdentifier','motherPhone'];
const rosterKeys=['surname','secondSurname','names','identifierType','identifier','guardianName','guardianIdentifier','guardianPhone','guardianEmail','address','commune'];
const fold=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL');
const compareText=(left,right)=>String(left??'').localeCompare(String(right??''),'es-CL',{sensitivity:'base',numeric:true});
const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'});
const dayAt=value=>{
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
  const parts=Object.fromEntries(localDay.formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

function scalar(query,key,fail,{max=100,fallback=''}={}){
  const value=query[key];if(value===undefined||value===null||value==='')return fallback;
  if(typeof value!=='string'||value.length>max)fail(400,'Valor de filtro inválido o demasiado largo.','FILTER_INVALID');
  return value.trim();
}
function choice(query,key,values,fail,fallback=''){
  const value=scalar(query,key,fail,{fallback});
  if(value&&!values.includes(value))fail(400,'Opción de filtro inválida.','FILTER_INVALID');
  return value;
}
function dateFilter(query,key,fail){
  const value=scalar(query,key,fail,{max:10});if(!value)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(400,'Use una fecha válida en formato AAAA-MM-DD.','FILTER_DATE_INVALID');
  return value;
}
function pendingFilter(value,fail){
  if(value===undefined||value===null||value===''||value===false||value===0||value==='0'||value==='false')return false;
  if(value===true||value===1||value==='1'||value==='true')return true;
  fail(400,'Filtro de pendientes inválido.','FILTER_INVALID');
}

/** Administrative filters deliberately exclude hidden/reserved questionnaire fields,
 * including for an administrator: exporting a cohort must not encode private data
 * in its membership. Attachments are classified only if visible to this account. */
export function createRecordCohort(store,{can,requirePermission,courseFor,fieldsFor,getData,fail,requireSchoolYear}){
  const {db}=store;
  return async function recordCohort(user,query={}, {requireYear=false,permission='read',maxRows=10000,withData=false}={}){
    requirePermission(user,'read');if(permission==='export')requirePermission(user,'export');
    if(!query||typeof query!=='object'||Array.isArray(query))fail(400,'Filtros inválidos.','FILTER_INVALID');
    const course=scalar(query,'course',fail,{max:64});let selected=null;
    if(course){requirePermission(user,'read',course);if(permission==='export')requirePermission(user,'export',course);selected=await courseFor(course);}
    const hasYear=query.year!==undefined&&query.year!==null&&query.year!=='';
    const year=hasYear?requireSchoolYear(query.year):requireYear?requireSchoolYear(selected?.year,'Seleccione un año escolar válido para el reporte.'):null;
    if(selected&&year!==null&&Number(selected.year)!==year)fail(400,'El curso no corresponde al año elegido.','COURSE_YEAR_MISMATCH');
    const filters={year,course,courseName:selected?.name||'',status:choice(query,'status',statuses,fail),q:scalar(query,'q',fail),pending:pendingFilter(query.pending,fail)};
    for(const key of ['identifierType','pendingKey','documentKind','documentState','contact','origin'])filters[key]=choice(query,key,recordFilterOptions[key],fail);
    filters.updatedFrom=dateFilter(query,'updatedFrom',fail);filters.updatedTo=dateFilter(query,'updatedTo',fail);filters.sort=choice(query,'sort',recordFilterOptions.sort,fail,'name');
    if(filters.updatedFrom&&filters.updatedTo&&filters.updatedFrom>filters.updatedTo)fail(400,'La fecha inicial no puede ser posterior a la final.','FILTER_DATE_INVALID');
    if(Boolean(filters.documentKind)!==Boolean(filters.documentState))fail(400,'Seleccione el tipo y el estado del documento.','FILTER_INVALID');
    if(filters.documentKind)requirePermission(user,'documents');
    if(!user.allCourses&&!user.courses.length)return {filters,items:[]};
    const clauses=[],params=[];
    if(!user.allCourses){clauses.push(`r.course_id IN (${user.courses.map(()=>'?').join(',')})`);params.push(...user.courses);}
    if(year!==null){clauses.push('r.year=?');params.push(year);}
    if(course){clauses.push('r.course_id=?');params.push(course);}
    if(filters.status){clauses.push('r.status=?');params.push(filters.status);}
    const where=clauses.length?clauses.join(' AND '):'1=1',items=[],templates=new Map(),search=fold(filters.q),identifierSearch=normalizeIdentifier(filters.q);
    let after='',scanned=0;
    while(true){
      // Keyset batches bound live ciphertext and never page the matching cohort.
      const rows=await db.prepare(`SELECT r.*,c.name AS "courseName",s.origin AS "studentOrigin" FROM records r JOIN courses c ON c.id=r.course_id JOIN students s ON s.id=r.student_id WHERE ${where}${after?' AND r.id>?':''} ORDER BY r.id LIMIT 64`).all(...params,...(after?[after]:[]));
      if(!rows.length)break;
      if((scanned+=rows.length)>50000)fail(413,'Acote la selección por año o curso para aplicar estos filtros.','FILTER_COHORT_LIMIT');
      const documents=new Set();
      if(filters.documentKind){
        const ids=rows.map(row=>row.id),visibility=can(user,'sensitive')?'':' AND sensitive=0';
        const attachments=await db.prepare(`SELECT record_id FROM attachments WHERE record_id IN (${ids.map(()=>'?').join(',')}) AND kind=?${visibility}`).all(...ids,filters.documentKind);
        for(const attachment of attachments)documents.add(attachment.record_id);
      }
      for(const source of rows){
        if(!templates.has(source.template_id))templates.set(source.template_id,await fieldsFor(source.template_id));
        const fields=templates.get(source.template_id),visible=new Set(fields.filter(field=>!field.hidden&&!field.sensitive).map(field=>field.key));
        const raw=getData(source),data=Object.fromEntries(Object.entries(raw).filter(([key])=>visible.has(key))),pending=pendingFields(data,source.status).filter(key=>visible.has(key));
        const origin=source.studentOrigin?'imported':'manual';
        if(filters.identifierType&&(!visible.has('identifierType')||data.identifierType!==filters.identifierType))continue;
        if(filters.pending&&!pending.length)continue;
        if(filters.pendingKey&&!pending.includes(filters.pendingKey))continue;
        if(filters.origin&&origin!==filters.origin)continue;
        if(filters.contact){
          const phone=visible.has('guardianPhone'),email=visible.has('guardianEmail');
          if(filters.contact==='missing-phone'&&(!phone||String(data.guardianPhone||'').trim()))continue;
          if(filters.contact==='missing-email'&&(!email||String(data.guardianEmail||'').trim()))continue;
          if(filters.contact==='complete'&&(!phone||!email||!String(data.guardianPhone||'').trim()||!String(data.guardianEmail||'').trim()))continue;
        }
        if(filters.documentKind&&documents.has(source.id)!==(filters.documentState==='present'))continue;
        if(filters.updatedFrom||filters.updatedTo){const day=dayAt(source.updated_at);if(!day||(filters.updatedFrom&&day<filters.updatedFrom)||(filters.updatedTo&&day>filters.updatedTo))continue;}
        const publicName=`${data.surname||''} ${data.secondSurname||''}, ${data.names||''}`.replace(/\s+/g,' ').replace(/\s+,/g,',').trim();
        if(search&&!fold(publicName).includes(search)&&!searchKeys.some(key=>visible.has(key)&&(fold(data[key]).includes(search)||(key.toLowerCase().includes('identifier')&&identifierSearch&&normalizeIdentifier(data[key]).includes(identifierSearch)))))continue;
        const row={id:source.id,student_id:source.student_id,year:source.year,course_id:source.course_id,template_id:source.template_id,status:source.status,name:source.name,version:source.version,updated_at:source.updated_at,courseName:source.courseName};
        items.push({row,data:withData?Object.fromEntries(rosterKeys.filter(key=>visible.has(key)).map(key=>[key,data[key]??''])):undefined,fields,pending,origin});
        if(items.length>maxRows)fail(413,'Acote la selección por año, curso o estado. Supera 10.000 expedientes.','FILTER_COHORT_LIMIT');
      }
      after=rows.at(-1).id;if(rows.length<64)break;
    }
    const compareName=(a,b)=>compareText(a.row.name,b.row.name)||compareText(a.row.id,b.row.id);
    items.sort((a,b)=>{
      if(filters.sort==='updated-desc'||filters.sort==='updated-asc'){const order=String(a.row.updated_at).localeCompare(String(b.row.updated_at));if(order)return filters.sort==='updated-desc'?-order:order;}
      if(filters.sort==='course'){const order=compareText(a.row.courseName,b.row.courseName);if(order)return order;}
      if(filters.sort==='status'){const order=statuses.indexOf(a.row.status)-statuses.indexOf(b.row.status);if(order)return order;}
      return compareName(a,b);
    });
    return {filters,items};
  };
}
