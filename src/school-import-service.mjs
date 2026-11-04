import { randomUUID } from 'node:crypto';
import { parseSchoolWorkbook, normalizeSchoolWorkbook, normalizeHeader, normalizeCourseName } from './school-import.mjs';
import { hasImportFields, sourceFields } from './import-fields.mjs';
import { normalizeIdentifier, validateIdentifier } from './fields.mjs';

const MAX_ROWS = 500;
const SOURCE = 'ERP_USUARIOS';

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
    courseId: row.courseId || null, courseName: row.courseName || '', section: row.section || '', year: Number(row.year || row.courseYear || 0),
    data: sourceData(row)
  }));
}

function ticketPayload(year, rows, coursesToCreate) {
  return JSON.stringify({ year: Number(year), rows: stableRows(rows), coursesToCreate: coursesToCreate.map(course => ({ name: course.name, year: Number(course.year) })) });
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
  return hasImportFields(fields) ? { error: null, fields } : { error: templateMissingError(), fields };
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

async function existingIdentityIssue(store, candidate) {
  if (!store?.db?.prepare) return null;
  const data = candidate.data;
  const origin = candidate.origin || SOURCE;
  const originId = candidate.originId;
  const hash = hashIdentity(store, data);
  const found = await dbGet(store, 'SELECT id FROM students WHERE identity_hash=? OR (origin=? AND origin_id=?)', hash, origin, originId);
  return found ? { code: 'DUPLICADO_EXISTENTE', message: 'La identidad u origen ya existe en la matrícula; se requiere revisión manual.', studentId: found.id } : null;
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

async function decodeWorkbook(input) {
  if (input?.workbook) return input.workbook;
  if (input?.rows || input?.sheets) return input;
  const content = input?.content;
  if (!content) throw new SchoolImportError('Adjunte un archivo .xlsx para previsualizar el padrón.', 'FILE_REQUIRED');
  if (typeof content === 'string' && content.length > 16 * 1024 * 1024) throw new SchoolImportError('El archivo supera el límite de importación.', 'FILE_TOO_LARGE', 413);
  try { return Buffer.isBuffer(content) ? content : Buffer.from(content, 'base64'); } catch { throw new SchoolImportError('El contenido base64 del archivo no es válido.', 'FILE_INVALID'); }
}

/**
 * Pure preview + guarded commit for the ERP workbook. Preview performs only
 * SELECTs; all mutations are confined to commit after a fresh ticket check.
 */
export function createSchoolImport(store, svc) {
  const preview = async (user, input = {}) => {
    requirePermission(svc, user, 'import');
    requirePermission(svc, user, 'write');
    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new SchoolImportError('Indique un año de matrícula válido.', 'YEAR_INVALID');
    const templateInfo = await loadTemplateFields(store);
    if (templateInfo?.error) return { canImport: false, rows: [], errors: [templateInfo.error], warnings: [], coursesToCreate: [], unresolvedCourses: [], summary: { total: 0, errors: 1 } };
    const templateFields = templateInfo?.fields || [];
    const workbook = await decodeWorkbook(input);
    const parserOptions={year,maxRows:MAX_ROWS,fileName:input.name||input.fileName||'',columnMapping:input.columnMapping,sheetMappings:input.sheetMappings,contactOwner:input.contactOwner,addressOwner:input.addressOwner};
    const parsed = Buffer.isBuffer(workbook) || workbook instanceof Uint8Array || typeof workbook === 'string'
      ? await parseSchoolWorkbook(workbook, parserOptions).catch(error=>{throw new SchoolImportError(error.message,error.code||'XLSX_INVALID');})
      : normalizeSchoolWorkbook(workbook, parserOptions);
    const courses = await availableCourses(store, input, year);
    const mapped = resolveCourses(parsed.rows, courses, input.courseMapping || {});
    const rows = [];
    const errors = [...(parsed.errors || [])];
    const warnings = [...(parsed.warnings || [])];
    for (const item of mapped.resolved) {
      const data = sourceData(item.row);
      const candidate = { ...item.row, year, courseId: item.course?.id || null, data, fields: data, origin: item.row.origin || SOURCE };
      const location={row:item.row.rowNumber,sheet:item.row.sourceSheet};
      if(item.issue)errors.push({...location,...item.issue});
      else if (!item.course) errors.push({ ...location, code: 'CURSO_NO_RESUELTO', message: `El curso «${item.labels.at(-1) || item.row.courseName}» requiere asignación o creación explícita.`, courseName: item.row.courseName, section: item.row.section });
      else if (!can(svc, user, 'write', item.course.id)) errors.push({ ...location, code: 'COURSE_PERMISSION_DENIED', message: 'La cuenta no tiene permiso de edición para ese curso.', courseId: item.course.id });
      try { validateImportData(candidate, templateFields, svc, user); } catch (error) { errors.push({ ...location, code: error.code || 'DATA_INVALID', message: error.message }); }
      rows.push(candidate);
    }
    const existing = await existingIdentityMap(store, rows);
    for (const candidate of rows) {
      const keys = identityKeys(store, candidate);
      const duplicate = existing.get(`hash:${keys.hash}`) || (keys.originId && existing.get(`origin:${keys.origin}\u0000${keys.originId}`));
      if (duplicate) errors.push({ row: candidate.rowNumber, sheet:candidate.sourceSheet, code: 'DUPLICADO_EXISTENTE', message: 'La identidad u origen ya existe en la matrícula; se requiere revisión manual.' });
    }
    const coursesToCreate = mapped.proposals.map(({ key, name, year: courseYear, count, sourceNames }) => ({ key, name, year: courseYear || year, count, sourceNames }));
    const hasNonCourseErrors = errors.some(error => error.code !== 'CURSO_NO_RESUELTO');
    const ticket = hasNonCourseErrors||!rows.length ? null : store?.mac ? store.mac(ticketPayload(year, rows, coursesToCreate)) : ticketPayload(year, rows, coursesToCreate);
    const invalidLocations=new Set(errors.filter(error=>error.row).map(error=>`${error.sheet||''}:${error.row}`));
    return {
      source: parsed.source || SOURCE, fileName: input.name || input.fileName || null, year, courses:courses.filter(course=>can(svc,user,'write',course.id)), rows,
      sheetSummaries:parsed.sheetSummaries||[],mappingTargets:parsed.mappingTargets||[],
      administrativeRows: parsed.administrativeRows || [], coursesToCreate,
      unresolvedCourses: coursesToCreate, errors, warnings, ignored: parsed.ignored || [],
      summary: { total: rows.length, valid: errors.some(error=>!error.row)?0:Math.max(0,rows.length-invalidLocations.size), errors: errors.length, warnings: warnings.length, unresolvedCourses: coursesToCreate.length },
      ticket, canImport: rows.length > 0 && !hasNonCourseErrors && errors.length === 0
    };
  };

  const commit = async (user, input = {}) => {
    requirePermission(svc, user, 'import');
    requirePermission(svc, user, 'write');
    if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > MAX_ROWS) throw new SchoolImportError(`La confirmación admite entre 1 y ${MAX_ROWS} filas.`, 'ROWS_INVALID');
    const year = Number(input.year || input.rows[0]?.year);
    const coursesToCreate = Array.isArray(input.coursesToCreate) ? input.coursesToCreate.map(course => ({ name: asText(course.name), year: Number(course.year || year) })) : [];
    const expectedTicket = store?.mac ? store.mac(ticketPayload(year, input.rows, coursesToCreate)) : ticketPayload(year, input.rows, coursesToCreate);
    if (!input.ticket || input.ticket !== expectedTicket) throw new SchoolImportError('La previsualización caducó o fue modificada; vuelva a previsualizar.', 'IMPORT_TICKET_MISMATCH', 409);
    const unresolved = input.rows.filter(row => !row.courseId);
    if (unresolved.length) {
      if (input.createCourses !== true) throw new SchoolImportError('Confirme explícitamente la creación de los cursos faltantes antes de importar.', 'COURSES_CONFIRMATION_REQUIRED', 409);
      requirePermission(svc, user, 'enroll');
      if (!user?.allCourses) throw new SchoolImportError('La creación de cursos requiere acceso autorizado a todos los cursos.', 'COURSES_ALL_SCOPE_REQUIRED', 403);
    }
    const templateInfo = await loadTemplateFields(store);
    if (templateInfo?.error) throw new SchoolImportError(templateInfo.error.message, templateInfo.error.code);
    const templateFields = templateInfo?.fields || [];
    const existing = await existingIdentityMap(store, input.rows);
    const seen = new Set();
    for (const row of input.rows) {
      validateImportData({ data: sourceData(row) }, templateFields, svc, user);
      const keys = identityKeys(store, { ...row, data: sourceData(row) });
      const duplicate = existing.get(`hash:${keys.hash}`) || (keys.originId && existing.get(`origin:${keys.origin}\u0000${keys.originId}`));
      if (duplicate) throw new SchoolImportError('La identidad u origen ya existe; no se fusionan fichas automáticamente.', 'DUPLICADO_EXISTENTE', 409);
      if (seen.has(`hash:${keys.hash}`) || (keys.originId && seen.has(`origin:${keys.origin}\u0000${keys.originId}`))) throw new SchoolImportError('La identidad u origen se repite dentro del archivo.', 'DUPLICADO_IDENTIDAD', 409);
      seen.add(`hash:${keys.hash}`); if (keys.originId) seen.add(`origin:${keys.origin}\u0000${keys.originId}`);
    }
    const result = await runTransaction(store, async () => {
      const courseIds = new Map();
      const createdCourses = [];
      for (const course of coursesToCreate) {
        if (!course.name || course.name.length > 80 || course.year < 2020 || course.year > 2100) throw new SchoolImportError('Nombre o año de curso inválido.', 'COURSE_INVALID');
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
      const latestTemplate = await dbGet(store, 'SELECT id FROM templates ORDER BY id DESC LIMIT 1');
      const inserted = [];
      const pending = {students:[],records:[],revisions:[],events:[]};
      const courseCache = new Map();
      for (const inputRow of input.rows) {
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
        validateImportData({ data }, templateFields, svc, user);
        const identityHash = hashIdentity(store, data);
        const studentId = randomUUID();
        const recordId = randomUUID();
        const now = new Date().toISOString();
        pending.students.push([studentId, identityHash, inputRow.origin || SOURCE, inputRow.originId]);
        pending.records.push([recordId, studentId, year, courseId, latestTemplate.id, 'draft', displayName(data), 1, store.seal(data), now]);
        pending.revisions.push([recordId, 1, user.id, now, store.seal({ year, courseId, status: 'draft', templateId: latestTemplate.id, data })]);
        pending.events.push([recordId, 'imported', user.id, now, store.seal({ origin: inputRow.origin || SOURCE, originId: inputRow.originId })]);
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
      await auditInTransaction(store, user.id, 'import.commit.erp', '', { count: inserted.length, year, source: SOURCE, createdCourses: createdCourses.length });
      return { count: inserted.length, ids: inserted };
    });
    return { ...result, source: SOURCE, year };
  };
  return { preview, commit };
}
