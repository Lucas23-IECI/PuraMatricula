import PDFDocument from 'pdfkit';
import { displayLabel, sections } from './fields.mjs';
import { createFichaPdf } from './pdf.mjs';
import { makeDocx, makeXlsx } from './report-office.mjs';
import { fail, pageWindow } from './service.mjs';
import { pendingLabels } from './record-filters.mjs';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const statuses = { draft: 'Borrador', enrolled: 'Matriculado', withdrawn: 'Retirado' };
const movementLabels = { enroll: 'Confirmaciones', renewed: 'Renovaciones', transfer: 'Traslados', withdraw: 'Retiros', reenter: 'Reingresos' };
const maxReportRows = 10000;
const staffSignatures = ['Firma del apoderado/a', 'Nombre y firma del establecimiento'];

const displayDate = value => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const blankStatuses = () => ({ draft: 0, enrolled: 0, withdrawn: 0 });
const studentName = data => `${data.surname || ''} ${data.secondSurname || ''}, ${data.names || ''}`.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
const makeDownload = (bytes, mime, name) => ({ bytes, mime, name });
const protectCsv = value => {
  const str = String(value ?? '');
  // Spreadsheet readers may skip leading whitespace/control characters before a formula.
  const safe = /^[\s\p{Cc}\p{Cf}]*[=+@\-]/u.test(str.normalize('NFKC')) || /^[\t\r\n]/.test(str) ? "'" + str : str;
  return '"' + safe.replace(/"/g, '""') + '"';
};

const rosterHeaders = [
  'Año', 'Curso', 'Estado', 'Apellido paterno (estudiante)', 'Apellido materno (estudiante)', 'Nombres (estudiante)',
  'Tipo de identificación', 'Identificador (estudiante)', 'Nombre completo (apoderado)', 'Identificador (apoderado)',
  'Teléfono (apoderado)', 'Correo (apoderado)', 'Domicilio (estudiante)', 'Comuna (estudiante)', 'Revisión',
];
const rosterCells = ({row, data}) => [
  row.year, row.courseName, statuses[row.status], data.surname || '', data.secondSurname || '', data.names || '',
  data.identifierType || '', String(data.identifier || ''), data.guardianName || '', String(data.guardianIdentifier || ''),
  String(data.guardianPhone || ''), data.guardianEmail || '', data.address || '', data.commune || '', row.version,
];

function pdfFile(render, title) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 }, info: { Title: title, Author: 'Colegio Domingo Santa María' } });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  try {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#28618c').text('COLEGIO DOMINGO SANTA MARÍA · MATRÍCULA');
    doc.moveDown().fontSize(19).fillColor('#202a35').text(title);
    doc.moveDown(.65).font('Helvetica').fontSize(10);
    render(doc);
    doc.end();
  } catch (error) {
    doc.destroy(error);
  }
  return complete;
}

function summaryRows(report) {
  return report.byCourse.map(course => [course.name, course.total, course.enrolled, course.draft, course.withdrawn, course.pending]);
}
const summaryHeaders = ['Curso', 'Expedientes', 'Vigentes', 'Borradores', 'Retirados', 'Con pendientes'];
function scopeLabel(report) {
  const {year,courseName,status,q,pending,identifierType,pendingKey,documentKind,documentState,contact,origin,updatedFrom,updatedTo}=report.filters;
  const contactLabels={'missing-phone':'Sin teléfono de apoderado','missing-email':'Sin correo de apoderado',complete:'Contacto completo'};
  return [`Año ${year}`,courseName||'Todos los cursos autorizados',status?statuses[status]:'Todos los estados',q&&'Búsqueda aplicada',pending&&'Solo fichas con pendientes',identifierType&&`Identificación: ${identifierType}`,pendingKey&&`Pendiente: ${pendingLabels[pendingKey]}`,documentKind&&`${documentKind==='identity'?'Identificación':'Ficha firmada'}: ${documentState==='present'?'con documento visible':'sin documento visible'}`,contactLabels[contact],origin&&(origin==='manual'?'Ingreso manual':'Importado'),updatedFrom&&`Actualizado desde ${updatedFrom}`,updatedTo&&`Actualizado hasta ${updatedTo}`].filter(Boolean).join(' · ');
}

