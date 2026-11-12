import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script=readFileSync(new URL('../public/import-observations.js',import.meta.url),'utf8');
function helpers(browser={}) {
  const window={};
  runInNewContext(script,{window,...browser});
  return window.EnrollmentImportObservations;
}

test('exporta las observaciones de todas las páginas y consolida las filas sin curso por hoja',()=>{
  const {format}=helpers();
  const errors=Array.from({length:41},(_,index)=>({sheet:'PRE-KINDER',row:index+2,code:'RUT_INVALIDO',reason:'possibleIpe'}));
  errors.push(
    {sheet:'1° Básico B',row:18,code:'DUPLICADO_IDENTIDAD',firstSheet:'PRE-KINDER',firstRow:3},
    ...[5,2,4,3,9].map(row=>({sheet:'1° Básico B',row,code:'CURSO_NO_RESUELTO'})),
    {sheet:'PRE-KINDER',row:43,code:'CURSO_NO_RESUELTO'}
  );
  const result=format({year:2026,errors,sheetSummaries:[{name:'PRE-KINDER'},{name:'1° Básico B'}],coursesToCreate:[{name:'1° Básico B',count:5},{name:'PRE-KINDER',count:1}]});
  assert.match(result,/Observaciones por resolver: 42/);
  assert.match(result,/Hoja 1 \(Prekínder\), fila 42: Posible IPE/);
  assert.match(result,/Hoja 2 \(1° Básico B\), fila 18: Identificación repetida\..*Primera aparición: Hoja 1 \(Prekínder\), fila 3/);
  assert.match(result,/Filas que necesitan curso de destino: 6/);
  assert.match(result,/Hoja 2 \(1° Básico B\): filas 2–5, 9/);
  assert.match(result,/Hoja 1 \(Prekínder\): filas 43/);
  assert.match(result,/Cursos propuestos para revisión: 2/);
  assert.match(result,/Propuesta 1 \(1° Básico B\): 5 filas/);
  assert.match(result,/Propuesta 2 \(Prekínder\): 1 fila/);
});

test('el archivo de revisión no reproduce identificaciones, mensajes, títulos libres ni controles invisibles',()=>{
  const {format}=helpers();
  const suspicious='=ALUMNA TEST\r\n+OCULTO\u202e\u0000';
  const result=format({
    fileName:'RESERVADO.xlsx', year:'2026\nprivado', rows:[{studentName:'PERSONA PRIVADA',run:'11111111-K'}],
    sheetSummaries:[{name:suspicious}],
    errors:[
      {sheet:suspicious,row:2,code:'DUPLICADO_IDENTIDAD',firstSheet:suspicious,firstRow:3,message:'IDENTIFICADOR PRIVADO 11111111-K'},
      {sheet:suspicious,row:4,code:'__proto__',reason:'__proto__',message:'Instrucción no confiable'},
      {sheet:suspicious,row:90000000,code:'CURSO_NO_RESUELTO'}
    ],
    coursesToCreate:[{name:'1° Básico B: CORREO PRIVADO',count:2}]
  });
  assert.match(result,/Hoja 1, fila 2.*Primera aparición: Hoja 1, fila 3/);
  assert.match(result,/Hoja 1, fila 4: Otra observación/);
  assert.match(result,/Hoja 1: 1 sin número de fila/);
  assert.match(result,/Propuesta 1: 2 filas/);
  assert.doesNotMatch(result,/OCULTO|ALUMNA|RESERVADO|PRIVAD|11111111|90000000|__proto__|Instrucción no confiable|2026|[\u202e\u0000]/);
  assert.doesNotMatch(result,/^[=+]/m);
});

test('descarga texto UTF-8 con nombre fijo y no genera un archivo si no hay observaciones',async()=>{
  let blob,appended,clicked=false,removed=false,revoked;
  const {download,hasDiagnostics}=helpers({
    Blob,
    URL:{createObjectURL:value=>{blob=value;return 'blob:observaciones';},revokeObjectURL:value=>{revoked=value;}},
    document:{body:{append:link=>{appended=link;}},createElement:tag=>{assert.equal(tag,'a');return {click:()=>{clicked=true;},remove:()=>{removed=true;}};}},
    setTimeout:callback=>callback()
  });
  assert.equal(hasDiagnostics({errors:[],coursesToCreate:[]}),false);
  assert.equal(download({fileName:'Documento privado.xlsx',errors:[]}),false);
  assert.equal(blob,undefined);
  const preview={fileName:'Documento privado.xlsx',year:2026,errors:[{code:'LIMITE_FILAS'}]};
  assert.equal(hasDiagnostics(preview),true);
  assert.equal(download(preview),true);
  assert.equal(appended.download,'observaciones-matricula-2026.txt');
  assert.equal(appended.href,'blob:observaciones');
  assert.ok(clicked&&removed);
  assert.equal(revoked,'blob:observaciones');
  assert.equal(blob.type,'text/plain;charset=utf-8');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf]);
  assert.match(new TextDecoder().decode(bytes),/Revisión general: Reducir la cantidad de filas por revisión/);
});
