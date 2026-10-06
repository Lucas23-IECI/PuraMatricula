import { baseFields } from './fields.mjs';

/** Fields that retain useful source-system values without changing the Word form. */
export const sourceFields = Object.freeze([
  { key: 'studentPhone', label: 'Teléfono del padrón ERP', section: 'contactos', type: 'tel', sensitive: false },
  { key: 'sourceGender', label: 'Género informado por el padrón ERP', section: 'reservados', type: 'text', sensitive: true },
  { key: 'sourceBarcode', label: 'Código de barra del padrón ERP', section: 'identificacion', type: 'text', sensitive: false },
  { key: 'sourceCountry', label: 'País emisor informado por el padrón ERP', section: 'identificacion', type: 'text', sensitive: false },
  { key: 'sourceIdentifierType', label: 'Tipo de documento informado por el padrón ERP', section: 'identificacion', type: 'text', sensitive: false }
]);
export const IMPORT_SOURCE_FIELDS = sourceFields;

const sourceKeys = new Set(sourceFields.map((field) => field.key));

function parseFields(row) {
  if (!row) return [];
  if (Array.isArray(row.fields)) return row.fields;
  if (typeof row.fields === 'string') {
    try { return JSON.parse(row.fields); } catch { return []; }
  }
  return [];
}

/**
 * Ensure a new database has a template version with the fixed ERP source
 * fields. Existing template rows remain immutable; this only appends a new
 * version when the latest one predates the import extension.
 */
function ensureFromLatest(store, latest) {
  if (!latest) throw new Error('No existe una plantilla base para agregar los campos del padrón ERP.');
  const current = parseFields(latest);
  if (sourceFields.every((field) => current.some((candidate) => candidate?.key === field.key))) {
    return { ...latest, fields: current };
  }
  // Use the canonical base reference, then retain any approved additions from
  // the latest version before appending this fixed extension.
  const keys = new Set();
  const fields = [];
  for (const field of [...baseFields, ...current, ...sourceFields]) {
    if (!field?.key || keys.has(field.key)) continue;
    keys.add(field.key);
    fields.push(field);
  }
  const name = `Referencia Word + padrón ERP · versión ${Number(latest.id || 0) + 1}`;
  const createdAt = new Date().toISOString();
  const result = store.db.prepare('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?)').run(name, JSON.stringify(fields), createdAt);
  // Async SQL adapters expose lastInsertRowid in their resolved result.
  if (result && typeof result.then === 'function') return result.then(inserted => ({ id: inserted?.lastInsertRowid ?? inserted?.lastInsertId, name, fields, created_at: createdAt }));
  const id = result?.lastInsertRowid ?? result?.lastInsertId;
  return { id, name, fields, created_at: createdAt };
}

export function ensureImportFields(store) {
  if (!store?.db?.prepare) throw new Error('Se requiere un store con tabla de plantillas.');
  const latest = store.db.prepare('SELECT * FROM templates ORDER BY id DESC LIMIT 1').get();
  if (latest && typeof latest.then === 'function') return latest.then(row => ensureFromLatest(store, row));
  return ensureFromLatest(store, latest);
}

export function hasImportFields(fields) {
  const list = Array.isArray(fields) ? fields : parseFields(fields);
  return sourceKeys.size > 0 && [...sourceKeys].every((key) => list.some((field) => field?.key === key));
}
