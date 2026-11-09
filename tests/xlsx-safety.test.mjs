import test from 'node:test';
import {syntheticWorkbook} from './helpers/school-fixtures.mjs';
import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';
import { zipSync, strToU8 } from 'fflate';
import { assertSafeXlsx, XlsxSafetyError, XLSX_LIMITS } from '../src/xlsx-safety.mjs';

// Independent ZIP writer for deliberately inconsistent headers/descriptors.
// Payloads are synthetic in-memory bytes; no server or school database is used.
function archive(entries, { comment = '', centralFilter = () => true } = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data || ''), method = entry.method ?? 8;
    const compressed = entry.compressed || (method === 0 ? data : deflateRawSync(data));
    const checksum = entry.checksum ?? crc32(data), expanded = entry.expanded ?? data.length;
    const flags = entry.flags ?? (entry.descriptor ? 8 : 0), extra = entry.extra || Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);
    if (!entry.descriptor) { local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(expanded,22); }
    local.writeUInt16LE(name.length,26);local.writeUInt16LE(extra.length,28);
    const descriptor = entry.descriptor ? Buffer.alloc(entry.descriptor === 'signature' ? 16 : 12) : Buffer.alloc(0);
    if (entry.descriptor) {
      const start = descriptor.length === 16 ? 4 : 0;
      if (start) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(checksum,start);descriptor.writeUInt32LE(compressed.length,start+4);descriptor.writeUInt32LE(expanded,start+8);
    }
    locals.push(local,name,extra,compressed,descriptor);
    if (centralFilter(entry)) {
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);
      central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(expanded,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(extra.length,30);
      central.writeUInt32LE(entry.attributes || 0,38);central.writeUInt32LE(offset,42);
      centrals.push(central,name,extra);
    }
    offset += local.length + name.length + extra.length + compressed.length + descriptor.length;
  }
  const directory = Buffer.concat(centrals), note = Buffer.from(comment), end = Buffer.alloc(22);
  const count = entries.filter(centralFilter).length;
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(note.length,20);
  return Buffer.concat([...locals,directory,end,note]);
}
const basic = () => archive([{ name:'xl/worksheets/sheet1.xml', data:'<worksheet/>' }]);
const centralAt = bytes => bytes.readUInt32LE(bytes.length - 6);
const rejects = (bytes, code) => assert.throws(() => assertSafeXlsx(bytes), error => error instanceof XlsxSafetyError && error.status === 400 && (!code || error.code === code));

test('accepts the three generated synthetic school-workbook formats',()=>{
  for (const name of ['usuarios-sinteticos.xlsx','matricula-por-cursos-sintetica.xlsx','columnas-flexibles-sinteticas.xlsx']) {
    const bytes=syntheticWorkbook(name), result=assertSafeXlsx(bytes);
    assert.ok(result.entries>0,name);assert.equal(result.compressedBytes,bytes.length);assert.ok(result.expandedBytes>0);
  }
});

test('accepts a synthetic 14-sheet, 500-row workload produced by fflate',()=>{
  const parts={};let count=0;
  for(let sheet=0;sheet<14;sheet++) {
    const rows=sheet<10?36:35;
    parts['xl/worksheets/sheet'+(sheet+1)+'.xml']=strToU8('<worksheet><sheetData>'+Array.from({length:rows},(_,row)=>'<row r="'+(row+1)+'"><c r="A'+(row+1)+'" t="inlineStr"><is><t>Estudiante sintético '+(++count)+'</t></is></c></row>').join('')+'</sheetData></worksheet>');
  }
  const bytes=Buffer.from(zipSync(parts)),result=assertSafeXlsx(bytes);assert.equal(count,500);assert.equal(result.entries,14);
});

test('accepts stored/deflated entries, directory entries and a ZIP comment',()=>{
  const bytes=archive([{name:'xl/',data:'',method:0},{name:'xl/workbook.xml',data:'<workbook/>',method:0},{name:'xl/worksheets/sheet1.xml',data:'<worksheet/>'}],{comment:'synthetic fixture'});
  assert.equal(assertSafeXlsx(bytes).entries,3);
  const padded=Buffer.concat([Buffer.from('prefix'),bytes,Buffer.from('suffix')]);
  assert.equal(assertSafeXlsx(new Uint8Array(padded.buffer,padded.byteOffset+6,bytes.length)).entries,3);
});

test('accepts streaming data descriptors with and without their signature',()=>{
  for(const descriptor of ['signature','plain'])assert.equal(assertSafeXlsx(archive([{name:'xl/workbook.xml',data:'<workbook/>',descriptor}])).entries,1);
});

test('rejects path strings, objects, arrays, empty or oversized input with safe errors',()=>{
  for(const value of ['C:/private.xlsx',null,{},[],new ArrayBuffer(5)])rejects(value,'XLSX_INPUT_INVALID');
  rejects(Buffer.alloc(0),'XLSX_INVALID_ZIP');rejects(Buffer.alloc(XLSX_LIMITS.compressedBytes+1),'XLSX_SIZE_LIMIT');
});

