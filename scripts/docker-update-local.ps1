[CmdletBinding()]
param(
    [string]$Destino = 'C:\PuraMatricula',
    [switch]$SoloComprobar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Fail([string]$message) { throw $message }
function Read-Json([string]$path) { Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
function Sha256([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Invoke-Docker([string[]]$Arguments, [switch]$Capture) {
    if ($Capture) { $result=@(& $script:Docker @Arguments); if ($LASTEXITCODE -ne 0) { Fail "Docker terminó con código $LASTEXITCODE." }; return $result }
    & $script:Docker @Arguments; if ($LASTEXITCODE -ne 0) { Fail "Docker terminó con código $LASTEXITCODE." }
}
function Get-EnvValue([string[]]$lines,[string]$name,[string]$fallback='') {
    $line=$lines | Where-Object { $_ -match ('^\s*'+[regex]::Escape($name)+'\s*=') } | Select-Object -Last 1
    if (-not $line) { return $fallback }
    $value=($line -split '=',2)[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith("'") -and $value.EndsWith("'")) -or ($value.StartsWith('"') -and $value.EndsWith('"')))) { $value=$value.Substring(1,$value.Length-2) }
    return $value
}
function Set-EnvValue([string[]]$lines,[string]$name,[string]$value) {
    $result=@();$found=$false
    foreach($line in $lines){if($line -match ('^\s*'+[regex]::Escape($name)+'\s*=')){ $result+="$name=$value";$found=$true } else {$result+=$line}}
    if(-not $found){$result+="$name=$value"};return $result
}

try {
    if ($Destino -notmatch '^[A-Za-z]:[\\/]') { Fail 'El destino debe ser una carpeta absoluta de un disco local.' }
    $target=[IO.Path]::GetFullPath($Destino)
    if (-not (Test-Path -LiteralPath $target -PathType Container)) { Fail "No existe la instalación: $target" }
    $release=Read-Json (Join-Path $PSScriptRoot 'ENTREGA.json')
    if ($release.mode -cne 'local' -or $release.kind -cne 'local-update') { Fail 'Esta entrega no es una actualización local de Matrícula.' }
    if ($release.image -notmatch '^puramatricula:\d+\.\d+\.\d+-local-[0-9]{8}t[0-9]{9}z$') { Fail 'La etiqueta de imagen no es válida.' }
    $tarName=[string]$release.tar;if($tarName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tar$'){Fail 'La imagen de actualización está incompleta.'}
    $tar=Join-Path $PSScriptRoot $tarName;if((Sha256 $tar) -cne ([string]$release.tarSha256).ToLowerInvariant()){Fail 'No coincide el SHA-256 de la imagen de actualización.'}
    $dockerCommand=Get-Command docker -ErrorAction SilentlyContinue;if(-not $dockerCommand){Fail 'No se encontró Docker. Abra Docker Desktop y vuelva a ejecutar el actualizador.'};$script:Docker=$dockerCommand.Source
    $engine=Invoke-Docker @('version','--format','{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}') -Capture
    if($engine -notmatch '^(\d+)\.\S+\s+linux/amd64$' -or [int]$Matches[1] -lt 28){Fail 'Se requiere Docker Engine 28 o posterior con motor Linux amd64.'}
    $endpoint='';if(-not $env:DOCKER_CONTEXT -and $env:DOCKER_HOST){$endpoint=[string]$env:DOCKER_HOST}else{$endpoint=[string](Invoke-Docker @('context','inspect','--format','{{.Endpoints.docker.Host}}') -Capture)[0]};$endpoint=$endpoint.Trim();if($endpoint -notmatch '^(npipe:/{2,4}\.\/pipe\/|unix:/{2,3})'){Fail 'Seleccione el contexto local de Docker Desktop.'}
    $envPath=Join-Path $target 'docker.env';$composePath=Join-Path $target 'compose.local.yaml';$assistant=Join-Path $target 'scripts\docker-colegio.ps1'
    foreach($required in @($envPath,$composePath,$assistant)){if(-not(Test-Path -LiteralPath $required -PathType Leaf)){Fail "Falta un archivo de la instalación: $required"}}
    $lines=@(Get-Content -LiteralPath $envPath);if((Get-EnvValue $lines 'MATRICULA_DOCKER_MODE') -cne 'local'){Fail 'La instalación existente no está en modo local.'}
    $volume=Get-EnvValue $lines 'MATRICULA_DATA_VOLUME' 'puramatricula_data';$port=Get-EnvValue $lines 'MATRICULA_LOCAL_PORT' '4319';$oldImage=Get-EnvValue $lines 'MATRICULA_IMAGE'
    if($volume -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$'){Fail 'El volumen configurado no es válido.'};if($port -notmatch '^\d{4,5}$' -or [int]$port -lt 1024 -or [int]$port -gt 65535){Fail 'El puerto local configurado no es válido.'};if($oldImage -notmatch '^puramatricula:[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$'){Fail 'La imagen actual no es válida.'}
    $allowedImages=@($release.upgradeFrom | ForEach-Object {[string]$_} | Where-Object {$_});if($allowedImages.Count -gt 0 -and $allowedImages -notcontains $oldImage){Fail "La versión instalada no corresponde a esta actualización: $oldImage"}
    if((Invoke-Docker @('volume','ls','--format','{{.Name}}') -Capture) -notcontains $volume){Fail "No existe el volumen de datos configurado: $volume"}
    $project=(Invoke-Docker @('compose','--project-directory',$target,'--env-file',$envPath,'-f',$composePath,'-p','puramatricula','ps','--status','running','--services') -Capture);if($project -notcontains 'puramatricula'){Fail 'Matrícula no está ejecutándose. Inicie primero la instalación y vuelva a intentarlo.'}
    if($SoloComprobar){Write-Host "Actualización preparada para $target. Conserva puerto $port, volumen $volume e imagen anterior $oldImage.";return}
    Write-Host 'Se hará un respaldo cifrado antes de cambiar la imagen.';& $assistant backup;if($LASTEXITCODE -ne 0){Fail 'No se pudo crear el respaldo. La imagen no se cambió.'}
    Invoke-Docker @('image','load','--input',$tar);$newIds=@(Invoke-Docker @('image','inspect','--format','{{.Id}}',$release.image) -Capture);$expected=@($release.imageId,$release.imageConfigId)|Where-Object{$_ -and $_ -match '^sha256:[a-f0-9]{64}$'};if($newIds.Count -ne 1 -or ($expected -notcontains $newIds[0])){Fail 'La imagen cargada no coincide con la entrega.'}
    $oldLines=[string[]]$lines;$backupEnv=Join-Path $target ('.docker.env.before-update-'+[Guid]::NewGuid().ToString('N')+'.txt');[IO.File]::WriteAllLines($backupEnv,$oldLines,(New-Object Text.UTF8Encoding($false)))
    try{$next=Set-EnvValue $oldLines 'MATRICULA_IMAGE' ([string]$release.image);$temporary=$envPath+'.partial-'+[Guid]::NewGuid().ToString('N');[IO.File]::WriteAllLines($temporary,$next,(New-Object Text.UTF8Encoding($false)));Move-Item -LiteralPath $temporary -Destination $envPath -Force;& $assistant start;if($LASTEXITCODE -ne 0){Fail 'La nueva imagen no pudo iniciar.'};& $assistant check;if($LASTEXITCODE -ne 0){Fail 'La nueva imagen no superó la comprobación de salud.'};Remove-Item -LiteralPath $backupEnv -Force;Write-Host "Actualización lista. Se conservó el puerto $port y el volumen $volume."}
    catch{Write-Warning 'La actualización no superó la comprobación. Se restaura la configuración anterior; el volumen no se toca.';[IO.File]::WriteAllLines($envPath,$oldLines,(New-Object Text.UTF8Encoding($false)));& $assistant start | Out-Host;throw}
    finally{if(Test-Path -LiteralPath $backupEnv){Remove-Item -LiteralPath $backupEnv -Force -ErrorAction SilentlyContinue}}
}catch{Write-Error $_.Exception.Message;exit 1}
