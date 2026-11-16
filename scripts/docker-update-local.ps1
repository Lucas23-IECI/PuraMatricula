[CmdletBinding()]
param(
    [string]$Destino = 'C:\PuraMatricula',
    [switch]$SoloComprobar,
    [string]$CarpetaAccesoDirecto,
    [switch]$SinAccesoDirecto
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Fail([string]$message) { throw $message }
function Read-Json([string]$path) { Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json }
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
function Get-LanAddress {
    $candidate = Get-NetIPConfiguration |
        Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway } |
        ForEach-Object { $_.IPv4Address.IPAddress } |
        Where-Object { $_ -and $_ -notlike '169.254.*' } |
        Select-Object -First 1
    if (-not $candidate) { Fail 'No se encontró una dirección IPv4 interna activa.' }
    return [string]$candidate
}
function Get-ActiveAddresses {
    @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress })
}

try {
    if (Get-ChildItem Env:MATRICULA_* -ErrorAction SilentlyContinue) { Fail 'Abra una PowerShell nueva, sin variables MATRICULA_ que puedan cambiar la instalacion seleccionada.' }
    if ($Destino -notmatch '^[A-Za-z]:[\\/]') { Fail 'El destino debe ser una carpeta absoluta de un disco local.' }
    $target=[IO.Path]::GetFullPath($Destino)
    if (-not (Test-Path -LiteralPath $target -PathType Container)) { Fail "No existe la instalación: $target" }
    $release=Read-Json (Join-Path $PSScriptRoot 'ENTREGA.json')
    if ($release.mode -cne 'local' -or $release.kind -cne 'local-update') { Fail 'Esta entrega no es una actualización local de Matrícula.' }
    $deliveryVersion=$release.PSObject.Properties['deliveryVersion']
    if($deliveryVersion -and $deliveryVersion.Value -match '^colegio\.[1-9]\d{0,5}$'){Write-Host "Matrícula | Entrega Windows $($deliveryVersion.Value)"}
    if ($release.image -notmatch '^puramatricula:\d+\.\d+\.\d+-local-[0-9]{8}t[0-9]{9}z$') { Fail 'La etiqueta de imagen no es válida.' }
    $tarName=[string]$release.tar;if($tarName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tar$'){Fail 'La imagen de actualización está incompleta.'}
    $tar=Join-Path $PSScriptRoot $tarName;if((Sha256 $tar) -cne ([string]$release.tarSha256).ToLowerInvariant()){Fail 'No coincide el SHA-256 de la imagen de actualización.'}
    $dockerCommand=Get-Command docker -ErrorAction SilentlyContinue;if(-not $dockerCommand){Fail 'No se encontró Docker. Abra Docker Desktop y vuelva a ejecutar el actualizador.'};$script:Docker=$dockerCommand.Source
    $engine=Invoke-Docker @('version','--format','{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}') -Capture
    if($engine -notmatch '^(\d+)\.\S+\s+linux/amd64$' -or [int]$Matches[1] -lt 28){Fail 'Se requiere Docker Engine 28 o posterior con motor Linux amd64.'}
    $endpoint='';if(-not $env:DOCKER_CONTEXT -and $env:DOCKER_HOST){$endpoint=[string]$env:DOCKER_HOST}else{$contextEndpoint=@(Invoke-Docker @('context','inspect','--format','{{.Endpoints.docker.Host}}') -Capture);$endpoint=[string]$contextEndpoint[0]};$endpoint=$endpoint.Trim();if($endpoint -notmatch '^(npipe:/{2,4}\.\/pipe\/|unix:/{2,3})'){Fail 'Seleccione el contexto local de Docker Desktop.'}
    $envPath=Join-Path $target 'docker.env';$composePath=Join-Path $target 'compose.local.yaml';$assistant=Join-Path $target 'scripts\docker-colegio.ps1'
    foreach($required in @($envPath,$composePath,$assistant)){if(-not(Test-Path -LiteralPath $required -PathType Leaf)){Fail "Falta un archivo de la instalación: $required"}}
    $lines=@(Get-Content -LiteralPath $envPath);if((Get-EnvValue $lines 'MATRICULA_DOCKER_MODE') -cne 'local'){Fail 'La instalación existente no está en modo local.'}
    $volume=Get-EnvValue $lines 'MATRICULA_DATA_VOLUME' 'puramatricula_data';$port=Get-EnvValue $lines 'MATRICULA_LOCAL_PORT' '4319';$oldImage=Get-EnvValue $lines 'MATRICULA_IMAGE'
    if($volume -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$'){Fail 'El volumen configurado no es válido.'};if($port -notmatch '^\d{4,5}$' -or [int]$port -lt 1024 -or [int]$port -gt 65535){Fail 'El puerto local configurado no es válido.'};if($oldImage -notmatch '^puramatricula:[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$'){Fail 'La imagen actual no es válida.'}
    $allowedImages=@($release.upgradeFrom | ForEach-Object {[string]$_} | Where-Object {$_})
    $imageIsAllowed=$allowedImages.Count -eq 0 -or $allowedImages -contains $oldImage
    $upgradePatternProperty=$release.PSObject.Properties['upgradeFromPattern']
    if(-not $imageIsAllowed -and $upgradePatternProperty -and [string]$upgradePatternProperty.Value){
      try {$imageIsAllowed=[regex]::IsMatch($oldImage,[string]$upgradePatternProperty.Value,[System.Text.RegularExpressions.RegexOptions]::CultureInvariant)}
      catch {Fail 'La regla de compatibilidad de la entrega no es válida.'}
    }
    if(-not $imageIsAllowed){Fail "La versión instalada no corresponde a esta actualización: $oldImage"}
    if((Invoke-Docker @('volume','ls','--format','{{.Name}}') -Capture) -notcontains $volume){Fail "No existe el volumen de datos configurado: $volume"}
    $containerIds=@(Invoke-Docker @('compose','--project-directory',$target,'--env-file',$envPath,'-f',$composePath,'-p','puramatricula','ps','--status','running','--quiet','puramatricula') -Capture)
    if($containerIds.Count -ne 1 -or $containerIds[0] -notmatch '^[a-f0-9]{12,64}$'){Fail 'No se encontro un contenedor activo de Matricula. Inicie la instalacion correcta y vuelva a intentarlo.'}
    $containers=@(Invoke-Docker @('inspect','--type','container',$containerIds[0]) -Capture | Out-String | ConvertFrom-Json)
    if($containers.Count -ne 1){Fail 'No se pudo identificar el contenedor activo de Matricula.'}
    $container=$containers[0];$workingDir=$container.Config.Labels.PSObject.Properties['com.docker.compose.project.working_dir']
    $pathSeparators=[char[]]@('\','/')
    if(-not $workingDir -or [IO.Path]::GetFullPath([string]$workingDir.Value).TrimEnd($pathSeparators) -ne $target.TrimEnd($pathSeparators)){Fail 'El contenedor activo pertenece a otra carpeta. Use -Destino con la carpeta de la instalacion en ejecucion.'}
    if($container.Config.Image -cne $oldImage -or -not @($container.Mounts | Where-Object { $_.Type -eq 'volume' -and $_.Destination -ceq '/data' -and $_.Name -ceq $volume }).Count){Fail 'La imagen o el volumen del contenedor activo no coinciden con docker.env. No se hizo ningun cambio.'}
    if($SoloComprobar){Write-Host "Actualización preparada para $target. Conserva puerto $port, volumen $volume e imagen anterior $oldImage.";return}
    $previousLan=Get-EnvValue $lines 'MATRICULA_LAN_IP'
    $previousOrigin=Get-EnvValue $lines 'MATRICULA_ORIGIN' ('http://127.0.0.1:'+$port)
    $existingLan=(Get-EnvValue $lines 'MATRICULA_TRANSPORT' 'local') -eq 'lan'
    $generatedOrigin=$previousLan -and $previousOrigin -match ('^http://'+[regex]::Escape($previousLan)+':\d{4,5}/?$')
    $newLan=if(-not $existingLan){Get-LanAddress}
        elseif($generatedOrigin){if((Get-ActiveAddresses) -contains $previousLan){$previousLan}else{Get-LanAddress}}
    $assistantPackage=Join-Path $PSScriptRoot 'docker-colegio.ps1'
    if(-not (Test-Path -LiteralPath $assistantPackage -PathType Leaf)){Fail 'Falta el asistente de la entrega. Extraiga todo el ZIP en una carpeta nueva.'}
    Invoke-Docker @('image','load','--input',$tar);$newIds=@(Invoke-Docker @('image','inspect','--format','{{.Id}}',$release.image) -Capture);$expected=@($release.imageId,$release.imageConfigId)|Where-Object{$_ -and $_ -match '^sha256:[a-f0-9]{64}$'};if($newIds.Count -ne 1 -or ($expected -notcontains $newIds[0])){Fail 'La imagen cargada no coincide con la entrega.'}
    Write-Host 'Creando el respaldo automático antes de cambiar la versión...'
    & $assistantPackage backup -InstallationRoot $target -AutomaticBackup
    if($LASTEXITCODE -ne 0){Fail 'No se pudo crear el respaldo. Se conserva la versión instalada.'}
    $oldLines=[string[]]$lines;$backupEnv=Join-Path $target ('.docker.env.before-update-'+[Guid]::NewGuid().ToString('N')+'.txt');Copy-Item -LiteralPath $envPath -Destination $backupEnv
    $keepRollbackFiles=$false
    $composeTarget=Join-Path $target 'compose.local.yaml';$composePackage=Join-Path $PSScriptRoot 'compose.local.yaml';$composeBackup=$null;$shortcutTarget=Join-Path $target 'scripts\crear-acceso-directo.ps1';$shortcutPackage=Join-Path $PSScriptRoot 'crear-acceso-directo.ps1';$shortcutBackup=$null;$assistantBackup=$null
    try{
      $next=Set-EnvValue $oldLines 'MATRICULA_IMAGE' ([string]$release.image)
      if(-not $existingLan){
        $next=Set-EnvValue $next 'MATRICULA_TRANSPORT' 'lan';$next=Set-EnvValue $next 'MATRICULA_ALLOW_INSECURE_LAN' '1';$next=Set-EnvValue $next 'MATRICULA_LOCAL_BIND' '0.0.0.0'
      }
      if($newLan){
        $next=Set-EnvValue $next 'MATRICULA_LAN_IP' $newLan;$next=Set-EnvValue $next 'MATRICULA_ORIGIN' ('http://'+$newLan+':'+$port)
      }
      if(Test-Path -LiteralPath $composePackage -PathType Leaf){$composeBackup=$composeTarget+'.before-update-'+[Guid]::NewGuid().ToString('N');Copy-Item -LiteralPath $composeTarget -Destination $composeBackup -Force;Copy-Item -LiteralPath $composePackage -Destination $composeTarget -Force}
      if((Test-Path -LiteralPath $shortcutPackage -PathType Leaf) -and (Test-Path -LiteralPath $shortcutTarget -PathType Leaf)){$shortcutBackup=$shortcutTarget+'.before-update-'+[Guid]::NewGuid().ToString('N');Copy-Item -LiteralPath $shortcutTarget -Destination $shortcutBackup -Force;Copy-Item -LiteralPath $shortcutPackage -Destination $shortcutTarget -Force}
      if((Test-Path -LiteralPath $assistantPackage -PathType Leaf) -and (Test-Path -LiteralPath $assistant -PathType Leaf)){$assistantBackup=$assistant+'.before-update-'+[Guid]::NewGuid().ToString('N');Copy-Item -LiteralPath $assistant -Destination $assistantBackup -Force;Copy-Item -LiteralPath $assistantPackage -Destination $assistant -Force}
      $temporary=$envPath+'.partial-'+[Guid]::NewGuid().ToString('N');[IO.File]::WriteAllLines($temporary,$next,(New-Object Text.UTF8Encoding($false)));Move-Item -LiteralPath $temporary -Destination $envPath -Force;& $assistant start;if($LASTEXITCODE -ne 0){Fail 'La nueva imagen no pudo iniciar.'};& $assistant check;if($LASTEXITCODE -ne 0){Fail 'La nueva imagen no superó la comprobación de salud.'}
    }
    catch{
      $failure=$_
      $keepRollbackFiles=$true
      Write-Warning 'No se pudo completar la actualizacion. Se restaurara la configuracion anterior sin borrar el volumen.'
      Copy-Item -LiteralPath $backupEnv -Destination $envPath -Force
      if($composeBackup -and (Test-Path -LiteralPath $composeBackup)){Copy-Item -LiteralPath $composeBackup -Destination $composeTarget -Force}
      if($shortcutBackup -and (Test-Path -LiteralPath $shortcutBackup)){Copy-Item -LiteralPath $shortcutBackup -Destination $shortcutTarget -Force}
      if($assistantBackup -and (Test-Path -LiteralPath $assistantBackup)){Copy-Item -LiteralPath $assistantBackup -Destination $assistant -Force}
      & $assistant start | Out-Host
      if($LASTEXITCODE -ne 0){Fail "No pudo arrancar la imagen anterior. Se conservaron el volumen, el respaldo cifrado y la copia de configuracion: $backupEnv"}
      $keepRollbackFiles=$false
      throw $failure
    }
    finally{
      if(-not $keepRollbackFiles){
        foreach($saved in @($backupEnv,$composeBackup,$shortcutBackup,$assistantBackup)){
          if($saved -and (Test-Path -LiteralPath $saved)){Remove-Item -LiteralPath $saved -Force -ErrorAction SilentlyContinue}
        }
      }
    }
    $origin=Get-EnvValue $next 'MATRICULA_ORIGIN'
    Write-Host "Actualización lista. Se conservó el puerto $port y el volumen $volume. Acceso interno: $origin/"
    try {
      $isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
      if($isAdmin){
        $ruleName="PuraMatricula-LAN-$port"
        if(-not(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)){New-NetFirewallRule -Name $ruleName -DisplayName "PuraMatricula - Red privada ($port)" -Direction Inbound -Protocol TCP -LocalPort ([int]$port) -RemoteAddress LocalSubnet -Action Allow -Profile Private | Out-Null}
      } else {Write-Warning "Si otro equipo no puede entrar, Informática puede habilitar el puerto $port en la red privada."}
    } catch {Write-Warning "No se pudo configurar el firewall. Informática puede revisar el puerto $port."}
    if(-not $SinAccesoDirecto){
      try {
        $shortcutArgs=@{OrigenAnterior=$previousOrigin}
        if($CarpetaAccesoDirecto){$shortcutArgs.Carpeta=$CarpetaAccesoDirecto}
        $shortcut=& $shortcutTarget @shortcutArgs
        Write-Host "Acceso directo actualizado: $shortcut"
      } catch {Write-Warning "La aplicacion funciona en $origin/. No se pudo actualizar el acceso directo de este escritorio."}
    }
}catch{Write-Error $_.Exception.Message;exit 1}
