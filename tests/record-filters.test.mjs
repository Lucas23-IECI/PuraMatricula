import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import readXlsx from 'read-excel-file/node';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {openPostgresStore} from '../src/store-postgres.mjs';
import {createService} from '../src/service.mjs';
import {createReports} from '../src/reports.mjs';
import {createPglitePool} from './helpers/pglite-pool.mjs';

const admin={id:'filter-admin',permissions:['read','write','enroll','sensitive','documents','export','admin'],allCourses:true,courses:[]};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const csvIds=file=>[...file.bytes.toString('utf8').matchAll(/"FILT-(\d+)"/g)].map(match=>id(Number(match[1])));
const normalData=n=>({names:`Persona ${String(n).padStart(3,'0')}`,surname:'Sintético',identifierType:'Otro',identifier:`FILT-${n}`,guardianName:'Tutor ficticio',guardianPhone:'900000000',guardianEmail:`familia${n}@filtro.test`,emergencyPhone:'900000001',imagesDecision:'No',outingsDecision:'No',birthCertificate:'Sí'});

async function fixture(t,kind){
  let directory,store;
  if(kind==='SQLite'){directory=mkdtempSync(join(tmpdir(),'matricula-filters-'));store=openAsyncStore(directory);}
  else store=await openPostgresStore({pool:await createPglitePool(),migrate:true,key:randomBytes(32)});
  t.after(async()=>{await store.close();if(directory){assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));rmSync(directory,{recursive:true,force:true});}});
  const svc=createService(store),reports=createReports(store,svc),a=await svc.createCourse(admin,{year:2026,name:'2° Básico A'}),b=await svc.createCourse(admin,{year:2026,name:'2° Básico B'}),next=await svc.createCourse(admin,{year:2027,name:'3° Básico A'});
  const fields=await svc.fieldsFor(1),privateFields=fields.map(field=>({...field,...(field.key==='guardianPhone'?{sensitive:true}:field.key==='guardianEmail'?{hidden:true}:{} )}));
  const privateTemplate=await store.db.prepare('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?) RETURNING id').get('Prueba de reserva',JSON.stringify(privateFields),'2026-03-01T12:00:00.000Z');
  await store.transaction(async()=>{
    for(let n=1;n<=75;n++){
      const course=n<=72?a:n<=74?b:next,data=normalData(n),origin=n%2?'ERP_SINTETICO':null;
      if([61,65,69].includes(n)){data.identifierType='IPE';data.guardianEmail=`tarde-${n}@filtro.test`;}
      if(n===61)data.guardianPhone='';if(n===65)data.guardianEmail='';if(n===69)data.imagesDecision='Pendiente';
      if(n>=71&&n<=72){data.guardianPhone='SECRETO-TELEFONO';data.guardianEmail=`oculto-${n}@privado.test`;}
      if(n>=73)data.guardianEmail='tarde-fuera@filtro.test';
      const updated=n===61?'2026-04-05T03:30:00.000Z':n===65?'2026-04-05T04:30:00.000Z':'2026-03-01T12:00:00.000Z';
      const status=n===61||n===69?'draft':['enrolled','withdrawn','draft'][n%3];
      await store.db.prepare('INSERT INTO students VALUES(?,?,?,?)').run(id(1000+n),store.mac('identidad-'+n),origin,origin?'fila-'+n:null);
      await store.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?)').run(id(n),id(1000+n),course.year,course.id,n>=71&&n<=72?privateTemplate.id:1,status,`${data.surname}, ${data.names}`,1,store.seal(data),updated);
    }
    for(const [n,kind,sensitive]of [[2,'signed',1],[3,'identity',0],[4,'identity',0],[4,'signed',1]])await store.db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?)').run(id(2000+n+(kind==='signed'?100:0)),id(n),kind,'fixture.pdf','application/pdf',sensitive,'0'.repeat(64),1,admin.id,'2026-03-01T12:00:00.000Z');
  });
  const reader={id:'filter-reader',permissions:['read','export','documents'],allCourses:false,courses:[a.id]};
  return {store,svc,reports,a,b,next,reader};
}

