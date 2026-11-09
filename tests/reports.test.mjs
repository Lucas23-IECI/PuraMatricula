import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import readXlsx from 'read-excel-file/node';
import {unzipSync,strFromU8} from 'fflate';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {createService} from '../src/service.mjs';
import {createReports} from '../src/reports.mjs';
import {randomBytes} from 'node:crypto';
import {openPostgresStore} from '../src/store-postgres.mjs';
import {createPglitePool} from './helpers/pglite-pool.mjs';

const year=2026;
const admin={id:'admin-report-test',permissions:['read','write','enroll','sensitive','export','admin'],allCourses:true,courses:[]};
const birthFields={guardianName:'Apoderado Ficticio',guardianPhone:'012345678',emergencyPhone:'012345678',birthCertificate:'Sí',imagesDecision:'Pendiente',outingsDecision:'Pendiente'};
const student=(name,identifier,extra={})=>({names:name,surname:'Ficticio',identifierType:'Otro',identifier,...birthFields,...extra});

async function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'matricula-reports-'));
  const store=openAsyncStore(directory);t.after(async()=>{await store.close();rmSync(directory,{recursive:true,force:true});});
  const svc=createService(store),reports=createReports(store,svc);
  const a=await svc.createCourse(admin,{year,name:'3° Básico A'}),b=await svc.createCourse(admin,{year,name:'3° Básico B'}),next=await svc.createCourse(admin,{year:year+1,name:'4° Básico A'});
  const restricted={id:'report-reader',permissions:['read','export'],allCourses:false,courses:[a.id]};
  return {store,svc,reports,a,b,next,restricted};
}

function docxContent(bytes){return strFromU8(unzipSync(bytes)['word/document.xml']);}
function pdfText(bytes){
  const text=bytes.toString('latin1'), glyphs=[];
  for(const match of text.matchAll(/\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n/g)){
    const start=match.index+match[0].length, end=text.indexOf('endstream',start);
    if(end===-1)continue;
    try {
      const content=inflateSync(bytes.subarray(start,end)).toString('latin1');
      for(const run of content.matchAll(/\[([^\[\]]+)\]\s*TJ/g))glyphs.push([...run[1].matchAll(/<([0-9a-f]+)>/gi)].map(piece=>Buffer.from(piece[1],'hex').toString('latin1')).join(''));
    }catch{}
  }
  return glyphs.join('\n');
}

test('nóminas CSV y Excel conservan filtros, cursos autorizados e identificadores de texto',async t=>{
  const {svc,reports,a,b,restricted}=await fixture(t);
  const current=await svc.create(admin,{year,courseId:a.id,data:student('Coincidencia exacta','000123',{guardianName:'\u200b=SUM(1;2)',allergies:'NOEXPORTARPRUEBA',commune:'Comuna ficticia'})});
  await svc.transition(admin,current.id,{action:'enroll',version:1,date:'2026-03-01'});
  await svc.create(admin,{year,courseId:a.id,data:student('Otro borrador','OTRO000')});
  await svc.create(admin,{year,courseId:b.id,data:student('Sin permiso','OTRO999')});
  const filter={year,course:a.id,status:'enrolled',q:'Coincidencia'};
  const list=await svc.list(restricted,filter);assert.equal(list.total,1);
  const csv=await reports.roster(restricted,filter,'csv');
  assert.match(csv.mime,/text\/csv/);const csvText=csv.bytes.toString('utf8');
  assert.match(csvText,/^\uFEFF/);assert.ok(csvText.includes('Coincidencia exacta'));assert.ok(csvText.includes('"\'\u200b=SUM(1;2)"'));assert.ok(csvText.includes('Comuna ficticia'));
  for(const omitted of ['Otro borrador','Sin permiso','NOEXPORTARPRUEBA'])assert.ok(!csvText.includes(omitted));
  const excel=await reports.roster(restricted,filter,'xlsx');
  const sheets=await readXlsx(excel.bytes);assert.equal(sheets.length,1);assert.equal(sheets[0].data.length,2);
  assert.equal(sheets[0].data[1][sheets[0].data[0].indexOf('Identificador (estudiante)')],'000123');
  const annual=await readXlsx((await reports.roster(admin,{year,layout:'by-course'},'xlsx')).bytes);
  assert.deepEqual(annual.map(sheet=>[sheet.sheet,sheet.data.length]),[[a.name,3],[b.name,2]]);
  await assert.rejects(()=>reports.roster(restricted,{year,course:b.id},'csv'),{status:403});
  await assert.rejects(()=>reports.roster({...restricted,permissions:['read']},filter,'xlsx'),{status:403});
});

