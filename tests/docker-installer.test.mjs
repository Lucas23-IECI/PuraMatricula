import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {zipSync} from 'fflate';

test('instalador acepta manifest o config de la misma imagen y rechaza otra identidad antes de extraer',async t=>{
  if(process.platform!=='win32'){t.skip('Instalador requiere Windows PowerShell.');return;}
  const root=mkdtempSync(join(tmpdir(),'matricula-installer-'));
  t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
  const tools=join(root,'tools');mkdirSync(tools);
  const fakeDocker=`param([Parameter(ValueFromRemainingArguments=$true)][string[]]$DockerArgs)
$global:LASTEXITCODE=0
switch ($DockerArgs[0]) {
  'version' { '29.0.0 linux/amd64' }
  'context' { 'npipe:////./pipe/docker_engine' }
  'volume' { }
  'image' {
    if ($DockerArgs[1] -eq 'inspect') { $env:PURA_INSTALLER_IMAGE_ID }
  }
  default { $global:LASTEXITCODE=1; throw 'Comando Docker inesperado' }
}
`;
  writeFileSync(join(tools,'docker.ps1'),fakeDocker);
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const config='MATRICULA_DOCKER_MODE=local\r\nMATRICULA_LOCAL_PORT=4319\r\n';
  const source=zipSync({'public/escudo.ico':new Uint8Array([0,0,1,0]),'README.md':new TextEncoder().encode('Fuente ficticia para probar solo el instalador.')});
  const tar=Buffer.from('Archivo de imagen simulado; Docker esta sustituido en esta prueba.');
  const manifestId='sha256:'+'a'.repeat(64),configId='sha256:'+'b'.repeat(64);
  const metadata={mode:'local',image:'puramatricula:0.2.0-local-20261109t120000000z',imageId:manifestId,imageConfigId:configId,zip:'source.zip',zipSha256:digest(source),tar:'image.tar',tarSha256:digest(tar),configSha256:digest(config)};
  copyFileSync(new URL('../scripts/docker-install-local.ps1',import.meta.url),join(root,'install.ps1'));
  writeFileSync(join(root,'source.zip'),source);writeFileSync(join(root,'image.tar'),tar);writeFileSync(join(root,'docker.local.env'),config);
  writeFileSync(join(root,'ENTREGA.json'),JSON.stringify(metadata));
  const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  for(const [name,id,accepted] of [['manifest',manifestId,true],['config',configId,true],['unknown','sha256:'+'c'.repeat(64),false]]){
    const destination=join(root,'installed-'+name);
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^MATRICULA_|^PATH$/i.test(key)));
    env.Path=tools+';'+process.env.Path;env.PURA_INSTALLER_IMAGE_ID=id;
    // A host running PowerShell 7 can pass its incompatible module directory
    // to Windows PowerShell 5.1. Use only the latter's built-in modules here.
    env.PSModulePath=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules');
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'install.ps1'),'-Destino',destination,'-Puerto',String(port),'-SoloPreparar'],{encoding:'utf8',env,timeout:30000});
    if(accepted){
      assert.equal(result.status,0,result.stderr);assert.ok(existsSync(join(destination,'README.md')));
      assert.match(readFileSync(join(destination,'docker.env'),'utf8'),new RegExp('MATRICULA_LOCAL_PORT='+port));
    }else{
      assert.notEqual(result.status,0);assert.match(result.stderr,/imagen cargada no coincide/);assert.equal(existsSync(destination),false);
    }
  }
});
