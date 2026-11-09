[CmdletBinding()]
param(
    [string]$Carpeta = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory),
    [ValidateRange(0, 65535)]
    [int]$Puerto = 0,
    [switch]$UsarIP
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
$servidor = if ($UsarIP) { '127.0.0.1' } else { 'matricula.localhost' }
$direccion = 'http://{0}:{1}/' -f $servidor, $Puerto
$contenido = @('[InternetShortcut]', "URL=$direccion", "IconFile=$icono", 'IconIndex=0', '') -join [Environment]::NewLine
$encoding = [Text.UnicodeEncoding]::new($false, $true)
[byte[]]$bytes = $encoding.GetPreamble() + $encoding.GetBytes($contenido)

# Do not replace another shortcut or follow a pre-existing reparse point.
for ($i = 1; $i -le 30; $i++) {
    $nombre = if ($i -eq 1) { 'Matricula del colegio.url' } else { "Matricula del colegio ($i).url" }
    $archivo = Join-Path $Carpeta $nombre
    $existente = Get-Item -LiteralPath $archivo -Force -ErrorAction SilentlyContinue
    if ($null -ne $existente) {
        if (-not ($existente.Attributes -band ([IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint)) -and
            $existente.Length -eq $bytes.Length -and [IO.File]::ReadAllText($archivo) -ceq $contenido) {
            return $archivo
        }
        continue
    }
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
