/**
 * Importador de padrón del ERP del colegio.
 *
 * Este módulo solo lee y normaliza. No abre la base, no crea usuarios ni
 * escribe archivos. La aplicación puede usar el resultado para una
 * previsualización y luego pedir confirmación antes de persistirlo.
 */

const STUDENT_ROLES = new Set(['estudiante', 'alumno', 'student']);
const ACCOUNT_HEADERS = new Set([
  'contrasena', 'password', 'passwd', 'clave', 'nombreusuario', 'username',
  'usuario', 'user', 'correoacceso', 'emailacceso'
]);
export const ERP_USUARIOS_HEADERS = Object.freeze([
  'ID de Usuario (no modificar)', 'RUT', 'DV', 'Tipo de documento', 'País emisor',
  'Nombres', 'Apellidos', 'Email', 'Teléfono', 'Rol', 'Curso', 'Sección',
  'Género', 'Fecha Nacimiento', 'Nombre Usuario', 'RUT Apoderado', 'Código Barra'
]);

export const ADMINISTRATIVE_SHEETS = Object.freeze([
  'Estudiantes', 'Padrón administrativo', 'Padron administrativo', 'Identificadores'
]);

const text = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
};

/** Same matching rule used by the original ERP parser: accents and symbols ignored. */
export function normalizeHeader(value) {
  return text(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

const KNOWN_HEADERS = new Set([
  ...ERP_USUARIOS_HEADERS.map(normalizeHeader),
  'idusuario', 'idusuarioerp', 'uuiderp', 'run', 'id', 'digitoverificador', 'documenttype',
  'paisdocumento', 'country', 'nombre', 'name', 'apellido', 'lastname', 'correo', 'mail',
  'telefono', 'phone', 'role', 'grade', 'seccion', 'genero', 'gender', 'fecha_nacimiento', 'nacimiento',
  'apoderadorut', 'rutapoderados', 'apoderado_rut', 'rut_apoderado', 'barcode', 'codigo_barra'
]);

function firstValue(row, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(normalizeHeader(key)) && text(value)) return text(value);
  }
  return '';
}

