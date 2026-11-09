import {existsSync,readdirSync,statSync} from 'node:fs';
import {isAbsolute,join,resolve,relative,sep} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {schoolConfig} from './school-start.mjs';

export function publicOrigin(value,transport){
  if(transport==='local'){
    const match=typeof value==='string'&&/^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})$/.exec(value);
    if(!match||Number(match[1])<1024||Number(match[1])>65535)throw Error('Modo local: use http://127.0.0.1:PUERTO, con puerto entre 1024 y 65535.');
    return value;
  }
  let origin;try{origin=new URL(value);}catch{throw Error('Defina MATRICULA_ORIGIN con un origen HTTPS válido.');}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('MATRICULA_ORIGIN debe ser HTTPS, sin credenciales, rutas ni consultas.');
  return origin.origin;
}
export function dockerConfig(env=process.env,{checkFiles=true}={}){
  const transport=env.MATRICULA_TRANSPORT||'proxy';
  if(!['proxy','tls','local'].includes(transport))throw Error('MATRICULA_TRANSPORT debe ser local, tls o proxy.');
  if(transport==='proxy'&&env.MATRICULA_BEHIND_TLS_PROXY!=='1')throw Error('Declare MATRICULA_BEHIND_TLS_PROXY=1 únicamente detrás del proxy HTTPS del colegio.');
  if(transport!=='proxy'&&env.MATRICULA_BEHIND_TLS_PROXY==='1')throw Error('Elija TLS nativo o proxy HTTPS; no mezcle ambos modos.');
  if(env.MATRICULA_DATABASE_URL||env.MATRICULA_STORAGE_KEY||env.VERCEL)throw Error('Este contenedor usa exclusivamente su volumen SQLite y storage.key; quite la configuración cloud de este proceso.');
  if(env.MATRICULA_DATA_MODE==='synthetic')throw Error('El arranque escolar no admite el modo de demostración.');
  const origin=publicOrigin(env.MATRICULA_ORIGIN,transport),directory=env.MATRICULA_DATA,port=Number(env.MATRICULA_PORT||4318),host=env.MATRICULA_HOST||'0.0.0.0';
  if(!directory||!isAbsolute(directory))throw Error('MATRICULA_DATA debe ser la ruta absoluta del volumen propio de Matrícula.');
  if(host!=='0.0.0.0')throw Error('El contenedor debe escuchar internamente en 0.0.0.0; use el archivo Compose del modo elegido.');
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('MATRICULA_PORT debe ser un puerto interno entre 1024 y 65535.');
  if(checkFiles){
    if(!existsSync(directory)||!statSync(directory).isDirectory())throw Error('No existe el volumen de datos de Matrícula.');
    if(existsSync(join(directory,'synthetic-demo.flag')))throw Error('Una base de demostración no puede iniciar el servicio escolar.');
    if(!existsSync(join(directory,'matricula.sqlite'))||!existsSync(join(directory,'storage.key')))throw Error('Inicialice primero el volumen con docker-init.mjs.');
    if(statSync(join(directory,'storage.key')).size!==32)throw Error('storage.key no es una clave local válida.');
  }
  if(transport==='tls'){
    if(Number(new URL(origin).port||443)!==port)throw Error('En TLS nativo el puerto del origen debe coincidir con el puerto publicado y de escucha.');
    for(const key of ['MATRICULA_TLS_CERT','MATRICULA_TLS_KEY'])if(!env[key]||!isAbsolute(env[key]))throw Error(`${key} debe ser la ruta absoluta del PEM montado de solo lectura.`);
    if(checkFiles)return {...schoolConfig({...env,MATRICULA_HOST:host,MATRICULA_PORT:String(port),MATRICULA_ORIGIN:origin}),secure:true,transport};
  }
  return {origin,directory:resolve(directory),port,host,secure:transport!=='local',localOnly:transport==='local',transport,...(transport==='local'?{desktopIcon:env.MATRICULA_DESKTOP_ICON}:{})};
}
export function requireEmptyDirectory(directory){
  if(!directory||!isAbsolute(directory))throw Error('Use una carpeta absoluta y exclusiva para Matrícula.');
  if(existsSync(directory)&&(!statSync(directory).isDirectory()||readdirSync(directory).length))throw Error('El destino ya contiene archivos. Esta operación requiere una carpeta o volumen nuevo y vacío.');
  return resolve(directory);
}
export function backupDestination(directory,destination){
  const base=resolve(directory,'backups'),target=resolve(destination),tail=relative(base,target);
  if(!tail||tail==='..'||tail.startsWith('..'+sep)||isAbsolute(tail)||!target.endsWith('.dsmbak'))throw Error('El respaldo debe ser un archivo .dsmbak nuevo dentro de la carpeta backups del volumen.');
  return target;
}
export async function askUsername(){
  if(!process.stdin.isTTY)throw Error('Indique --username y --password-stdin para automatización; el asistente normal requiere una terminal.');
  const prompt=createInterface({input:process.stdin,output:process.stderr});
  try{return (await prompt.question('Usuario de la cuenta administradora: ')).trim();}finally{prompt.close();}
}
export function hiddenQuestion(label){
  if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')throw Error('La contraseña se solicita en una terminal interactiva.');
  return new Promise((resolve,reject)=>{
    const input=process.stdin,wasRaw=input.isRaw;let text='';process.stderr.write(label);input.setRawMode(true);input.setEncoding('utf8');input.resume();
    const done=(error,value)=>{input.off('data',onData);input.setRawMode(Boolean(wasRaw));input.pause();process.stderr.write('\n');if(error)reject(error);else resolve(value);};
    const onData=chunk=>{for(const char of chunk){if(char==='\u0003')return done(Error('Operación cancelada.'));if(char==='\r'||char==='\n')return done(null,text);if(char==='\u007f'||char==='\b'){text=Array.from(text).slice(0,-1).join('');continue;}if(char>=' '&&text.length<201)text+=char;}};
    input.on('data',onData);
  });
}
export async function readPassword({stdin=false,min=12}={}){
  let password;
  if(stdin){let size=0;const chunks=[];for await(const chunk of process.stdin){size+=Buffer.byteLength(chunk);if(size>1024)throw Error('Entrada de contraseña demasiado larga.');chunks.push(Buffer.from(chunk));}password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');}
  else{password=await hiddenQuestion('Contraseña (oculta): ');const repeated=await hiddenQuestion('Repita la contraseña: ');if(password!==repeated)throw Error('Las contraseñas no coinciden.');}
  if(password.length<min||password.length>200||password.trim().length<min)throw Error(`Use una contraseña de entre ${min} y 200 caracteres.`);
  return password;
}
