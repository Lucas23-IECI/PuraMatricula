import { AsyncLocalStorage } from 'node:async_hooks';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { baseFields } from './fields.mjs';

/**
 * PostgreSQL counterpart of store.mjs.
 *
 * The adapter deliberately keeps the local store's data contract: JSON values
 * are text, dates are ISO text, UUIDs are text, and identity columns are
 * returned as JavaScript numbers. The service can therefore share most of its
 * validation and encryption code between SQLite and PostgreSQL.
 */

const SCHEMA = 'matricula';
const TABLES = ['users', 'sessions', 'courses', 'templates', 'students', 'records', 'revisions', 'events', 'attachments', 'audit', 'attachment_blobs', 'login_attempts'];
const TABLE_RE = new RegExp(`\\b(${['from', 'join', 'update', 'into', 'delete\\s+from'].join('|')})\\s+(${TABLES.join('|')})\\b`, 'gi');
const WRITE_LOCK_SQL = 'SELECT pg_advisory_xact_lock(294815027);';
const TX_STATE = new AsyncLocalStorage();

export const digest = value => createHash('sha256').update(String(value)).digest('hex');

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

export function checkPassword(password, hash) {
  try {
    const [salt, encoded] = String(hash || '').split(':');
    const expected = Buffer.from(encoded || '', 'hex');
    if (!salt || expected.length !== 64) return false;
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function base64Key(value, label) {
  if (Buffer.isBuffer(value)) {
    if (value.length !== 32) throw new Error(`${label} debe contener exactamente 32 bytes.`);
    return Buffer.from(value);
  }
  if (typeof value !== 'string' || !value) throw new Error(`${label} es obligatorio y debe estar codificado en base64.`);
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value.replace(/\s+/g, '')) throw new Error(`${label} debe ser base64 válido de 32 bytes.`);
  return key;
}

export function cleanDatabaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('MATRICULA_DATABASE_URL es obligatorio para el modo PostgreSQL.');
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('MATRICULA_DATABASE_URL no es una URL PostgreSQL válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('MATRICULA_DATABASE_URL debe usar postgres:// o postgresql://.');
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode && !['require', 'verify-ca', 'verify-full'].includes(sslmode)) throw new Error('La conexión PostgreSQL debe exigir TLS; sslmode inseguro no está permitido.');
  // pg parses sslmode inconsistently across versions. TLS is configured below
  // with rejectUnauthorized:true, so remove URL options that could override it.
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
  return url.toString();
}

function caFromEnv(value = process.env.MATRICULA_DATABASE_CA) {
  if (!value) return undefined;
  const ca = Buffer.from(value, 'base64');
  if (!ca.length || ca.toString('base64') !== String(value).replace(/\s+/g, '')) throw new Error('MATRICULA_DATABASE_CA debe ser base64 válido.');
  return ca.toString('utf8');
}

async function createPool(options = {}) {
  if (options.pool) return options.pool;
  const url = cleanDatabaseUrl(options.connectionString || process.env.MATRICULA_DATABASE_URL);
  const { Pool } = await import('pg');
  const ca = caFromEnv(options.ca);
  return new Pool({
    connectionString: url,
    max: 1,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
  });
}

function tableName(name) {
  if (!TABLES.includes(name)) throw new Error(`Tabla no permitida: ${name}`);
  return `${SCHEMA}.${name}`;
}

function qualifyTables(sql) {
  return String(sql).replace(TABLE_RE, (whole, verb, name) => `${verb} ${tableName(name.toLowerCase())}`);
}

function questionPlaceholders(sql) {
  let index = 0;
  let output = '';
  let quote = '';
  for (let i = 0; i < String(sql).length; i += 1) {
    const ch = sql[i];
    if (quote) {
      output += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) output += sql[++i];
        else quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; output += ch; continue; }
    if (ch === '?') output += `$${++index}`;
    else output += ch;
  }
  return output;
}

