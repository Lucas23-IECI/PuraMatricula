import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';

const project='puramatricula',scope='lucas-projects-8df523ea';
if(!existsSync('.vercelignore')||!readFileSync('.vercelignore','utf8').includes('.local/'))throw new Error('Falta excluir los archivos privados del despliegue.');
const variables=['MATRICULA_DATABASE_URL','MATRICULA_STORAGE_KEY','MATRICULA_DATABASE_CA','MATRICULA_ORIGIN','MATRICULA_DATA_MODE'];
for(const name of variables)if(!process.env[name])throw new Error(`Falta ${name} en el entorno privado.`);
if(process.env.MATRICULA_ORIGIN!=='https://puramatricula.vercel.app')throw new Error('Esta configuración corresponde a puramatricula.vercel.app.');
const npmRunner=join(dirname(process.execPath),'node_modules','npm','bin','npx-cli.js');
function cli(args,input=''){
 return new Promise((resolve,reject)=>{
  const child=existsSync(npmRunner)?spawn(process.execPath,[npmRunner,'--yes','vercel@48.10.0',...args],{windowsHide:true,stdio:['pipe','pipe','pipe']}):spawn('npx',['--yes','vercel@48.10.0',...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();child.on('error',()=>reject(new Error('No se pudo ejecutar Vercel CLI.')));
  child.on('close',code=>code?reject(new Error('Vercel rechazó la operación. Compruebe la sesión y el acceso al proyecto puramatricula.')):resolve());child.stdin.end(input);
 });
}
await cli(['whoami']);
await cli(['link','--yes','--project',project,'--scope',scope]);
const linked=JSON.parse(readFileSync('.vercel/project.json','utf8'));
if(linked.projectName&&linked.projectName!==project)throw new Error('El proyecto vinculado no corresponde a PuraMatricula.');
for(const name of variables){await cli(['env','add',name,'production','--sensitive','--force','--scope',scope],process.env[name]);console.log('Variable configurada:',name);}
await cli(['deploy','--prod','--yes','--scope',scope]);
console.log('Despliegue solicitado en https://puramatricula.vercel.app. Verifique login y persistencia antes de usar datos reales.');
