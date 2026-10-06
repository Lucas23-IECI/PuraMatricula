/*
 * Promise based facade for the existing local SQLite store.
 *
 * The store deliberately remains synchronous because it is also used by the
 * backup/restore tools.  The HTTP adapter uses this facade so the service has
 * one asynchronous contract that can later be implemented by PostgreSQL.
 */
import { openStore } from './store.mjs';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

export function openAsyncStore(directory) {
  const raw = openStore(directory);
  let queue = Promise.resolve();
  let inTransaction = false;
  const requestContext = new AsyncLocalStorage();
  const withRequest = fn => {
    if (requestContext.getStore()) return Promise.resolve().then(fn);
    const run = queue.then(() => requestContext.run(true, fn));
    queue = run.catch(() => {});
    return run;
  };
  const db = {
    exec(sql) { return requestContext.getStore() ? raw.db.exec(sql) : withRequest(() => raw.db.exec(sql)); },
    prepare(sql) {
      return {
        get: (...args) => requestContext.getStore() ? raw.db.prepare(sql).get(...args) : withRequest(() => raw.db.prepare(sql).get(...args)),
        all: (...args) => requestContext.getStore() ? raw.db.prepare(sql).all(...args) : withRequest(() => raw.db.prepare(sql).all(...args)),
        run: (...args) => requestContext.getStore() ? raw.db.prepare(sql).run(...args) : withRequest(() => raw.db.prepare(sql).run(...args)),
      };
    },
  };
  const store = {
    ...raw,
    kind: 'sqlite',
    db,
    audit: (...args) => withRequest(() => raw.audit(...args)),
    verifyAudit: () => withRequest(() => raw.verifyAudit()),
    transaction: fn => withRequest(async () => {
      if (inTransaction) return fn();
      raw.db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const value = await fn();
        raw.db.exec('COMMIT');
        inTransaction = false;
        return value;
      } catch (error) {
        try { raw.db.exec('ROLLBACK'); } catch { /* preserve original error */ }
        inTransaction = false;
        throw error;
      }
    }),
    withRequest,
    files: {
      write: async (id, value) => writeFileSync(`${raw.dir}/attachments/${id}.enc`, value, { mode: 0o600, flag: 'wx' }),
      read: async id => readFileSync(`${raw.dir}/attachments/${id}.enc`, 'utf8'),
      remove: async id => unlinkSync(`${raw.dir}/attachments/${id}.enc`),
    },
    close: () => raw.close(),
  };
  return store;
}