test('rejects malformed directory bounds, truncation and bytes after EOCD',()=>{
  const bytes=basic();rejects(bytes.subarray(0,bytes.length-3));rejects(Buffer.concat([bytes,Buffer.from('trailing')]));
  const offset=Buffer.from(bytes);offset.writeUInt32LE(0xffffffff,offset.length-6);rejects(offset,'XLSX_UNSAFE_ZIP');
  const length=Buffer.from(bytes);length.writeUInt32LE(1,length.length-10);rejects(length,'XLSX_INVALID_ZIP');
});

test('rejects split archives and excessive entry counts before allocation',()=>{
  const disk=basic();disk.writeUInt16LE(1,disk.length-18);rejects(disk,'XLSX_UNSAFE_ZIP');
  const count=basic();count.writeUInt16LE(2049,count.length-14);count.writeUInt16LE(2049,count.length-12);rejects(count,'XLSX_SIZE_LIMIT');
});

test('rejects traversal, absolute paths, ambiguous segments and duplicate names',()=>{
  for(const name of ['../private.xml','/xl/workbook.xml','C:/file.xml','xl\\file.xml','xl//file.xml','xl/./file.xml','xl/../file.xml','xl/file.xml ','xl/file.xml.','xl/%2fprivate.xml','xl/\u0000.xml'])rejects(archive([{name,data:'x'}]),'XLSX_UNSAFE_ZIP');
  for(const names of [['xl/file.xml','xl/file.xml'],['xl/File.xml','xl/file.xml'],['xl','xl/']])rejects(archive(names.map(name=>({name,data:'x'}))),'XLSX_UNSAFE_ZIP');
});

test('rejects encryption, unsupported methods, symlinks and ZIP64 extras',()=>{
  for(const flags of [1,64,8192])rejects(archive([{name:'xl/file.xml',data:'x',flags}]),'XLSX_UNSAFE_ZIP');
  rejects(archive([{name:'xl/file.xml',data:'x',method:99}]),'XLSX_UNSAFE_ZIP');
  rejects(archive([{name:'xl/file.xml',data:'x',attributes:(0xa000<<16)>>>0}]),'XLSX_UNSAFE_ZIP');
  const extra=Buffer.alloc(4);extra.writeUInt16LE(1);rejects(archive([{name:'xl/file.xml',data:'x',extra}]),'XLSX_UNSAFE_ZIP');
  const zip64=basic();zip64.writeUInt32LE(0xffffffff,centralAt(zip64)+24);rejects(zip64,'XLSX_UNSAFE_ZIP');
});

test('rejects reported expanded sizes per entry and per archive',()=>{
  rejects(archive([{name:'xl/file.xml',data:'x',expanded:XLSX_LIMITS.entryBytes+1}]),'XLSX_SIZE_LIMIT');
  rejects(archive(Array.from({length:5},(_,i)=>({name:'xl/file'+i+'.xml',data:'x',expanded:7*1024*1024}))),'XLSX_SIZE_LIMIT');
});

test('bounds actual inflation even when both ZIP headers lie about expanded size',()=>{
  const bytes=archive([{name:'xl/worksheets/sheet1.xml',data:Buffer.alloc(XLSX_LIMITS.entryBytes+1,65),expanded:1}]);
  assert.ok(bytes.length<12000,'The bounded bomb fixture must stay tiny');rejects(bytes,'XLSX_SIZE_LIMIT');
});

test('rejects forged small sizes and CRC without trusting matching ZIP metadata',()=>{
  rejects(archive([{name:'xl/file.xml',data:'real content',expanded:1}]),'XLSX_INTEGRITY');
  rejects(archive([{name:'xl/file.xml',data:'real content',checksum:1}]),'XLSX_INTEGRITY');
  rejects(archive([{name:'xl/file.xml',data:'real content',expanded:1,method:0}]),'XLSX_INTEGRITY');
});

test('rejects mismatched local headers and truncated or inconsistent descriptors',()=>{
  const method=basic();method.writeUInt16LE(0,8);rejects(method,'XLSX_UNSAFE_ZIP');
  const name=basic();name[30]^=1;rejects(name,'XLSX_INTEGRITY');
  const checksum=basic();checksum.writeUInt32LE(0,14);rejects(checksum,'XLSX_INTEGRITY');
  const descriptor=archive([{name:'xl/file.xml',data:'x',descriptor:'signature'}]);
  descriptor.writeUInt32LE(99,centralAt(descriptor)-4);rejects(descriptor,'XLSX_INTEGRITY');
});

