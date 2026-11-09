import { createHash } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootFiles = new Set(['package.json', 'package-lock.json', 'Dockerfile', '.dockerignore', 'docker.env.example', 'README.md', 'AGENTS.md', 'LICENSE', 'LICENSE.md']);
const publicExtensions = new Set(['.html', '.js', '.css', '.jpg', '.jpeg', '.png', '.svg', '.ico', '.webp', '.woff', '.woff2']);
const scriptExtensions = new Set(['.mjs', '.ps1', '.sh']);
const documents = new Set(['DOCKER-COLEGIO.md', 'RECURSOS-VISUALES.md', 'ANIOS-ESCOLARES.md', 'SEGURIDAD.md', 'VERIFICACION.md', 'SERVIDOR-COLEGIO.md', 'ENTREGA-REUTILIZABLE.md', 'ABRIR-PRIMERO-WINDOWS.md']);
const excludedApiDirectory = /^(?:__)?(?:fixtures?|tests?|specs?)(?:__)?$/i;
const excludedApiFile = /(?:^|[._-])(?:fixtures?|tests?|specs?|private|secrets?|credentials)(?:[._-]|$)/i;
const excludedDirectories = new Set(['node_modules', 'output', 'backups', 'backup', 'data', 'storage', 'attachments', 'logs', 'private', 'secrets', 'credentials', 'certs', 'certificates', 'tls']);
const requiredFiles = ['package.json', 'package-lock.json', 'Dockerfile', '.dockerignore', 'compose.yaml', 'docker.env.example', 'docs/DOCKER-COLEGIO.md'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const ordered = values => values.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

function safeRelativePath(value) {
  if (!value || isAbsolute(value) || /[\\:<>"|?*\x00-\x1f\x7f]/.test(value)) throw new Error('Ruta de entrega no segura.');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw new Error('Nombre de archivo no portable.');
  return value;
}

function sourceRoot(root) {
  const absolute = resolve(root);
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('El origen debe ser una carpeta real, sin enlaces.');
  return realpathSync(absolute);
}

function plainEntry(root, path) {
  const absolute = join(root, ...safeRelativePath(path).split('/'));
  const info = lstatSync(absolute);
  if (info.isSymbolicLink() || !samePath(realpathSync(absolute), absolute)) throw new Error(`No se empaquetan enlaces ni puntos de reanálisis: ${path}`);
  if (info.isFile() && info.nlink > 1) throw new Error(`No se empaquetan archivos con enlaces físicos: ${path}`);
  return { absolute, info };
}

function allowedFile(path) {
  const parts = safeRelativePath(path).split('/');
  if (parts.length === 1) return rootFiles.has(path) || /^compose(?:[.-][a-zA-Z0-9_-]+)*\.yaml$/.test(path);
  if (parts.some(part => part.startsWith('.') || excludedDirectories.has(part.toLowerCase())) || parts.some(part => /\.env(?:\.|$)/i.test(part))) return false;
  const extension = extname(path).toLowerCase();
  if (parts[0] === 'api') return extension === '.mjs' && !parts.some(part => excludedApiDirectory.test(part)) && !excludedApiFile.test(parts.at(-1));
  if (parts[0] === 'src') return extension === '.mjs';
  if (parts[0] === 'scripts') return scriptExtensions.has(extension) || path === 'scripts/instalar-matricula.cmd';
  if (parts[0] === 'public') return publicExtensions.has(extension);
  return parts.length === 2 && parts[0] === 'docs' && documents.has(parts[1]);
}

/** Only returns public source paths, relative to root and using ZIP/POSIX separators. */
export function collectReleaseFiles(root = projectRoot) {
  const directory = sourceRoot(root), files = [];
  const visit = path => {
    const { absolute, info } = plainEntry(directory, path);
    if (!info.isDirectory()) return;
    for (const name of ordered(readdirSync(absolute))) {
      // Hidden and operational directories are never entered, even when nested in public/.
      if (name.startsWith('.') || excludedDirectories.has(name.toLowerCase())) continue;
      if ((path === 'api' || path.startsWith('api/')) && excludedApiDirectory.test(name)) continue;
      const child = safeRelativePath(`${path}/${name}`), childInfo = lstatSync(join(absolute, name));
      if (childInfo.isSymbolicLink()) throw new Error(`No se empaquetan enlaces: ${child}`);
      if (childInfo.isDirectory()) {
        if (path !== 'docs') visit(child);
      } else if (allowedFile(child)) {
        if (!plainEntry(directory, child).info.isFile()) throw new Error(`Tipo de archivo no permitido: ${child}`);
        files.push(child);
      }
    }
  };
  for (const name of ordered(readdirSync(directory))) {
    if (['src', 'public', 'scripts', 'docs', 'api'].includes(name)) visit(name);
    else if (allowedFile(name)) {
      if (!plainEntry(directory, name).info.isFile()) throw new Error(`Se esperaba un archivo público: ${name}`);
      files.push(name);
    }
  }
  const seen = new Set();
  for (const path of files) {
    const folded = path.toLowerCase();
    if (seen.has(folded)) throw new Error(`Dos archivos se confundirían al extraer en Windows: ${path}`);
    seen.add(folded);
  }
  return ordered(files);
}

function readPublicFile(root, path, maximum) {
  const { absolute, info } = plainEntry(root, path);
  if (!info.isFile() || info.size > maximum) throw new Error(`Archivo de entrega inválido o demasiado grande: ${path}`);
  const descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino || opened.nlink > 1) throw new Error(`El archivo cambió durante la lectura: ${path}`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (bytes.length > maximum || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || bytes.length !== after.size) throw new Error(`El archivo cambió durante la lectura: ${path}`);
    return bytes;
  } finally { closeSync(descriptor); }
}

function outputDirectory(path) {
  const absolute = resolve(path);
  for (let candidate = absolute; ; candidate = dirname(candidate)) {
    if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new Error('La carpeta de salida no puede usar enlaces.');
    if (dirname(candidate) === candidate) break;
  }
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  if (!lstatSync(absolute).isDirectory()) throw new Error('La salida debe ser una carpeta.');
  return absolute;
}

/** Builds a source-only delivery. Docker base images and npm packages are not included. */
export function createPortableRelease({ root = projectRoot, output, now = new Date(), maxFileBytes = 64 * 1024 * 1024, maxTotalBytes = 256 * 1024 * 1024 } = {}) {
  const directory = sourceRoot(root), files = collectReleaseFiles(directory), source = Object.create(null);
  for (const path of requiredFiles) if (!files.includes(path)) throw new Error(`La entrega todavía está incompleta; falta ${path}.`);
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1) throw new Error('Límites de entrega inválidos.');
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('La fecha de entrega no es válida.');
  let totalBytes = 0;
  for (const path of files) {
    const bytes = readPublicFile(directory, path, maxFileBytes);
    totalBytes += bytes.length;
    if (totalBytes > maxTotalBytes) throw new Error('La fuente supera el límite de la entrega portable.');
    source[path] = bytes;
  }
  const packageInfo = JSON.parse(source['package.json'].toString('utf8'));
  if (typeof packageInfo.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageInfo.version) || packageInfo.version.length > 80) throw new Error('La versión del paquete no es portable.');
  const manifest = files.map(path => `${digest(source[path])}  ${path}\n`).join('');
  const metadata = {
    format: 'puramatricula-docker-source/v1', application: 'puramatricula', version: packageInfo.version,
    createdAt: date.toISOString(), kind: 'source', imageIncluded: false, installationRequiresNetwork: true,
    testsIncluded: false, fullCheckoutIncluded: false, deliveryScope: 'operational-source-only',
    requirements: ['Docker Engine y Docker Compose', 'Red para descargar la imagen base y ejecutar npm ci durante docker build'],
    manifest: 'MANIFEST.sha256', manifestSha256: digest(manifest), sourceFileCount: files.length, sourceBytes: totalBytes,
    manifestCoverage: 'Archivos de fuente. MANIFEST.sha256 y RELEASE.json están cubiertos por el SHA-256 externo del ZIP.'
  };
  const archiveFiles = { ...source, 'MANIFEST.sha256': Buffer.from(manifest), 'RELEASE.json': Buffer.from(JSON.stringify(metadata, null, 2) + '\n') };
  const zipDate = new Date(Math.min(Date.UTC(2099, 11, 31, 23, 59, 58), Math.max(Date.UTC(1980, 0, 1), date.getTime())));
  const zipEntries = Object.create(null);
  for (const path of ordered(Object.keys(archiveFiles))) zipEntries[path] = [archiveFiles[path], { os: 3, attrs: (path.endsWith('.sh') ? 0o755 : 0o644) << 16, mtime: zipDate }];
  const archive = zipSync(zipEntries, { level: 6 }), archiveSha256 = digest(archive);
  const destination = outputDirectory(output ?? join(directory, 'output', 'release'));
  const stamp = date.toISOString().replace(/[-:.]/g, '');
  const zipPath = join(destination, `puramatricula-${packageInfo.version}-docker-source-${stamp}.zip`), checksumPath = zipPath + '.sha256';
  if (existsSync(zipPath) || existsSync(checksumPath)) throw new Error('La entrega ya existe; no se sobrescribe ningún archivo.');
  writeFileSync(zipPath, archive, { flag: 'wx', mode: 0o600 });
  writeFileSync(checksumPath, `${archiveSha256}  ${basename(zipPath)}\n`, { flag: 'wx', mode: 0o600 });
  return { zipPath, checksumPath, archiveSha256, manifestSha256: metadata.manifestSha256, sourceFileCount: files.length, sourceBytes: totalBytes, archiveBytes: archive.length, metadata };
}

function main(args) {
  let output;
  if (args.includes('--help')) {
    console.log('Uso: node scripts/docker-package.mjs [--output CARPETA]\nEntrega únicamente fuentes públicas. Docker build requiere red para la imagen base y npm ci.');
    return;
  }
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== '--output' || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Use solamente --output CARPETA. El origen alternativo se admite únicamente mediante la API para pruebas.');
    output = args[++index];
  }
  const result = createPortableRelease({ output });
  console.log(`Entrega de fuentes creada: ${result.zipPath}\nSHA-256: ${result.archiveSha256}\nVerificación: ${result.checksumPath}\nNo incluye una imagen Docker: la primera compilación requiere acceso a la red.`);
}

if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`No se pudo preparar la entrega: ${error.message}`); process.exitCode = 1; }
}