for(const kind of ['SQLite','PostgreSQL/PGlite'])test(`${kind}: filtros comparten cohorte autorizada antes de paginar y exportar`,async t=>{
  const {store,svc,reports,a,b,next,reader}=await fixture(t,kind);
  const parity=async(query,expected,user=reader)=>{
    const selection={year:2026,...query},list=await svc.list(user,{...selection,page:1,pageSize:100}),stats=await reports.statistics(user,{...selection,includeRecords:1,pageSize:100}),csv=await reports.roster(user,{...selection,page:99,pageSize:1},'csv');
    assert.equal(list.total,expected.length);assert.equal(stats.total,list.total);assert.deepEqual(list.items.map(row=>row.id),expected);assert.deepEqual(stats.items.map(row=>row.id),expected);assert.deepEqual(csvIds(csv),expected);return {list,stats};
  };
  await t.test('búsqueda administrativa tardía y filtros combinados recorren más de una página y lote',async()=>{
    await parity({q:'tarde-'},[id(61),id(69)]);
    await parity({identifierType:'IPE'},[id(61),id(65),id(69)]);
    await parity({pendingKey:'guardianPhone'},[id(61)]);
    await parity({contact:'missing-email'},[id(65)]);
    await parity({identifierType:'IPE',contact:'missing-phone',origin:'imported'},[id(61)]);
    await parity({q:'Sintético, Persona 069'},[id(69)]);
    await parity({q:'%'},[]);
    const page=await svc.list(reader,{year:2026,origin:'imported',page:2,pageSize:25});
    assert.equal(page.total,36);assert.equal(page.page,2);assert.equal(page.items.length,11);
    const sheet=await readXlsx((await reports.roster(reader,{year:2026,origin:'imported',page:2,pageSize:25},'xlsx')).bytes);
    assert.equal(sheet[0].data.length-1,page.total,'Excel incluye toda la selección, no solo la página.');
    const summary=await readXlsx((await reports.summary(reader,{year:2026,identifierType:'IPE',contact:'missing-phone'},'xlsx')).bytes);
    assert.ok(summary[0].data.some(row=>row[0]==='Expedientes'&&row[1]===1));
  });
  await t.test('fechas inclusivas corresponden al día chileno y cada orden es estable en todas las salidas',async()=>{
    await parity({updatedFrom:'2026-04-04',updatedTo:'2026-04-04'},[id(61)]);
    await parity({updatedFrom:'2026-04-05',updatedTo:'2026-04-05'},[id(65)]);
    await parity({identifierType:'IPE',sort:'updated-desc'},[id(65),id(61),id(69)]);
    await parity({identifierType:'IPE',sort:'updated-asc'},[id(69),id(61),id(65)]);
    for(const sort of ['name','course','status']){
      const expected=(await svc.list(reader,{year:2026,sort,pageSize:100})).items.map(row=>row.id);await parity({sort},expected);
    }
  });
  await t.test('contacto, búsqueda y pendientes no infieren campos reservados u ocultos de cada plantilla',async()=>{
    for(const user of [reader,{...reader,permissions:[...reader.permissions,'sensitive','admin']}]){
      await parity({q:'SECRETO-TELEFONO'},[],user);await parity({q:'@privado.test'},[],user);
      await parity({contact:'missing-phone'},[id(61)],user);await parity({pendingKey:'guardianPhone'},[id(61)],user);
      const rows=(await svc.list(user,{year:2026,pageSize:100})).items;
      assert.ok(rows.find(row=>row.id===id(71)).pending.every(label=>label!=='Teléfono del apoderado'));
      assert.ok(rows.every(row=>!Object.hasOwn(row,'data')&&!Object.hasOwn(row,'studentOrigin')&&!Object.hasOwn(row,'originId')));
    }
    const audit=JSON.stringify(await store.db.prepare('SELECT detail FROM audit').all());assert.doesNotMatch(audit,/SECRETO-TELEFONO|@privado\.test|tarde-/);
  });
  await t.test('documentos requieren permiso y no distinguen ausencia de un archivo reservado invisible',async()=>{
    await parity({documentKind:'identity',documentState:'present'},[id(3),id(4)]);
    await parity({documentKind:'signed',documentState:'present'},[]);
    const missing=await svc.list(reader,{year:2026,documentKind:'signed',documentState:'missing',pageSize:100});assert.equal(missing.total,72);assert.ok(missing.items.some(row=>row.id===id(2)));
    const full={...reader,permissions:[...reader.permissions,'sensitive']};await parity({documentKind:'signed',documentState:'present'},[id(2),id(4)],full);
    for(const permissions of [['read','export'],['read','export','sensitive']])for(const operation of [query=>svc.list({...reader,permissions},query),query=>reports.statistics({...reader,permissions},query),query=>reports.roster({...reader,permissions},query,'csv')])await assert.rejects(()=>operation({year:2026,documentKind:'identity',documentState:'missing'}),{status:403});
  });
  await t.test('valores inválidos fallan explícitamente y se conserva la compatibilidad de alcance y páginas vacías',async()=>{
    for(const query of [{identifierType:'inventado'},{pendingKey:'allergies'},{contact:'otro'},{origin:'otro'},{sort:'otro'},{documentKind:'support',documentState:'present'},{documentKind:'identity'},{documentState:'missing'},{updatedFrom:'2026-02-30'},{updatedTo:'2026-2-01'},{updatedFrom:'2026-04-05',updatedTo:'2026-04-04'},{q:[]},{q:'x'.repeat(101)}])for(const operation of [q=>svc.list(reader,q),q=>reports.statistics(reader,q)])await assert.rejects(()=>operation({year:2026,...query}),{status:400});
    await assert.rejects(()=>svc.list(reader,{year:2026,course:b.id,contact:'missing-phone'}),{status:403});
    await assert.rejects(()=>reports.statistics(admin,{year:2026,course:next.id}),{status:400});
    assert.equal((await svc.list(reader)).total,72,'Listar sin año conserva el alcance histórico autorizado.');
    assert.equal((await reports.statistics(reader,{course:a.id})).filters.year,2026,'El reporte puede tomar el año del curso.');
    const empty=await svc.list({...reader,courses:[]},{page:999,pageSize:5});assert.deepEqual(empty,{items:[],total:0,page:1,pageSize:5});
    await assert.rejects(()=>svc.recordCohort(reader,{year:2026},{maxRows:1}),{status:413,code:'FILTER_COHORT_LIMIT'});
  });
});
