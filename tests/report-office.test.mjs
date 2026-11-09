import assert from 'node:assert/strict';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import readExcel from 'read-excel-file/node';
import {makeDocx, makeXlsx} from '../src/report-office.mjs';

const openParts=bytes=>Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name,data])=>[name,strFromU8(data)]));

test('el XLSX permite leer todos los cursos, conserva identificadores y no ejecuta texto como fórmula',async()=>{
  const bytes=makeXlsx([
    {name:'1° Básico / A',headers:['Identificador','Nombres','Cantidad'],rows:[['00001234567890','Ficticio & <prueba> 😀',1],['=HYPERLINK("file:///c:","a")','  Espacios  ',0]]},
    {name:'1° básico : A',headers:['Identificador','Nombres','Cantidad'],rows:[['0012-K','Otra persona de prueba',2]]},
    {name:'History',headers:['Observaciones'],rows:[]},
  ]);
  assert(Buffer.isBuffer(bytes));
  const actual=await readExcel(bytes);
  assert.deepEqual(actual.map(({sheet})=>sheet),['1° Básico A','1° básico A (2)','History (2)']);
  assert.equal(actual[0].data[1][0],'00001234567890');
  assert.equal(actual[0].data[1][1],'Ficticio & <prueba> 😀');
  assert.equal(actual[0].data[1][2],1);
  assert.equal(actual[0].data[2][0],'=HYPERLINK("file:///c:","a")');
  assert.equal(actual[1].data[1][0],'0012-K');
  const parts=openParts(bytes);
  const sheet=parts['xl/worksheets/sheet1.xml'];
  assert.match(sheet,/<autoFilter ref="A1:C3"/);
  assert.match(sheet,/<pane ySplit="1" [^>]*state="frozen"/);
  assert.match(sheet,/<c r="A2" s="2" t="inlineStr">/);
  assert.doesNotMatch(sheet,/<f\b|<hyperlink\b/);
  assert.doesNotMatch(parts['xl/_rels/workbook.xml.rels'],/TargetMode="External"/);
});

test('el DOCX contiene cuerpo editable, secciones, texto escapado y líneas para firma',()=>{
  const bytes=makeDocx({
    title:'Ficha sintética < & >',subtitle:'Año 2026 · Borrador',note:'Copia editable',
    groups:[{title:'Identificación',rows:[['Nombre','Prueba & "curso"'],['Observación','Línea 1\nLínea 2\t dato \u0000 😀'],['Marcado','</w:t><w:fldSimple w:instr="x"/>']]}],
    signatures:['Funcionario/a'],
  });
  assert(Buffer.isBuffer(bytes));
  const parts=openParts(bytes);
  const document=parts['word/document.xml'];
  assert.match(parts['[Content_Types].xml'],/wordprocessingml\.document\.main\+xml/);
  assert.match(parts['_rels/.rels'],/Target="word\/document\.xml"/);
  assert.match(parts['word/_rels/document.xml.rels'],/Target="styles\.xml"/);
  assert.match(document,/Ficha sintética &lt; &amp; &gt;/);
  assert.match(document,/Año 2026 · Borrador/);
  assert.match(document,/<w:tblGrid><w:gridCol [^>]+\/><w:gridCol [^>]+\/><\/w:tblGrid>/);
  assert.match(document,/Prueba &amp; &quot;curso&quot;/);
  assert.match(document,/Línea 1<\/w:t><w:br\/><w:t xml:space="preserve">Línea 2<\/w:t><w:tab\/>/);
  assert.match(document,/dato � 😀/);
  assert.match(document,/&lt;\/w:t&gt;&lt;w:fldSimple/);
  assert.match(document,/Funcionario\/a/);
  assert.doesNotMatch(document,/<w:fldSimple|\u0000/);
  assert.doesNotMatch(Object.keys(parts).join(' '),/vba|externalLink/i);
});

test('los formatos rechazan dimensiones o valores incompatibles de forma explícita',()=>{
  assert.throws(()=>makeXlsx([]),/Cantidad de hojas/);
  assert.throws(()=>makeXlsx([{name:'Prueba',headers:['Una'],rows:[[1,2]]}]),/encabezados/);
  assert.throws(()=>makeXlsx([{name:'Prueba',headers:['Una'],rows:[[Infinity]]}]),/Número/);
  assert.throws(()=>makeXlsx([{name:'Prueba',headers:['Una'],rows:[['x'.repeat(32768)]]}]),/límite/);
  assert.throws(()=>makeDocx({title:'Prueba',groups:[{title:'Campos',rows:[['Sin valor']]}]}),/etiqueta y valor/);
});
