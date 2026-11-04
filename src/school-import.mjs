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

/** Stable target keys are independent of the source workbook's wording. */
export const MAPPING_TARGETS = Object.freeze([
  ['names', 'Nombres del estudiante'], ['surname', 'Apellido paterno del estudiante'],
  ['secondSurname', 'Apellido materno del estudiante'], ['identifier', 'Identificación del estudiante'],
  ['identifierType', 'Tipo de identificación'], ['guardianNames', 'Nombres del apoderado'],
  ['guardianSurname', 'Apellido paterno del apoderado'], ['guardianSecondSurname', 'Apellido materno del apoderado'],
  ['guardianIdentifier', 'Identificación del apoderado'], ['contactPhone', 'Teléfono de contacto'],
  ['contactEmail', 'Correo de contacto'], ['address', 'Domicilio'], ['commune', 'Comuna'],
  ['courseName', 'Curso'], ['section', 'Sección'], ['birthDate', 'Fecha de nacimiento']
].map(([key, label]) => Object.freeze({ key, label })));

const COLUMN_ALIASES = Object.freeze({
  names: ['Nombres (Estudiante)', 'Nombres del estudiante', 'Nombres alumno', 'Nombres', 'Nombre', 'Name'],
  surname: ['Apellido Paterno (Estudiante)', 'Apellido paterno estudiante', 'Apellido paterno', 'Primer apellido'],
  secondSurname: ['Apellido Materno (Estudiante)', 'Apellido materno estudiante', 'Apellido materno', 'Segundo apellido'],
  identifier: ['RUT (Estudiante)', 'RUN (Estudiante)', 'RUT estudiante', 'RUN estudiante', 'Identificador', 'RUT', 'RUN', 'Documento'],
  identifierType: ['Tipo de documento', 'Tipo identificación', 'Tipo de identificación'],
  guardianNames: ['Nombres (Apoderado)', 'Nombres apoderado', 'Nombre del apoderado', 'Nombre apoderado'],
  guardianSurname: ['Apellido Paterno (APODERADO)', 'Apellido paterno apoderado'],
  guardianSecondSurname: ['Apellido Materno (APODERADO)', 'Apellido materno apoderado'],
  guardianIdentifier: ['RUT (Apoderado)', 'RUT apoderado', 'RUN apoderado', 'Identificador apoderado'],
  contactPhone: ['Contacto (Teléfono)', 'Teléfono de contacto', 'Teléfono contacto', 'Teléfono', 'Phone'],
  contactEmail: ['Contacto (Email) SOLO SI REGISTRÓ', 'Contacto (Email)', 'Correo de contacto', 'Correo contacto', 'Email', 'Correo'],
  address: ['DOMICILIO', 'Dirección', 'Domicilio estudiante'], commune: ['COMUNA', 'Comuna estudiante'],
  courseName: ['Curso', 'Grade'], section: ['Sección', 'Section'],
  birthDate: ['Fecha Nacimiento', 'Fecha de nacimiento', 'Nacimiento']
});

export function normalizeCourseName(value) {
  const label = text(value).replace(/\s+/g, ' ');
  const key = normalizeHeader(label);
  if (/^(prekinder|prekindergarten|nt1)$/.test(key)) return 'Prekínder';
  if (/^(kinder|kindergarten|nt2)$/.test(key)) return 'Kínder';
  const match = label.match(/^(\d{1,2})\s*[°ºo]?\s*(b[aá]sico|medio)\s*([a-z])?$/i);
  return match ? `${Number(match[1])}° ${/^b/i.test(match[2]) ? 'Básico' : 'Medio'}${match[3] ? ` ${match[3].toUpperCase()}` : ''}` : label;
}

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

