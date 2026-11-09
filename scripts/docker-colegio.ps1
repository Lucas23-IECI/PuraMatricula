[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('init', 'start', 'check', 'backup', 'restore', 'update', 'stop', 'help')]
    [string]$Command = 'check',
    [string]$BackupFile,
    [string]$Origin,
    [ValidateSet('', 'local', 'tls', 'proxy')]
    [string]$Mode = '',
    [int]$Port = 0,
    [switch]$UseImage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ProjectName = 'puramatricula'
$ConfigFile = Join-Path $ProjectRoot 'docker.env'
$ServiceName = 'puramatricula'
$script:LastBackupFile = $null

function Show-Help {
    Write-Host @'
PuraMatricula: administracion Docker independiente
  .\scripts\docker-colegio.ps1 init [-Mode local] [-UseImage]
  .\scripts\docker-colegio.ps1 start
  .\scripts\docker-colegio.ps1 check
  .\scripts\docker-colegio.ps1 backup [-BackupFile C:\Respaldos\matricula.dsmbak]
  .\scripts\docker-colegio.ps1 restore -BackupFile C:\Respaldos\matricula.dsmbak
  .\scripts\docker-colegio.ps1 update
  .\scripts\docker-colegio.ps1 stop

init -Mode local permite usar Matricula solo desde el PC servidor sin HTTPS.
Para uso desde otros computadores, configure TLS o proxy HTTPS. Las contrasenas
se escriben en el contenedor, sin guardarlas en docker.env ni en argumentos.
restore crea y verifica otro volumen; nunca reemplaza el volumen activo.
init -UseImage exige la imagen local configurada y no construye ni descarga.
Guia: docs/DOCKER-COLEGIO.md
'@
}

if ($Command -eq 'help') { Show-Help; return }
if ($UseImage -and $Command -ne 'init') { throw '-UseImage solo se admite con init. update conserva su flujo de respaldo y construccion.' }
$DockerExecutable = (Get-Command docker -ErrorAction Stop).Source

function Assert-DockerReady {
    $probe = New-Object System.Diagnostics.Process
    $probe.StartInfo.FileName = $DockerExecutable
    $probe.StartInfo.Arguments = 'info --format "{{.ServerVersion}}"'
    $probe.StartInfo.UseShellExecute = $false
    $probe.StartInfo.CreateNoWindow = $true
    $probe.StartInfo.RedirectStandardOutput = $true
    $probe.StartInfo.RedirectStandardError = $true
    try {
        [void]$probe.Start()
        $output = $probe.StandardOutput.ReadToEndAsync()
        $errors = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit(10000)) {
            $probe.Kill()
            $probe.WaitForExit()
            throw 'El motor Docker no respondio en 10 segundos. Abra Docker Desktop manualmente y espere a que este listo.'
        }
        if ($probe.ExitCode -ne 0) { throw 'El motor Docker no esta disponible. Compruebe Docker Desktop y su contexto antes de continuar.' }
        return $output.GetAwaiter().GetResult().Trim()
    } finally { $probe.Dispose() }
}

function Invoke-Docker {
    param([string[]]$Arguments, [switch]$Capture)
    if ($Capture) {
        $result = @(& $DockerExecutable @Arguments)
        if ($LASTEXITCODE -ne 0) { throw "Docker termino con codigo $LASTEXITCODE." }
        return $result
    }
    & $DockerExecutable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker termino con codigo $LASTEXITCODE." }
}

function Get-Setting {
    param([string]$Name, [string]$Default = '')
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value) -and (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
        $line = @(Get-Content -LiteralPath $ConfigFile | Where-Object { $_ -match ('^' + [regex]::Escape($Name) + '\s*=') } | Select-Object -Last 1)
        if ($line.Count) { $value = ($line[0] -split '=', 2)[1].Trim() }
    }
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) { $value = $value.Substring(1, $value.Length - 2) }
    return $value
}

