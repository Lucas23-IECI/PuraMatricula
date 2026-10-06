import { createApp } from '../src/server.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';
const store=await openPostgresStore();
const app=await createApp({store,origin:process.env.MATRICULA_ORIGIN});
const address=await app.listen(Number(process.env.MATRICULA_PORT)||4320);
console.log(`PuraMatricula contra PostgreSQL: http://127.0.0.1:${address.port}`);
process.on('SIGINT',async()=>{await app.close();process.exit(0);});
