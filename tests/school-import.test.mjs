import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate,
  normalizeRutAndDv,
  normalizeCourseName,
  normalizeSchoolWorkbook,
  normalizeStudentRow,
  validateRut
} from '../src/school-import.mjs';

test('permite elegir la fila de encabezados de un formato nuevo sin confundir el título',()=>{
  const result=normalizeSchoolWorkbook({Listado:[['Título informativo'],[],['Persona','Apellido','Documento'],['Alumno ficticio','Sintético','11111111-1']]},{year:2026,columnMapping:{names:'Persona',surname:'Apellido',identifier:'Documento'},sheetMappings:{Listado:{include:true,headerRow:3,courseName:'Kínder'}}});
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].rowNumber,4);assert.equal(result.sheetSummaries[0].headerRow,3);assert.equal(result.errors.length,0);
});

const headers = [
  'ID de Usuario (no modificar)', 'RUT', 'DV', 'Tipo de documento', 'País emisor',
  'Nombres', 'Apellidos', 'Email', 'Teléfono', 'Rol', 'Curso', 'Sección',
  'Género', 'Fecha Nacimiento', 'Nombre Usuario', 'RUT Apoderado', 'Contraseña'
];

test('normaliza la hoja Usuarios ERP con identidad y campos de matrícula', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    headers,
    ['erp-001', '11111111', '1', 'RUN', 'CL', 'Ana María', 'Pérez Soto', 'ana@example.cl', '+56911112222', 'Estudiante', '1° Básico', 'A', 'F', '01/03/2018', 'ana.erp', '11111111-1', 'secreto'],
    ['erp-002', '11111112', '9', 'RUN', 'CL', 'Ana María', 'Pérez Soto', 'ana2@example.cl', '+56911112223', 'Estudiante', '1° Básico', 'A', 'F', 43160, '', '', ''],
  ] }, { year: 2026, courses: [{ id: 'course-1', name: '1° Básico', year: 2026 }] });

  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].originId, 'erp-001');
  assert.equal(result.rows[0].identity.value, '11111111-1');
  assert.equal(result.rows[0].data.surname, 'Pérez');
  assert.equal(result.rows[0].data.secondSurname, 'Soto');
  assert.equal(result.rows[0].data.birthDate, '2018-03-01');
  assert.equal(result.rows[0].data.phone, '+56911112222');
  assert.equal(result.rows[0].data.sourceBarcode, '');
  assert.equal(result.rows[0].data.sourceIdentifierType, 'RUN');
  assert.equal(result.rows[0].courseId, 'course-1');
  assert.equal(result.rows[0].account, null);
  assert.equal(Object.hasOwn(result.rows[0].data, 'password'), false);
  assert.equal(Object.hasOwn(result.rows[0].data, 'username'), false);
  assert.ok(result.warnings.some((warning) => warning.code === 'CUENTA_IGNORADA'));
});

test('no fusiona nombres iguales y bloquea identidad de origen repetida', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Apellidos', 'Rol'],
    ['same-name-1', '11111111', '1', 'Alex', 'Gómez', 'Estudiante'],
    ['same-name-2', '11111112', '9', 'Alex', 'Gómez', 'Estudiante'],
    ['same-name-1', '11111113', '7', 'Alex', 'Gómez', 'Estudiante']
  ] });
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.filter((error) => error.code === 'DUPLICADO_IDENTIDAD').length, 1);
  assert.deepEqual(result.rows.map((row) => row.data.names), ['Alex', 'Alex']);
});

test('bloquea colisión entre ID ERP y RUN aunque ambos difieran en la otra columna', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Apellidos', 'Rol'],
    ['erp-a', '11111111', '1', 'Alex', 'Gómez', 'Estudiante'],
    ['erp-b', '11111111', '1', 'Otro', 'Nombre', 'Estudiante']
  ] });
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors[0].code, 'DUPLICADO_IDENTIDAD');
});

