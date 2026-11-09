import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { schoolConfig } from '../scripts/school-start.mjs';

function powerShellCommand() {
  for (const command of ['pwsh', 'powershell']) {
    const probe = '$rsa=[System.Security.Cryptography.RSA]::Create(512); if(-not $rsa.GetType().GetMethod("ExportPkcs8PrivateKeyPem")){ exit 1 }; [System.Security.Cryptography.X509Certificates.X500DistinguishedName] | Out-Null; exit 0';
    const result = spawnSync(command, ['-NoProfile', '-NonInteractive', '-Command', probe], { stdio: 'ignore' });
    if (result.status === 0) return command;
  }
  return null;
}

function makeCertificate(powerShell, root, certPath, keyPath) {
  const scriptPath = join(root, 'make-test-certificate.ps1');
  writeFileSync(scriptPath, String.raw`
param([string]$CertPath, [string]$KeyPath)
$ErrorActionPreference = 'Stop'
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$name = [System.Security.Cryptography.X509Certificates.X500DistinguishedName]::new('CN=127.0.0.1')
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  $name,
  $rsa,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
$request.CertificateExtensions.Add($san.Build($false))
$certificate = $request.CreateSelfSigned(
  [DateTimeOffset]::Now.AddMinutes(-5),
  [DateTimeOffset]::Now.AddDays(1)
)
[System.IO.File]::WriteAllText($CertPath, $certificate.ExportCertificatePem())
[System.IO.File]::WriteAllText($KeyPath, $rsa.ExportPkcs8PrivateKeyPem())
`, { encoding: 'utf8' });
  const result = spawnSync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, certPath, keyPath], { encoding: 'utf8' });
  if (result.status !== 0 || !existsSync(certPath) || !existsSync(keyPath)) throw new Error(`No se pudo generar el certificado temporal: ${result.stderr || result.stdout}`);
}

test('schoolConfig valida una base local, HTTPS y el nombre del certificado sin instalarlo', { skip: !powerShellCommand() }, () => {
  const powerShell = powerShellCommand();
  const root = mkdtempSync(join(tmpdir(), 'pura-matricula-school-start-'));
  try {
    const data = join(root, 'data');
    const cert = join(root, 'matricula-cert.pem');
    const key = join(root, 'matricula-key.pem');
    mkdirSync(data);
    writeFileSync(join(data, 'matricula.sqlite'), Buffer.from('SQLite format 3\0 synthetic test'));
    writeFileSync(join(data, 'storage.key'), randomBytes(32));
    makeCertificate(powerShell, root, cert, key);

    const env = {
      MATRICULA_DATA: data,
      MATRICULA_HOST: '127.0.0.1',
      MATRICULA_PORT: '44321',
      MATRICULA_ORIGIN: 'https://127.0.0.1:44321/',
      MATRICULA_TLS_CERT: cert,
      MATRICULA_TLS_KEY: key
    };
    const config = schoolConfig(env);
    assert.equal(config.origin, 'https://127.0.0.1:44321');
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 44321);
    assert.ok(config.tls.cert.length > 0);
    assert.ok(config.tls.key.length > 0);
    assert.equal(existsSync(join(data, 'synthetic-demo.flag')), false);

    assert.throws(() => schoolConfig({ ...env, MATRICULA_DATABASE_URL: 'postgresql://no-debe-usarse' }), /SQLite exclusivo/);
    assert.throws(() => schoolConfig({ ...env, MATRICULA_ORIGIN: 'http://127.0.0.1:44321/' }), /HTTPS/);
    assert.throws(() => schoolConfig({ ...env, MATRICULA_ORIGIN: 'https://localhost:44321/' }), /no corresponde/);

    writeFileSync(join(data, 'synthetic-demo.flag'), 'demo');
    assert.throws(() => schoolConfig(env), /demostración/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
