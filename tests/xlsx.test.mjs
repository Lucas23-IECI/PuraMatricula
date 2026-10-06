import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSchoolWorkbook} from '../src/school-import.mjs';
test('lee un XLSX real Usuarios con read-excel-file 9 y descarta contraseñas',async()=>{
 const result=await parseSchoolWorkbook(readFileSync(new URL('./fixtures/usuarios-sinteticos.xlsx',import.meta.url)),{year:2026});
 assert.equal(result.rows.length,3);
 assert.equal(result.rows[0].originId,'UI-SYNTH-1');
 assert.equal(result.rows[0].data.birthDate,'2012-05-10');
 assert.equal(result.rows[0].section,'Z');
 assert.equal(result.errors.length,0);
 assert(!JSON.stringify(result).includes('DESCARTAR'));
});
