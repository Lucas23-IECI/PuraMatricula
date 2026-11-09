import { join,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAsyncStore } from '../src/async-sqlite.mjs';
import { ensureImportFields } from '../src/import-fields.mjs';
import { createService } from '../src/service.mjs';
import { createAccounts } from '../src/accounts.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.MATRICULA_INITIAL_PASSWORD)throw new Error('Defina MATRÍCULA_INITIAL_PASSWORD (mínimo 12 caracteres) solo para inicializar.');
const store=openAsyncStore(process.env.MATRICULA_DATA||join(root,'.local','manual'));
try{await createAccounts(store,createService(store)).bootstrap({username:process.env.MATRICULA_INITIAL_USER||'administrador',password:process.env.MATRICULA_INITIAL_PASSWORD});await ensureImportFields(store);console.log('Cuenta administradora creada. Cambie la contraseña temporal al ingresar y quite la variable del entorno.');}finally{await store.close();}
