import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {openAsyncStore} from '../src/async-sqlite.mjs';
import {createService} from '../src/service.mjs';
import {createAccounts} from '../src/accounts.mjs';
import {ensureImportFields} from '../src/import-fields.mjs';
import {askUsername,hiddenQuestion,readPassword,requireEmptyDirectory} from './docker-lib.mjs';

const usernameRules='De 3 a 60 caracteres: empieza con una letra minúscula o un número; después puedes usar letras minúsculas, números, punto, guion o guion bajo.';
const usernameError='Usuario no válido. '+usernameRules;
const passwordError='Usa una contraseña inicial de entre 12 y 200 caracteres.';
const isUsername=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{2,59}$/.test(value);
const isPassword=value=>typeof value==='string'&&value.length>=12&&value.length<=200&&value.trim().length>=12;

export async function promptBootstrapCredentials({username,passwordStdin=false}={},{
  readUsername=askUsername,readSecret=hiddenQuestion,readStdin=()=>readPassword({stdin:true}),notice=message=>console.error(message)
}={}){
  if(username!==undefined){
    if(!isUsername(username))throw Error(usernameError);
  }else{
    if(passwordStdin)throw Error('Indique --username junto con --password-stdin.');
    notice('Usuario de la cuenta administradora. '+usernameRules);
    for(;;){
      username=await readUsername('Usuario: ');
      if(isUsername(username))break;
      notice(usernameError);
    }
  }
  if(passwordStdin){
    const password=await readStdin();
    if(!isPassword(password))throw Error(passwordError);
    return {username,password};
  }
  for(;;){
    const password=await readSecret('Contraseña temporal (oculta, mínimo 12 caracteres): ');
    if(!isPassword(password)){notice(passwordError);continue;}
    const repeated=await readSecret('Repita la contraseña: ');
    if(password===repeated)return {username,password};
    notice('Las contraseñas no coinciden. Vuelve a escribirlas.');
  }
}

export async function initializeDockerData({directory,username,password}){
  if(!isUsername(username))throw Error(usernameError);
  if(!isPassword(password))throw Error(passwordError);
  directory=requireEmptyDirectory(directory);mkdirSync(directory,{recursive:true,mode:0o700});const store=openAsyncStore(directory);
  try{await createAccounts(store,createService(store)).bootstrap({username,password});await ensureImportFields(store);return {initialized:true};}finally{await store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {values}=parseArgs({options:{username:{type:'string'},'password-stdin':{type:'boolean'}}});
    const directory=requireEmptyDirectory(process.env.MATRICULA_DATA||'/data/matricula');
    const credentials=await promptBootstrapCredentials({username:values.username,passwordStdin:values['password-stdin']});
    await initializeDockerData({directory,...credentials});
    console.log('Cuenta administradora creada. Cambie su contraseña temporal al ingresar.');
  }
  catch(error){console.error(error.message);process.exitCode=1;}
}
