import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { parseSchoolWorkbook, normalizeSchoolWorkbook, normalizeHeader, normalizeCourseName, summarizeSchoolImport } from './school-import.mjs';
import { hasImportFields, sourceFields } from './import-fields.mjs';
import { normalizeIdentifier, validateIdentifier } from './fields.mjs';
import { parseSchoolYear } from './school-years.mjs';

const MAX_ROWS = 500;
const SOURCE = 'ERP_USUARIOS';
const UPDATE_FIELDS = Object.freeze(['studentPhone', 'email', 'address', 'commune', 'guardianPhone', 'guardianEmail', 'guardianAddress', 'guardianCommune']);

export class SchoolImportError extends Error {
  constructor(message, code = 'SCHOOL_IMPORT_INVALID', status = 400) {
    super(message); this.name = 'SchoolImportError'; this.code = code; this.status = status;
  }
}

const asText = value => value === null || value === undefined ? '' : String(value).trim();
const keyName = value => normalizeHeader(value || '');
const courseKey = value => keyName(normalizeCourseName(value || ''));
const unique = values => [...new Set(values.filter(Boolean))];

async function dbGet(store, sql, ...args) { return await store.db.prepare(sql).get(...args); }
async function dbAll(store, sql, ...args) { return await store.db.prepare(sql).all(...args); }
async function dbRun(store, sql, ...args) { return await store.db.prepare(sql).run(...args); }

async function auditInTransaction(store, actor, action, target, detail = {}) {
  if (!store?.db?.prepare || !store?.mac) return;
  const at = new Date().toISOString();
  const text = JSON.stringify(detail);
  const previous = (await dbGet(store, 'SELECT hash FROM audit ORDER BY id DESC LIMIT 1'))?.hash || '';
  const hash = store.mac(JSON.stringify([actor, at, action, target, text, previous]));
  await dbRun(store, 'INSERT INTO audit(actor,at,action,target,detail,prev_hash,hash) VALUES(?,?,?,?,?,?,?)', actor, at, action, target, text, previous, hash);
}

