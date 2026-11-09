import { openStore } from '../src/store.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';
import { createBackupFile } from '../src/backup-file.mjs';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
if((!process.env.MATRICULA_DATA&&!process.env.MATRICULA_DATABASE_URL)||!process.env.MATRICULA_BACKUP_PASSWORD||!process.argv[2])throw new Error('Defina MATRICULA_DATA o MATRICULA_DATABASE_URL, y MATRICULA_BACKUP_PASSWORD; indique archivo de destino.');
if(!process.env.MATRICULA_DATABASE_URL&&(!existsSync(join(process.env.MATRICULA_DATA,'matricula.sqlite'))||!existsSync(join(process.env.MATRICULA_DATA,'storage.key'))))throw new Error('No existe una base inicializada en MATRICULA_DATA.');
const store=process.env.MATRICULA_DATABASE_URL?await openPostgresStore():openStore(process.env.MATRICULA_DATA);try{await createBackupFile(store,process.env.MATRICULA_BACKUP_PASSWORD,process.argv[2]);console.log('Respaldo cifrado creado.');}finally{await store.close();}
