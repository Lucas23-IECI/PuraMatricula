import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
function checkDirectory(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())checkDirectory(file);else if(/\.(mjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}}}
for(const dir of ['src','scripts','tests','public','api'])checkDirectory(dir);
console.log('Sintaxis comprobada.');
