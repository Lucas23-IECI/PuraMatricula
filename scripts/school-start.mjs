import {constants,accessSync,existsSync,readFileSync,statSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {X509Certificate} from 'node:crypto';
import {createSecureContext} from 'node:tls';
import {isIP} from 'node:net';
import {fileURLToPath} from 'node:url';

export function schoolConfig(env=process.env){
  for(const name of ['MATRICULA_DATA','MATRICULA_HOST','MATRICULA_PORT','MATRICULA_ORIGIN','MATRICULA_TLS_CERT','MATRICULA_TLS_KEY'])if(!env[name]?.trim())throw new Error(`Falta ${name}.`);
  if(env.MATRICULA_DATABASE_URL)throw new Error('El inicio escolar local requiere un directorio SQLite exclusivo. Quite MATRICULA_DATABASE_URL de este proceso.');
  const port=Number(env.MATRICULA_PORT),host=env.MATRICULA_HOST.trim();
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('El puerto escolar no es válido.');
  if(!isIP(host)&&host!=='localhost')throw new Error('MATRICULA_HOST debe ser la IP local de escucha o localhost.');
  const origin=new URL(env.MATRICULA_ORIGIN);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||Number(origin.port||443)!==port)throw new Error('El origen escolar debe ser una dirección HTTPS sin ruta y con el puerto de escucha.');
  for(const name of ['MATRICULA_DATA','MATRICULA_TLS_CERT','MATRICULA_TLS_KEY'])if(!isAbsolute(env[name]))throw new Error(`${name} debe ser una ruta absoluta.`);
  const directory=resolve(env.MATRICULA_DATA);
  if(!statSync(directory).isDirectory())throw new Error('MATRICULA_DATA debe ser una carpeta exclusiva de Matrícula.');
  accessSync(directory,constants.R_OK|constants.W_OK);
  if(existsSync(join(directory,'synthetic-demo.flag')))throw new Error('La base de demostración no puede exponerse en la red del colegio.');
  if(!existsSync(join(directory,'matricula.sqlite'))||!existsSync(join(directory,'storage.key')))throw new Error('Inicialice la cuenta administradora en la carpeta escolar antes de iniciar el servicio.');
  const tls={cert:readFileSync(env.MATRICULA_TLS_CERT),key:readFileSync(env.MATRICULA_TLS_KEY),minVersion:'TLSv1.2'};
  const cert=new X509Certificate(tls.cert),address=origin.hostname.replace(/^\[|\]$/g,'');
  if(Date.now()<Date.parse(cert.validFrom)||Date.now()>=Date.parse(cert.validTo))throw new Error('El certificado TLS todavía no está vigente o ha vencido.');
  if(!(isIP(address)?cert.checkIP(address):cert.checkHost(address)))throw new Error('El certificado TLS no corresponde a la dirección de Matrícula.');
  createSecureContext(tls);
  return {directory,host,port,origin:origin.origin,tls};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const config=schoolConfig();
    if(process.argv.includes('--check'))console.log('Configuración local y certificado comprobados. Falta probar conectividad y confianza del certificado desde Secretaría.');
    else{
      const {createApp}=await import('../src/server.mjs');
      const app=await createApp(config);
      await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(config.port,config.host,()=>{app.server.removeListener('error',reject);resolve();});});
      console.log(`Matrícula disponible en ${config.origin}`);
      let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();};
      process.once('SIGINT',stop);process.once('SIGTERM',stop);
    }
  }catch(error){console.error(`No se pudo iniciar Matrícula: ${error.message}`);process.exitCode=1;}
}
