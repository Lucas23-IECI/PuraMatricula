import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Windows acepta la imagen exacta de Andrés y rechaza otra instalación antes de escribir',t=>{
  if(process.platform!=='win32'){t.skip('Actualizador requiere Windows PowerShell.');return;}
  const root=mkdtempSync(join(tmpdir(),'matricula-updater-'));
  t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
  const tools=join(root,'tools'),target=join(root,'install'),envFile=join(target,'docker.env'),script=join(root,'update.ps1'),calls=join(root,'calls.txt');
  mkdirSync(tools);mkdirSync(join(target,'scripts'),{recursive:true});
  writeFileSync(script,'\ufeff'+read('scripts/docker-update-local.ps1'));
  writeFileSync(join(target,'compose.local.yaml'),'services: {}');
  writeFileSync(join(target,'scripts','docker-colegio.ps1'),"throw 'No debe llamar al asistente durante la precomprobacion'");
  const tar='imagen de prueba';writeFileSync(join(root,'image.tar'),tar);
  writeFileSync(join(root,'ENTREGA.json'),JSON.stringify({
    kind:'local-update',mode:'local',deliveryVersion:'colegio.7',image:'puramatricula:0.2.0-local-20261112t181057444z',
    tar:'image.tar',tarSha256:createHash('sha256').update(tar).digest('hex'),
    upgradeFrom:['puramatricula:0.2.0-local-20261109t173905304z'],
    upgradeFromPattern:'^puramatricula:0\\.2\\.0-local-[0-9]{8}t[0-9]{9}z$'
  }));
  writeFileSync(join(tools,'docker.ps1'),`param([Parameter(ValueFromRemainingArguments=$true)][string[]]$DockerArgs)
$global:LASTEXITCODE=0
$DockerArgs[0] | Add-Content -LiteralPath $env:PURA_TEST_CALLS
switch ($DockerArgs[0]) {
  'version' { '29.0.0 linux/amd64' }
  'context' { 'npipe:////./pipe/docker_engine' }
  'volume' { 'pura_test_data' }
  'compose' { 'abcdef123456' }
  'inspect' { Get-Content -LiteralPath $env:PURA_TEST_CONTAINER }
  default { throw 'Comando Docker inesperado' }
}`);
  const tag='puramatricula:0.2.0-local-20261112t153329709z';
  const containerFile=join(root,'container.json');
  const run=({image=tag,working=target,mounted='pura_test_data',runningImage=tag,override=false}={})=>{
    const original='MATRICULA_DOCKER_MODE=local\r\nMATRICULA_LOCAL_PORT=15431\r\nMATRICULA_IMAGE='+image+'\r\nMATRICULA_DATA_VOLUME=pura_test_data\r\n';
    writeFileSync(envFile,original);
    writeFileSync(containerFile,JSON.stringify([{Config:{Image:runningImage,Labels:{'com.docker.compose.project.working_dir':working}},Mounts:[{Type:'volume',Name:mounted,Destination:'/data'}]}]));
    writeFileSync(calls,'');
    const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^MATRICULA_|^DOCKER_(HOST|CONTEXT)$|^PATH$/i.test(name)));
    env.Path=tools+';'+process.env.Path;
    env.PSModulePath=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules');
    Object.assign(env,{PURA_TEST_CALLS:calls,PURA_TEST_CONTAINER:containerFile});
    if(override)env.MATRICULA_LOCAL_PORT='44444';
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Destino',target,'-SoloComprobar'],{encoding:'utf8',env,timeout:30000});
    assert.equal(readFileSync(envFile,'utf8'),original);
    assert.doesNotMatch(readFileSync(calls,'utf8'),/image/);
    return result;
  };
  const accepted=run();assert.equal(accepted.status,0,accepted.stderr);assert.match(accepted.stdout,/Entrega Windows colegio\.7/);assert.match(accepted.stdout,/15431.*pura_test_data/);
  for(const [options,message] of [
    [{image:tag.replace('0.2.0','0.2.1')},/no corresponde a esta actualizaci/],
    [{working:join(root,'another')},/pertenece a otra carpeta/],
    [{mounted:'other_data'},/no coinciden con docker.env/],
    [{runningImage:'puramatricula:another'},/no coinciden con docker.env/],
    [{override:true},/sin variables MATRICULA_/]
  ]){
    const rejected=run(options);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,message);
  }
});

test('lanzador de actualización usa PowerShell del sistema y no reinstala',()=>{
  const cmd=read('scripts/actualizar-matricula.cmd');
  assert.match(cmd,/ACTUALIZAR-EN-EL-SERVIDOR\.ps1/);
  assert.match(cmd,/System32\\WindowsPowerShell\\v1\.0\\powershell\.exe/);
  assert.doesNotMatch(cmd,/INSTALAR MATRICULA|docker-compose down/i);
  assert.match(cmd,/pause/);
});
