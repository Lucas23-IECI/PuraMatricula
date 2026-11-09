import { crc32, inflateRawSync } from 'node:zlib';

export const XLSX_LIMITS = Object.freeze({
  compressedBytes: 2 * 1024 * 1024,
  entryBytes: 8 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  entries: 2048,
  rows: 10000,
  columns: 256,
  cells: 500000,
  elements: 500000,
});

export class XlsxSafetyError extends Error {
  constructor(message, code = 'XLSX_INVALID_ZIP') {
    super(message);
    this.name = 'XlsxSafetyError';
    this.status = 400;
    this.code = code;
  }
}

const invalid = () => { throw new XlsxSafetyError('La estructura del archivo Excel está dañada o no es compatible. Vuelve a guardarlo como .xlsx.'); };
const unsafe = () => { throw new XlsxSafetyError('El archivo Excel contiene entradas no admitidas. Vuelve a guardarlo como .xlsx sin cifrado.', 'XLSX_UNSAFE_ZIP'); };
const tooLarge = () => { throw new XlsxSafetyError('El archivo Excel supera los límites de lectura segura. Divide la planilla en archivos más pequeños.', 'XLSX_SIZE_LIMIT'); };
const integrity = () => { throw new XlsxSafetyError('El contenido del archivo Excel no coincide con su estructura. Vuelve a guardarlo como .xlsx.', 'XLSX_INTEGRITY'); };
const sparse = () => { throw new XlsxSafetyError('La planilla ocupa demasiadas filas o columnas, incluso si están vacías. Guarda una copia limpia con solo el padrón y vuelve a cargarla.', 'XLSX_GRID_LIMIT'); };