function isAccountHeader(value) {
  const key = normalizeHeader(value);
  return ACCOUNT_HEADERS.has(key) || /password|passwd|contrasena|credencial|^clave|^nombreusuario|^username|^correoacceso|^emailacceso/.test(key);
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

function suggestedMapping(headers) {
  return Object.fromEntries(MAPPING_TARGETS.map(({ key }) => [key, headers.find(header => COLUMN_ALIASES[key].some(alias => normalizeHeader(alias) === normalizeHeader(header))) || '']));
}

function selectedMapping(headers, explicit = {}) {
  const suggested = suggestedMapping(headers);
  for (const [key, header] of Object.entries(explicit)) if (MAPPING_TARGETS.some(target => target.key === key)) suggested[key] = text(header);
  return suggested;
}

function mappedValue(row, mapping, key) {
  const header = mapping[key];
  if (!header || isAccountHeader(header)) return '';
  return firstValue(row, [header]);
}

function applyErpMapping(row, mapping, explicit) {
  const copy = { ...row };
  const destinations = { names: 'Nombres', surname: 'Apellido paterno', secondSurname: 'Apellido materno', identifier: 'RUT', identifierType: 'Tipo de documento',
    guardianNames: 'Nombres apoderado', guardianSurname: 'Apellido paterno apoderado', guardianSecondSurname: 'Apellido materno apoderado', guardianIdentifier: 'RUT Apoderado',
    contactPhone: 'Teléfono', contactEmail: 'Email', address: 'Domicilio', commune: 'Comuna', courseName: 'Curso', section: 'Sección', birthDate: 'Fecha Nacimiento' };
  for (const key of Object.keys(explicit)) {
    const destination = destinations[key];
    if (!destination) continue;
    for (const header of Object.keys(copy)) if (COLUMN_ALIASES[key].some(alias => normalizeHeader(alias) === normalizeHeader(header))) delete copy[header];
    copy[destination] = mappedValue(row, mapping, key);
  }
  return copy;
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
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const candidate = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
    return !Number.isNaN(candidate.getTime()) && candidate.toISOString().slice(0, 10) === raw.slice(0, 10) ? raw.slice(0, 10) : null;
  }
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
    if (isAccountHeader(key)) ignored.push(key);
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
  surnames.surname = firstValue(row, COLUMN_ALIASES.surname) || surnames.surname;
  surnames.secondSurname = firstValue(row, COLUMN_ALIASES.secondSurname) || surnames.secondSurname;
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

function inspectSheet(value, explicit = {}, headerRow = null) {
  if (!Array.isArray(value) || !value.length) return { headers: [], entries: [], headerRow: 0, duplicateHeaders: false };
  if (value.every(row => row && !Array.isArray(row) && typeof row === 'object')) {
    const headers = [...new Set(value.flatMap(row => Object.keys(row)))];
    return { headers, headerRow: 1, duplicateHeaders: false, entries: value.map((row, index) => ({ row, rowNumber: index + 2 })).filter(item => Object.values(item.row).some(cell => text(cell))) };
  }
  const requested = Object.values(explicit).map(normalizeHeader).filter(Boolean);
  let headerIndex = headerRow ? headerRow-1 : value.slice(0, 30).findIndex(row => Array.isArray(row) && row.some(cell => {
    const key = normalizeHeader(cell);
    return ['iddeusuarionomodificar', 'nombres', 'nombresestudiante', 'nombresdelestudiante', 'estudiante', 'valorcompleto'].includes(key) || requested.includes(key);
  }));
  // Unknown layouts are still presented to the operator for explicit mapping.
  if (headerIndex < 0) headerIndex = value.findIndex(row => Array.isArray(row) && row.some(cell => text(cell)));
  if (headerIndex < 0 || !Array.isArray(value[headerIndex])) return { headers: [], entries: [], headerRow: 0, duplicateHeaders: false };
  const headers = value[headerIndex].map((header, index) => text(header) || `Columna ${index + 1}`);
  const names = headers.map(normalizeHeader);
  const duplicateHeaders = names.some((name, index) => names.indexOf(name) !== index);
  const entries = value.slice(headerIndex + 1).map((row, index) => ({ row, rowNumber: headerIndex + index + 2 }))
    .filter(item => Array.isArray(item.row) && item.row.some(cell => text(cell)))
    .map(item => ({ row: Object.fromEntries(headers.map((header, index) => [header, item.row[index] ?? ''])), rowNumber: item.rowNumber }));
  return { headers, headerRow: headerIndex + 1, entries, duplicateHeaders };
}

function toObjectRows(value) { return inspectSheet(value).entries.map(item => item.row); }

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
  return inspectSheet(rows).entries.map(({ row, rowNumber }) => normalizeAdministrativeRow(row, { rowNumber, sheet }));
}