test('ignora roles ajenos y nunca conserva usuario o contraseña', () => {
  const row = normalizeStudentRow({
    'ID de Usuario (no modificar)': 'teacher-1', Rol: 'Docente', Nombres: 'No', Apellidos: 'Importar', Contraseña: 'secret'
  }, { rowNumber: 8 });
  assert.equal(row.row, null);
  assert.equal(row.ignored.code, 'ROL_IGNORADO');

  const student = normalizeStudentRow({
    'ID de Usuario (no modificar)': 'student-1', Rol: 'Estudiante', Nombres: 'Sí', Apellidos: 'Importar', 'Nombre Usuario': 'login', Contraseña: 'secret'
  });
  assert.equal(student.row.account, null);
  assert.equal(Object.hasOwn(student.row, 'username'), false);
  assert.equal(Object.hasOwn(student.row.data, 'password'), false);
  assert.ok(student.warnings.some((warning) => warning.code === 'CUENTA_IGNORADA'));
});

test('acepta el padrón administrativo exportado y lo convierte si Usuarios no existe', () => {
  const result = normalizeSchoolWorkbook({
    'Padrón administrativo': [
      ['ID interno', 'Estudiante', 'Curso', 'Identificador principal', 'Documento completo', 'País', 'Matrícula'],
      ['42', 'Alex Gómez', '2° Medio', 'RUN chileno', '11111111-1', 'CL', 'VIGENTE']
    ],
    Identificadores: [
      ['ID interno', 'Estudiante', 'Tipo', 'Valor completo', 'Principal'],
      ['42', 'Alex Gómez', 'RUN chileno', '11111111-1', 'Sí']
    ]
  }, { year: 2026 });
  assert.equal(result.administrativeRows.length, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.yearContext.source, 'selection');
  assert.deepEqual(result.yearContext.sourceYears, []);
  assert.equal(result.rows[0].identity.value, '11111111-1');
  assert.equal(result.rows[0].data.surname, 'Alex');
  assert.equal(result.rows[0].data.secondSurname, 'Gómez');
});

const courseHeaders = ['N°', 'Apellido Paterno (Estudiante)', 'Apellido Materno (Estudiante)', 'Nombres (Estudiante)', 'RUT (Estudiante)',
  'Apellido Paterno (APODERADO)', 'Apellido Materno (APODERADO)', 'Nombres (Apoderado)', 'RUT (Apoderado)', 'Contacto (Teléfono)', 'Contacto (Email) SOLO SI REGISTRÓ', 'DOMICILIO', 'COMUNA'];
const courseStudent = (run = '11111111-1') => [1, 'Pérez', 'Soto', 'Ana sintética', run, 'Tutor', 'Prueba', 'Marta', '11111112-9', '+56912340000', 'tutor@example.test', 'Domicilio ficticio', 'Comuna ficticia'];

test('lee catorce hojas por curso sin inventar sección ni perder filas sin numeración', () => {
  const names = ['PRE-KINDER', 'KINDER', '1ºBásico', '2° Básico', '3°Básico', '4°Básico', '5° Básico', '6°Básico', '7°Básico', '8°Básico', '1° Medio', '2°Medio', '3°Medio', '4°Medio'];
  const check = body => { let sum=0,m=2;for(const digit of [...String(body)].reverse()){sum+=Number(digit)*m;m=m===7?2:m+1;}const v=11-sum%11;return v===11?'0':v===10?'K':String(v); };
  const book = Object.fromEntries(names.map((name,index) => {
    const body=15000000+index,row=courseStudent(`${body}-${check(body)}`);
    return [name,index===0?[courseHeaders.slice(1),row.slice(1)]:[courseHeaders,row]];
  }));
  const result = normalizeSchoolWorkbook(book,{year:2027});
  assert.equal(result.rows.length,14);
  assert.equal(result.errors.length,0);
  assert.equal(result.sheetSummaries.length,14);
  assert.equal(result.rows[0].courseName,'Prekínder');
  assert.equal(result.rows[1].courseName,'Kínder');
  assert.equal(result.rows[2].courseName,'1° Básico');
  assert.equal(result.rows[2].section,null);
  assert.equal(result.rows[0].courseYear,2027);
  assert.equal(result.rows[0].origin,'MATRICULA_POR_CURSO');
  assert.equal(result.rows[0].data.guardianName,'Marta Tutor Prueba');
  assert.equal(result.rows[0].data.sourceGuardianSurname,'Tutor');
  assert.equal(result.rows[0].data.sourceContactEmail,'tutor@example.test');
  assert.equal(result.rows[0].data.guardianEmail,undefined);
  assert.equal(result.rows[0].data.email,undefined);
  assert.equal(result.rows[0].data.address,undefined);
  assert.equal(result.rows[0].data.sourceCommune,'Comuna ficticia');
  assert.ok(result.warnings.some(issue=>issue.code==='CONTACTO_SIN_TITULAR'));
  assert.ok(result.mappingTargets.some(target=>target.key==='commune'));
  assert.equal(normalizeCourseName('6ºbasico b'),'6° Básico B');
});

