import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync,writeFileSync } from 'node:fs';
import { createApp } from '../src/server.mjs';
import { seedDemo } from './seed-demo.mjs';
import { ensureImportFields } from '../src/import-fields.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=join(root,'.local','demo');
const app=await createApp({directory:dir,demo:true});const marker=join(dir,'synthetic-demo.flag');
if((await app.store.db.prepare('SELECT count(*) AS n FROM users').get()).n&&!existsSync(marker)){await app.close();throw new Error('Esta base no está identificada como demostración sintética.');}
if(!existsSync(marker)){await seedDemo(app.store,app.svc);writeFileSync(marker,'SYNTHETIC ONLY\n');}
await ensureImportFields(app.store);
const address=await app.listen(Number(process.env.MATRICULA_PORT)||4318);console.log(`Demostración local sintética: http://127.0.0.1:${address.port}`);
process.on('SIGINT',async()=>{await app.close();process.exit(0);});process.on('SIGTERM',async()=>{await app.close();process.exit(0);});