function Get-ComposeArguments {
    if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
        throw 'Falta docker.env. Ejecute primero .\scripts\docker-colegio.ps1 init.'
    }
    $transport = Get-Setting 'MATRICULA_DOCKER_MODE' 'tls'
    if ($transport -notin @('local', 'tls', 'proxy')) { throw 'MATRICULA_DOCKER_MODE debe ser local, tls o proxy.' }
    $composeFile = switch ($transport) { 'local' { 'compose.local.yaml' } 'tls' { 'compose.tls.yaml' } default { 'compose.yaml' } }
    $result = @('compose', '--project-directory', $ProjectRoot, '--env-file', $ConfigFile, '-f', (Join-Path $ProjectRoot $composeFile))
    if ($transport -eq 'proxy' -and -not [string]::IsNullOrWhiteSpace((Get-Setting 'MATRICULA_PROXY_NETWORK'))) { $result += @('-f', (Join-Path $ProjectRoot 'compose.proxy.yaml')) }
    return $result + @('-p', $ProjectName)
}

function Invoke-Compose {
    param([string[]]$Arguments, [switch]$Capture)
    Invoke-Docker -Arguments ((Get-ComposeArguments) + $Arguments) -Capture:$Capture
}

function New-Configuration {
    if (Test-Path -LiteralPath $ConfigFile) {
        if ($Mode -and (Get-Setting 'MATRICULA_DOCKER_MODE' 'tls') -ne $Mode) { throw 'docker.env ya existe con otro modo. Revise la guia antes de cambiarlo; no se modifico.' }
        Write-Host 'Se conserva docker.env existente. No se reemplazan sus valores.'
        return
    }
    $transport = $Mode
    if (-not $transport) { $transport = Read-Host 'Modo: local (solo este PC), tls o proxy HTTPS [local]' }
    if (-not $transport) { $transport = 'local' }
    if ($transport -notin @('local', 'tls', 'proxy')) { throw 'Seleccione local, tls o proxy.' }
    $selectedPort = $Port
    if ($selectedPort -eq 0) {
        if ($transport -eq 'local') { $selectedPort = 4319 }
        else {
            $prompt = if ($transport -eq 'tls') { 'Puerto HTTPS para la red del colegio [4433]' } else { 'Puerto HTTP solo en 127.0.0.1 para el proxy [4319]' }
            $answer = Read-Host $prompt
            if ([string]::IsNullOrWhiteSpace($answer)) { $selectedPort = if ($transport -eq 'tls') { 4433 } else { 4319 } }
            elseif (-not [int]::TryParse($answer, [ref]$selectedPort)) { throw 'El puerto debe ser un numero.' }
        }
    }
    if ($selectedPort -lt 1024 -or $selectedPort -gt 65535) { throw 'Use un puerto entre 1024 y 65535, reservado para Matricula.' }
    $publicOrigin = $Origin
    if ($transport -eq 'local') {
        $expected = 'http://127.0.0.1:' + $selectedPort
        if ($publicOrigin -and $publicOrigin -cne $expected) { throw "Modo local: el unico origen permitido es $expected." }
        $publicOrigin = $expected
    } else {
        if ([string]::IsNullOrWhiteSpace($publicOrigin)) { $publicOrigin = Read-Host 'Origen HTTPS usado por Secretaria; ej. https://10.0.0.25:4433' }
        $publicOrigin = $publicOrigin.Trim()
        $uri = $null
        if ($publicOrigin -match '[\r\n]' -or -not [Uri]::TryCreate($publicOrigin, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
            throw 'Use un origen HTTPS sin usuario, contrasena, ruta, consulta ni fragmento.'
        }
        if ($transport -eq 'tls' -and $uri.Port -ne $selectedPort) { throw 'En modo tls el origen HTTPS debe indicar el mismo puerto publicado, por ejemplo :4433.' }
        $publicOrigin = $uri.GetLeftPart([UriPartial]::Authority)
    }
    $httpPort = if ($transport -eq 'proxy') { $selectedPort } else { 4319 }
    $tlsPort = if ($transport -eq 'tls') { $selectedPort } else { 4433 }
    $localPort = if ($transport -eq 'local') { $selectedPort } else { 4319 }
    $text = @(
        '# Configuracion propia de PuraMatricula. No agregue contrasenas.'
        ('MATRICULA_DOCKER_MODE=' + $transport)
        ('MATRICULA_PUBLIC_ORIGIN=' + $publicOrigin)
        ('MATRICULA_LOCAL_PORT=' + $localPort)
        ('MATRICULA_HTTP_PORT=' + $httpPort)
        ('MATRICULA_TLS_PORT=' + $tlsPort)
        'MATRICULA_TLS_BIND=0.0.0.0'
        'MATRICULA_TLS_CERT_FILE=./certificados/matricula.crt'
        'MATRICULA_TLS_KEY_FILE=./certificados/matricula.key'
        'MATRICULA_IMAGE=puramatricula:0.2.0'
        'MATRICULA_DATA_VOLUME=puramatricula_data'
        'MATRICULA_NETWORK_NAME=puramatricula_private'
    ) -join "`n"
    $stream = [IO.File]::Open($ConfigFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
        try { $writer.WriteLine($text) } finally { $writer.Dispose() }
    } finally { $stream.Dispose() }
    Write-Host 'docker.env creado sin contrasenas.'
}

function Assert-TransportFiles {
    if ((Get-Setting 'MATRICULA_DOCKER_MODE' 'tls') -ne 'tls') { return }
    foreach ($name in @('MATRICULA_TLS_CERT_FILE', 'MATRICULA_TLS_KEY_FILE')) {
        $value = Get-Setting $name
        if (-not $value) { throw "Falta $name en docker.env." }
        $path = if ([IO.Path]::IsPathRooted($value)) { $value } else { Join-Path $ProjectRoot $value }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Falta el archivo propio configurado en $name. La guia explica como preparar los certificados sin usar los de Asistencia." }
    }
}

function Start-Matricula {
    Invoke-Compose -Arguments @('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', $ServiceName)
}

function Assert-LocalImage {
    $imageName = Get-Setting 'MATRICULA_IMAGE' 'puramatricula:0.2.0'
    if (-not [regex]::IsMatch($imageName, '\A[a-zA-Z0-9][a-zA-Z0-9._/:@-]*\z')) { throw 'MATRICULA_IMAGE no es una referencia de imagen valida.' }
    $imageIds = @(Invoke-Docker -Arguments @('image', 'inspect', '--format', '{{.Id}}', $imageName) -Capture)
    if ($imageIds.Count -ne 1 -or $imageIds[0] -notmatch '^sha256:[a-f0-9]{64}$') { throw 'No se pudo comprobar la imagen local configurada. Cargue el tar verificado antes de init -UseImage.' }
    Write-Host 'Se usara la imagen local configurada, sin construir ni descargar.'
}

function Remove-OwnedTaskContainer {
    param([string]$Name)
    if ($Name -notmatch '^puramatricula-backup-[0-9a-f]{32}$') { throw 'Nombre de tarea inesperado; no se quitara el contenedor.' }
    $taskMatches = @(Invoke-Docker -Arguments @('ps', '--all', '--filter', ('name=^/' + $Name + '$'), '--format', '{{.ID}}') -Capture)
    if (-not $taskMatches.Count) { return }
    if ($taskMatches.Count -ne 1) { throw 'La consulta del contenedor de tarea no devolvio una coincidencia unica.' }
    $labelsText = @(Invoke-Docker -Arguments @('inspect', '--type', 'container', '--format', '{{json .Config.Labels}}', $Name) -Capture)
    $running = @(Invoke-Docker -Arguments @('inspect', '--type', 'container', '--format', '{{.State.Running}}', $Name) -Capture)
    if ($labelsText.Count -ne 1 -or $running.Count -ne 1) { throw 'No se pudo validar el contenedor de tarea.' }
    $labels = $labelsText[0] | ConvertFrom-Json -ErrorAction Stop
    if (-not $labels) { throw 'El contenedor de tarea no tiene etiquetas de Compose verificables.' }
    $projectLabel = $labels.PSObject.Properties['com.docker.compose.project']
    $oneOffLabel = $labels.PSObject.Properties['com.docker.compose.oneoff']
    if (-not $projectLabel -or -not $oneOffLabel -or $projectLabel.Value -ne $ProjectName -or $oneOffLabel.Value -ne 'True' -or $running[0] -ne 'false') { throw 'No se quitara un contenedor ajeno o que sigue ejecutandose.' }
    Invoke-Docker -Arguments @('rm', $Name)
}

function Backup-Matricula {
    Assert-LocalImage
    $token = [Guid]::NewGuid().ToString('N')
    $filename = 'matricula-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $token.Substring(0, 8) + '.dsmbak'
    $destination = if ($BackupFile) { [IO.Path]::GetFullPath($BackupFile) } else { Join-Path (Join-Path $ProjectRoot 'backups') $filename }
    if ([IO.Path]::GetExtension($destination) -ne '.dsmbak') { throw 'El destino debe terminar en .dsmbak.' }
    if (Test-Path -LiteralPath $destination) { throw 'El archivo de destino ya existe; no se sobrescribira.' }
    $parent = Split-Path -Parent $destination
    [void][IO.Directory]::CreateDirectory($parent)
    $partial = Join-Path $parent ('.partial-' + $token + '.dsmbak')
    $container = 'puramatricula-backup-' + $token
    $wasRunning = @(Invoke-Compose -Arguments @('ps', '--status', 'running', '--services') -Capture) -contains $ServiceName
    try {
        if ($wasRunning) { Invoke-Compose -Arguments @('stop', '--timeout', '30', $ServiceName) }
        Invoke-Compose -Arguments @('run', '--pull', 'never', '--name', $container, '--no-deps', $ServiceName, 'node', 'scripts/docker-maintenance.mjs', 'backup', ('/data/matricula/backups/' + $filename))
        Invoke-Docker -Arguments @('cp', ($container + ':/data/matricula/backups/' + $filename), $partial)
        [IO.File]::Move($partial, $destination)
        $script:LastBackupFile = $destination
        Write-Host "Respaldo cifrado copiado a: $destination"
    } finally {
        try { Remove-OwnedTaskContainer -Name $container }
        finally { if ($wasRunning) { Start-Matricula } }
    }
}

function Restore-Matricula {
    if (-not $BackupFile) { throw 'Indique -BackupFile con un respaldo cifrado .dsmbak.' }
    $source = (Resolve-Path -LiteralPath $BackupFile -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or [IO.Path]::GetExtension($source) -ne '.dsmbak') { throw 'Seleccione un archivo .dsmbak existente.' }
    Assert-LocalImage
    $volume = 'puramatricula_restore_' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ').ToLowerInvariant() + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    Invoke-Docker -Arguments @('volume', 'create', '--label', 'cl.dsm.puramatricula.purpose=restore-check', '--label', ('com.docker.compose.project=' + $ProjectName), '--label', 'com.docker.compose.volume=matricula-data', $volume)
    $previous = [Environment]::GetEnvironmentVariable('MATRICULA_DATA_VOLUME')
    try {
        [Environment]::SetEnvironmentVariable('MATRICULA_DATA_VOLUME', $volume)
        Invoke-Compose -Arguments @('run', '--pull', 'never', '--rm', '--no-deps', '-v', ($source + ':/restore-input.dsmbak:ro'), $ServiceName, 'node', 'scripts/docker-maintenance.mjs', 'restore', '/restore-input.dsmbak', '/data/matricula')
    } finally { [Environment]::SetEnvironmentVariable('MATRICULA_DATA_VOLUME', $previous) }
    Write-Host "Restauracion verificada en volumen nuevo: $volume"
    Write-Host 'El volumen activo no cambio. Conserve este nombre; la guia explica la prueba aislada con navegador.'
}

try {
    $serverVersion = Assert-DockerReady
    if ($Command -eq 'init') { New-Configuration }
    $localMode = (Get-Setting 'MATRICULA_DOCKER_MODE' 'tls') -eq 'local'
    if ($localMode -and $Command -ne 'stop') {
        if ($serverVersion -notmatch '^(\d+)\.' -or [int]$Matches[1] -lt 28) { throw 'El modo local requiere Docker Engine 28 o posterior para aislar la publicacion en 127.0.0.1.' }
        $endpoint = if (-not $env:DOCKER_CONTEXT -and $env:DOCKER_HOST) { $env:DOCKER_HOST } else { @(Invoke-Docker -Arguments @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}') -Capture)[0] }
        if ($endpoint -notmatch '^(npipe:////\./pipe/|unix:///)') { throw 'El modo local requiere el motor Docker de este PC; no use un contexto remoto.' }
    }
    if ($Command -ne 'stop') { Assert-TransportFiles }
    Invoke-Compose -Arguments @('config', '--quiet')
    switch ($Command) {
        'init' {
            if ($UseImage) { Assert-LocalImage } else { Invoke-Compose -Arguments @('build', $ServiceName) }
            Invoke-Compose -Arguments @('run', '--pull', 'never', '--rm', '--no-deps', $ServiceName, 'node', 'scripts/docker-init.mjs')
            Invoke-Compose -Arguments @('run', '--pull', 'never', '--rm', '--no-deps', $ServiceName, 'node', 'scripts/docker-start.mjs', '--check')
            Start-Matricula
        }
        'start' { Start-Matricula }
        'check' {
            Invoke-Compose -Arguments @('ps')
            if (-not (@(Invoke-Compose -Arguments @('ps', '--status', 'running', '--services') -Capture) -contains $ServiceName)) { throw 'Matricula no esta ejecutandose. Use start despues de inicializar.' }
            Invoke-Compose -Arguments @('exec', '-T', $ServiceName, 'node', 'scripts/docker-start.mjs', '--check')
            Invoke-Compose -Arguments @('exec', '-T', $ServiceName, 'node', 'scripts/docker-healthcheck.mjs')
            if ($localMode) {
                $localUrl = 'http://127.0.0.1:' + (Get-Setting 'MATRICULA_LOCAL_PORT' '4319')
                $health = [Net.WebRequest]::Create($localUrl + '/api/health')
                $health.Proxy = $null
                $health.Timeout = 5000
                $reply = $health.GetResponse()
                try {
                    $reader = New-Object IO.StreamReader($reply.GetResponseStream())
                    try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
                    if (-not $body.ok -or $body.demo -or $body.application -ne 'matricula') { throw 'El puerto local no responde como Matricula escolar.' }
                } finally { $reply.Dispose() }
                Write-Host "Matricula responde en $localUrl (solo en este PC)."
            } else { Write-Host 'Salud interna comprobada. Compruebe tambien HTTPS e ingreso desde el PC de Secretaria.' }
        }
        'backup' { Backup-Matricula }
        'restore' { Restore-Matricula }
        'update' {
            Backup-Matricula
            $images = @(Invoke-Compose -Arguments @('images', '--quiet', $ServiceName) -Capture)
            if ($images.Count -and $images[0]) {
                $rollback = 'puramatricula:antes-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ').ToLowerInvariant()
                Invoke-Docker -Arguments @('image', 'tag', $images[0], $rollback)
                Write-Host "Imagen anterior conservada como $rollback"
            }
            Invoke-Compose -Arguments @('build', $ServiceName)
            Start-Matricula
            Write-Host "Actualizacion comprobada. Conserve el respaldo: $script:LastBackupFile"
        }
        'stop' { Invoke-Compose -Arguments @('stop', '--timeout', '30', $ServiceName) }
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