function xmlAttribute(value) {
  return value.replace(/&([^;]*);|&/g, (match, entity) => {
    const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    let number;
    if (/^#[0-9]{1,7}$/.test(entity || '')) number = Number(entity.slice(1));
    else if (/^#x[0-9a-f]{1,6}$/i.test(entity || '')) number = parseInt(entity.slice(2), 16);
    else unsafe();
    if (!Number.isInteger(number) || number < 1 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) invalid();
    return String.fromCodePoint(number);
  });
}

/**
 * Restricted XML lexical preflight, not a replacement workbook parser. It
 * understands quoted attributes, entities, comments, CDATA and namespaces so
 * coordinates cannot hide from the check. DTDs/declarations are never allowed.
 * The reader materializes gaps between coordinates; byte limits alone would
 * still allow a tiny worksheet such as a single cell at XFD1048576 to exhaust
 * memory. Blank formatted tails must be removed from the source workbook.
 */
function checkXml(content, budget) {
  let xml;
  try { xml = new TextDecoder('utf-8', { fatal:true }).decode(content); } catch { invalid(); }
  const white = character => character === ' ' || character === '\t' || character === '\r' || character === '\n';
  const nameStart = character => character !== undefined && /[A-Za-z_]/.test(character);
  const namePart = character => character !== undefined && /[A-Za-z0-9_.:-]/.test(character);
  const localName = name => name.slice(name.lastIndexOf(':') + 1);
  let at = 0, seenData = false, previousRow = 0, row = null, explicitRow = false, rowHasCell = false, maxRow = 0, maxColumn = 0, estimated = 0;
  const stack = [];
  const grid = (rowNumber, column = 0) => {
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1 || rowNumber > XLSX_LIMITS.rows || column > XLSX_LIMITS.columns) sparse();
    maxRow = Math.max(maxRow, rowNumber);maxColumn = Math.max(maxColumn, column);
    const next = maxRow * Math.max(1, maxColumn);
    budget.gridCells += next - estimated;estimated = next;
    if (budget.gridCells > XLSX_LIMITS.cells) sparse();
  };
  const opening = (name, attributes) => {
    if (++budget.elements > XLSX_LIMITS.elements) tooLarge();
    const tag = localName(name);
    if (tag === 'sheetData') seenData = true;
    if (!seenData) return;
    if (tag === 'row') {
      if (row !== null) invalid();
      explicitRow = attributes.r !== undefined;rowHasCell = false;
      if (explicitRow && !/^[1-9][0-9]*$/.test(attributes.r)) invalid();
      row = explicitRow ? Number(attributes.r) : previousRow + 1;grid(row);
    } else if (tag === 'c') {
      if (row === null || typeof attributes.r !== 'string') invalid();
      const reference = /^([A-Z]{1,4})([1-9][0-9]*)$/.exec(attributes.r);
      if (!reference) invalid();
      let column = 0;
      for (const letter of reference[1]) column = column * 26 + letter.charCodeAt(0) - 64;
      const cellRow = Number(reference[2]);grid(cellRow, column);
      if (!explicitRow && !rowHasCell) row = cellRow;
      rowHasCell = true;
      if (++budget.cells > XLSX_LIMITS.cells) sparse();
    }
  };
  const closing = name => {
    if (seenData && localName(name) === 'row') {
      if (row === null || row <= previousRow) invalid();
      previousRow = row;row = null;
    }
  };
  const readName = () => {
    if (!nameStart(xml[at])) invalid();
    const start = at++;
    while (namePart(xml[at])) at++;
    const name = xml.slice(start, at);
    if (name.length > 512 || name.split(':').length > 2) invalid();
    return name;
  };
  while (at < xml.length) {
    const start = xml.indexOf('<', at);
    if (start < 0) break;
    at = start;
    if (xml.startsWith('<!--', at)) {
      const end = xml.indexOf('-->', at + 4);if (end < 0 || xml.slice(at + 4, end).includes('--')) invalid();at = end + 3;continue;
    }
    if (xml.startsWith('<![CDATA[', at)) {
      const end = xml.indexOf(']]>', at + 9);if (end < 0) invalid();at = end + 3;continue;
    }
    if (xml.startsWith('<!', at)) unsafe();
    if (xml.startsWith('<?', at)) {
      const end = xml.indexOf('?>', at + 2);if (end < 0) invalid();at = end + 2;continue;
    }
    at++;
    const close = xml[at] === '/';if (close) at++;
    const name = readName(), attributes = Object.create(null), rawAttributes = new Set();
    while (white(xml[at])) at++;
    if (close) {
      if (xml[at++] !== '>' || stack.pop() !== name) invalid();closing(name);continue;
    }
    let count = 0;
    while (xml[at] !== '>' && xml[at] !== '/') {
      if (++count > 256) invalid();
      const attribute = readName();if (rawAttributes.has(attribute)) invalid();rawAttributes.add(attribute);
      while (white(xml[at])) at++;
      if (xml[at++] !== '=') invalid();
      while (white(xml[at])) at++;
      const quote = xml[at++];if (quote !== '"' && quote !== "'") invalid();
      const end = xml.indexOf(quote, at);if (end < 0 || end - at > 65536 || xml.slice(at, end).includes('<')) invalid();
      const value = xmlAttribute(xml.slice(at, end)), local = localName(attribute);
      if (local === 'r') { if (attributes.r !== undefined) invalid();attributes.r = value; }
      at = end + 1;
      if (!white(xml[at]) && xml[at] !== '/' && xml[at] !== '>') invalid();
      while (white(xml[at])) at++;
    }
    const selfClosing = xml[at] === '/';if (selfClosing) at++;
    if (xml[at++] !== '>') invalid();
    opening(name, attributes);
    if (selfClosing) closing(name);
    else { stack.push(name);if (stack.length > 128) invalid(); }
  }
  if (stack.length) invalid();
}

function checkExtra(bytes, from, length) {
  const end = from + length;
  for (let at = from; at < end;) {
    if (at + 4 > end) invalid();
    const id = bytes.readUInt16LE(at), size = bytes.readUInt16LE(at + 2);
    if (id === 0x0001 || id === 0x9901) unsafe(); // ZIP64 and encrypted AES entries.
    at += 4 + size;
    if (at > end) invalid();
  }
}

function safeName(raw) {
  let name;
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { unsafe(); }
  if (!name || /[\\:\u0000-\u001f\u007f]/.test(name) || name.startsWith('/') || /%(?:2f|5c|00)/i.test(name)) unsafe();
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) unsafe();
  return name.normalize('NFC').toLowerCase().replace(/\/$/, '');
}