function rewriteOutsideQuotes(sql, rewrite) {
  let result = '';
  let start = 0;
  let quote = '';
  for (let i = 0; i < String(sql).length; i += 1) {
    const ch = sql[i];
    if (!quote && (ch === "'" || ch === '"' || ch === '`')) {
      result += rewrite(sql.slice(start, i));
      quote = ch;
      start = i;
      continue;
    }
    if (quote && ch === quote) {
      if (sql[i + 1] === quote) { i += 1; continue; }
      result += sql.slice(start, i + 1);
      quote = '';
      start = i + 1;
    }
  }
  return result + rewrite(sql.slice(start));
}

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = '';
  let dollar = '';
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < String(sql).length; i += 1) {
    const ch = sql[i], next = sql[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (!quote && !dollar && ch === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (!quote && !dollar && ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = ''; } continue; }
    if (quote) {
      if (ch === quote) {
        if (next === quote) i += 1;
        else quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
      if (match) { dollar = match[0]; i += dollar.length - 1; }
      continue;
    }
    if (ch === ';') {
      const statement = sql.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const last = sql.slice(start).trim();
  if (last) statements.push(last);
  return statements;
}

function translateSql(sql) {
  const text = String(sql);
  if (/\bPRAGMA\b|\bVACUUM\s+INTO\b/i.test(text)) throw new Error('PRAGMA/VACUUM solo pertenecen al almacenamiento SQLite local.');
  // SQLite LIKE is ASCII case-insensitive by default; ILIKE preserves the
  // search behaviour used by the browser UI on PostgreSQL.
  return rewriteOutsideQuotes(questionPlaceholders(text), segment => segment
    .replace(/\bLIKE\b/gi, 'ILIKE')
    .replace(TABLE_RE, (whole, verb, name) => `${verb} ${tableName(name.toLowerCase())}`)
    // PostgreSQL folds unquoted identifiers to lowercase; preserve the API's
    // existing camelCase aliases (studentId, courseId, updatedAt, ...).
    .replace(/\bAS\s+([a-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, (_, alias) => `AS "${alias}"`));
}

function numberize(row) {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  for (const key of ['id', 'version', 'year', 'template_id', 'size', 'count', 'n', 'total', 'rowcount']) {
    if (typeof copy[key] === 'string' && /^-?\d+$/.test(copy[key])) copy[key] = Number(copy[key]);
  }
  return copy;
}

function rowsNumberized(rows) { return rows.map(numberize); }

function ensureQueryPool(pool) {
  if (!pool || typeof pool.query !== 'function') throw new Error('El pool PostgreSQL debe exponer query(text, values).');
  if (typeof pool.connect !== 'function') throw new Error('El pool PostgreSQL debe exponer connect() para transacciones.');
}

function txClient(state) { return state?.client; }

export async function openPostgresStore(options = {}) {
  const key = base64Key(options.key || process.env.MATRICULA_STORAGE_KEY, 'MATRICULA_STORAGE_KEY');
  const pool = await createPool(options);
  ensureQueryPool(pool);
  const state = TX_STATE;

  const runQuery = async (sql, values = [], client = txClient(state.getStore())) => {
    const text = translateSql(sql);
    const result = await (client || pool).query(text, values);
    return { ...result, rows: rowsNumberized(result.rows || []), rowCount: Number(result.rowCount || 0) };
  };
  const one = async (sql, values = []) => (await runQuery(sql, values)).rows[0];
  const many = async (sql, values = []) => (await runQuery(sql, values)).rows;
  const exec = async sql => runQuery(sql, []);
  const returningId = sql => {
    const text = String(sql).trim().replace(/;\s*$/, '');
    if (/^insert\s+into\s+(templates|revisions|events|audit)\b/i.test(text) && !/\breturning\b/i.test(text)) return `${text} RETURNING id`;
    return sql;
  };
  const prepared = sql => ({
    get: async (...values) => one(sql, values),
    all: async (...values) => many(sql, values),
    run: async (...values) => {
      const result = await runQuery(returningId(sql), values);
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id ?? result.rows[0]?.ID ?? undefined, rows: result.rows };
    },
  });

  const db = { query: runQuery, one, many, exec, prepare: prepared };

  const transaction = async fn => {
    const parent = state.getStore();
    if (parent?.client) {
      const savepoint = `matricula_sp_${parent.depth + 1}`;
      await parent.client.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await state.run({ client: parent.client, depth: parent.depth + 1 }, fn);
        await parent.client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await parent.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => {});
        throw error;
      }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(WRITE_LOCK_SQL);
      const result = await state.run({ client, depth: 0 }, fn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const seal = value => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  };
  const unseal = value => {
    const bytes = Buffer.from(String(value), 'base64');
    if (bytes.length < 28) throw new Error('Valor cifrado inválido.');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  };
  const mac = value => createHmac('sha256', key).update(value).digest('hex');

  const audit = async (actor, action, target = '', detail = {}) => transaction(async () => {
    const at = new Date().toISOString();
    const text = JSON.stringify(detail);
    const previous = (await one('SELECT hash FROM audit ORDER BY id DESC LIMIT 1'))?.hash || '';
    const hash = mac(JSON.stringify([actor, at, action, target, text, previous]));
    await runQuery('INSERT INTO audit(actor,at,action,target,detail,prev_hash,hash) VALUES(?,?,?,?,?,?,?)', [actor, at, action, target, text, previous, hash]);
  });

  const verifyAudit = async () => {
    let previous = '';
    for (const row of await many('SELECT * FROM audit ORDER BY id')) {
      if (row.prev_hash !== previous || row.hash !== mac(JSON.stringify([row.actor, row.at, row.action, row.target, row.detail, row.prev_hash]))) return false;
      previous = row.hash;
    }
    return true;
  };

  const blob = {
    put: async (id, encrypted) => { await runQuery('INSERT INTO attachment_blobs(id,content,created_at) VALUES(?,?,?)', [id, encrypted, new Date().toISOString()]); return id; },
    get: async id => (await one('SELECT content FROM attachment_blobs WHERE id=?', [id]))?.content,
    remove: async id => { await runQuery('DELETE FROM attachment_blobs WHERE id=?', [id]); },
    list: async () => many('SELECT id,created_at AS "createdAt" FROM attachment_blobs ORDER BY id'),
  };
  const files = { write: blob.put, read: blob.get, remove: blob.remove, list: blob.list };

  const loginAllowed = async ipHash => {
    const row = await one('SELECT blocked_until AS "blockedUntil" FROM login_attempts WHERE ip_hash=?', [ipHash]);
    return !row || Number(row.blockedUntil) <= Date.now();
  };
  const loginFailed = async ipHash => transaction(async () => {
    const now = Date.now();
    const row = await one('SELECT count,window_started AS "windowStarted" FROM login_attempts WHERE ip_hash=? FOR UPDATE', [ipHash]);
    const within = row && now - Number(row.windowStarted) < 600000;
    const count = within ? Number(row.count) + 1 : 1;
    const blockedUntil = now + 600000;
    await runQuery(`INSERT INTO login_attempts(ip_hash,count,window_started,blocked_until)
      VALUES(?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET count=excluded.count,window_started=excluded.window_started,blocked_until=excluded.blocked_until`, [ipHash, count, within ? Number(row.windowStarted) : now, count >= 10 ? blockedUntil : 0]);
    return count < 10;
  });
  const loginSucceeded = async ipHash => { await runQuery('DELETE FROM login_attempts WHERE ip_hash=?', [ipHash]); };

  const initialize = async ({ migrate = false } = {}) => {
    if (migrate) {
      // Runtime migrations are only allowed for an explicitly injected test
      // pool (PGlite/ephemeral QA). Production uses Supabase CLI migrations.
      if (!options.pool) throw new Error('La migración remota se ejecuta explícitamente con Supabase CLI; no se permite desde el arranque.');
      const migration = await readMigration(new URL('../supabase/migrations/202610050001_matricula.sql', import.meta.url));
      if (typeof pool.exec === 'function') await pool.exec(migration);
      else for (const statement of splitSqlStatements(migration)) await pool.query(statement);
    }
    const exists = await one("SELECT to_regclass('matricula.users') AS name");
    if (!exists?.name) throw new Error('Falta el esquema PostgreSQL matricula. Ejecute la migración explícita antes de iniciar.');
    await transaction(async () => {
      if (!(await one('SELECT id FROM templates LIMIT 1'))) {
        await runQuery('INSERT INTO templates(name,fields,created_at) VALUES(?,?,?)', ['Referencia Word · versión 1', JSON.stringify(baseFields), new Date().toISOString()]);
      }
    });
    return true;
  };

  // Optional schema check/seed; never runs DDL remotely.
  if (options.initialize !== false) await initialize({ migrate: options.migrate === true });

  return {
    kind: 'postgres', db, pool, query: runQuery, one, many, exec, transaction, withRequest: async fn => fn(),
    initialize, key, seal, unseal, mac, audit, verifyAudit, blob, files, attachmentBlobs: blob,
    loginAllowed, loginFailed, loginSucceeded,
    snapshotData: async () => {
      const rows = {};
      for (const table of TABLES.filter(name => name !== 'login_attempts')) rows[table] = await many(`SELECT * FROM ${tableName(table)} ORDER BY 1`);
      return rows;
    },
    close: async () => { if (typeof pool.end === 'function') await pool.end(); },
  };
}

export async function readMigration(migrationPath) { return readFile(migrationPath, 'utf8'); }