test('preserva hoja/fila exacta después de títulos, huecos y numeración vacía', () => {
  const result=normalizeSchoolWorkbook({'1° Básico':[
    ['Padrón de prueba'],[],courseHeaders,[],[2],courseStudent(),[],courseStudent('11111112-K')
  ]},{year:2026,contactOwner:'guardian',addressOwner:'student'});
  assert.deepEqual(result.rows.map(row=>row.rowNumber),[6,8]);
  assert.equal(result.rows[0].data.sourceRow,'6');
  assert.equal(result.rows[0].data.sourceSheet,'1° Básico');
  assert.equal(result.rows[0].data.guardianPhone,'+56912340000');
  assert.equal(result.rows[0].data.email,undefined);
  assert.equal(result.rows[0].data.address,'Domicilio ficticio');
  assert.equal(result.rows[0].data.commune,'Comuna ficticia');
  assert.equal(result.rows[0].data.guardianAddress,undefined);
  assert.equal(result.sheetSummaries[0].headerRow,3);
  assert.equal(result.sheetSummaries[0].ignoredRows,1);
  assert.equal(result.ignored[0].row,5);
});

test('mapea columnas distintas por hoja y conserva identidad estable aunque cambie la fila', () => {
  const book={Lote:[['Persona','Familia','Documento local','Contacto seguro'],['Ana','Pérez','11111111-1','ana@example.test']],
    Otro:[['Nombre alternativo','Apellido alternativo','ID alternativo'],['Luis','Soto','11111112-K']]};
  const config={year:2027,columnMapping:{names:'Persona',surname:'Familia',identifier:'Documento local',contactEmail:'Contacto seguro'},
    sheetMappings:{Lote:{courseName:'2º basico'},Otro:{courseName:'KINDER',columnMapping:{names:'Nombre alternativo',surname:'Apellido alternativo',identifier:'ID alternativo',contactEmail:''}}},contactOwner:'student'};
  const result=normalizeSchoolWorkbook(book,config);
  assert.equal(result.errors.length,0);
  assert.deepEqual(result.rows.map(row=>row.courseName),['2° Básico','Kínder']);
  assert.equal(result.rows[0].data.email,'ana@example.test');
  assert.equal(result.rows[0].data.guardianEmail,undefined);
  const shifted=normalizeSchoolWorkbook({Lote:[['Título'],...book.Lote]},{...config,sheetMappings:{Lote:config.sheetMappings.Lote}});
  assert.equal(result.rows[0].originId,shifted.rows[0].originId);
  assert.equal(shifted.rows[0].rowNumber,3);
});

test('informa hojas desconocidas y exige excluirlas explícitamente; no usa primera hoja como Usuarios', () => {
  const book={Notas:[['Texto ajeno'],['Nota de prueba']], '1° Básico':[courseHeaders,courseStudent()]};
  const initial=normalizeSchoolWorkbook(book,{year:2026});
  assert.ok(initial.errors.some(issue=>issue.code==='HOJA_NO_RECONOCIDA'&&issue.sheet==='Notas'));
  assert.equal(initial.rows.length,1);
  const chosen=normalizeSchoolWorkbook(book,{year:2026,sheetMappings:{Notas:{include:false}}});
  assert.equal(chosen.errors.length,0);
  assert.equal(chosen.sheetSummaries[0].included,false);
  assert.ok(chosen.ignored.some(issue=>issue.code==='HOJA_EXCLUIDA'));
});

