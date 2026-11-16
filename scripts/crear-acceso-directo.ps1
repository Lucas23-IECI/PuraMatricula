[CmdletBinding()]
param(
    [string]$Carpeta = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory),
    [ValidateRange(0, 65535)]
    [int]$Puerto = 0,
    [switch]$UsarIP,
    [string]$OrigenAnterior
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$instalacion = Split-Path -Parent $PSScriptRoot
$config = Join-Path $instalacion 'docker.env'
if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw 'No se encontro docker.env. Ejecute este script desde la carpeta instalada de PuraMatricula.'
}
$configLines = Get-Content -LiteralPath $config
$modeLine = $configLines | Where-Object { $_ -match '^\s*MATRICULA_DOCKER_MODE\s*=' } | Select-Object -Last 1
if ($modeLine -notmatch '^\s*MATRICULA_DOCKER_MODE\s*=\s*local\s*(?:#.*)?$') {
    throw 'Este acceso directo se prepara para el modo local.'
}
if ($Puerto -eq 0) {
    $portLine = $configLines | Where-Object { $_ -match '^\s*MATRICULA_LOCAL_PORT\s*=' } | Select-Object -Last 1
    if (-not $portLine) { $Puerto = 4319 }
    elseif ($portLine -match '^\s*MATRICULA_LOCAL_PORT\s*=\s*(\d{1,5})\s*(?:#.*)?$') { $Puerto = [int]$Matches[1] }
    else { throw 'El puerto en docker.env no es valido.' }
}
if ($Puerto -lt 1024 -or $Puerto -gt 65535) { throw 'El puerto en docker.env no es valido.' }

if ([string]::IsNullOrWhiteSpace($Carpeta) -or -not [IO.Directory]::Exists($Carpeta)) {
    throw 'No se encontro el Escritorio de este usuario. Puede indicar una carpeta existente con -Carpeta.'
}
$icono = Join-Path $instalacion 'public\escudo.ico'
if (-not [IO.File]::Exists($icono)) { throw 'No se encontro el escudo de la instalacion.' }
if ($icono -match '[\x00-\x1f\x7f]') { throw 'La ruta del icono no se puede usar en el acceso directo.' }
function Get-Setting([string]$Name) {
    $line = $configLines | Where-Object { $_ -match ('^\s*' + $Name + '\s*=') } | Select-Object -Last 1
    if ($line -and $line -match '^\s*\w+\s*=\s*([^#]*?)(?:\s+#.*)?\s*$') {
        return $Matches[1].Trim().Trim([char[]]@("'", '"'))
    }
}

function Format-Origin([string]$Value) {
    $uri = $null
    if ($Value -match '^https?://[^\s#]+$' -and [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri) -and
        -not $uri.UserInfo -and $uri.AbsolutePath -eq '/' -and -not $uri.Query) {
        return $uri.GetLeftPart([UriPartial]::Authority) + '/'
    }
}

$lan = Get-Setting 'MATRICULA_LAN_IP'
$ip = $null
$servidor = if ($lan -match '^\d{1,3}(?:\.\d{1,3}){3}$' -and [Net.IPAddress]::TryParse($lan, [ref]$ip)) { $ip.ToString() } else { '127.0.0.1' }
$direccion = if (-not $UsarIP) { Format-Origin (Get-Setting 'MATRICULA_ORIGIN') }
if (-not $direccion) { $direccion = 'http://{0}:{1}/' -f $servidor, $Puerto }

$encoding = [Text.UnicodeEncoding]::new($false, $true)
function Get-ShortcutBytes([string]$Address) {
    $body = @('[InternetShortcut]', "URL=$Address", "IconFile=$icono", 'IconIndex=0', '') -join [Environment]::NewLine
    $encoding.GetPreamble() + $encoding.GetBytes($body)
}

[byte[]]$bytes = Get-ShortcutBytes $direccion
$actual = [Convert]::ToBase64String($bytes)
$anterior = Format-Origin $OrigenAnterior
$propiosAnteriores = @()
if ($anterior) {
    $propiosAnteriores += [Convert]::ToBase64String([byte[]](Get-ShortcutBytes $anterior))
    $anteriorUri = [Uri]$anterior
    if ($anteriorUri.Scheme -eq 'http' -and $anteriorUri.Port -eq $Puerto) {
        # The first LAN upgrade did not replace shortcuts from the loopback installation.
        $propiosAnteriores += [Convert]::ToBase64String([byte[]](Get-ShortcutBytes ('http://matricula.localhost:{0}/' -f $Puerto)))
        $propiosAnteriores += [Convert]::ToBase64String([byte[]](Get-ShortcutBytes ('http://127.0.0.1:{0}/' -f $Puerto)))
    }
}

function Read-OwnedCandidate([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item -or
        ($item.Attributes -band ([IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint)) -or
        $item.Length -gt 4096) { return }
    try { [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path)) }
    catch [IO.IOException] { }
    catch [UnauthorizedAccessException] { }
}

function Update-OwnedShortcut([string]$Path, [string]$Expected) {
    $temporary = Join-Path $Carpeta ('.matricula-acceso-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $created = $false
    try {
        $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $created = $true
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        if ((Read-OwnedCandidate $Path) -cne $Expected) { return $false }
        [IO.File]::Replace($temporary, $Path, [NullString]::Value)
        return $true
    } catch [IO.IOException] { return $false }
      catch [UnauthorizedAccessException] { return $false }
    finally { if ($created) { [IO.File]::Delete($temporary) } }
}

# Check all numbered names first so a gap does not leave an obsolete shortcut behind.
$disponibles = @()
$resultado = $null
for ($i = 1; $i -le 30; $i++) {
    $nombre = if ($i -eq 1) { 'Matricula del colegio.url' } else { "Matricula del colegio ($i).url" }
    $archivo = Join-Path $Carpeta $nombre
    $existente = Get-Item -LiteralPath $archivo -Force -ErrorAction SilentlyContinue
    if ($null -eq $existente) {
        $disponibles += $archivo
        continue
    }
    $candidato = Read-OwnedCandidate $archivo
    if ($candidato -ceq $actual -or
        ($propiosAnteriores -ccontains $candidato -and (Update-OwnedShortcut $archivo $candidato))) {
        if (-not $resultado) { $resultado = $archivo }
    }
}
if ($resultado) { return $resultado }
foreach ($archivo in $disponibles) {
    try {
        $stream = [IO.File]::Open($archivo, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    } catch [IO.IOException] {
        if (-not (Test-Path -LiteralPath $archivo)) { throw }
        continue
    }
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    return $archivo
}
throw 'No se encontro un nombre disponible para el acceso directo.'
