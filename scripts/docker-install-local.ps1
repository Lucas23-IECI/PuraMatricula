[CmdletBinding()]
param(
    [string]$Destino = 'C:\PuraMatricula',
    [ValidateRange(1024, 65535)]
    [int]$Puerto = 4319,
    [switch]$SoloPreparar
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
try {
    if (Get-ChildItem Env:MATRICULA_* -ErrorAction SilentlyContinue) { throw 'Abra una PowerShell nueva, sin variables MATRICULA_ de otra instalacion.' }
    if ($Destino -notmatch '^[A-Za-z]:[\\/]') { throw 'El destino debe ser una carpeta absoluta de un disco local.' }
    $target = [IO.Path]::GetFullPath($Destino)
    if (Test-Path -LiteralPath $target) { throw 'El destino ya existe. Para una instalacion anterior use su asistente y conserve su volumen.' }
    $release = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ENTREGA.json') -Raw | ConvertFrom-Json
    if ($release.mode -cne 'local' -or $release.image -notmatch '^puramatricula:0\.2\.0-local-[0-9]{8}t[0-9]{9}z$') { throw 'Esta no es una entrega local de PuraMatricula.' }

    function Confirm-Artifact([string]$Name,[string]$Hash) {
        if ($Name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' -or $Hash -notmatch '^[a-f0-9]{64}$') { throw 'Nombre o huella de artefacto no valido.' }
        $file = Join-Path $PSScriptRoot $Name
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $Hash) { throw "No coincide SHA-256: $Name." }
        return $file
    }
    $zip = Confirm-Artifact $release.zip $release.zipSha256
    $tar = Confirm-Artifact $release.tar $release.tarSha256
    $config = Confirm-Artifact 'docker.local.env' $release.configSha256
    $docker = (Get-Command docker -ErrorAction Stop).Source
    $engine = & $docker version --format '{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}'
    if ($LASTEXITCODE -ne 0 -or $engine -notmatch '^(\d+)\.\S+\s+linux/amd64$' -or [int]$Matches[1] -lt 28) { throw 'Se requiere el motor local Docker Engine 28 o posterior, Linux amd64. Compruebe Docker Desktop.' }
    $endpoint = if (-not $env:DOCKER_CONTEXT -and $env:DOCKER_HOST) { $env:DOCKER_HOST } else { & $docker context inspect --format '{{.Endpoints.docker.Host}}' }
    if ($endpoint -notmatch '^(npipe:////\./pipe/|unix:///)') { throw 'Seleccione el contexto local de Docker Desktop.' }
    $volumes = @(& $docker volume ls --format '{{.Name}}')
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible consultar los volumenes Docker.' }
    if ($volumes -contains 'puramatricula_data') { throw 'Ya existe puramatricula_data. Conserve la base y siga la guia de actualizacion; no inicialice de nuevo.' }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Puerto)
    try { $listener.ExclusiveAddressUse = $true; $listener.Start() }
    catch { throw "El puerto local $Puerto no se pudo reservar. Elija otro con -Puerto 4320." }
    finally { $listener.Stop() }

    & $docker image load --input $tar
    if ($LASTEXITCODE -ne 0) { throw 'Docker no pudo cargar la imagen.' }
    $id = & $docker image inspect --format '{{.Id}}' $release.image
    if ($LASTEXITCODE -ne 0 -or $id -cne $release.imageId) { throw 'La imagen cargada no coincide con la entrega.' }

    Expand-Archive -LiteralPath $zip -DestinationPath $target
    $envText = (Get-Content -LiteralPath $config -Raw).Replace('MATRICULA_LOCAL_PORT=4319','MATRICULA_LOCAL_PORT='+$Puerto)
    [IO.File]::WriteAllText((Join-Path $target 'docker.env'), $envText, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Archivos preparados en $target"
    $assistant = Join-Path $target 'scripts\docker-colegio.ps1'
    if ($SoloPreparar) {
        Write-Host "Para inicializar: powershell -NoProfile -ExecutionPolicy Bypass -File `"$assistant`" init -Mode local -UseImage"
        return
    }
    & $assistant init -Mode local -UseImage
    if ($LASTEXITCODE -ne 0) { throw 'La inicializacion no termino. Consulte ABRIR-PRIMERO.md antes de repetirla.' }
    & $assistant check
    if ($LASTEXITCODE -ne 0) { throw 'El asistente no pudo confirmar el acceso.' }
    Write-Host "Abra http://127.0.0.1:$Puerto/ en este PC y cambie su contrasena temporal."
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
