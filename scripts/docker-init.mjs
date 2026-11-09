import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {createService} from '../src/service.mjs';
import {createAccounts} from '../src/accounts.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';
import {askUsername,readPassword,requireEmptyDirectory} from './docker-lib.mjs';

export async function initializeDockerData({directory,username,password}){
  if(typeof username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username))throw Error('Use un usuario de 3 a 60 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
  if(typeof password!=='string'||password.length<12||password.length>200||password.trim().length<12)throw Error('Use una contraseña inicial de entre 12 y 200 caracteres.');
  directory=requireEmptyDirectory(directory);mkdirSync(directory,{recursive:true,mode:0o700});const store=openAsyncStore(directory);
  try{await createAccounts(store,createService(store)).bootstrap({username,password});await ensureImportFields(store);return {initialized:true};}finally{await store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const {values}=parseArgs({options:{username:{type:'string'},'password-stdin':{type:'boolean'}}});await initializeDockerData({directory:process.env.MATRICULA_DATA||'/data/matricula',username:values.username||await askUsername(),password:await readPassword({stdin:values['password-stdin']})});console.log('Cuenta administradora creada. Cambie su contraseña temporal al ingresar.');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