test('rejects unlisted local entries, overlapping offsets and compressed trailing junk',()=>{
  const entries=[{name:'xl/one.xml',data:'one'},{name:'xl/two.xml',data:'two'}];
  rejects(archive(entries,{centralFilter:entry=>entry.name.includes('one')}),'XLSX_INVALID_ZIP');
  const overlap=archive(entries),first=centralAt(overlap),second=first+46+Buffer.byteLength(entries[0].name);overlap.writeUInt32LE(0,second+42);rejects(overlap);
  const content=Buffer.from('valid content'),compressed=Buffer.concat([deflateRawSync(content),Buffer.from('extra')]);
  rejects(archive([{name:'xl/file.xml',data:content,compressed}]),'XLSX_INTEGRITY');
});

const sheet = xml => archive([{name:'xl/worksheets/sheet1.xml',data:xml}]);

test('rejects sparse row/cell coordinates before the workbook reader allocates gaps',()=>{
  for(const xml of [
    '<worksheet><sheetData><row r="10001"/></sheetData></worksheet>',
    '<worksheet><sheetData><row><c r="A1000000000"><v>1</v></c></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="XFD1"><v>1</v></c></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="10000"/><row/></sheetData></worksheet>',
  ]) rejects(sheet(xml),'XLSX_GRID_LIMIT');
});

test('counts the dense grid implied by gaps across worksheets',()=>{
  const wide='<worksheet><sheetData><row r="2000"><c r="GR2000"><v>1</v></c></row></sheetData></worksheet>'; // GR = 200 columns.
  assert.doesNotThrow(()=>assertSafeXlsx(sheet(wide)));
  rejects(archive([{name:'xl/worksheets/sheet1.xml',data:wide},{name:'xl/worksheets/sheet2.xml',data:wide}]),'XLSX_GRID_LIMIT');
});

test('decodes coordinate entities and handles quotes and namespace prefixes',()=>{
  const allowed='<?xml version="1.0"?><x:worksheet xmlns:x="urn:test"><x:sheetData><x:row r=\'&#x31;\'><x:c r=\'A&#49;\'><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>';
  assert.doesNotThrow(()=>assertSafeXlsx(sheet(allowed)));
  rejects(sheet('<x:worksheet xmlns:x="urn:test"><x:sheetData><x:row r="&#49;00000000"/></x:sheetData></x:worksheet>'),'XLSX_GRID_LIMIT');
  rejects(sheet('<worksheet><sheetData><row><c r="A&#x31;00000000"><v>1</v></c></row></sheetData></worksheet>'),'XLSX_GRID_LIMIT');
});

test('rejects DTD/entity declarations, ambiguous attributes and malformed XML',()=>{
  for(const xml of [
    '<!DOCTYPE worksheet [<!ENTITY x SYSTEM "file:///private">]><worksheet/>',
    '<!ENTITY x "value"><worksheet/>',
    '<worksheet><sheetData><row r="1" r="100000000"/></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1e9"/></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="A1e9"><v>1</v></c></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="&unknown;"/></sheetData></worksheet>',
    '<worksheet><sheetData><row r=1/></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"/></worksheet>',
    '<worksheet><sheetData><row r="1" x="unterminated></row></sheetData></worksheet>',
  ]) rejects(sheet(xml));
});

test('ignores comments and CDATA that only resemble coordinates or declarations',()=>{
  const xml='<worksheet><!-- <row r="1000000000"/> <!DOCTYPE worksheet> --><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t><![CDATA[<row r="9999999999"/>]]></t></is></c></row></sheetData></worksheet>';
  assert.doesNotThrow(()=>assertSafeXlsx(sheet(xml)));
});

test('rejects implicit excess rows and an excessive XML nesting depth',()=>{
  rejects(sheet('<worksheet><sheetData>'+'<row/>'.repeat(XLSX_LIMITS.rows+1)+'</sheetData></worksheet>'),'XLSX_GRID_LIMIT');
  rejects(sheet('<a>'.repeat(129)+'</a>'.repeat(129)),'XLSX_INVALID_ZIP');
});

test('bounds total XML element work even without cell coordinates',()=>{
  const xml='<worksheet>'+'<a/>'.repeat(XLSX_LIMITS.elements)+'</worksheet>';
  const bytes=sheet(xml);assert.ok(bytes.length<10000);rejects(bytes,'XLSX_SIZE_LIMIT');
});

test('also guards XML-looking contents without relying only on the ZIP part extension',()=>{
  const xml='<worksheet><sheetData><row r="1000000000"/></sheetData></worksheet>';
  rejects(archive([{name:'xl/worksheets/unusual.bin',data:xml}]),'XLSX_GRID_LIMIT');
  rejects(archive([{name:'xl/worksheets/unusual',data:Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(' \n'+xml)])}]),'XLSX_GRID_LIMIT');
  assert.doesNotThrow(()=>assertSafeXlsx(archive([{name:'xl/media/image.bin',data:Buffer.from([0xff,0xd8,0xff,0,1,2,3])}])));
});