function normalizeRole(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function normalizeRutAndDv(rutInput, dvInput = '') {
  let raw = text(rutInput).toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
  let dv = text(dvInput).toUpperCase().replace(/[^0-9K]/g, '').slice(0, 1);
  if (raw.includes('-')) {
    const [body, supplied] = raw.split('-', 2);
    raw = body.replace(/\D/g, '');
    if (!dv) dv = text(supplied).replace(/[^0-9K]/g, '').slice(0, 1);
  } else {
    raw = raw.replace(/[^0-9K]/g, '');
  }
  // An ERP export generally has DV in its own column. For a compact RUT
  // without DV, infer the last character only when it is explicitly plausible.
  if (!dv && raw.length >= 8 && /^\d+[0-9K]$/.test(raw)) {
    dv = raw.slice(-1);
    raw = raw.slice(0, -1);
  }
  return { rut: raw.replace(/\D/g, ''), dv };
}

export function validateRut(rut, dv) {
  const body = text(rut).replace(/\D/g, '');
  const check = text(dv).toUpperCase().replace(/[^0-9K]/g, '');
  if (!/^\d{7,8}$/.test(body) || !/^[0-9K]$/.test(check)) return false;
  let sum = 0;
  let multiplier = 2;
  for (const digit of [...body].reverse()) {
    sum += Number(digit) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const value = 11 - (sum % 11);
  const expected = value === 11 ? '0' : value === 10 ? 'K' : String(value);
  return expected === check;
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parts = raw.split(/[\/-]/);
  if (parts.length === 3 && parts[2].length === 4) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
      return candidate.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function splitSurname(value) {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return { surname: parts[0] || '', secondSurname: parts.slice(1).join(' ') };
}

function rowIssue(rowNumber, code, message, extra = {}) {
  return { row: rowNumber, code, message, ...extra };
}

function identityFrom(row) {
  const rawRut = firstValue(row, ['RUT', 'RUN', 'ID']);
  const suppliedDv = firstValue(row, ['DV', 'Dígito verificador', 'Digito verificador']);
  const normalized = normalizeRutAndDv(rawRut, suppliedDv);
  const validRun = validateRut(normalized.rut, normalized.dv);
  const erpId = firstValue(row, ['ID de Usuario (no modificar)', 'id usuario', 'id_usuario', 'uuid_erp']);
  const typeInput = firstValue(row, ['Tipo de documento', 'tipo documento', 'tipo_documento', 'document type']);
  const country = firstValue(row, ['País emisor', 'Pais emisor', 'país documento', 'pais_documento', 'country']);
  const typeNormalized = normalizeHeader(typeInput);
  let type = validRun ? 'RUN_CHILE' : 'ID_ERP';
  if (!validRun && /ipe|mineduc/.test(typeNormalized)) type = 'IPE_MINEDUC';
  else if (!validRun && typeInput && !/erp|usuario|interno/.test(typeNormalized)) type = 'DOCUMENTO_EXTRANJERO';
  const document = validRun ? `${normalized.rut}-${normalized.dv}` : text(rawRut || erpId).toUpperCase();
  const canIdentify = Boolean(erpId || document);
  return {
    erpId: erpId || null,
    rut: validRun ? normalized.rut : null,
    dv: validRun ? normalized.dv : null,
    rawRut: rawRut || null,
    suppliedDv: suppliedDv || null,
    document: document || null,
    type,
    documentType: type === 'DOCUMENTO_EXTRANJERO' ? typeInput || 'OTRO' : null,
    sourceIdentifierType: typeInput || null,
    country: country || null,
    validRun,
    canIdentify,
    key: erpId ? `erp:${erpId}` : document ? `${type}:${document.replace(/[.\s]/g, '').toUpperCase()}` : null
  };
}

function accountWarnings(row, rowNumber) {
  const ignored = [];
  const unknown = [];
  for (const key of Object.keys(row || {})) {
    const normalized = normalizeHeader(key);
    if (ACCOUNT_HEADERS.has(normalized)) ignored.push(key);
    else if (text(row[key]) && !KNOWN_HEADERS.has(normalized)) unknown.push(key);
  }
  const warnings = ignored.length ? [rowIssue(rowNumber, 'CUENTA_IGNORADA', 'Se ignoraron columnas de acceso; la nómina nunca crea ni modifica cuentas.', { columns: ignored })] : [];
  if (unknown.length) warnings.push(rowIssue(rowNumber, 'COLUMNA_IGNORADA', 'Se ignoraron columnas que no pertenecen al contrato de importación; revise su mapeo si son institucionales.', { columns: unknown }));
  return warnings;
}

/** Normalize one ERP row into the field names used by PuraMatrícula. */
export function normalizeStudentRow(row, { rowNumber = 2, sheet = 'Usuarios', origin = 'ERP_USUARIOS' } = {}) {
  const warnings = accountWarnings(row, rowNumber);
  const role = firstValue(row, ['Rol', 'rol', 'role']);
  if (role && !STUDENT_ROLES.has(normalizeRole(role))) {
    return { row: null, warnings, ignored: rowIssue(rowNumber, 'ROL_IGNORADO', 'La fila no corresponde a un estudiante; se omitió.', { role }) };
  }
  const names = firstValue(row, ['Nombres', 'nombre', 'name']);
  const surnames = splitSurname(firstValue(row, ['Apellidos', 'apellido', 'lastname']));
  const identity = identityFrom(row);
  const courseName = firstValue(row, ['Curso', 'grade']);
  const section = firstValue(row, ['Sección', 'seccion']);
  const errors = [];
  if (!names) errors.push(rowIssue(rowNumber, 'NOMBRES_AUSENTES', 'La fila no tiene nombres de estudiante.'));
  if (!identity.canIdentify) errors.push(rowIssue(rowNumber, 'IDENTIDAD_AUSENTE', 'La fila no tiene RUN, documento ni ID de usuario ERP.'));
  if (identity.rawRut && !identity.validRun && !identity.erpId) {
    errors.push(rowIssue(rowNumber, 'RUT_INVALIDO', 'El RUT/DV no supera la validación chilena y no existe un ID ERP alternativo.'));
  }
  const birthDateRaw = firstValue(row, ['Fecha Nacimiento', 'fecha_nacimiento', 'nacimiento']);
  const birthDate = normalizeDate(birthDateRaw);
  if (birthDateRaw && !birthDate) errors.push(rowIssue(rowNumber, 'FECHA_INVALIDA', 'No se pudo normalizar la fecha de nacimiento.', { value: birthDateRaw }));
  const guardianRaw = firstValue(row, ['RUT Apoderado', 'RUT Apoderados', 'apoderado_rut', 'rut_apoderado']);
  const guardian = guardianRaw ? normalizeRutAndDv(guardianRaw) : { rut: '', dv: '' };
  const guardianIdentifier = guardian.rut ? `${guardian.rut}${guardian.dv ? `-${guardian.dv}` : ''}` : guardianRaw || '';
  if (guardianRaw && guardian.dv && !validateRut(guardian.rut, guardian.dv)) warnings.push(rowIssue(rowNumber, 'RUT_APODERADO_INVALIDO', 'El RUT del apoderado requiere revisión.'));
  if (errors.length) return { row: null, errors, warnings };
  const originId = identity.erpId || identity.key;
  return {
    row: {
      rowNumber,
      sourceSheet: sheet,
      origin,
      originId,
      identity: {
        type: identity.type,
        value: identity.document,
        sourceId: identity.erpId,
        rut: identity.rut,
        dv: identity.dv,
        documentType: identity.documentType,
        country: identity.country
      },
      courseName: courseName || null,
      section: section || null,
      data: {
        names,
        surname: surnames.surname,
        secondSurname: surnames.secondSurname,
        identifierType: identity.validRun ? 'RUN' : identity.type === 'IPE_MINEDUC' ? 'IPE' : identity.type === 'DOCUMENTO_EXTRANJERO' ? 'Otro' : 'Otro',
        identifier: identity.document,
        birthDate,
        email: firstValue(row, ['Email', 'correo', 'mail']),
        // Telephone belongs to the source student row. It is deliberately
        // kept as `phone` (and the legacy Spanish alias) instead of being
        // guessed as the Word form's emergency contact.
        phone: firstValue(row, ['Teléfono', 'telefono', 'phone']),
        telefono: firstValue(row, ['Teléfono', 'telefono', 'phone']),
        guardianIdentifier,
        course: courseName,
        section,
        gender: firstValue(row, ['Género', 'genero', 'gender']),
        sourceGender: firstValue(row, ['Género', 'genero', 'gender']),
        sourceBarcode: firstValue(row, ['Código Barra', 'Codigo Barra', 'codigo_barra', 'barcode']),
        sourceCountry: identity.country,
        sourceIdentifierType: identity.sourceIdentifierType
      },
      // Deliberately no username/password fields: this is a student roster,
      // never an access-account import.
      account: null
    },
    errors,
    warnings
  };
}

function toObjectRows(value) {
  if (!Array.isArray(value)) return [];
  if (!value.length) return [];
  if (value.every((row) => row && !Array.isArray(row) && typeof row === 'object')) return value;
  const headerIndex = value.findIndex((row) => Array.isArray(row) && row.some((cell) => {
    const key = normalizeHeader(cell);
    return key === 'iddeusuarionomodificar' || key === 'nombres' || key === 'estudiante' || key === 'valorcompleto';
  }));
  if (headerIndex < 0) return [];
  const headers = value[headerIndex].map((header, index) => text(header) || `Columna ${index + 1}`);
  return value.slice(headerIndex + 1).filter((row) => Array.isArray(row) && row.some((cell) => text(cell))).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function getSheets(workbook) {
  if (Array.isArray(workbook)) return { Usuarios: workbook };
  if (workbook instanceof Map) return Object.fromEntries(workbook.entries());
  if (!workbook || typeof workbook !== 'object') return {};
  if (workbook.sheets && typeof workbook.sheets === 'object' && !Array.isArray(workbook.sheets)) return workbook.sheets;
  if (Array.isArray(workbook.sheets)) return Object.fromEntries(workbook.sheets.map((sheet) => [sheet.name || sheet.sheet || 'Hoja', sheet.rows || sheet.data || []]));
  if (workbook.rows) return { Usuarios: workbook.rows };
  return workbook;
}

function sheetKind(name) {
  const key = normalizeHeader(name);
  if (key === 'usuarios' || key === 'usuario' || key === 'estudianteserp') return 'usuarios';
  if (key === 'identificadores') return 'identificadores';
  if (key === 'estudiantes' || key === 'padronadministrativo' || key === 'padron') return 'administrativo';
  return null;
}

function normalizeAdministrativeRow(row, { rowNumber, sheet }) {
  const name = firstValue(row, ['Estudiante', 'Nombre', 'Nombres']);
  const split = splitSurname(name);
  const rawDocument = firstValue(row, ['Documento completo', 'Valor completo', 'RUT', 'RUN', 'Identificador']);
  const identityType = firstValue(row, ['Tipo', 'Tipo de documento', 'Identificador principal']);
  const id = firstValue(row, ['ID interno', 'ID de Usuario (no modificar)', 'ID usuario', 'uuid_erp']);
  const courseName = firstValue(row, ['Curso', 'grade']);
  const country = firstValue(row, ['País', 'Pais', 'País emisor']);
  const identity = normalizeRutAndDv(rawDocument);
  const validRun = validateRut(identity.rut, identity.dv);
  const value = validRun ? `${identity.rut}-${identity.dv}` : rawDocument || id;
  return {
    rowNumber,
    sourceSheet: sheet,
    origin: 'ERP_ADMINISTRATIVO',
    originId: id || (value ? `${normalizeHeader(identityType || 'documento')}:${value}` : null),
    studentInternalId: id || null,
    name,
    surname: split.surname,
    secondSurname: split.secondSurname,
    courseName: courseName || null,
    identity: { type: validRun ? 'RUN_CHILE' : identityType || 'ID_ERP', value: value || null, rut: validRun ? identity.rut : null, dv: validRun ? identity.dv : null, country: country || null },
    status: firstValue(row, ['Matrícula', 'Estado', 'Estado de matrícula']),
    validation: firstValue(row, ['Validación', 'Resultado', 'Estado de validación']),
    source: firstValue(row, ['Fuente', 'Origen de ficha'])
  };
}

export function normalizeAdministrativeRows(rows, { sheet = 'Estudiantes' } = {}) {
  return toObjectRows(rows).filter((row) => Object.values(row).some((value) => text(value))).map((row, index) => normalizeAdministrativeRow(row, { rowNumber: index + 2, sheet }));
}

function administrativeToStudent(row) {
  if (!row.identity?.value && !row.name) return null;
  return {
    rowNumber: row.rowNumber,
    sourceSheet: row.sourceSheet,
    origin: row.origin,
    originId: row.originId,
    identity: row.identity,
    courseName: row.courseName,
    section: null,
    data: {
      names: row.name || '', surname: row.surname || '', secondSurname: row.secondSurname || '',
      identifierType: row.identity.type === 'RUN_CHILE' ? 'RUN' : 'Otro', identifier: row.identity.value || '',
      birthDate: null, email: '', emergencyPhone: '', guardianIdentifier: '', course: row.courseName || '', section: '', gender: ''
    },
    account: null
  };
}

/**
 * Normalize a workbook represented by object rows or matrix rows. The return
 * value is intentionally JSON-safe and contains no raw password/account data.
 */
export function normalizeSchoolWorkbook(workbook, { origin = 'ERP_USUARIOS', year = null, courses = null, maxRows = 5000 } = {}) {
  const sheets = getSheets(workbook);
  const errors = [];
  const warnings = [];
  const ignored = [];
  const rows = [];
  const administrativeRows = [];
  const seen = new Map();
  let usuariosFound = false;
  for (const [sheet, sheetRows] of Object.entries(sheets)) {
    const kind = sheetKind(sheet);
    if (kind === 'usuarios') {
      usuariosFound = true;
      const objects = toObjectRows(sheetRows);
      if (objects.length > maxRows) {
        errors.push(rowIssue(0, 'LIMITE_FILAS', `La importación admite hasta ${maxRows} filas de estudiantes.`));
      }
      objects.slice(0, maxRows).forEach((raw, index) => {
        const normalized = normalizeStudentRow(raw, { rowNumber: index + 2, sheet, origin });
        warnings.push(...(normalized.warnings || []));
        if (normalized.ignored) { ignored.push(normalized.ignored); return; }
        if (normalized.errors?.length) { errors.push(...normalized.errors); return; }
        const keys = [
          normalized.row.identity.sourceId ? `erp:${normalized.row.identity.sourceId}` : null,
          normalized.row.identity.value ? `${normalized.row.identity.type}:${normalized.row.identity.value}` : null,
          normalized.row.identity.rut ? `rut:${normalized.row.identity.rut}-${normalized.row.identity.dv || ''}` : null
        ].filter(Boolean);
        const collisionKey = keys.find((key) => seen.has(key));
        if (collisionKey) {
          errors.push(rowIssue(normalized.row.rowNumber, 'DUPLICADO_IDENTIDAD', 'La identidad ya aparece en otra fila; no se fusionaron estudiantes.', { firstRow: seen.get(collisionKey), key: collisionKey }));
          return;
        }
        for (const key of keys) seen.set(key, normalized.row.rowNumber);
        normalized.row.courseYear = year === null || year === undefined ? null : Number(year);
      normalized.row.fields = normalized.row.data;
      rows.push(normalized.row);
      });
    } else if (kind === 'administrativo' || kind === 'identificadores') {
      const parsed = normalizeAdministrativeRows(sheetRows, { sheet });
      administrativeRows.push(...parsed);
    }
  }
  if (!usuariosFound && administrativeRows.length) rows.push(...administrativeRows.map(administrativeToStudent).filter(Boolean));
  for (const candidate of rows) if (!candidate.fields) candidate.fields = candidate.data;
  const unresolvedCourses = [];
  if (Array.isArray(courses)) {
    const normalizedCourses = courses.map((course) => ({
      ...course,
      key: normalizeHeader(typeof course === 'string' ? course : course?.name),
      year: typeof course === 'object' && course?.year !== undefined ? Number(course.year) : null,
      id: typeof course === 'string' ? course : course?.id
    }));
    for (const candidate of rows) {
      if (!candidate.courseName) {
        warnings.push(rowIssue(candidate.rowNumber, 'CURSO_AUSENTE', 'La fila no trae curso; requiere asignación antes de matricular.'));
        continue;
      }
      const matching = normalizedCourses.find((course) => course.key === normalizeHeader(candidate.courseName) && (course.year === null || year === null || course.year === Number(year)));
      if (matching) {
        candidate.courseId = matching.id || matching.name;
      } else {
        const key = `${normalizeHeader(candidate.courseName)}|${year ?? ''}`;
        if (!unresolvedCourses.some((entry) => entry.key === key)) unresolvedCourses.push({ key, name: candidate.courseName, year: year === null ? null : Number(year) });
        errors.push(rowIssue(candidate.rowNumber, 'CURSO_NO_RESUELTO', `No existe un curso configurado que coincida con «${candidate.courseName}».`, { courseName: candidate.courseName, year }));
      }
    }
  }
  if (!Object.keys(sheets).length) errors.push(rowIssue(0, 'LIBRO_VACIO', 'El libro no contiene hojas reconocibles.'));
  else if (!rows.length && !administrativeRows.length && !errors.length) errors.push(rowIssue(0, 'FILAS_AUSENTES', 'La hoja no contiene filas de estudiantes para importar.'));
  return {
    source: origin,
    rows,
    administrativeRows,
    errors,
    warnings,
    ignored,
    unresolvedCourses,
    sheets: Object.keys(sheets),
    summary: { total: rows.length, errors: errors.length, warnings: warnings.length, ignored: ignored.length, administrative: administrativeRows.length, unresolvedCourses: unresolvedCourses.length },
    canImport: rows.length > 0 && errors.length === 0
  };
}

export function parseSchoolWorkbook(workbook, options = {}) {
  if (Buffer.isBuffer(workbook) || workbook instanceof Uint8Array || typeof workbook === 'string') return parseXlsx(workbook, options);
  return normalizeSchoolWorkbook(workbook, options);
}
export const normalizeWorkbook = normalizeSchoolWorkbook;
export const normalizeStudentRows = (rows, options = {}) => normalizeSchoolWorkbook({ Usuarios: rows }, options);
export const parseWorkbook = parseSchoolWorkbook;

/** Parse xlsx bytes only when the optional read-excel-file dependency exists. */
export async function readXlsx(input, { sheets = null, fileName = '' } = {}) {
  if (/\.xls$/i.test(fileName)) {
    const error = new Error('El importador acepta .xlsx. Convierte el archivo .xls a .xlsx antes de previsualizarlo.');
    error.code = 'XLS_FORMAT_UNSUPPORTED';
    throw error;
  }
  let reader;
  try {
    const imported = await import('read-excel-file/node');
    reader = imported.default || imported;
  } catch {
    const error = new Error('Para leer archivos .xlsx instale la dependencia opcional "read-excel-file" (npm install read-excel-file). Las matrices y filas ya normalizadas no requieren dependencia.');
    error.code = 'XLSX_DEPENDENCY_REQUIRED';
    throw error;
  }
  const names = sheets || ['Usuarios', 'Estudiantes', 'Padrón administrativo', 'Identificadores'];
  let workbook;
  try { workbook = await reader(input); } catch { throw Object.assign(new Error('El archivo no se puede leer como una planilla .xlsx válida.'), {status:400,code:'XLSX_INVALID'}); }
  const result = {};
  // read-excel-file 9 returns all sheets as {sheet,data}; options.sheet
  // belongs to the former API and silently has no effect on that result.
  for (const item of workbook) if (names.some(name=>normalizeHeader(name)===normalizeHeader(item.sheet))) result[item.sheet]=item.data;
  if (!Object.keys(result).length && workbook[0]) result.Usuarios=workbook[0].data;
  return result;
}

export async function parseXlsx(input, options = {}) {
  return normalizeSchoolWorkbook(await readXlsx(input, options), options);
}