function normalizeCourseRosterRow(raw, { mapping, rowNumber, sheet, year, courseName, courseId, contactOwner, addressOwner }) {
  const get = key => mappedValue(raw, mapping, key);
  const names = get('names'), surname = get('surname'), secondSurname = get('secondSurname'), identifierRaw = get('identifier');
  if (![names, surname, secondSurname, identifierRaw].some(Boolean)) return { row: null, ignored: rowIssue(rowNumber, 'FILA_SIN_ESTUDIANTE', 'Se omitió una fila sin datos de estudiante.', { sheet }) };
  const errors = [], warnings = [];
  const issue = (code, message) => rowIssue(rowNumber, code, message, { sheet });
  if (!names) errors.push(issue('NOMBRES_AUSENTES', 'La fila no tiene nombres de estudiante.'));
  if (!surname) errors.push(issue('APELLIDO_AUSENTE', 'La fila no tiene apellido paterno de estudiante.'));
  const rut = normalizeRutAndDv(identifierRaw), validRun = /^(\d{7,8})-?([0-9K])$/.test(identifierRaw.toUpperCase().replace(/[.\s]/g, '')) && validateRut(rut.rut, rut.dv), inputType = get('identifierType'), typeKey = normalizeHeader(inputType);
  const explicitType = /^(run|rut|runchile|runchileno)$/.test(typeKey) ? 'RUN' : /^(ipe|ipemineduc)$/.test(typeKey) ? 'IPE' : /^pasaporte$/.test(typeKey) ? 'Pasaporte' : /^(otro|documentoextranjero)$/.test(typeKey) ? 'Otro' : null;
  const identifierType = inputType ? explicitType : validRun ? 'RUN' : null;
  if (!identifierRaw) errors.push(issue('IDENTIDAD_AUSENTE', 'La fila no tiene identificación de estudiante.'));
  else if (!identifierType || (identifierType === 'RUN' && !validRun)) errors.push(issue('RUT_INVALIDO', 'Revise el RUN y su dígito verificador o indique un tipo de documento explícito.'));
  if (identifierRaw.length > 80) errors.push(issue('IDENTIFICADOR_LARGO', 'El identificador supera 80 caracteres; revise la columna asignada.'));
  const identifier = identifierType === 'RUN' ? `${rut.rut}-${rut.dv}` : identifierRaw.toUpperCase();
  const guardianRaw = get('guardianIdentifier'), guardian = normalizeRutAndDv(guardianRaw);
  const guardianIdentifier = guardianRaw && validateRut(guardian.rut, guardian.dv) ? `${guardian.rut}-${guardian.dv}` : guardianRaw;
  if (guardianRaw && !validateRut(guardian.rut, guardian.dv)) warnings.push(issue('RUT_APODERADO_INVALIDO', 'El identificador del apoderado requiere revisión.'));
  const birthRaw = get('birthDate'), birthDate = normalizeDate(birthRaw);
  if (birthRaw && !birthDate) errors.push(issue('FECHA_INVALIDA', 'La fecha de nacimiento requiere revisión.'));
  if (errors.length) return { row: null, errors, warnings };
  const guardianNames = get('guardianNames'), guardianSurname = get('guardianSurname'), guardianSecondSurname = get('guardianSecondSurname');
  const contactPhone = get('contactPhone'), contactEmail = get('contactEmail'), address = get('address'), commune = get('commune');
  const data = {
    names, surname, secondSurname, identifierType, identifier, birthDate,
    guardianName: [guardianNames, guardianSurname, guardianSecondSurname].filter(Boolean).join(' '), guardianIdentifier,
    sourceGuardianNames: guardianNames, sourceGuardianSurname: guardianSurname, sourceGuardianSecondSurname: guardianSecondSurname,
    sourceSheet: sheet, sourceRow: String(rowNumber), sourceContactPhone: contactPhone, sourceContactEmail: contactEmail,
    sourceAddress: address, sourceCommune: commune
  };
  if (contactOwner === 'guardian') { data.guardianPhone = contactPhone; data.guardianEmail = contactEmail; }
  else if (contactOwner === 'student') { data.studentPhone = contactPhone; data.email = contactEmail; }
  if (addressOwner === 'guardian') { data.guardianAddress = address; data.guardianCommune = commune; }
  else if (addressOwner === 'student') { data.address = address; data.commune = commune; }
  if ((contactPhone || contactEmail) && contactOwner === 'unassigned') warnings.push(issue('CONTACTO_SIN_TITULAR', 'El contacto se conserva en origen; confirme si corresponde al estudiante o al apoderado.'));
  if ((address || commune) && addressOwner === 'unassigned') warnings.push(issue('DOMICILIO_SIN_TITULAR', 'El domicilio se conserva en origen; confirme si corresponde al estudiante o al apoderado.'));
  const selectedCourse = normalizeCourseName(courseName || get('courseName') || sheet);
  const identityType = identifierType === 'RUN' ? 'RUN_CHILE' : identifierType === 'IPE' ? 'IPE_MINEDUC' : 'DOCUMENTO_EXTRANJERO';
  const row = {
    rowNumber, sourceSheet: sheet, origin: 'MATRICULA_POR_CURSO', originId: `${identifierType}:${identifier.replace(/[.\s-]/g, '').toUpperCase()}`,
    identity: { type: identityType, value: identifier, rut: identifierType === 'RUN' ? rut.rut : null, dv: identifierType === 'RUN' ? rut.dv : null, sourceId: null, documentType: identifierType, country: null },
    courseName: selectedCourse, section: get('section') || null, courseId: courseId || null, courseYear: year,
    data, fields: data, account: null
  };
  return { row, errors, warnings };
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
export function normalizeSchoolWorkbook(workbook, { origin = 'ERP_USUARIOS', year = null, courses = null, maxRows = 5000, columnMapping = {}, sheetMappings = {}, contactOwner = 'unassigned', addressOwner = 'unassigned' } = {}) {
  const sheets = getSheets(workbook);
  const errors = [];
  const warnings = [];
  const ignored = [];
  const rows = [];
  const administrativeRows = [];
  const seen = new Map();
  const sheetSummaries = [];
  const targetKeys = new Set(MAPPING_TARGETS.map(target => target.key));
  const isMapping = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!isMapping(columnMapping) || !isMapping(sheetMappings)) errors.push(rowIssue(0, 'MAPEO_INVALIDO', 'El mapeo de columnas y hojas debe ser un objeto.'));
  if (!['unassigned', 'guardian', 'student'].includes(contactOwner) || !['unassigned', 'guardian', 'student'].includes(addressOwner)) errors.push(rowIssue(0, 'TITULAR_INVALIDO', 'Indique una titularidad válida para contacto y domicilio.'));
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 5000) errors.push(rowIssue(0, 'LIMITE_INVALIDO', 'El límite de filas debe estar entre 1 y 5000.'));
  const specs = [];
  for (const [sheet, sheetRows] of Object.entries(sheets)) {
    const config = isMapping(sheetMappings) && Object.hasOwn(sheetMappings, sheet) ? sheetMappings[sheet] : {};
    if (!isMapping(config) || (config.include !== undefined && typeof config.include !== 'boolean') || (config.headerRow !== undefined && (!Number.isInteger(config.headerRow)||config.headerRow<1||config.headerRow>100)) || (config.courseName !== undefined && (typeof config.courseName !== 'string' || config.courseName.length > 80)) || (config.courseId !== undefined && typeof config.courseId !== 'string') || (config.columnMapping !== undefined && !isMapping(config.columnMapping))) {
      errors.push(rowIssue(0, 'MAPEO_HOJA_INVALIDO', 'La configuración de la hoja no es válida.', { sheet }));
      continue;
    }
    const explicit = { ...(isMapping(columnMapping) ? columnMapping : {}), ...(config.columnMapping || {}) };
    for (const [key, value] of Object.entries(explicit)) {
      if (!targetKeys.has(key) || typeof value !== 'string' || value.length > 200 || isAccountHeader(value)) errors.push(rowIssue(0, 'MAPEO_COLUMNA_INVALIDO', 'Elija un destino permitido y un encabezado de datos; las credenciales no pueden importarse.', { sheet }));
    }
    const info = inspectSheet(sheetRows, explicit, config.headerRow);
    const mapping = selectedMapping(info.headers, explicit);
    const parenthetical = info.headers.some(header => ['nombresestudiante', 'nombresdelestudiante', 'apellidopaternoestudiante', 'rutestudiante'].includes(normalizeHeader(header)));
    const namedKind = sheetKind(sheet);
    const mappedFormat = (!namedKind || namedKind==='administrativo' || namedKind==='identificadores') && Object.keys(explicit).some(key => ['names', 'surname', 'identifier'].includes(key) && explicit[key]);
    const erpHeader = info.headers.some(header => ['iddeusuarionomodificar', 'apellidos'].includes(normalizeHeader(header))) && Boolean(mapping.names);
    const kind = parenthetical || mappedFormat ? 'por_curso' : namedKind || (erpHeader ? 'usuarios' : 'no_reconocido');
    const included = config.include !== false;
    const summary = { name: sheet, format: kind, headers: info.headers.filter(header => !isAccountHeader(header)), headerRow: info.headerRow,
      totalRows: info.entries.length, studentRows: 0, ignoredRows: 0, included, courseName: normalizeCourseName(config.courseName || (kind === 'por_curso' ? sheet : '')), suggestedMapping: suggestedMapping(info.headers) };
    sheetSummaries.push(summary);
    specs.push({ sheet, kind, config, info, mapping, summary });
  }
  const primary = specs.some(spec => spec.summary.included && ['usuarios', 'por_curso'].includes(spec.kind) && spec.info.entries.length);
  const hasAdministrative = specs.some(spec => spec.summary.included && spec.kind === 'administrativo');
  const mixedPrimary = specs.some(spec => spec.summary.included && spec.kind === 'usuarios') && specs.some(spec => spec.summary.included && spec.kind === 'por_curso');
  if (mixedPrimary) errors.push(rowIssue(0, 'FORMATOS_MEZCLADOS', 'El libro mezcla Usuarios y hojas de matrícula por curso. Seleccione explícitamente un formato para evitar cargas superpuestas.'));
  let intendedRows = 0;
  function addRow(candidate) {
    const keys = [candidate.identity.sourceId ? `erp:${candidate.identity.sourceId}` : null,
      candidate.identity.value ? `${candidate.identity.type}:${candidate.identity.value.replace(/[.\s-]/g, '').toUpperCase()}` : null,
      candidate.identity.rut ? `rut:${candidate.identity.rut}-${candidate.identity.dv || ''}` : null].filter(Boolean);
    const collision = keys.map(key => seen.get(key)).find(Boolean);
    if (collision) {
      errors.push(rowIssue(candidate.rowNumber, 'DUPLICADO_IDENTIDAD', 'La identidad ya aparece en otra fila; no se fusionaron estudiantes.', { sheet: candidate.sourceSheet, firstRow: collision.row, firstSheet: collision.sheet }));
      return;
    }
    for (const key of keys) seen.set(key, { row: candidate.rowNumber, sheet: candidate.sourceSheet });
    candidate.courseYear = year === null || year === undefined ? null : Number(year);
    if (!candidate.fields) candidate.fields = candidate.data;
    rows.push(candidate);
  }
  for (const spec of specs) {
    const { sheet, kind, config, info, mapping, summary } = spec;
    if (!summary.included) { summary.ignoredRows = info.entries.length; ignored.push(rowIssue(0, 'HOJA_EXCLUIDA', 'Hoja excluida explícitamente de la carga.', { sheet, count: info.entries.length })); continue; }
    if (kind === 'no_reconocido') {
      summary.ignoredRows = info.entries.length;
      if (info.entries.length || info.headers.length) errors.push(rowIssue(info.headerRow, 'HOJA_NO_RECONOCIDA', 'Asigne las columnas de esta hoja o exclúyala explícitamente antes de continuar.', { sheet }));
      else ignored.push(rowIssue(0, 'HOJA_VACIA', 'Se omitió una hoja vacía.', { sheet }));
      continue;
    }
    if (info.duplicateHeaders) { errors.push(rowIssue(info.headerRow, 'ENCABEZADO_DUPLICADO', 'La hoja tiene encabezados repetidos; distinga las columnas antes de importar.', { sheet })); continue; }
    const missingMappedHeaders = Object.entries({ ...(isMapping(columnMapping) ? columnMapping : {}), ...(config.columnMapping || {}) }).filter(([, header]) => header && !info.headers.some(source => normalizeHeader(source) === normalizeHeader(header)));
    if (missingMappedHeaders.length) { errors.push(rowIssue(info.headerRow, 'ENCABEZADO_NO_EXISTE', 'Una columna asignada no existe en esta hoja. Revise el mapeo específico de la hoja.', { sheet })); continue; }
    const auxiliary = (kind === 'administrativo' || kind === 'identificadores') && (primary || (kind === 'identificadores' && hasAdministrative));
    if (auxiliary) {
      administrativeRows.push(...info.entries.map(({ row, rowNumber }) => normalizeAdministrativeRow(row, { rowNumber, sheet })));
      summary.ignoredRows = info.entries.length;
      ignored.push(rowIssue(0, 'HOJA_AUXILIAR', 'Hoja administrativa auxiliar: no se crearon alumnos adicionales a partir de ella.', { sheet, count: info.entries.length }));
      continue;
    }
    for (const { row: raw, rowNumber } of info.entries) {
      let normalized;
      if (kind === 'por_curso') normalized = normalizeCourseRosterRow(raw, { mapping, rowNumber, sheet, year, courseName: config.courseName, courseId: config.courseId, contactOwner, addressOwner });
      else if (kind === 'usuarios') {
        normalized = normalizeStudentRow(applyErpMapping(raw, mapping, { ...(isMapping(columnMapping) ? columnMapping : {}), ...(config.columnMapping || {}) }), { rowNumber, sheet, origin });
        if(normalized.row){
          const data=normalized.row.data,get=key=>mappedValue(raw,mapping,key),guardianNames=get('guardianNames'),guardianSurname=get('guardianSurname'),guardianSecondSurname=get('guardianSecondSurname');
          Object.assign(data,{sourceSheet:sheet,sourceRow:String(rowNumber),sourceGuardianNames:guardianNames,sourceGuardianSurname:guardianSurname,sourceGuardianSecondSurname:guardianSecondSurname,sourceContactPhone:get('contactPhone'),sourceContactEmail:get('contactEmail'),sourceAddress:get('address'),sourceCommune:get('commune')});
          if(guardianNames||guardianSurname||guardianSecondSurname)data.guardianName=[guardianNames,guardianSurname,guardianSecondSurname].filter(Boolean).join(' ');
          if(contactOwner==='guardian'){data.guardianPhone=get('contactPhone');data.guardianEmail=get('contactEmail');data.email='';data.phone='';data.telefono='';}
          if(addressOwner==='guardian'){data.guardianAddress=get('address');data.guardianCommune=get('commune');}
          else if(addressOwner==='student'){data.address=get('address');data.commune=get('commune');}
        }
        if (normalized.row && config.courseName) normalized.row.courseName = normalizeCourseName(config.courseName);
        if (normalized.row && config.courseId) normalized.row.courseId = config.courseId;
      } else {
        if(Object.keys({ ...columnMapping,...(config.columnMapping||{}) }).length){errors.push(rowIssue(rowNumber,'MAPEO_ADMINISTRATIVO_INCOMPLETO','Para cambiar las columnas de este padrón, asigne también nombres, apellido e identificación del estudiante.',{sheet}));summary.studentRows++;intendedRows++;continue;}
        const admin = normalizeAdministrativeRow(raw, { rowNumber, sheet });
        administrativeRows.push(admin);
        const candidate = administrativeToStudent(admin);
        normalized = candidate ? { row: candidate, errors: [], warnings: [] } : { row: null, ignored: rowIssue(rowNumber, 'FILA_SIN_ESTUDIANTE', 'Se omitió una fila sin estudiante.', { sheet }) };
      }
      const withSheet = item => ({ ...item, sheet });
      warnings.push(...(normalized.warnings || []).map(withSheet));
      if (normalized.ignored) { summary.ignoredRows++; ignored.push(withSheet(normalized.ignored)); continue; }
      summary.studentRows++;
      intendedRows++;
      if (intendedRows > maxRows) continue;
      if (normalized.errors?.length) { errors.push(...normalized.errors.map(withSheet)); continue; }
      if (normalized.row) addRow(normalized.row);
    }
  }
  if (intendedRows > maxRows) errors.push(rowIssue(0, 'LIMITE_FILAS', `El libro contiene ${intendedRows} filas de estudiantes; la carga admite hasta ${maxRows} en total. No se importó un lote parcial.`));
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
      const matches = normalizedCourses.filter((course) => course.key === normalizeHeader(normalizeCourseName(candidate.courseName)) && (course.year === null || year === null || course.year === Number(year)));
      const matching = matches.length === 1 ? matches[0] : null;
      if (matching) {
        candidate.courseId = matching.id || matching.name;
      } else {
        const key = `${normalizeHeader(candidate.courseName)}|${year ?? ''}`;
        if (!unresolvedCourses.some((entry) => entry.key === key)) unresolvedCourses.push({ key, name: candidate.courseName, year: year === null ? null : Number(year) });
        errors.push(rowIssue(candidate.rowNumber, matches.length > 1 ? 'CURSO_AMBIGUO' : 'CURSO_NO_RESUELTO', matches.length > 1 ? 'Varios cursos coinciden; indique uno explícitamente.' : `No existe un curso configurado que coincida con «${candidate.courseName}».`, { sheet: candidate.sourceSheet, courseName: candidate.courseName, year }));
      }
    }
  }
  if (!Object.keys(sheets).length) errors.push(rowIssue(0, 'LIBRO_VACIO', 'El libro no contiene hojas reconocibles.'));
  else if (!rows.length && !errors.length) errors.push(rowIssue(0, 'FILAS_AUSENTES', 'La selección no contiene filas de estudiantes para importar.'));
  return {
    source: origin,
    rows,
    administrativeRows,
    errors,
    warnings,
    ignored,
    unresolvedCourses,
    sheets: Object.keys(sheets),
    sheetSummaries,
    mappingTargets: MAPPING_TARGETS,
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
  const names = sheets;
  let workbook;
  try { workbook = await reader(input); } catch { throw Object.assign(new Error('El archivo no se puede leer como una planilla .xlsx válida.'), {status:400,code:'XLSX_INVALID'}); }
  // read-excel-file 9 returns all sheets as {sheet,data}; options.sheet
  // belongs to the former API and silently has no effect on that result.
  return Object.fromEntries(workbook.filter(item=>!names||names.some(name=>normalizeHeader(name)===normalizeHeader(item.sheet))).map(item=>[item.sheet,item.data]));
}

export async function parseXlsx(input, options = {}) {
  return normalizeSchoolWorkbook(await readXlsx(input, options), options);
}
