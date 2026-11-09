import { timingSafeEqual } from 'node:crypto';
import { baseFields, validateFields } from './fields.mjs';
import { sourceFields } from './import-fields.mjs';

const protectedFields = [...baseFields, ...sourceFields];
export const templateProtectedKeys = Object.freeze(protectedFields.map(field => field.key));
const protectedKeySet = new Set(templateProtectedKeys);
const previewLifetime = 15 * 60_000;

function canonicalField(field) {
  return {
    key: field.key, label: field.label.trim(), section: field.section, type: field.type, sensitive: field.sensitive,
    ...(field.type === 'select' ? { options: field.options.map(option => option.trim()) } : {}),
    ...(field.hidden ? { hidden: true } : {})
  };
}

function fieldEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function compareFields(before, after) {
  const previous = new Map(before.map(field => [field.key, canonicalField(field)]));
  const next = new Map(after.map(field => [field.key, field]));
  return {
    added: after.filter(field => !previous.has(field.key)).map(field => field.key),
    edited: after.filter(field => {
      const old = previous.get(field.key);
      if (!old) return false;
      const { hidden: oldHidden, ...oldDefinition } = old;
      const { hidden: newHidden, ...newDefinition } = field;
      return !fieldEqual(oldDefinition, newDefinition);
    }).map(field => field.key),
    hidden: after.filter(field => field.hidden && !previous.get(field.key)?.hidden).map(field => field.key),
    shown: after.filter(field => !field.hidden && previous.get(field.key)?.hidden).map(field => field.key),
    reordered: !fieldEqual(before.filter(field => next.has(field.key)).map(field => field.key), after.filter(field => previous.has(field.key)).map(field => field.key))
  };
}

export function createTemplateWorkflow(store, { requirePermission, fail }) {
  const { db, mac, audit, transaction } = store;

  async function validatedDraft(u, input) {
    requirePermission(u, 'admin');
    if (!input || typeof input !== 'object' || !Number.isInteger(input.baseTemplateId)) fail(400, 'Indique la plantilla que sirve de base.');
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) fail(400, 'Nombre de versión inválido.');
    const base = await db.prepare('SELECT id,fields FROM templates ORDER BY id DESC LIMIT 1').get();
    if (!base || Number(base.id) !== input.baseTemplateId) fail(409, 'La plantilla vigente cambió. Abra un borrador desde la versión actual y vuelva a revisarlo.', 'TEMPLATE_BASE_STALE');
    let fields;
    try {
      // Validate raw values before normalizing property order and presentation.
      if (!Array.isArray(input.fields) || input.fields.length > 180) throw new Error('Conserve la referencia y agregue hasta 180 campos.');
      fields = input.fields.map(field => {
        if (!field || typeof field !== 'object' || Array.isArray(field) || typeof field.label !== 'string' || (field.hidden !== undefined && typeof field.hidden !== 'boolean') || (field.type === 'select' && (!Array.isArray(field.options) || field.options.some(option => typeof option !== 'string')))) throw new Error('Campo adicional inválido.');
        const canonical = canonicalField(field);
        if (canonical.type === 'select' && (canonical.options.some(option => !option) || new Set(canonical.options).size !== canonical.options.length)) throw new Error('Las opciones no pueden estar vacías ni repetidas.');
        return canonical;
      });
      validateFields(fields);
    } catch (error) { fail(400, error.message, 'TEMPLATE_FIELDS_INVALID'); }
    const previous = JSON.parse(base.fields), before = new Map(previous.map(field => [field.key, field])), after = new Map(fields.map(field => [field.key, field]));
    for (const field of protectedFields) {
      const candidate = after.get(field.key);
      if ((candidate && !fieldEqual(candidate, field)) || (!candidate && before.has(field.key))) fail(400, 'Los campos base y de importación se conservan completos, visibles y sin cambios.', 'TEMPLATE_FIELD_PROTECTED');
    }
    const originalOrder = previous.filter(field => protectedKeySet.has(field.key)).map(field => field.key);
    const nextOrder = fields.filter(field => before.has(field.key) && protectedKeySet.has(field.key)).map(field => field.key);
    if (!fieldEqual(originalOrder, nextOrder)) fail(400, 'Solo se puede reordenar preguntas adicionales.', 'TEMPLATE_FIELD_PROTECTED');
    for (const field of previous) {
      const candidate = after.get(field.key);
      if (!candidate) fail(400, 'Para retirar una pregunta del formulario, ocúltela y conserve su identificador.', 'TEMPLATE_FIELD_MISSING');
      if (field.sensitive && !candidate.sensitive) fail(400, 'No se puede quitar la reserva de una pregunta existente.', 'TEMPLATE_SENSITIVITY_DOWNGRADE');
    }
    return { baseTemplateId: input.baseTemplateId, name: input.name.trim(), fields, changes: compareFields(previous, fields) };
  }

  function sign(user, draft, expires) {
    return mac(JSON.stringify(['template.preview.v1', user.id, draft.baseTemplateId, draft.name, draft.fields, expires]));
  }

  const previewTemplate = async (u, input) => {
    const draft = await validatedDraft(u, input), expires = Date.now() + previewLifetime;
    return { ...draft, expiresAt: new Date(expires).toISOString(), previewToken: `${expires}.${sign(u, draft, expires)}` };
  };

  const publishTemplate = async (u, input) => transaction(async () => {
    // Check the active base inside the same write transaction as publication.
    const draft = await validatedDraft(u, input);
    const token = typeof input.previewToken === 'string' ? /^(\d{13})\.([a-f0-9]{64})$/.exec(input.previewToken) : null;
    const expires = Number(token?.[1]);
    if (!token || expires <= Date.now() || !timingSafeEqual(Buffer.from(token[2], 'hex'), Buffer.from(sign(u, draft, expires), 'hex'))) fail(409, 'Revise la vista previa de esta versión antes de publicarla. Si la cambió o la vista previa venció, genérela de nuevo.', 'TEMPLATE_PREVIEW_REQUIRED');
    const inserted = await db.prepare('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?)').run(draft.name, JSON.stringify(draft.fields), new Date().toISOString());
    const id = Number(inserted.lastInsertRowid);
    await audit(u.id, 'template.publish', String(id), { baseTemplateId: draft.baseTemplateId, count: draft.fields.length, added: draft.changes.added.length, edited: draft.changes.edited.length, hidden: draft.changes.hidden.length, shown: draft.changes.shown.length, reordered: draft.changes.reordered });
    return { id, name: draft.name };
  });

  return { previewTemplate, publishTemplate };
}
