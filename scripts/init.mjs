import { join,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAsyncStore } from '../src/async-sqlite.mjs';
import { ensureImportFields } from '../src/import-fields.mjs';
import { createService } from '../src/service.mjs';
import { permissions } from '../src/fields.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.MATRICULA_INITIAL_PASSWORD)throw new Error('Defina MATRÍCULA_INITIAL_PASSWORD (mínimo 12 caracteres) solo para inicializar.');
const store=openAsyncStore(process.env.MATRICULA_DATA||join(root,'.local','manual'));
try{if(await store.db.prepare('SELECT id FROM users LIMIT 1').get())throw new Error('Esta base ya tiene cuentas.');await createService(store).saveUser({id:'setup',permissions:['admin'],courses:[],allCourses:true},{username:process.env.MATRICULA_INITIAL_USER||'administrador',name:'Administración de matrícula',password:process.env.MATRICULA_INITIAL_PASSWORD,permissions,allCourses:true,courses:[]});await ensureImportFields(store);console.log('Cuenta individual inicial creada. Quite la variable de contraseña del entorno.');}finally{await store.close();}