test('bloquea RUN inválido, provisionales y duplicado entre hojas sin filtrar el documento en errores', () => {
  const run='11111111-1';
  const result=normalizeSchoolWorkbook({'1° Básico':[courseHeaders,courseStudent(run)],'2° Básico':[courseHeaders,courseStudent(run),courseStudent('11111111-0')]},{year:2026});
  assert.equal(result.rows.length,1);
  assert.ok(result.errors.some(issue=>issue.code==='RUT_INVALIDO'&&issue.row===3));
  const duplicate=result.errors.find(issue=>issue.code==='DUPLICADO_IDENTIDAD');
  assert.equal(duplicate.sheet,'2° Básico');assert.equal(duplicate.firstSheet,'1° Básico');assert.equal(duplicate.firstRow,2);
  assert.ok(!JSON.stringify(result.errors).includes(run));
  const provisional=normalizeSchoolWorkbook({Lote:[['Nombre','Familia','Documento','Tipo'],['Ana','Pérez','PENDIENTE','Provisional']]},{columnMapping:{names:'Nombre',surname:'Familia',identifier:'Documento',identifierType:'Tipo'}});
  assert.equal(provisional.rows.length,0);
  assert.ok(provisional.errors.some(issue=>issue.code==='RUT_INVALIDO'));
});

test('admite otro documento solo con tipo explícito y rechaza mappings hacia credenciales', () => {
  const book={Lote:[['Persona','Familia','Documento','Tipo','Contraseña'],['Ana','Pérez','ABC-FICTICIO','Pasaporte','NO-PERSISTIR']]};
  const options={columnMapping:{names:'Persona',surname:'Familia',identifier:'Documento',identifierType:'Tipo'}};
  const good=normalizeSchoolWorkbook(book,options);
  assert.equal(good.rows[0].data.identifierType,'Pasaporte');
  assert.ok(!JSON.stringify(good).includes('NO-PERSISTIR'));
  assert.ok(!good.sheetSummaries[0].headers.includes('Contraseña'));
  const bad=normalizeSchoolWorkbook(book,{columnMapping:{...options.columnMapping,contactEmail:'Contraseña'}});
  assert.ok(bad.errors.some(issue=>issue.code==='MAPEO_COLUMNA_INVALIDO'));
  assert.ok(!JSON.stringify(bad).includes('NO-PERSISTIR'));
  const access=normalizeSchoolWorkbook({Lote:[['Persona','Familia','Documento','Contraseña temporal','Clave de acceso'],['Ana','Pérez','11111111-1','SECRETO-UNO','SECRETO-DOS']]},{columnMapping:{names:'Persona',surname:'Familia',identifier:'Documento'}});
  assert.ok(!JSON.stringify(access).includes('SECRETO-'));
  assert.ok(!access.sheetSummaries[0].headers.some(header=>/Contraseña|Clave/.test(header)));
});

test('el límite cuenta todas las hojas y filas inválidas e impide un lote parcial', () => {
  const result=normalizeSchoolWorkbook({'1° Básico':[courseHeaders,courseStudent()],'2° Básico':[courseHeaders,courseStudent('11111112-K'),courseStudent('inválido')]},{maxRows:2});
  assert.ok(result.errors.some(issue=>issue.code==='LIMITE_FILAS'));
  assert.equal(result.sheetSummaries.reduce((sum,sheet)=>sum+sheet.studentRows,0),3);
  assert.equal(result.canImport,false);
});

test('mezclas Usuarios/por curso requieren selección y hojas administrativas auxiliares no duplican', () => {
  const book={Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos'],['ERP-1','Ana','Pérez']],
    '1° Básico':[courseHeaders,courseStudent()],
    Estudiantes:[['ID interno','Estudiante','Documento completo'],['ERP-1','Ana Pérez','11111111-1']]};
  const mixed=normalizeSchoolWorkbook(book);
  assert.ok(mixed.errors.some(issue=>issue.code==='FORMATOS_MEZCLADOS'));
  assert.ok(mixed.ignored.some(issue=>issue.code==='HOJA_AUXILIAR'));
  const selected=normalizeSchoolWorkbook(book,{sheetMappings:{Usuarios:{include:false},Estudiantes:{include:false}}});
  assert.equal(selected.rows.length,1);assert.equal(selected.errors.length,0);
});

test('normaliza fecha serial, RUT y errores de identidad sin nombres', () => {
  assert.equal(normalizeDate(43160), '2018-03-01');
  assert.deepEqual(normalizeRutAndDv('11.111.111-1'), { rut: '11111111', dv: '1' });
  assert.equal(validateRut('11111111', '1'), true);
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Rol'],
    ['', '11111111', '1', '', 'Estudiante']
  ] });
  assert.ok(result.errors.some((error) => error.code === 'NOMBRES_AUSENTES'));
});

