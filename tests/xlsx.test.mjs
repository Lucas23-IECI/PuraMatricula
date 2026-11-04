import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSchoolWorkbook,readXlsx} from '../src/school-import.mjs';
test('lee un XLSX real Usuarios con read-excel-file 9 y descarta contraseñas',async()=>{
 const result=await parseSchoolWorkbook(readFileSync(new URL('./fixtures/usuarios-sinteticos.xlsx',import.meta.url)),{year:2026});
 assert.equal(result.rows.length,3);
 assert.equal(result.rows[0].originId,'UI-SYNTH-1');
 assert.equal(result.rows[0].data.birthDate,'2012-05-10');
 assert.equal(result.rows[0].section,'Z');
 assert.equal(result.errors.length,0);
 assert(!JSON.stringify(result).includes('DESCARTAR'));
 assert.equal(result.sheetSummaries[0].name,'Usuarios');
 assert.equal(result.sheetSummaries[0].format,'usuarios');
});

test('un filtro XLSX sin coincidencia no convierte la primera hoja en Usuarios',async()=>{
 const result=await readXlsx(readFileSync(new URL('./fixtures/usuarios-sinteticos.xlsx',import.meta.url)),{sheets:['Hoja inexistente']});
 assert.deepEqual(result,{});
});

test('lee las catorce hojas del padrón XLSX sintético y conserva la fila física',async()=>{
 const input=readFileSync(new URL('./fixtures/matricula-por-cursos-sintetica.xlsx',import.meta.url));
 const result=await parseSchoolWorkbook(input,{year:2027,contactOwner:'guardian',addressOwner:'student'});
 assert.equal(result.sheets.length,14);
 assert.equal(result.sheetSummaries.length,14);
 assert.equal(result.rows.length,14);
 assert.equal(result.errors.length,0);
 assert.equal(result.canImport,true);
 assert.ok(result.sheetSummaries.every(sheet=>sheet.format==='por_curso'&&sheet.studentRows===1));
 assert.ok(result.rows.every(row=>row.rowNumber===3&&row.data.sourceRow==='3'&&row.courseYear===2027&&row.section===null));
 assert.equal(result.rows[0].courseName,'Prekínder');
 assert.equal(result.rows[1].courseName,'Kínder');
 assert.equal(result.rows.at(-1).courseName,'4° Medio');
 assert.equal(result.rows[0].data.guardianPhone,result.rows[0].data.sourceContactPhone);
 assert.equal(result.rows[0].data.address,result.rows[0].data.sourceAddress);
 assert.equal(result.rows[0].data.commune,result.rows[0].data.sourceCommune);
});