function summaryPdf(report) {
  return pdfFile(doc => {
    doc.text(scopeLabel(report)).text('Generado: ' + displayDate(report.generatedAt)).moveDown();
    doc.text(`${report.total} expedientes · ${report.byStatus.enrolled} vigentes · ${report.pending} con pendientes`).moveDown();
    const widths = [170, 66, 61, 66, 58, 78];
    const printRow = (cells, isHeader=false) => {
      doc.font(isHeader?'Helvetica-Bold':'Helvetica').fontSize(9);
      const height = Math.max(20,...cells.map((cell,i)=>doc.heightOfString(String(cell),{width:widths[i]-7})+9));
      if(doc.y + height > 745) {
        doc.addPage();
        if(!isHeader)printRow(summaryHeaders,true);
      }
      const y=doc.y;
      let x=48;
      if(isHeader)doc.rect(48,y,499,height).fill('#edf2f7');
      for(let i=0;i<cells.length;i++) {
        doc.fillColor('#202a35').text(String(cells[i]),x+3,y+4,{width:widths[i]-7,align:i===0?'left':'center'});
        x+=widths[i];
      }
      doc.y=y+height;
    };
    printRow(summaryHeaders,true);
    for(const row of summaryRows(report))printRow(row);
    doc.x=48;
    doc.moveDown(1.5).font('Helvetica-Bold').fontSize(12).text('Movimientos de los expedientes seleccionados');
    doc.moveDown(.5).font('Helvetica').fontSize(10).text(Object.entries(movementLabels).map(([key,label])=>label+': '+report.movements[key]).join(' · '));
    doc.moveDown(.5).fontSize(9).text('Los movimientos se cuentan por separado y no se suman a la matrícula vigente. Este informe refleja el estado actual al generarlo.');
  },'Estadísticas de matrícula');
}