test('marca cursos que no pueden resolverse en la configuración recibida', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'Nombres', 'Apellidos', 'Curso', 'Rol'],
    ['erp-1', 'Alex', 'Gómez', '3° Básico', 'Estudiante']
  ] }, { year: 2026, courses: [{ id: 'course-1', name: '1° Básico', year: 2026 }] });
  assert.deepEqual(result.unresolvedCourses, [{ key: '3basico|2026', name: '3° Básico', year: 2026 }]);
  assert.equal(result.errors[0].code, 'CURSO_NO_RESUELTO');
  assert.equal(result.canImport, false);
});

// A school year is import provenance, never inferred from birth dates or identifiers.
test('el año explícito de matrícula del archivo prevalece y resuelve el curso de ese año',()=>{
  for(const header of ['Año','Periodo','Año escolar','Año matrícula','Matrícula']){
    const result=normalizeSchoolWorkbook({'1° Básico':[[...courseHeaders,header],[...courseStudent(),2019]]},{year:2026,courses:[{id:'curso-actual',name:'1° Básico',year:2026},{id:'curso-historico',name:'1° Básico',year:2019}]});
    assert.equal(result.errors.length,0,header);
    assert.equal(result.yearContext.selectedYear,2026,header);assert.deepEqual(result.yearContext.sourceYears,[2019],header);
    assert.equal(result.yearContext.resolvedYear,2019,header);assert.equal(result.yearContext.source,'file',header);assert.equal(result.yearContext.conflict,true,header);assert.ok(result.warnings.some(warning=>warning.code==='IMPORT_YEAR_CHANGED'),header);
    assert.equal(result.rows[0].courseYear,2019,header);assert.equal(result.rows[0].courseId,'curso-historico',header);
    assert.equal(result.rows[0].sourceYear,2019,header);assert.equal(Object.hasOwn(result.rows[0].data,'sourceYear'),false,header);
    assert.equal(result.rows[0].sourceSheet,'1° Básico');assert.equal(result.rows[0].rowNumber,2);
  }
});

test('títulos explícitos anteriores al encabezado conservan año, hoja y fila de origen',()=>{
  for(const title of ['Matrícula 2019','Año escolar 2019','Periodo 2019']){
    const result=normalizeSchoolWorkbook({'1° Básico':[[title],[],courseHeaders,courseStudent()]},{year:2026});
    assert.equal(result.errors.length,0,title);assert.equal(result.yearContext.resolvedYear,2019,title);
    assert.deepEqual(result.yearContext.sourceYears,[2019],title);assert.equal(result.yearContext.source,'file',title);
    assert.equal(result.rows[0].sourceYear,2019,title);assert.equal(result.rows[0].courseYear,2019,title);
    assert.equal(result.rows[0].rowNumber,4,title);assert.equal(result.rows[0].data.sourceRow,'4',title);
  }
});

test('mezclar años de matrícula de estudiantes bloquea el lote completo',()=>{
  const result=normalizeSchoolWorkbook({'1° Básico':[[...courseHeaders,'Año escolar'],[...courseStudent(),2019],[...courseStudent('11111112-K'),2020]]},{year:2026});
  assert.equal(result.canImport,false);assert.ok(result.errors.some(error=>error.code==='IMPORT_YEARS_MIXED'));
  assert.deepEqual(result.yearContext.sourceYears,[2019,2020]);assert.equal(result.yearContext.resolvedYear,null);assert.equal(result.yearContext.conflict,true);
});

test('año de nacimiento, identificación, nombre del archivo y encabezados parecidos no cambian el período',()=>{
  const result=normalizeSchoolWorkbook({'1° Básico':[['Nacimiento 2018'],[...courseHeaders,'Fecha Nacimiento','Año nacimiento','Periodo de pago'],[...courseStudent(),'01/03/2018',2018,2019]]},{year:2026,fileName:'matricula-2019.xlsx'});
  assert.equal(result.errors.length,0);assert.equal(result.yearContext.resolvedYear,2026);assert.equal(result.yearContext.source,'selection');
  assert.deepEqual(result.yearContext.sourceYears,[]);assert.equal(result.rows[0].courseYear,2026);assert.ok(result.rows[0].sourceYear==null);
});

