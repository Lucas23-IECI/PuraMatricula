import { spawnSync } from 'node:child_process';
import { existsSync,readdirSync } from 'node:fs';
function checkDirectory(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())checkDirectory(file);else if(/\.(mjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}}}
for(const dir of ['src','scripts','public'])checkDirectory(dir);
// The operational Docker ZIP deliberately excludes the test checkout.
for(const dir of ['tests','api'])if(existsSync(dir))checkDirectory(dir);
console.log('Sintaxis comprobada.');
