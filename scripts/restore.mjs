import { restoreBackupFile } from '../src/backup-file.mjs';
if(!process.env.MATRICULA_BACKUP_PASSWORD||!process.argv[2]||!process.argv[3])throw new Error('Defina MATRICULA_BACKUP_PASSWORD; indique respaldo y carpeta nueva de destino.');
const result=await restoreBackupFile(process.argv[2],process.env.MATRICULA_BACKUP_PASSWORD,process.argv[3]);console.log(`Restauración verificada: ${result.records} fichas y ${result.attachments} adjuntos.`);