function findDirectory(bytes) {
  if (bytes.length < 22) invalid();
  const lower = Math.max(0, bytes.length - 22 - 65535);
  let at = bytes.length - 22;
  for (; at >= lower; at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) break;
  }
  if (at < lower) invalid();
  const disk = bytes.readUInt16LE(at + 4), directoryDisk = bytes.readUInt16LE(at + 6);
  const diskEntries = bytes.readUInt16LE(at + 8), count = bytes.readUInt16LE(at + 10);
  const length = bytes.readUInt32LE(at + 12), offset = bytes.readUInt32LE(at + 16);
  if (disk || directoryDisk || diskEntries !== count) unsafe();
  if (count === 0xffff || length === 0xffffffff || offset === 0xffffffff) unsafe();
  if (!count || count > XLSX_LIMITS.entries) tooLarge();
  if (offset + length !== at || offset < 30 || length < count * 46) invalid();
  return { count, offset, end: at };
}

function directoryEntries(bytes, directory) {
  const entries = [], names = new Set();
  let at = directory.offset, reportedTotal = 0;
  for (let index = 0; index < directory.count; index++) {
    if (at + 46 > directory.end || bytes.readUInt32LE(at) !== 0x02014b50) invalid();
    const version = bytes.readUInt16LE(at + 6), flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10);
    const checksum = bytes.readUInt32LE(at + 16), compressed = bytes.readUInt32LE(at + 20), expanded = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28), extraLength = bytes.readUInt16LE(at + 30), commentLength = bytes.readUInt16LE(at + 32);
    const disk = bytes.readUInt16LE(at + 34), attributes = bytes.readUInt32LE(at + 38), offset = bytes.readUInt32LE(at + 42);
    const end = at + 46 + nameLength + extraLength + commentLength;
    if (end > directory.end) invalid();
    if (version >= 45 || disk || (flags & 0x2041) || ![0, 8].includes(method)) unsafe();
    if ([compressed, expanded, offset].includes(0xffffffff)) unsafe();
    if (expanded > XLSX_LIMITS.entryBytes || (reportedTotal += expanded) > XLSX_LIMITS.expandedBytes) tooLarge();
    if (((attributes >>> 16) & 0xf000) === 0xa000) unsafe(); // No symbolic links.
    const rawName = bytes.subarray(at + 46, at + 46 + nameLength), name = safeName(rawName);
    if (names.has(name)) unsafe();
    names.add(name);
    checkExtra(bytes, at + 46 + nameLength, extraLength);
    entries.push({ name, rawName, flags, method, checksum, compressed, expanded, offset });
    at = end;
  }
  if (at !== directory.end) invalid();
  return entries;
}

