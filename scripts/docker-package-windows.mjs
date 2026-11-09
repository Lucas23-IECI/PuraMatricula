import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync, zipSync} from 'fflate';
import {collectReleaseFiles, createPortableRelease} from './docker-package.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args)=>execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
const write=(path,bytes)=>writeFileSync(path,bytes,{flag:'wx'});

function build(){
  if(process.argv.length!==2)throw Error('Uso: npm run release:windows');
  if(run('git',['status','--porcelain','--untracked-files=no']))throw Error('Confirma primero los cambios de la entrega. Se requiere un checkout sin cambios rastreados.');
  const commit=run('git',['rev-parse','HEAD']);
  const tracked=new Set(run('git',['ls-tree','-r','--name-only',commit]).split(/\r?\n/));
  for(const path of collectReleaseFiles(root)){
    if(!tracked.has(path))throw Error(`Archivo de entrega fuera del commit: ${path}`);
  }
  const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('La entrega Windows requiere una versión numérica.');
  const stamp=new Date().toISOString().replace(/[-:.]/g,'').toLowerCase();
  const release=join(root,'output','release','windows-'+stamp);
  mkdirSync(dirname(release),{recursive:true});mkdirSync(release);
  const source=createPortableRelease({root,output:release});
  const sourceBytes=readFileSync(source.zipPath);
  const sourceFiles=unzipSync(sourceBytes);
  const context=join(release,'build-context');mkdirSync(context);
  for(const [path,bytes] of Object.entries(sourceFiles)){
    if(!tracked.has(path)&&!['MANIFEST.sha256','RELEASE.json'].includes(path))throw Error(`Archivo de entrega fuera del commit: ${path}`);
    const output=join(context,...path.split('/'));mkdirSync(dirname(output),{recursive:true});write(output,bytes);
  }
  const image=`puramatricula:${version}-local-${stamp}`;
  const tarName=`puramatricula-${version}-image-${stamp}.tar`,tar=join(release,tarName);
  execFileSync('docker',['buildx','build','--platform','linux/amd64','--provenance=false','--output',`type=docker,dest=${tar}`,'--tag',image,context],{cwd:root,stdio:'inherit'});
  const manifest=JSON.parse(run('tar',['-xOf',tar,'manifest.json']));
  const entry=manifest.find(row=>row.RepoTags?.includes(image));
  const configId=/([a-f0-9]{64})(?:\.json)?$/.exec(entry?.Config||'')?.[1];
  if(!configId)throw Error('No se encontró la huella de configuración de la imagen Linux amd64.');
  run('docker',['image','load','--input',tar]);
  const inspected=JSON.parse(run('docker',['image','inspect','--format','{{json .}}',image]));
  if(!/^sha256:[a-f0-9]{64}$/.test(inspected.Id)||inspected.Os!=='linux'||inspected.Architecture!=='amd64')throw Error('La imagen cargada no corresponde a Linux amd64.');

  const config=Buffer.from(['MATRICULA_DOCKER_MODE=local','MATRICULA_LOCAL_PORT=4319',`MATRICULA_IMAGE=${image}`,'MATRICULA_DATA_VOLUME=puramatricula_data','MATRICULA_LOCAL_NETWORK_NAME=puramatricula_local',''].join('\r\n'));
  const tarBytes=readFileSync(tar),zipName=basename(source.zipPath);
  const metadata={mode:'local',platform:'linux/amd64',sourceCommit:commit,image,imageId:inspected.Id,imageConfigId:'sha256:'+configId,zip:zipName,zipSha256:digest(sourceBytes),tar:tarName,tarSha256:digest(tarBytes),configSha256:digest(config)};
  const guide=Buffer.from(sourceFiles['docs/ABRIR-PRIMERO-WINDOWS.md']).toString('utf8');
  const launcher=Buffer.from(sourceFiles['scripts/instalar-matricula.cmd']).toString('ascii').replace(/\r?\n/g,'\r\n');
  const payload={
    'INSTALAR MATRICULA.cmd':Buffer.from(launcher,'ascii'),
    'ABRIR-PRIMERO.md':Buffer.from(guide+`\nFuente de esta entrega: ${commit}\n`),
    'INICIAR-EN-EL-SERVIDOR.ps1':sourceFiles['scripts/docker-install-local.ps1'],
    'docker.local.env':config,
    'ENTREGA.json':Buffer.from(JSON.stringify(metadata,null,2)+'\n'),
    [zipName]:sourceBytes,
    [tarName]:tarBytes
  };
  payload.SHA256SUMS=Buffer.from(Object.entries(payload).map(([name,bytes])=>`${digest(bytes)}  ${name}\n`).join(''));
  const archive=zipSync(payload,{level:1}),assetName='PuraMatricula-Instalador-Windows.zip';
  const archivePath=join(release,assetName);
  write(archivePath,archive);write(archivePath+'.sha256',`${digest(archive)}  ${assetName}\n`);
  console.log(JSON.stringify({archive:archivePath,sha256:digest(archive),commit,image}));
}

try{build();}catch(error){console.error(`No se pudo generar la entrega Windows: ${error.message}`);process.exitCode=1;}
