import { openPostgresStore } from '../src/store-postgres.mjs';
import { createService } from '../src/service.mjs';
import { permissions } from '../src/fields.mjs';
import { ensureImportFields } from '../src/import-fields.mjs';
const store=await openPostgresStore();
try{
  if((await store.db.prepare('SELECT count(*) AS n FROM users').get()).n)throw new Error('La base ya tiene cuentas. No se reinicializa ni reemplaza.');
  const username=process.env.MATRICULA_INITIAL_USER||'lucas';
  const password=process.env.MATRICULA_INITIAL_PASSWORD;
  if(typeof password!=='string'||password.length<16)throw new Error('Configure una contraseña inicial privada de al menos 16 caracteres.');
  const svc=createService(store);
  const actor={id:'bootstrap',permissions:['admin'],courses:[],allCourses:true};
  await svc.saveUser(actor,{username,name:'Administrador PuraMatricula',password,permissions,allCourses:true,courses:[],active:true});
  await ensureImportFields(store);
  await store.audit('bootstrap','cloud.initialize','',{mode:process.env.MATRICULA_DATA_MODE||'normal'});
  console.log('Base independiente inicializada. Cuenta:',username);
}finally{await store.close();}
