import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createApp} from '../src/server.mjs';
import {dockerConfig} from './docker-lib.mjs';

export async function startDocker(env=process.env){
  const config=dockerConfig(env),app=await createApp(config);
  try{await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(config.port,config.host,()=>{app.server.removeListener('error',reject);resolve();});});}
  catch(error){await app.close();throw error;}
  let closing;
  const stop=()=>closing||=(async()=>{
    const timer=setTimeout(()=>app.server.closeAllConnections(),25000);timer.unref();
    try{await app.close();}finally{clearTimeout(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);}
  })();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return {...app,close:stop,config};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const {values}=parseArgs({options:{check:{type:'boolean'}}});if(values.check){const config=dockerConfig();console.log(`Configuración ${config.transport==='tls'?'TLS nativa (par, SAN y vigencia)':config.localOnly?'local del PC servidor':'de proxy HTTPS'} y volumen independiente comprobados.`);}else{const app=await startDocker();console.log(`Matrícula lista en modo ${app.config.transport} en el puerto ${app.config.port}.`);}}
  catch(error){console.error(`No se pudo iniciar Matrícula: ${error.message}`);process.exitCode=1;}
}