test('docentes, hojas excluidas y hojas administrativas auxiliares no aportan el año del lote',()=>{
  const result=normalizeSchoolWorkbook({
    Usuarios:[['ID de Usuario (no modificar)','Nombres','Apellidos','Rol','Curso','Año'],['docente-2018','Docente ficticio','No importar','Docente','1° Básico',2018],['alumno-2019','Alumno ficticio','Importable','Estudiante','1° Básico',2019]],
    '2° Básico':[['Matrícula 2020'],courseHeaders,courseStudent('11111112-K')],
    'Padrón administrativo':[['ID interno','Estudiante','Curso','Identificador principal','Documento completo','País','Periodo'],['aux-2021','Auxiliar ficticio','3° Básico','RUN chileno','11111111-1','CL',2021]]
  },{year:2026,sheetMappings:{'2° Básico':{include:false}}});
  assert.equal(result.errors.length,0);assert.equal(result.rows.length,1);assert.equal(result.rows[0].originId,'alumno-2019');
  assert.deepEqual(result.yearContext.sourceYears,[2019]);assert.equal(result.yearContext.resolvedYear,2019);assert.equal(result.rows[0].courseYear,2019);
  assert.ok(result.ignored.some(issue=>issue.code==='ROL_IGNORADO'));assert.ok(result.ignored.some(issue=>issue.code==='HOJA_EXCLUIDA'));assert.ok(result.ignored.some(issue=>issue.code==='HOJA_AUXILIAR'));
});

test('una fuente explícita inválida no se sustituye silenciosamente por la selección',()=>{
  for(const invalid of [1949,2101,'2019/2020','Periodo 2019']){
    const result=normalizeSchoolWorkbook({'1° Básico':[[...courseHeaders,'Año escolar'],[...courseStudent(),invalid]]},{year:2026});
    assert.equal(result.canImport,false,String(invalid));assert.ok(result.errors.some(error=>error.code==='IMPORT_YEAR_INVALID'),String(invalid));
  }
});

test('sin fuente de año conserva tanto la selección explícita como la ausencia de año del parser',()=>{
  const book={'1° Básico':[courseHeaders,courseStudent()]};
  const chosen=normalizeSchoolWorkbook(book,{year:2035});
  assert.equal(chosen.yearContext.selectedYear,2035);assert.equal(chosen.yearContext.resolvedYear,2035);assert.equal(chosen.yearContext.source,'selection');assert.deepEqual(chosen.yearContext.sourceYears,[]);
  const unselected=normalizeSchoolWorkbook(book);
  assert.equal(unselected.yearContext.selectedYear,null);assert.equal(unselected.yearContext.resolvedYear,null);assert.equal(unselected.rows[0].courseYear,null);assert.equal(unselected.errors.length,0);
});

test('fuentes de período admiten texto de cuatro dígitos y los límites históricos configurados',()=>{
  for(const sourceYear of [1950,'2019',2100]){
    const result=normalizeSchoolWorkbook({'1° Básico':[[...courseHeaders,'Año escolar'],[...courseStudent(),sourceYear]]},{year:2026});
    assert.equal(result.errors.length,0,String(sourceYear));assert.equal(result.yearContext.resolvedYear,Number(sourceYear));assert.equal(result.rows[0].sourceYear,Number(sourceYear));assert.equal(result.rows[0].courseYear,Number(sourceYear));
  }
});

test('títulos con identificadores o períodos ajenos no adivinan el año y los rangos declarados se rechazan',()=>{
  for(const title of ['Número matrícula 2019','ID matrícula 2019','Periodo de pago 2019','Código IPE 2019']){
    const result=normalizeSchoolWorkbook({'1° Básico':[[title],courseHeaders,courseStudent()]},{year:2026});
    assert.equal(result.errors.length,0,title);assert.equal(result.yearContext.resolvedYear,2026,title);assert.equal(result.yearContext.source,'selection',title);
  }
  for(const title of ['Matrícula 2019/2020','Año escolar 1949','Periodo 2101']){
    const result=normalizeSchoolWorkbook({'1° Básico':[[title],courseHeaders,courseStudent()]},{year:2026});
    assert.equal(result.canImport,false,title);assert.equal(result.yearContext.resolvedYear,null,title);assert.ok(result.errors.some(error=>error.code==='IMPORT_YEAR_INVALID'),title);
  }
});
