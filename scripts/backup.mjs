import { openStore } from '../src/store.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';
import { createBackup } from '../src/backup.mjs';
import { writeFileSync } from 'node:fs';
if((!process.env.MATRICULA_DATA&&!process.env.MATRICULA_DATABASE_URL)||!process.env.MATRICULA_BACKUP_PASSWORD||!process.argv[2])throw new Error('Defina MATRICULA_DATA o MATRICULA_DATABASE_URL, y MATRICULA_BACKUP_PASSWORD; indique archivo de destino.');
const store=process.env.MATRICULA_DATABASE_URL?await openPostgresStore():openStore(process.env.MATRICULA_DATA);try{writeFileSync(process.argv[2],await createBackup(store,process.env.MATRICULA_BACKUP_PASSWORD),{mode:0o600,flag:'wx'});console.log('Respaldo cifrado creado.');}finally{await store.close();}
