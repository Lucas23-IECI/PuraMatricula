import { PGlite } from '@electric-sql/pglite';

/**
 * A deliberately tiny pg Pool implementation for integration tests.
 *
 * PGlite has one PostgreSQL connection.  A pool.query call therefore owns the
 * mutex for the entire query, while pool.connect keeps it until release so a
 * BEGIN/COMMIT sequence cannot be interleaved with another request.
 */
class QueryMutex {
  #busy = false;
  #waiters = [];

  async acquire() {
    if (!this.#busy) { this.#busy = true; return () => this.release(); }
    await new Promise(resolve => this.#waiters.push(resolve));
    this.#busy = true;
    return () => this.release();
  }

  release() {
    if (!this.#busy) return;
    const next = this.#waiters.shift();
    if (next) next();
    else this.#busy = false;
  }
}

export async function createPglitePool({ dataDir = 'memory://pura-matricula-test' } = {}) {
  const db = new PGlite(dataDir);
  await db.waitReady;
  const mutex = new QueryMutex();
  let closed = false;

  const query = async (text, values = []) => {
    if (closed) throw new Error('PGlite pool cerrado.');
    const release = await mutex.acquire();
    try { return await db.query(text, values); } finally { release(); }
  };

  const exec = async text => {
    if (closed) throw new Error('PGlite pool cerrado.');
    const release = await mutex.acquire();
    try { return await db.exec(text); } finally { release(); }
  };

  const connect = async () => {
    if (closed) throw new Error('PGlite pool cerrado.');
    const release = await mutex.acquire();
    let released = false;
    return {
      query: (text, values = []) => {
        if (released) return Promise.reject(new Error('Cliente PGlite liberado.'));
        return db.query(text, values);
      },
      release: () => { if (!released) { released = true; release(); } }
    };
  };

  return {
    query,
    exec,
    connect,
    end: async () => { if (!closed) { closed = true; await db.close(); } },
    _db: db,
  };
}
