import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {isIP} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicOrigin} from './docker-lib.mjs';

export function checkDockerHealth(env=process.env){
  const origin=new URL(publicOrigin(env.MATRICULA_ORIGIN,env.MATRICULA_TRANSPORT)),port=Number(env.MATRICULA_PORT||4318);
  const native=env.MATRICULA_TRANSPORT==='tls',hostname=origin.hostname.replace(/^\[|\]$/g,'');
  const tls=native?{ca:readFileSync(env.MATRICULA_TLS_CERT),allowPartialTrustChain:true,servername:isIP(hostname)?undefined:hostname,checkServerIdentity:(_host,certificate)=>checkServerIdentity(hostname,certificate)}:{};
  return new Promise((resolve,reject)=>{
    const request=(native?https:http).get({host:'127.0.0.1',port,path:'/api/health',headers:{Host:origin.host},timeout:4000,...tls},response=>{
      let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;if(text.length>4096)request.destroy(Error('Respuesta de salud inválida.'));});response.on('end',()=>{try{const value=JSON.parse(text);if(response.statusCode!==200||value.ok!==true||value.application!=='matricula'||value.demo)throw Error('Matrícula no está disponible en modo escolar.');resolve({ok:true,application:'matricula'});}catch(error){reject(error);}});
    });
    request.on('timeout',()=>request.destroy(Error('Matrícula no respondió en cuatro segundos.')));request.on('error',reject);
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await checkDockerHealth();if(!process.argv.includes('--quiet'))console.log('Matrícula responde correctamente dentro del contenedor.');}
  catch(error){if(!process.argv.includes('--quiet'))console.error(error.message);process.exitCode=1;}
}
