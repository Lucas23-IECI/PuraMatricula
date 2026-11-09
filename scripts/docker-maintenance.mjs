import {existsSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {openStore} from '../src/store.mjs';
import {createBackupFile,restoreBackupFile} from '../src/backup-file.mjs';
import {backupDestination,readPassword,requireEmptyDirectory} from './docker-lib.mjs';

export async function backupDockerData({directory,destination,password}){
  if(!existsSync(join(directory,'matricula.sqlite'))||!existsSync(join(directory,'storage.key')))throw Error('No existe una base inicializada para respaldar.');
  const target=backupDestination(directory,destination);if(existsSync(target))throw Error('El archivo de respaldo ya existe; elija otro nombre.');
  if(typeof password!=='string'||password.length<16||password.length>200||password.trim().length<16)throw Error('Use una contraseña de respaldo de entre 16 y 200 caracteres.');
  mkdirSync(dirname(target),{recursive:true,mode:0o700});const store=openStore(directory);
  try{await createBackupFile(store,password,target,'docker-maintenance');return {destination:target};}finally{store.close();}
}
export async function restoreDockerData({source,directory,password}){
  requireEmptyDirectory(directory);
  if(typeof password!=='string'||password.length<16||password.length>200)throw Error('Use la contraseña del respaldo, entre 16 y 200 caracteres.');
  return restoreBackupFile(source,password,directory);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {values,positionals}=parseArgs({allowPositionals:true,options:{'password-stdin':{type:'boolean'}}}),[action,path,destination]=positionals;
    if(!['backup','restore'].includes(action)||!path)throw Error('Use backup /data/matricula/backups/nombre.dsmbak o restore /restore-input.dsmbak /data/matricula.');
    const password=await readPassword({stdin:values['password-stdin'],min:16});
    if(action==='backup'){await backupDockerData({directory:process.env.MATRICULA_DATA||'/data/matricula',destination:path,password});console.log('Respaldo cifrado creado. Copie el archivo fuera del volumen y custodie su contraseña por separado.');}
    else{const restored=await restoreDockerData({source:path,directory:destination||process.env.MATRICULA_DATA||'/data/matricula',password});console.log(`Restauración verificada en el volumen nuevo: ${restored.records} fichas y ${restored.attachments} adjuntos; sesiones anteriores invalidadas.`);}
  }catch(error){console.error(error.message);process.exitCode=1;}
}
