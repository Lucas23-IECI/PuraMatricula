import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=new URL('..',import.meta.url).pathname.replace(/^\//,'').replaceAll('/', '\\');
const read=path=>readFileSync(join(root,path),'utf8');

test('actualizador local conserva volumen, puerto y configuración anterior',()=>{
  const script=read('scripts/docker-update-local.ps1');
  assert.match(script,/MATRICULA_DATA_VOLUME/);
  assert.match(script,/MATRICULA_LOCAL_PORT/);
  assert.match(script,/Set-EnvValue \$oldLines 'MATRICULA_IMAGE'/);
  assert.match(script,/scripts\\docker-colegio\.ps1/);
  assert.match(script,/backup/);
  assert.match(script,/No se pudo crear el respaldo\. La imagen no se cambió/);
  assert.match(script,/La nueva imagen no superó la comprobación de salud/);
  assert.match(script,/WriteAllLines\(\$envPath,\$oldLines/);
  assert.match(script,/upgradeFromPattern/);
  assert.match(script,/IsMatch\(\$oldImage/);
  assert.match(script,/upgradePatternProperty/);
  assert.match(script,/RegexOptions\]::CultureInvariant/);
  assert.doesNotMatch(script,/docker[^\r\n]*(?:volume\s+(?:rm|prune)|compose[^\r\n]*down[^\r\n]*-v)/i);
});

test('lanzador de actualización usa PowerShell del sistema y no reinstala',()=>{
  const cmd=read('scripts/actualizar-matricula.cmd');
  assert.match(cmd,/ACTUALIZAR-EN-EL-SERVIDOR\.ps1/);
  assert.match(cmd,/System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/);
  assert.doesNotMatch(cmd,/INSTALAR MATRICULA|docker-compose down/i);
  assert.match(cmd,/pause/);
});