// The historical local store exposes a synchronous transaction callback,
// while the cloud adapters expose an async one. Keep rollback atomic in both.
async function runTransaction(store, work) {
  if (store.kind === 'sqlite' || store.kind === 'postgres') return store.transaction(work);
  const probe = store.db.prepare('SELECT 1').get();
  if (probe && typeof probe.then === 'function') return store.transaction(work);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const value = await work();
    store.db.exec('COMMIT');
    return value;
  } catch (error) {
    try { store.db.exec('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  }
}

function requirePermission(svc, user, permission, courseId) {
  if (svc?.requirePermission) return svc.requirePermission(user, permission, courseId);
  if (!user?.permissions?.includes(permission)) throw new SchoolImportError('La cuenta no tiene permiso para importar el padrón.', 'PERMISSION_DENIED', 403);
  if (courseId && !user.allCourses && !user.courses?.includes(courseId)) throw new SchoolImportError('La cuenta no tiene acceso al curso seleccionado.', 'COURSE_PERMISSION_DENIED', 403);
}

function can(svc, user, permission, courseId) {
  if (svc?.can) return Boolean(svc.can(user, permission, courseId));
  return Boolean(user?.permissions?.includes(permission) && (!courseId || user.allCourses || user.courses?.includes(courseId)));
}

function availableCoursesFromInput(input) {
  return Array.isArray(input?.courses) ? input.courses.map(course => ({ ...course, year: Number(course.year), key: keyName(course.name) })) : null;
}

async function availableCourses(store, input, year) {
  if (!store?.db?.prepare) return (availableCoursesFromInput(input) || []).filter(course=>course.year===Number(year)).map(course=>({...course,key:courseKey(course.name)}));
  return (await dbAll(store, 'SELECT id,name,year FROM courses WHERE year=? ORDER BY name', Number(year))).map(course => ({ ...course, key: courseKey(course.name) }));
}

function courseLabels(row) {
  const base = asText(row.courseName);
  const section = asText(row.section);
  if (!base) return [];
  const labels = [base];
  // Some ERP exports already put “A” in Curso. Avoid producing “A A”.
  if (section && !keyName(base).endsWith(keyName(section))) labels.push(`${base} ${section}`.trim());
  return unique(labels);
}

function sourceData(row) {
  const data = row.data || {};
  const result = {
    names: data.names || '', surname: data.surname || '', secondSurname: data.secondSurname || '',
    identifierType: data.identifierType || 'Otro', identifier: data.identifier || '', birthDate: data.birthDate || '',
    email: data.email || '', guardianIdentifier: data.guardianIdentifier || '',
    studentPhone: data.studentPhone ?? data.phone ?? data.telefono ?? '',
    sourceGender: data.sourceGender ?? data.gender ?? '', sourceBarcode: data.sourceBarcode || '',
    sourceCountry: data.sourceCountry ?? row.identity?.country ?? '', sourceIdentifierType: data.sourceIdentifierType ?? row.identity?.documentType ?? ''
  };
  for (const key of ['guardianName','guardianPhone','guardianEmail','guardianAddress','guardianCommune','address','commune','sourceSheet','sourceRow','sourceGuardianNames','sourceGuardianSurname','sourceGuardianSecondSurname','sourceContactPhone','sourceContactEmail','sourceAddress','sourceCommune']) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') result[key]=data[key];
  }
  return result;
}

function displayName(data) { return [data.names, data.surname, data.secondSurname].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }

function stableRows(rows) {
  return rows.map(row => ({
    rowNumber: row.rowNumber, sourceSheet:row.sourceSheet || '', origin: row.origin || SOURCE, originId: row.originId,
    courseId: row.courseId || null, courseName: row.courseName || '', section: row.section || '', year: Number(row.year || row.courseYear || 0), sourceYear: row.sourceYear ?? null,
    data: sourceData(row), review: row.review, ...(row.ipeConfirmed === true ? { ipeConfirmed: true } : {})
  }));
}

function ticketPayload(actor, templateId, year, rows, coursesToCreate) {
  return JSON.stringify({ purpose: 'school-roster-review-v2', actor, templateId, year: Number(year), rows: stableRows(rows), coursesToCreate: coursesToCreate.map(course => ({ name: course.name, year: Number(course.year) })) });
}

function courseTicketPayload(actor, year, coursesToCreate) {
  return JSON.stringify({ purpose: 'school-course-create-v1', actor, year: Number(year), coursesToCreate: coursesToCreate.map(course => ({ name: course.name, year: Number(course.year) })) });
}

function hashIdentity(store, data) {
  const token = data.identifierType === 'Provisional'
    ? `provisional:${data.identifier || ''}`
    : `${data.identifierType || 'Otro'}:${normalizeIdentifier(data.identifier)}`;
  return store?.mac ? store.mac(token) : token;
}

function templateMissingError() {
  return { row: 0, code: 'IMPORT_TEMPLATE_SOURCE_FIELDS_MISSING', message: `La plantilla vigente no contiene los campos de origen del ERP (${sourceFields.map(field => field.key).join(', ')}). Configure una nueva versión antes de importar.` };
}

async function loadTemplateFields(store) {
  if (!store?.db?.prepare) return null;
  const latest = await dbGet(store, 'SELECT * FROM templates ORDER BY id DESC LIMIT 1');
  if (!latest) return { error: templateMissingError(), fields: [] };
  let fields = [];
  try { fields = typeof latest.fields === 'string' ? JSON.parse(latest.fields) : latest.fields; } catch { fields = []; }
  return hasImportFields(fields) ? { error: null, fields, id: Number(latest.id) } : { error: templateMissingError(), fields };
}

function validateImportData(row, templateFields, svc, user) {
  const data = row.data || {};
  const allowed = new Set((templateFields || []).map(field => field?.key).filter(Boolean));
  const unknown = allowed.size ? Object.keys(data).filter(key => !allowed.has(key)) : [];
  if (unknown.length) throw new SchoolImportError(`La fila contiene campos no configurados: ${unknown.join(', ')}.`, 'UNKNOWN_IMPORT_FIELDS');
  for (const [key,value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    const field=templateFields?.find(field=>field.key===key);
    if (typeof value!=='string'||value.length>(field?.type==='textarea'?4000:500)) throw new SchoolImportError(`El campo ${key} contiene un valor inválido o demasiado largo.`, 'FIELD_TYPE_INVALID');
    if (field?.sensitive&&value&&!can(svc,user,'sensitive')) throw new SchoolImportError('Un campo de origen reservado requiere permiso sensible.', 'SENSITIVE_PERMISSION_REQUIRED',403);
  }
  for (const key of ['names', 'surname']) if (typeof data[key] !== 'string' || !data[key].trim()) throw new SchoolImportError(`El campo ${key} es obligatorio.`, 'IDENTITY_FIELD_REQUIRED');
  for (const key of ['names', 'surname', 'secondSurname', 'identifierType', 'identifier', 'birthDate', 'email', 'guardianIdentifier', 'studentPhone', 'sourceGender', 'sourceBarcode', 'sourceCountry', 'sourceIdentifierType']) {
    if (data[key] !== null && data[key] !== undefined && typeof data[key] !== 'string') throw new SchoolImportError(`El campo ${key} debe ser texto.`, 'FIELD_TYPE_INVALID');
  }
  if (data.birthDate) {
    const validShape = /^\d{4}-\d{2}-\d{2}$/.test(data.birthDate);
    const parsed = validShape ? new Date(`${data.birthDate}T00:00:00.000Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== data.birthDate) throw new SchoolImportError('La fecha de nacimiento debe ser una fecha válida en formato AAAA-MM-DD.', 'DATE_INVALID');
  }
  if (!['RUN', 'IPE', 'Pasaporte', 'Otro'].includes(data.identifierType)) throw new SchoolImportError('La importación necesita una identidad verificable; los borradores provisionales se ingresan de forma individual.', 'IDENTIFIER_TYPE_INVALID');
  if (!data.identifier || !String(data.identifier).trim()) throw new SchoolImportError('La identificación del estudiante es obligatoria.', 'IDENTIFIER_REQUIRED');
  if (data.identifierType === 'RUN' && !validateIdentifier('RUN', data.identifier)) throw new SchoolImportError('El RUN no supera la validación de dígito verificador.', 'RUN_INVALID');
  if (data.sourceGender && !can(svc, user, 'sensitive')) throw new SchoolImportError('El género de origen es reservado y requiere permiso sensible.', 'SENSITIVE_PERMISSION_REQUIRED', 403);
}

function resolveCourses(rows, courses, mapping = {}) {
  const byId = new Map(courses.map(course => [String(course.id), course]));
  const proposals = new Map();
  const resolved = [];
  for (const row of rows) {
    const labels = courseLabels(row);
    const own=key=>mapping&&typeof mapping==='object'&&Object.hasOwn(mapping,key)?mapping[key]:null;
    const mapped = row.courseId || labels.map(label => own(label) || own(row.courseName) || own(keyName(label))).find(Boolean);
    let course = mapped ? byId.get(String(mapped)) : null;
    if (mapped&&!course) {resolved.push({row,course:null,labels,issue:{code:'COURSE_MAPPING_INVALID',message:'El curso elegido no existe en el año seleccionado.'}});continue;}
    if (!course) {
      const matches=labels.slice().reverse().map(label=>courses.filter(item=>item.key===courseKey(label))).find(matches=>matches.length)||[];
      if(matches.length>1){resolved.push({row,course:null,labels,issue:{code:'CURSO_AMBIGUO',message:'Hay cursos con el mismo nombre normalizado; elija un curso explícitamente.'}});continue;}
      course=matches[0]||null;
    }
    if (!course) {
      const proposalLabel = labels.at(-1) || row.courseName || '';
      if(!proposalLabel){resolved.push({row,course:null,labels,issue:{code:'CURSO_AUSENTE',message:'Asigne un curso a la hoja antes de importar.'}});continue;}
      const proposalKey = `${courseKey(proposalLabel)}|${row.courseYear || ''}`;
      if (!proposals.has(proposalKey)) proposals.set(proposalKey, { key: proposalKey, name: proposalLabel, year: Number(row.courseYear || 0), count: 0, sourceNames: labels });
      proposals.get(proposalKey).count += 1;
      resolved.push({ row, course: null, labels, proposalKey });
    } else {
      resolved.push({ row, course, labels, proposalKey: null });
    }
  }
  return { resolved, proposals: [...proposals.values()] };
}

function identityKeys(store, candidate) {
  const data = candidate.data || {};
  const hash = hashIdentity(store, data);
  return { hash, origin: candidate.origin || SOURCE, originId: candidate.originId || null };
}

/** Batch the read-only duplicate check so 500-row cloud previews do not make 500 round trips. */
async function existingIdentityMap(store, candidates) {
  const found = new Map();
  if (!store?.db?.prepare || !candidates.length) return found;
  const identities = candidates.map(candidate => identityKeys(store, candidate));
  const hashes = unique(identities.map(identity => identity.hash));
  for (let start = 0; start < hashes.length; start += 400) {
    const chunk = hashes.slice(start, start + 400);
    const rows = await dbAll(store, `SELECT id,identity_hash,origin,origin_id FROM students WHERE identity_hash IN (${chunk.map(() => '?').join(',')})`, ...chunk);
    for (const row of rows) found.set(`hash:${row.identity_hash}`, row);
  }
  const origins = identities.filter(identity => identity.originId);
  for (let start = 0; start < origins.length; start += 150) {
    const chunk = origins.slice(start, start + 150);
    const clauses = chunk.map((_, index) => `(origin=? AND origin_id=?)`).join(' OR ');
    const params = chunk.flatMap(identity => [identity.origin, identity.originId]);
    const rows = await dbAll(store, `SELECT id,identity_hash,origin,origin_id FROM students WHERE ${clauses}`, ...params);
    for (const row of rows) found.set(`origin:${row.origin}\u0000${row.origin_id}`, row);
  }
  return found;
}

async function existingYearRecords(store, identities, year) {
  const found = new Map();
  const ids = unique([...identities.values()].map(student => student.id));
  for (let start = 0; start < ids.length; start += 400) {
    const chunk = ids.slice(start, start + 400);
    const records = await dbAll(store, `SELECT id,student_id,year,course_id,template_id,status,version,data FROM records WHERE year=? AND student_id IN (${chunk.map(() => '?').join(',')})`, year, ...chunk);
    for (const record of records) found.set(record.student_id, record);
  }
  return found;
}

/** Only missing target-year records need an authorized annual reference. */
async function existingAnnualSources(store,identities,records){
  const found=new Map(),ids=unique([...identities.values()].map(student=>student.id)).filter(id=>!records.has(id));
  for(let offset=0;offset<ids.length;offset+=400){
    const chunk=ids.slice(offset,offset+400);
    const rows=await dbAll(store,`SELECT id,student_id,year,course_id,template_id,status,version,data FROM records WHERE student_id IN (${chunk.map(()=>'?').join(',')}) ORDER BY year DESC,id`,...chunk);
    for(const row of rows){const entries=found.get(row.student_id)||[];entries.push(row);found.set(row.student_id,entries);}
  }
  return found;
}
const compareName = value => asText(value).normalize('NFKD').toLocaleLowerCase('es').replace(/[\p{M}\p{P}\s]+/gu, '');
const needsReview = reason => ({ kind: 'review', reason });
const comparableDifference = (left, right, normalize = asText) => Boolean(left && right && normalize(left) !== normalize(right));

async function assessRow(store, svc, user, candidate, identities, records, templates, annualSources=new Map()) {
  const keys = identityKeys(store, candidate);
  const hashMatch = identities.get(`hash:${keys.hash}`);
  const originMatch = keys.originId && identities.get(`origin:${keys.origin}\u0000${keys.originId}`);
  if (originMatch && (originMatch.identity_hash !== keys.hash || (hashMatch && originMatch.id !== hashMatch.id))) {
    return { review: needsReview('El identificador y la referencia de origen no coinciden. Revise la identidad en la ficha.') };
  }
  if (!hashMatch) return { review: { kind: 'new' } };
  const record = records.get(hashMatch.id);
  if(!record){
    const targetAllowed=candidate.courseId
      ? ['read','write','enroll'].every(permission=>can(svc,user,permission,candidate.courseId))
      : Boolean(user?.allCourses&&['read','write','enroll'].every(permission=>can(svc,user,permission)));
    if(!targetAllowed)return {review:needsReview('La matrícula de otro año requiere revisión por una cuenta autorizada.')};
    const source=annualSources.get(hashMatch.id)?.[0];
    if(!source||!can(svc,user,'read',source.course_id)||!can(svc,user,'enroll',source.course_id)||(Number(candidate.year)>=Number(source.year)&&source.status==='withdrawn'))return {review:needsReview('La matrícula de otro año requiere revisión por una cuenta autorizada. Revise el reingreso si corresponde.')};
    const previous=JSON.parse(store.unseal(source.data)),incoming=candidate.data;
    if(hashIdentity(store,previous)!==keys.hash||comparableDifference(previous.names,incoming.names,compareName)
      ||comparableDifference([previous.surname,previous.secondSurname].filter(Boolean).join(' '),[incoming.surname,incoming.secondSurname||previous.secondSurname].filter(Boolean).join(' '),compareName)
      ||comparableDifference(previous.birthDate,incoming.birthDate))return {review:needsReview('Los datos de identidad difieren. Revise la ficha antes de preparar otra matrícula anual.')};
    return {source,review:{kind:'annual',studentId:hashMatch.id,sourceRecordId:source.id,sourceYear:Number(source.year),sourceVersion:Number(source.version),year:Number(candidate.year),reason:`Nueva matrícula anual ${candidate.year}. Se conservarán las fichas anteriores; debe seleccionarla explícitamente.`}};
  }
  if (!can(svc, user, 'read', record.course_id) || !can(svc, user, 'write', record.course_id)) {
    return { review: needsReview('Una ficha existente requiere revisión por una cuenta autorizada.') };
  }
  if (!candidate.courseId || candidate.courseId !== record.course_id) return { review: needsReview('El curso no coincide. La importación no traslada estudiantes.') };
  if (record.status === 'withdrawn') return { review: needsReview('La ficha está retirada. Revise el reingreso por separado.') };
  const previous = JSON.parse(store.unseal(record.data));
  const incoming = candidate.data;
  if (hashIdentity(store, previous) !== keys.hash || comparableDifference(previous.names, incoming.names, compareName)
      || comparableDifference([previous.surname, previous.secondSurname].filter(Boolean).join(' '), [incoming.surname, incoming.secondSurname || previous.secondSurname].filter(Boolean).join(' '), compareName)
      || comparableDifference(previous.birthDate, incoming.birthDate)) {
    return { review: needsReview('Los datos de identidad difieren. Corríjalos individualmente antes de actualizar el contacto.') };
  }
  const guardianDiffers = comparableDifference(previous.guardianIdentifier, incoming.guardianIdentifier, normalizeIdentifier)
    || comparableDifference(previous.guardianName, incoming.guardianName, compareName);
  if (!templates.has(record.template_id)) {
    const template = await dbGet(store, 'SELECT fields FROM templates WHERE id=?', record.template_id);
    templates.set(record.template_id, new Map(JSON.parse(template?.fields || '[]').map(field => [field.key, field])));
  }
  const fields = templates.get(record.template_id);
  const changes = [];
  for (const key of UPDATE_FIELDS) {
    const field = fields.get(key), after = incoming[key];
    if (!field || typeof after !== 'string' || !after.trim() || (key.startsWith('guardian') && guardianDiffers)
        || (field.sensitive && !can(svc, user, 'sensitive'))) continue;
    const before = asText(previous[key]);
    if (before !== after.trim()) changes.push({ key, label: field.label, before, after: after.trim() });
  }
  if (!changes.length) {
    return { review: guardianDiffers ? needsReview('El apoderado no coincide. Revise su identidad y contacto en la ficha.') : { kind: 'match' } };
  }
  return { record, previous, review: { kind: 'update', recordId: record.id, version: Number(record.version), templateId: Number(record.template_id), changes,
    ...(guardianDiffers ? { reason: 'El apoderado no coincide; sus datos no se modificarán.' } : {}) } };
}

async function decodeWorkbook(input) {
  if (input?.workbook) return input.workbook;
  if (input?.rows || input?.sheets) return { rows: input.rows, sheets: input.sheets };
  const content = input?.content;
  if (!content) throw new SchoolImportError('Adjunte un archivo .xlsx para previsualizar el padrón.', 'FILE_REQUIRED');
  if (typeof content === 'string' && content.length > 16 * 1024 * 1024) throw new SchoolImportError('El archivo supera el límite de importación.', 'FILE_TOO_LARGE', 413);
  try { return Buffer.isBuffer(content) ? content : Buffer.from(content, 'base64'); } catch { throw new SchoolImportError('El contenido base64 del archivo no es válido.', 'FILE_INVALID'); }
}

function ipeConfirmationToken(store, actor, year, workbook, { columnMapping, sheetMappings }) {
  if (!store?.mac) return null;
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  // Explicit column labels also participate in header discovery, including
  // labels not related to documents. Keep all of them bound to the preview.
  const sourceColumns = mapping => isObject(mapping) ? Object.keys(mapping).sort().map(key => [key, mapping[key]]) : [];
  const sheetOptions = (isObject(sheetMappings) ? Object.keys(sheetMappings) : []).sort().flatMap(sheet => {
    const config = sheetMappings[sheet];
    const include = config?.include !== false, headerRow = config?.headerRow ?? null, columns = sourceColumns(config?.columnMapping);
    return include && headerRow === null && !columns.length ? [] : [[sheet, include, headerRow, columns]];
  });
  const binary = workbook instanceof Uint8Array || typeof workbook === 'string';
  const hash = createHash('sha256').update(binary ? workbook : JSON.stringify(workbook)).digest('hex');
  return store.mac(JSON.stringify(['school-ipe-confirmation-v1', actor, year, binary, hash, sourceColumns(columnMapping), sheetOptions]));
}

function validIpeConfirmationToken(expected, given) {
  return typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected) && typeof given === 'string' && /^[0-9a-f]{64}$/.test(given) &&
    timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
}

/**
 * Pure preview + guarded commit for the ERP workbook. Preview performs only
 * SELECTs; all mutations are confined to commit after a fresh ticket check.
 */
export function createSchoolImport(store, svc) {
  const preview = async (user, input = {}) => {
    requirePermission(svc, user, 'import');
    requirePermission(svc, user, 'write');
    const selectedYear = parseSchoolYear(input.year);
    if (selectedYear === null) throw new SchoolImportError('Indique un año de matrícula válido.', 'YEAR_INVALID');
    const templateInfo = await loadTemplateFields(store);
    if (templateInfo?.error) {
      const errors = [templateInfo.error];
      return { canImport: false, rows: [], confirmedIpeRows: [], ipeConfirmationToken: null, errors, warnings: [], coursesToCreate: [], unresolvedCourses: [], summary: summarizeSchoolImport({ rows: [], errors, warnings: [], detectedRows: 0, unresolvedCourses: 0 }) };
    }
    const templateFields = templateInfo?.fields || [];
    const workbook = await decodeWorkbook(input);
    const token = ipeConfirmationToken(store, user.id, selectedYear, workbook, input);
    const staleIpeConfirmation = Array.isArray(input.confirmedIpeRows) && input.confirmedIpeRows.length > 0 && !validIpeConfirmationToken(token, input.ipeConfirmationToken);
    const parserOptions={year:selectedYear,maxRows:MAX_ROWS,fileName:input.name||input.fileName||'',columnMapping:input.columnMapping,sheetMappings:input.sheetMappings,contactOwner:input.contactOwner,addressOwner:input.addressOwner,
      confirmedIpeRows:staleIpeConfirmation ? [] : input.confirmedIpeRows};
    const parsed = Buffer.isBuffer(workbook) || workbook instanceof Uint8Array || typeof workbook === 'string'
      ? await parseSchoolWorkbook(workbook, parserOptions).catch(error=>{throw new SchoolImportError(error.message,error.code||'XLSX_INVALID');})
      : normalizeSchoolWorkbook(workbook, parserOptions);
    const yearContext=parsed.yearContext||{selectedYear,sourceYears:[],resolvedYear:selectedYear,source:'selection',conflict:false};
    const year=parseSchoolYear(yearContext.resolvedYear)??selectedYear;
    const courses = await availableCourses(store, input, year);
    const mapped = resolveCourses(parsed.rows, courses, input.courseMapping || {});
    const rows = [];
    const errors = [...(parsed.errors || [])];
    if (staleIpeConfirmation) errors.push({ row: 0, code: 'IPE_CONFIRMATION_INVALID', message: 'Las confirmaciones de IPE corresponden a otra revisión. Limpie las confirmaciones y vuelva a revisar la planilla.' });
    const warnings = [...(parsed.warnings || [])];
    const candidates = mapped.resolved.map(item => {
      const data = sourceData(item.row);
      return { ...item.row, year, courseId: item.course?.id || null, data, fields: data, origin: item.row.origin || SOURCE };
    });
    const identities = await existingIdentityMap(store, candidates);
    const records = await existingYearRecords(store, identities, year);
    const annualSources = await existingAnnualSources(store, identities, records);
    const templates = new Map();
    const requestedCourses = new Map();
    const counts = { new: 0, annual: 0, unchanged: 0, updates: 0, review: 0 };
    for (const [index, candidate] of candidates.entries()) {
      const item = mapped.resolved[index], location = { row: candidate.rowNumber, sheet: candidate.sourceSheet };
      try {
        validateImportData(candidate, templateFields, svc, user);
        candidate.review = (await assessRow(store, svc, user, candidate, identities, records, templates, annualSources)).review;
      } catch (error) {
        if (!(error instanceof SchoolImportError)) throw error;
        errors.push({ ...location, code: error.code, message: error.message });
        candidate.review = needsReview('La fila tiene datos que requieren corrección.');
      }
      if (candidate.review.kind === 'new'||candidate.review.kind === 'annual') {
        counts[candidate.review.kind==='annual'?'annual':'new']++;
        if (item.issue) errors.push({ ...location, ...item.issue });
        else if (!item.course) {
          errors.push({ ...location, code: 'CURSO_NO_RESUELTO', message: `El curso «${item.labels.at(-1) || item.row.courseName}» requiere asignación o creación explícita.`, courseName: item.row.courseName, section: item.row.section });
          if (item.proposalKey) requestedCourses.set(item.proposalKey, (requestedCourses.get(item.proposalKey) || 0) + 1);
        } else if (!can(svc, user, 'write', item.course.id)) errors.push({ ...location, code: 'COURSE_PERMISSION_DENIED', message: 'La cuenta no tiene permiso de edición para ese curso.', courseId: item.course.id });
      } else if (candidate.review.kind === 'update') counts.updates++;
      else if (candidate.review.kind === 'match') counts.unchanged++;
      else counts.review++;
      rows.push(candidate);
    }
    const coursesToCreate = mapped.proposals.filter(course => requestedCourses.has(course.key)).map(({ key, name, year: courseYear, sourceNames }) => ({ key, name, year: courseYear || year, count: requestedCourses.get(key), sourceNames }));
    const hasNonCourseErrors = errors.some(error => error.code !== 'CURSO_NO_RESUELTO');
    const actionable = counts.new + counts.annual + counts.updates;
    const payload = ticketPayload(user.id, templateInfo?.id, year, rows, coursesToCreate);
    const ticket = hasNonCourseErrors || !actionable ? null : store?.mac ? store.mac(payload) : payload;
    const courseTicket = coursesToCreate.length ? store?.mac ? store.mac(courseTicketPayload(user.id, year, coursesToCreate)) : courseTicketPayload(user.id, year, coursesToCreate) : null;
    return {
      source: parsed.source || SOURCE, fileName: input.name || input.fileName || null, year, yearContext, courses:courses.filter(course=>can(svc,user,'write',course.id)), rows,
      sheetSummaries:parsed.sheetSummaries||[],mappingTargets:parsed.mappingTargets||[],confirmedIpeRows:parsed.confirmedIpeRows||[],ipeConfirmationToken:token,
      administrativeRows: parsed.administrativeRows || [], coursesToCreate, courseTicket,
      unresolvedCourses: coursesToCreate, errors, warnings, ignored: parsed.ignored || [],
      summary: { ...summarizeSchoolImport({ rows, errors, warnings, detectedRows: parsed.summary.detectedRows, unresolvedCourses: coursesToCreate.length }), ...counts },
      ticket, canImport: actionable > 0 && errors.length === 0
    };
  };

  const createCourses = async (user, input = {}) => {
    requirePermission(svc, user, 'import');
    requirePermission(svc, user, 'write');
    requirePermission(svc, user, 'enroll');
    if (!user?.allCourses) throw new SchoolImportError('La creación de cursos requiere acceso autorizado a todos los cursos.', 'COURSES_ALL_SCOPE_REQUIRED', 403);
    const year = parseSchoolYear(input.year);
    if (year === null) throw new SchoolImportError('Indique un año de matrícula válido.', 'YEAR_INVALID');
    if (!Array.isArray(input.coursesToCreate) || !input.coursesToCreate.length || input.coursesToCreate.length > MAX_ROWS || input.coursesToCreate.some(course => !course || typeof course.name !== 'string')) {
      throw new SchoolImportError('No hay cursos pendientes válidos para crear.', 'COURSES_INVALID');
    }
    const coursesToCreate = input.coursesToCreate.map(course => ({ name: asText(course.name), year: Number(course.year || year) }));
    const expected = store?.mac ? store.mac(courseTicketPayload(user.id, year, coursesToCreate)) : courseTicketPayload(user.id, year, coursesToCreate);
    if (!input.courseTicket || input.courseTicket !== expected) throw new SchoolImportError('La revisión de cursos caducó. Vuelva a previsualizar la planilla.', 'COURSE_REVIEW_STALE', 409);
    return runTransaction(store, async () => {
      let created = 0;
      for (const course of coursesToCreate) {
        if (!course.name || course.name.length > 80 || parseSchoolYear(course.year) === null || course.year !== year) throw new SchoolImportError('Nombre o año de curso inválido.', 'COURSE_INVALID');
        const matching = (await dbAll(store, 'SELECT id,name FROM courses WHERE year=?', course.year)).filter(item => courseKey(item.name) === courseKey(course.name));
        if (matching.length > 1) throw new SchoolImportError('Hay cursos ambiguos; revise el catálogo antes de continuar.', 'CURSO_AMBIGUO', 409);
        if (!matching.length) {
          const id = randomUUID();
          await dbRun(store, 'INSERT INTO courses(id,year,name) VALUES(?,?,?)', id, course.year, course.name);
          await auditInTransaction(store, user.id, 'course.create.import', id, { year: course.year, name: course.name, standalone: true });
          created++;
        }
      }
      return { created, year };
    });
  };

  const commit = async (user, input = {}) => {
    requirePermission(svc, user, 'import');
    requirePermission(svc, user, 'write');
    if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > MAX_ROWS || input.rows.some(row => !row || !['new','annual','match','update','review'].includes(row.review?.kind))) throw new SchoolImportError(`La confirmación admite entre 1 y ${MAX_ROWS} filas previsualizadas.`, 'ROWS_INVALID');
    const year = parseSchoolYear(input.year ?? input.rows[0]?.year);
    if (year === null) throw new SchoolImportError('Indique un año de matrícula válido.', 'YEAR_INVALID');
    if(input.rows.some(row=>parseSchoolYear(row.year??row.courseYear)!==year||(row.sourceYear!=null&&parseSchoolYear(row.sourceYear)!==year)))throw new SchoolImportError('Las filas deben corresponder al año revisado de la importación.','COURSE_YEAR_MISMATCH');
    if (input.coursesToCreate !== undefined && (!Array.isArray(input.coursesToCreate) || input.coursesToCreate.length > MAX_ROWS || input.coursesToCreate.some(course => !course || typeof course.name !== 'string'))) throw new SchoolImportError('La lista de cursos propuestos no es válida.', 'COURSES_INVALID');
    const coursesToCreate = Array.isArray(input.coursesToCreate) ? input.coursesToCreate.map(course => ({ name: asText(course.name), year: Number(course.year || year) })) : [];
    const updateIndexes = input.updateIndexes ?? [];
    if (!Array.isArray(updateIndexes) || updateIndexes.length > MAX_ROWS || new Set(updateIndexes).size !== updateIndexes.length || updateIndexes.some(index => !Number.isInteger(index) || input.rows[index]?.review.kind !== 'update')) throw new SchoolImportError('Seleccione solamente filas con cambios previsualizados.', 'IMPORT_SELECTION_INVALID');
    const annualIndexes=input.annualIndexes??[];
    if(!Array.isArray(annualIndexes)||annualIndexes.length>MAX_ROWS||new Set(annualIndexes).size!==annualIndexes.length||annualIndexes.some(index=>!Number.isInteger(index)||input.rows[index]?.review.kind!=='annual'))throw new SchoolImportError('Seleccione solamente matrículas anuales previsualizadas.','IMPORT_SELECTION_INVALID');
    const selected = new Set([...updateIndexes,...annualIndexes]);
    const activeRows = input.rows.filter((row, index) => row.review.kind === 'new' || selected.has(index));
    const stale = () => new SchoolImportError('Las fichas o su disponibilidad cambiaron desde la revisión. Vuelva a previsualizar antes de confirmar.', 'IMPORT_REVIEW_STALE', 409);
    const result = await runTransaction(store, async () => {
      const templateInfo = await loadTemplateFields(store);
      if (templateInfo?.error) throw new SchoolImportError(templateInfo.error.message, templateInfo.error.code);
      const templateFields = templateInfo?.fields || [];
      const payload = ticketPayload(user.id, templateInfo?.id, year, input.rows, coursesToCreate);
      const expectedTicket = store?.mac ? store.mac(payload) : payload;
      if (!input.ticket || input.ticket !== expectedTicket) throw new SchoolImportError('La previsualización caducó o fue modificada; vuelva a previsualizar.', 'IMPORT_TICKET_MISMATCH', 409);
      if (!activeRows.length) throw new SchoolImportError('No hay fichas nuevas, matrículas anuales ni actualizaciones seleccionadas.', 'IMPORT_SELECTION_EMPTY', 409);
      if (activeRows.some(row => !row.courseId)) {
        if (input.createCourses !== true) throw new SchoolImportError('Confirme explícitamente la creación de los cursos faltantes antes de importar.', 'COURSES_CONFIRMATION_REQUIRED', 409);
        requirePermission(svc, user, 'enroll');
        if (!user?.allCourses) throw new SchoolImportError('La creación de cursos requiere acceso autorizado a todos los cursos.', 'COURSES_ALL_SCOPE_REQUIRED', 403);
      }
      const identities = await existingIdentityMap(store, activeRows);
      const records = await existingYearRecords(store, identities, year);
      const annualSources = await existingAnnualSources(store, identities, records);
      const templates = new Map(), assessments = new Map(), seen = new Set();
      for (const row of activeRows) {
        const candidate = { ...row, data: sourceData(row) };
        validateImportData(candidate, templateFields, svc, user);
        if (row.courseId && !can(svc, user, 'write', row.courseId)) throw new SchoolImportError('La cuenta no tiene acceso de edición a uno de los cursos.', 'COURSE_PERMISSION_DENIED', 403);
        if (row.review.kind === 'annual')requirePermission(svc,user,'enroll',row.courseId||undefined);
        if ((row.review.kind === 'update'||row.review.kind === 'annual') && row.courseId && !can(svc, user, 'read', row.courseId)) throw new SchoolImportError('La cuenta no tiene acceso de lectura a la ficha que se quiere actualizar.', 'COURSE_PERMISSION_DENIED', 403);
        const keys = identityKeys(store, candidate), originKey = keys.originId ? `origin:${keys.origin}\u0000${keys.originId}` : null;
        if (seen.has(`hash:${keys.hash}`) || (originKey && seen.has(originKey))) throw new SchoolImportError('La identidad u origen se repite dentro del archivo.', 'DUPLICADO_IDENTIDAD', 409);
        seen.add(`hash:${keys.hash}`); if (originKey) seen.add(originKey);
        const assessment = await assessRow(store, svc, user, candidate, identities, records, templates, annualSources);
        if (JSON.stringify(assessment.review) !== JSON.stringify(row.review)) throw stale();
        assessments.set(row, assessment);
      }
      const courseIds = new Map();
      const createdCourses = [];
      for (const course of coursesToCreate.filter(course=>activeRows.some(row=>!row.courseId&&courseLabels(row).some(label=>courseKey(label)===courseKey(course.name))))) {
        if (!course.name || course.name.length > 80 || parseSchoolYear(course.year)===null || course.year!==year) throw new SchoolImportError('Nombre o año de curso inválido.', 'COURSE_INVALID');
        const matching=(await dbAll(store,'SELECT id,name FROM courses WHERE year=?',course.year)).filter(item=>courseKey(item.name)===courseKey(course.name));
        if(matching.length>1)throw new SchoolImportError('Hay cursos ambiguos; asigne uno y vuelva a previsualizar.','CURSO_AMBIGUO',409);
        const existing = matching[0];
        const id = existing?.id || randomUUID();
        if (!existing) {
          await dbRun(store, 'INSERT INTO courses(id,year,name) VALUES(?,?,?)', id, course.year, course.name);
          createdCourses.push({ id, name: course.name, year: course.year });
          await auditInTransaction(store, user.id, 'course.create.import', id, { year: course.year, name: course.name });
        }
        courseIds.set(`${courseKey(course.name)}|${course.year}`, id);
      }
      const inserted = [], updated = [], annual = [];
      const pending = {students:[],records:[],revisions:[],events:[]};
      const courseCache = new Map();
      for (const inputRow of activeRows) {
        const data = sourceData(inputRow);
        let courseId = inputRow.courseId;
        if (!courseId) {
          const proposed = courseLabels(inputRow).reverse().map(label=>coursesToCreate.find(course=>courseKey(course.name)===courseKey(label))).find(Boolean);
          courseId = proposed && courseIds.get(`${courseKey(proposed.name)}|${proposed.year}`);
        }
        if (!courseId) throw new SchoolImportError('Una fila no tiene curso resuelto.', 'COURSE_UNRESOLVED');
        if (!can(svc, user, 'write', courseId)) throw new SchoolImportError('La cuenta no tiene acceso a uno de los cursos.', 'COURSE_PERMISSION_DENIED', 403);
        let course = courseCache.get(courseId);
        if (!course) { course = await dbGet(store, 'SELECT id,year FROM courses WHERE id=?', courseId); courseCache.set(courseId, course); }
        if (!course || Number(course.year) !== year) throw new SchoolImportError('El curso no corresponde al año de la importación.', 'COURSE_YEAR_MISMATCH');
        const now = new Date().toISOString();
        if (inputRow.review.kind === 'update') {
          const { record, previous, review } = assessments.get(inputRow);
          const next = { ...previous, ...Object.fromEntries(review.changes.map(change => [change.key, change.after])) };
          const changed = await dbRun(store, 'UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=? AND version=? AND course_id=? AND year=? AND status<>?', store.seal(next), now, record.id, review.version, courseId, year, 'withdrawn');
          if (changed.changes !== 1) throw stale();
          pending.revisions.push([record.id, review.version + 1, user.id, now, store.seal({ year, courseId, status: record.status, templateId: review.templateId, data: next })]);
          pending.events.push([record.id, 'import.updated', user.id, now, store.seal({ origin: inputRow.origin || SOURCE, sourceSheet: inputRow.sourceSheet, sourceRow: inputRow.rowNumber, fields: review.changes.map(change => change.key) })]);
          updated.push(record.id);
          continue;
        }
        const identityHash = hashIdentity(store, data);
        const annualSource=inputRow.review.kind==='annual'?assessments.get(inputRow).source:null;
        const studentId = annualSource?annualSource.student_id:randomUUID();
        const recordId = randomUUID();
        if(!annualSource)pending.students.push([studentId, identityHash, inputRow.origin || SOURCE, inputRow.originId]);
        pending.records.push([recordId, studentId, year, courseId, templateInfo.id, 'draft', displayName(data), 1, store.seal(data), now]);
        pending.revisions.push([recordId, 1, user.id, now, store.seal({ year, courseId, status: 'draft', templateId: templateInfo.id, data })]);
        pending.events.push([recordId, annualSource?'import.annual':'imported', user.id, now, store.seal({ origin: inputRow.origin || SOURCE, originId: inputRow.originId,sourceSheet:inputRow.sourceSheet,sourceRow:inputRow.rowNumber,...(inputRow.ipeConfirmed===true?{ipeConfirmed:true}:{}),...(annualSource?{sourceId:annualSource.id,sourceYear:annualSource.year}:{}) })]);
        if(annualSource)annual.push(recordId);
        inserted.push(recordId);
      }
      const columns = {students:'id,identity_hash,origin,origin_id',records:'id,student_id,year,course_id,template_id,status,name,version,data,updated_at',revisions:'record_id,version,actor,at,snapshot',events:'record_id,action,actor,at,detail'};
      for (const [table, values] of Object.entries(pending)) {
        const chunkSize = store.kind === 'postgres' ? 250 : 1;
        for (let offset=0;offset<values.length;offset+=chunkSize) {
          const chunk=values.slice(offset,offset+chunkSize);
          const placeholders=chunk.map(row=>'('+row.map(()=>'?').join(',')+')').join(',');
          await dbRun(store, `INSERT INTO ${table}(${columns[table]}) VALUES${placeholders}`, ...chunk.flat());
        }
      }
      const origins = unique(activeRows.map(row => row.origin || SOURCE));
      const source = origins.length === 1 ? origins[0] : 'PADRON_MIXTO';
      const detail = { count: inserted.length + updated.length, created: inserted.length, annual: annual.length, createdStudents: inserted.length-annual.length, updated: updated.length, skipped: input.rows.length - activeRows.length };
      await auditInTransaction(store, user.id, 'import.commit.erp', '', { ...detail, year, source, createdCourses: createdCourses.length });
      return { ...detail, ids: [...inserted, ...updated], source };
    });
    return { ...result, year };
  };
  return { preview, commit, createCourses };
}
