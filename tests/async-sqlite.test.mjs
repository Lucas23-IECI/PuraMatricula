import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAsyncStore} from '../src/async-sqlite.mjs';

test('SQLite serializa otra solicitud durante await y permite consultas reentrantes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'matricula-queue-')),store=openAsyncStore(dir);
 let release,started;
 const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 const first=store.withRequest(async()=>{started();await gate;return store.db.prepare('SELECT 1 AS n').get();});
 await entered;
 let secondEntered=false;
 const second=store.withRequest(()=>{secondEntered=true;return 2;});
 await Promise.resolve();await Promise.resolve();
 assert.equal(secondEntered,false);
 release();assert.equal((await first).n,1);assert.equal(await second,2);
 store.close();rmSync(dir,{recursive:true,force:true});
});
