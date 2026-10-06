import { createApp } from '../src/server.mjs';
import { openPostgresStore } from '../src/store-postgres.mjs';

let appPromise;
function configuredApp(){
  if(!appPromise)appPromise=(async()=>{
    const store=await openPostgresStore();
    return createApp({store,secure:true,origin:process.env.MATRICULA_ORIGIN});
  })().catch(error=>{appPromise=undefined;throw error;});
  return appPromise;
}
export default async function handler(req,res){
  try{const app=await configuredApp();await app.handler(req,res);}
  catch(error){
    console.error('PuraMatricula cloud unavailable:',error.code||error.name);
    res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({error:'La conexión de PuraMatricula aún no está disponible. Revise la configuración del servidor.'}));
  }
}