test('estadísticas, movimientos y bandeja usan la misma selección que las nóminas',async t=>{
  const {svc,reports,a,b,next,restricted}=await fixture(t);
  const old=await svc.create(admin,{year,courseId:a.id,data:student('Alumno activo','0011')});
  const enrolled=await svc.transition(admin,old.id,{action:'enroll',version:1,date:'2026-03-01'});
  await svc.renew(admin,old.id,{version:enrolled.version,courseId:next.id});
  const transferred=await svc.transition(admin,old.id,{action:'transfer',version:enrolled.version,courseId:b.id,date:'2026-03-20',reason:'Motivo sintético'});
  await svc.transition(admin,old.id,{action:'withdraw',version:transferred.version,date:'2026-04-01',reason:'Baja sintética'});
  await svc.create(admin,{year,courseId:a.id,data:student('Alumno borrador','0012')});
  const stats=await reports.statistics(admin,{year,includeRecords:1});
  assert.equal(stats.total,2);assert.deepEqual(stats.byStatus,{draft:1,enrolled:0,withdrawn:1});
  assert.equal(stats.movements.transfer,1);assert.equal(stats.movements.withdraw,1);assert.equal(stats.movements.renewed,0);
  assert.equal(stats.items.length,2);assert.equal((await reports.statistics(admin,{year:year+1})).movements.renewed,1);
  const pending=await reports.statistics(restricted,{year,pending:1,includeRecords:1});
  assert.equal(pending.total,1);assert.ok(pending.items[0].pending.includes('Decisión sobre imágenes'));assert.equal(pending.items[0].courseId,a.id);
  assert.equal(stats.pending,1);assert.equal((await svc.detail(admin,old.id)).pending.length,0);
  const excel=await readXlsx((await reports.roster(restricted,{year,pending:1},'xlsx')).bytes);
  assert.equal(excel[0].data.length-1,pending.total);
  const summary=await reports.summary(admin,{year},'xlsx');
  const report=await readXlsx(summary.bytes);assert.deepEqual(report.map(sheet=>sheet.sheet),['Resumen','Por curso','Movimientos']);assert.ok(report[0].data.some(row=>row[0]==='Expedientes'&&row[1]===stats.total));
  const pdf=await reports.summary(admin,{year},'pdf');assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');assert.match(pdfText(pdf.bytes),/Movimientos de los expedientes seleccionados/);
  assert.equal((await reports.statistics({...restricted,courses:[]},{year})).total,0);
  await assert.rejects(()=>reports.statistics(restricted,{year,course:b.id}),{status:403});
});

test('PDF y Word por revisión respetan permisos y la constancia exige una matrícula vigente',async t=>{
  const {store,svc,reports,a,b,restricted}=await fixture(t);
  const marker='SECRETOCLINICO';
  const current=await svc.create(admin,{year,courseId:a.id,data:student('Nombre previo','001234',{allergies:marker})});
  await assert.rejects(()=>reports.record(admin,current.id,{format:'pdf',kind:'constancia'}),{status:409});
  const enrolled=await svc.transition(admin,current.id,{action:'enroll',version:1,date:'2026-03-01'});
  const constancia=await reports.record(restricted,current.id,{format:'pdf',kind:'constancia'});
  assert.match(pdfText(constancia.bytes),/Constancia de matrícula/);assert.doesNotMatch(pdfText(constancia.bytes),/SECRETOCLINICO/);
  const updated=await svc.patch(admin,current.id,{version:enrolled.version,data:{names:'Nombre actualizado'}});
  const historical=await reports.record(restricted,current.id,{format:'docx',version:1});
  assert.match(historical.mime,/wordprocessingml/);assert.match(docxContent(historical.bytes),/Nombre previo/);assert.doesNotMatch(docxContent(historical.bytes),/Nombre actualizado|SECRETOCLINICO/);
  await assert.rejects(()=>reports.record(admin,current.id,{kind:'constancia',version:enrolled.version}),{status:409});
  const withdrawn=await svc.transition(admin,current.id,{action:'withdraw',version:updated.version,date:'2026-04-01',reason:'MOTIVORESERVADO'});
  const pdfLimited=await reports.record(restricted,current.id,{format:'pdf'}),wordLimited=await reports.record(restricted,current.id,{format:'docx'});
  assert.match(pdfText(pdfLimited.bytes),/Fecha de baja/);assert.doesNotMatch(pdfText(pdfLimited.bytes),/MOTIVORESERVADO|SECRETOCLINICO/);
  assert.doesNotMatch(docxContent(wordLimited.bytes),/MOTIVORESERVADO|SECRETOCLINICO/);
  assert.match(docxContent((await reports.record(admin,current.id,{format:'docx'})).bytes),/MOTIVORESERVADO/);
  assert.match(pdfText((await reports.record(admin,current.id)).bytes),/MOTIVORESERVADO/);
  const other=await svc.create(admin,{year,courseId:b.id,data:student('Otro curso','012345')});
  await assert.rejects(()=>reports.record(restricted,other.id,{format:'docx'}),{status:403});
  await svc.transition(admin,other.id,{action:'transfer',version:1,courseId:a.id,date:'2026-04-02',reason:'Traslado sintético'});
  await assert.rejects(()=>reports.record(restricted,other.id,{format:'docx',version:1}),{status:403});
  assert.equal(withdrawn.status,'withdrawn');
  const log=JSON.stringify(await store.db.prepare('SELECT detail FROM audit').all());
  assert.doesNotMatch(log,/MOTIVORESERVADO|SECRETOCLINICO|Nombre previo/);
});

test('la selección de reportes y su exportación funcionan con el adaptador PostgreSQL',async t=>{
  const pool=await createPglitePool();
  const store=await openPostgresStore({pool,migrate:true,key:randomBytes(32)});t.after(()=>store.close());
  const svc=createService(store),reports=createReports(store,svc);
  const course=await svc.createCourse(admin,{year,name:'Prueba PostgreSQL'});
  const rec=await svc.create(admin,{year,courseId:course.id,data:student('Muestra PG','000045')});
  await svc.transition(admin,rec.id,{action:'enroll',version:1,date:'2026-03-01'});
  const query={year,course:course.id,status:'enrolled',q:'000045'};
  const stats=await reports.statistics(admin,query);
  assert.equal(stats.total,1);assert.equal(stats.movements.enroll,1);
  const csv=await reports.roster(admin,query);
  assert.match(csv.bytes.toString('utf8'),/"000045"/);
});