function entryRange(bytes, entry, directoryOffset) {
  const at = entry.offset;
  if (at + 30 > directoryOffset || bytes.readUInt32LE(at) !== 0x04034b50) invalid();
  const version = bytes.readUInt16LE(at + 4), flags = bytes.readUInt16LE(at + 6), method = bytes.readUInt16LE(at + 8);
  const checksum = bytes.readUInt32LE(at + 14), compressed = bytes.readUInt32LE(at + 18), expanded = bytes.readUInt32LE(at + 22);
  const nameLength = bytes.readUInt16LE(at + 26), extraLength = bytes.readUInt16LE(at + 28);
  const start = at + 30 + nameLength + extraLength, dataEnd = start + entry.compressed;
  if (start > directoryOffset || dataEnd > directoryOffset) invalid();
  if (version >= 45 || flags !== entry.flags || method !== entry.method) unsafe();
  if (!bytes.subarray(at + 30, at + 30 + nameLength).equals(entry.rawName)) integrity();
  checkExtra(bytes, at + 30 + nameLength, extraLength);
  const descriptor = Boolean(flags & 8);
  if (!descriptor && (checksum !== entry.checksum || compressed !== entry.compressed || expanded !== entry.expanded)) integrity();
  if (descriptor && ((checksum && checksum !== entry.checksum) || (compressed && compressed !== entry.compressed) || (expanded && expanded !== entry.expanded))) integrity();
  let end = dataEnd;
  if (descriptor) {
    if (end + 12 > directoryOffset) invalid();
    if (bytes.readUInt32LE(end) === 0x08074b50) end += 4;
    if (end + 12 > directoryOffset || bytes.readUInt32LE(end) !== entry.checksum || bytes.readUInt32LE(end + 4) !== entry.compressed || bytes.readUInt32LE(end + 8) !== entry.expanded) integrity();
    end += 12;
  }
  return { start, dataEnd, end };
}

/**
 * Validate an in-memory XLSX ZIP before the workbook reader allocates XML parts.
 * Central and local headers must agree. Every compressed entry is checked with
 * an actual bounded inflate and CRC; attacker-supplied lengths never allocate
 * output buffers. No archive entry is written to the filesystem.
 */
export function assertSafeXlsx(input) {
  if (!(input instanceof Uint8Array)) throw new XlsxSafetyError('Adjunta el contenido de un archivo .xlsx válido.', 'XLSX_INPUT_INVALID');
  if (input.byteLength > XLSX_LIMITS.compressedBytes) tooLarge();
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const directory = findDirectory(bytes), entries = directoryEntries(bytes, directory);
  const ordered = entries.map(entry => ({ entry, range: entryRange(bytes, entry, directory.offset) })).sort((a, b) => a.entry.offset - b.entry.offset);
  // A streaming ZIP reader sees local headers, not the central directory. Do
  // not let unlisted local entries, overlapping ranges or prefixes bypass it.
  let nextOffset = 0;
  for (const { entry, range } of ordered) {
    if (entry.offset !== nextOffset) invalid();
    nextOffset = range.end;
  }
  if (nextOffset !== directory.offset) invalid();
  let total = 0;
  const xmlBudget = { gridCells:0, cells:0, elements:0 };
  for (const { entry, range } of ordered) {
    const content = bytes.subarray(range.start, range.dataEnd);
    const budget = Math.min(XLSX_LIMITS.entryBytes, XLSX_LIMITS.expandedBytes - total);
    if (budget < 0) tooLarge();
    let output;
    if (entry.method === 0) {
      if (content.length > budget) tooLarge();
      output = content;
    } else {
      try {
        const inflated = inflateRawSync(content, { maxOutputLength: Math.max(1, budget), info: true });
        if (inflated.engine.bytesWritten !== content.length) integrity();
        output = inflated.buffer;
      } catch (error) {
        if (error instanceof XlsxSafetyError) throw error;
        if (error.code === 'ERR_BUFFER_TOO_LARGE') tooLarge();
        invalid();
      }
    }
    if (output.length > budget) tooLarge();
    if (output.length !== entry.expanded || crc32(output) !== entry.checksum) integrity();
    let first = output.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
    while ([9, 10, 13, 32].includes(output[first])) first++;
    if (entry.name.endsWith('.xml') || entry.name.endsWith('.rels') || output[first] === 60) checkXml(output, xmlBudget);
    total += output.length;
  }
  return { entries: entries.length, compressedBytes: bytes.length, expandedBytes: total };
}