export function createReports(store, svc) {
  const {db,audit}=store;
  const auditScope=({year,course,status,q,pending})=>({year,course:course||null,status:status||null,searched:!!q,pending});

  async function aggregate(user,query,permission='read'){
    // Read the cohort and its movement counts in one database transaction.
    const {filters,items,movements}=await store.transaction(async()=>{
      const {filters,items}=await svc.recordCohort(user,query,{requireYear:true,permission,maxRows:maxReportRows});
      const movements=Object.fromEntries(Object.keys(movementLabels).map(key=>[key,0]));
      const ids=items.map(item=>item.row.id);
      for(let from=0;from<ids.length;from+=400){
        const batch=ids.slice(from,from+400);
        const entries=await db.prepare(`SELECT action,count(*) AS total FROM events WHERE record_id IN (${batch.map(()=>'?').join(',')}) AND action IN ('enroll','renewed','transfer','withdraw','reenter') GROUP BY action`).all(...batch);
        for(const entry of entries)if(Object.hasOwn(movements,entry.action))movements[entry.action]+=Number(entry.total);
      }
      return {filters,items,movements};
    });
    const byStatus=blankStatuses(),byCourse=new Map();
    let pending=0;
    for(const {row,pending:fields} of items) {
      const course=byCourse.get(row.course_id)||{id:row.course_id,name:row.courseName,year:row.year,total:0,pending:0,...blankStatuses()};
      byCourse.set(row.course_id,course);
      course.total++;course[row.status]++;byStatus[row.status]++;
      if(fields.length){pending++;course.pending++;}
    }
    const result={filters,generatedAt:new Date().toISOString(),total:items.length,byStatus,pending,byCourse:[...byCourse.values()].sort((a,b)=>a.name.localeCompare(b.name,'es-CL',{numeric:true})||a.id.localeCompare(b.id)),movements};
    if(String(query.includeRecords)==='1') {
      const {page,pageSize}=pageWindow(query,items.length);
      result.page=page;result.pageSize=pageSize;
      result.items=items.slice((page-1)*pageSize,page*pageSize).map(({row,pending,origin})=>({id:row.id,name:row.name,courseId:row.course_id,courseName:row.courseName,status:row.status,updatedAt:row.updated_at,pending:pending.map(key=>pendingLabels[key]),origin}));
    }
    return result;
  }

  async function statistics(user,query={}){
    const result=await aggregate(user,query);
    await audit(user.id,'report.statistics','',{...auditScope(result.filters),count:result.total,includesRecords:!!result.items});
    return result;
  }

  async function roster(user,query={},format='csv'){
    if(!['csv','xlsx'].includes(format))fail(400,'Elija CSV o Excel para exportar la nómina.');
    const {filters,items}=await store.transaction(()=>svc.recordCohort(user,query,{requireYear:true,permission:'export',maxRows:maxReportRows,withData:true}));
    // The roster always uses a fixed list of administrative fields, and never includes reserved fields.
    const allowed=items.map(item=>({...item,data:Object.fromEntries(Object.entries(item.data).filter(([key])=>item.fields.some(field=>field.key===key&&!field.sensitive&&!field.hidden)))}));
    const rows=allowed.map(rosterCells);
    let bytes,mime;
    if(format==='csv') {
      bytes=Buffer.from('\uFEFF'+[rosterHeaders,...rows].map(row=>row.map(protectCsv).join(';')).join('\r\n'),'utf8');
      mime='text/csv; charset=utf-8';
    } else {
      const sheets=new Map();
      if(query.layout==='by-course') {
        allowed.forEach((item,index)=>{
          if(!sheets.has(item.row.course_id))sheets.set(item.row.course_id,{name:item.row.courseName,headers:rosterHeaders,rows:[]});
          sheets.get(item.row.course_id).rows.push(rows[index]);
        });
      }
      bytes=makeXlsx(sheets.size?[...sheets.values()]:[{name:'Nómina',headers:rosterHeaders,rows}]);mime=XLSX;
    }
    await audit(user.id,filters.course?'course.export':'report.roster',filters.course,{...auditScope(filters),format,count:rows.length});
    return makeDownload(bytes,mime,`nomina-${filters.year}${filters.course?'-'+filters.course.slice(0,8):''}.${format}`);
  }

  async function summary(user,query={},format='pdf'){
    if(!['pdf','xlsx'].includes(format))fail(400,'Elija PDF o Excel para descargar estadísticas.');
    const report=await aggregate(user,{...query,includeRecords:'0'},'export');
    const bytes=format==='pdf'?await summaryPdf(report):makeXlsx([
      {name:'Resumen',headers:['Indicador','Valor'],rows:[
        ['Selección',scopeLabel(report)],['Fecha de generación',displayDate(report.generatedAt)],['Expedientes',report.total],
        ['Matrícula vigente',report.byStatus.enrolled],['Borradores',report.byStatus.draft],['Retirados',report.byStatus.withdrawn],['Con pendientes',report.pending],
      ]},
      {name:'Por curso',headers:summaryHeaders,rows:summaryRows(report)},
      {name:'Movimientos',headers:['Tipo','Cantidad'],rows:Object.entries(movementLabels).map(([key,label])=>[label,report.movements[key]])},
    ]);
    await audit(user.id,'report.summary','',{...auditScope(report.filters),format,count:report.total});
    return makeDownload(bytes,format==='pdf'?'application/pdf':XLSX,`estadisticas-${report.filters.year}.${format}`);
  }

  async function record(user,id,{format='pdf',kind='ficha',version}={}){
    if(!['pdf','docx'].includes(format)||!['ficha','constancia'].includes(kind))fail(400,'Formato o tipo de documento inválido.');
    const current=await svc.load(id);
    svc.requirePermission(user,'read',current.course_id);svc.requirePermission(user,'export',current.course_id);
    const selected=version===undefined||version===null||version===''?Number(current.version):Number(version);
    if(!Number.isSafeInteger(selected)||selected<1)fail(400,'Revisión inválida.');
    const revision=await db.prepare('SELECT * FROM revisions WHERE record_id=? AND version=?').get(id,selected);
    if(!revision)fail(404,'Revisión no encontrada.');
    const snapshot=JSON.parse(store.unseal(revision.snapshot));
    svc.requirePermission(user,'read',snapshot.courseId);svc.requirePermission(user,'export',snapshot.courseId);
    const allFields=await svc.fieldsFor(snapshot.templateId),limited=!svc.can(user,'sensitive');
    const fields=allFields.filter(field=>!field.hidden&&(!field.sensitive||!limited)),data=svc.filtered(snapshot.data,fields,user);
    const course=await svc.courseFor(snapshot.courseId),template=await db.prepare('SELECT id,name FROM templates WHERE id=?').get(snapshot.templateId);
    const document={...snapshot,id,data,version:selected,name:studentName(data),events:[]};
    if(kind==='constancia'&&(snapshot.status!=='enrolled'||Number(current.version)!==selected||current.status!=='enrolled'))fail(409,'La constancia solo se emite para la revisión vigente de una matrícula confirmada.','CERTIFICATE_NOT_CURRENT');
    if(kind==='ficha'&&snapshot.status==='withdrawn'&&Number(current.version)===selected) {
      const event=await db.prepare("SELECT detail FROM events WHERE record_id=? AND action='withdraw' ORDER BY id DESC LIMIT 1").get(id);
      if(event){
        const detail=JSON.parse(store.unseal(event.detail));
        document.events=[{action:'withdraw',detail:{date:detail.date,...(!limited&&detail.reason?{reason:detail.reason}:{})}}];
      }
    }
    const subtitle=`Año ${snapshot.year} · ${course.name} · ${statuses[snapshot.status]} · Revisión ${selected}`;
    const constanciaRows=[['Estudiante',document.name],['Identificación',data.identifier||'—'],['Año escolar',snapshot.year],['Curso',course.name],['Estado','Matriculado'],['Revisión',selected],['Fecha de emisión',displayDate(new Date())]];
    const title=kind==='constancia'?'Constancia de matrícula':'Ficha de matrícula';
    let bytes;
    if(format==='pdf')bytes=kind==='ficha'?await createFichaPdf(document,fields,course,template,limited):await pdfFile(doc=>{
      doc.text(subtitle).moveDown();
      for(const [label,value] of constanciaRows)doc.font('Helvetica-Bold').text(label+': ',{continued:true}).font('Helvetica').text(String(value));
      doc.moveDown(2).text('Nombre y firma del establecimiento: ________________________');
      doc.moveDown(.75).fontSize(9).text('Documento generado desde el registro de matrícula. Requiere firma del establecimiento para su entrega.');
    },title);
    else {
      const groups=kind==='constancia'?[{title:'Datos de matrícula',rows:constanciaRows}]:Object.entries(sections).map(([key,label])=>({title:label,rows:fields.filter(field=>field.section===key).map(field=>[displayLabel(field),data[field.key]||'—'])})).filter(group=>group.rows.length);
      const withdrawal=document.events[0]?.detail;
      if(kind==='ficha'&&withdrawal)groups.push({title:'Movimiento de retiro',rows:[['Fecha de baja',withdrawal.date||'—'],...(!limited&&withdrawal.reason?[['Motivo',withdrawal.reason]]:[])]});
      bytes=makeDocx({title,subtitle:`Colegio Domingo Santa María · ${subtitle}`,note:`Copia editable de ${template.name}. Requiere firma del establecimiento.${limited?' Vista limitada: se omiten antecedentes reservados.':''}`,groups,signatures:kind==='constancia'?staffSignatures.slice(1):staffSignatures});
    }
    await audit(user.id,`${format}.download`,id,{version:selected,year:snapshot.year,kind,sensitive:!limited&&kind==='ficha'});
    return makeDownload(bytes,format==='pdf'?'application/pdf':DOCX,`${kind}-${snapshot.year}-${id.slice(0,8)}-r${selected}.${format}`);
  }
  return {statistics,roster,summary,record};
}
