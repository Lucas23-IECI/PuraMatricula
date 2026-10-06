# PuraMatrícula: ejecución local y nube

Guía de ejecución independiente. El 5 de octubre se creó y comprobó el esquema privado en Supabase con 400 estudiantes ficticios, TLS verificado, conflicto 409, PDF, adjuntos cifrados y respaldo restaurado. Vercel ya tiene las variables privadas y el login publicado fue comprobado. La aceptación escolar sigue pendiente.

## Requisitos y modo local

Usa Node.js 24 y PowerShell:

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

`npm run demo` crea o reabre una base sintética en `.local/demo/` y sólo escucha en `127.0.0.1:4318`. Para una base vacía normal, define `MATRICULA_DATA` en una carpeta nueva, `MATRICULA_INITIAL_USER` y `MATRICULA_INITIAL_PASSWORD` (mínimo 12 caracteres) y ejecuta `node scripts/init.mjs`. No reutilices la carpeta de demo ni la pongas en OneDrive o en una carpeta compartida.

SQLite local usa una clave `storage.key` propia. La interfaz admite adjuntos de hasta 5 MiB; la cola asíncrona de solicitudes evita transacciones concurrentes sobre la misma base.

## Supabase/PostgreSQL

1. Crea un proyecto separado para la matrícula y conserva el proyecto de atrasos sin cambios.
2. Ejecuta explícitamente la migración versionada desde la terminal con Supabase CLI o el SQL del archivo [202610050001_matricula.sql](../supabase/migrations/202610050001_matricula.sql). La aplicación no ejecuta DDL al arrancar.
3. Usa una conexión PostgreSQL con TLS y permisos sólo sobre el esquema `matricula`. El proceso de Vercel es el único que debe conocer esta conexión; nunca la envíes al navegador.
4. Define las variables siguientes en el entorno privado de Vercel y en el proceso local de prueba contra PostgreSQL:

| Variable | Uso |
| --- | --- |
| `MATRICULA_DATABASE_URL` | URL `postgresql://` del pooler de Supabase, con TLS. |
| `MATRICULA_STORAGE_KEY` | Clave base64 de exactamente 32 bytes para AES-GCM. |
| `MATRICULA_ORIGIN` | Origen HTTPS permitido, por ejemplo `https://puramatricula.vercel.app`. |
| `MATRICULA_ALLOWED_HOSTS` | Hosts adicionales de preview, separados por coma, sólo si se prueban explícitamente. |
| `MATRICULA_DATABASE_CA` | CA base64 si el entorno exige una CA privada. |
| `MATRICULA_DATA_MODE` | `normal` para operación; `synthetic` sólo para una instancia de prueba. |

La conexión usa un rol runtime privado con permisos limitados al esquema; no requiere una clave Supabase service_role en el navegador. RLS queda habilitado y los roles `anon`, `authenticated` y `public` no reciben acceso. Las contraseñas de matrícula se guardan con `scrypt`; las fichas y blobs se cifran antes de persistirlos. Los adjuntos cloud tienen límite de 2 MiB y se guardan como blobs privados de PostgreSQL, no como archivos públicos.

Inicialización única, con una contraseña privada de al menos 16 caracteres:

```powershell
$env:MATRICULA_DATABASE_URL = 'postgresql://...'
$env:MATRICULA_STORAGE_KEY = '...'
$env:MATRICULA_INITIAL_USER = 'administracion'
$env:MATRICULA_INITIAL_PASSWORD = '...'
npm run cloud:init
Remove-Item Env:MATRICULA_INITIAL_PASSWORD
```

El arranque cloud se realiza mediante `api/index.mjs`; `vercel.json` incluye la función y las reescrituras `/api/*`. El handler no abre un puerto y acepta el store PostgreSQL inyectado. Configura `MATRICULA_ORIGIN` con el dominio de producción y agrega previews a `MATRICULA_ALLOWED_HOSTS` sólo mientras se prueban. La instancia de pruebas https://puramatricula.vercel.app está desplegada y conectada a Supabase.

## Carga del padrón

La importación Excel del padrón escolar usa `/api/import/school/preview` y `/api/import/school/commit`. Acepta la hoja `Usuarios`, conserva procedencia e identificador ERP, propone cursos no resueltos y exige una confirmación explícita antes de crearlos. La confirmación usa un ticket de previsualización y es atómica; el límite es 500 filas por lote. La importación JSON existente usa las rutas `/api/import/preview` y `/api/import/commit` con el mismo límite.

No hay fusión automática de identidades. Un RUT, IPE, documento extranjero o identificador ERP repetido queda como duplicado para revisión manual. Prueba primero con `MATRICULA_DATA_MODE=synthetic` y archivos sintéticos; no subas un padrón real a GitHub, Vercel, artefactos de CI ni a una demo.

## Respaldos y recuperación

El endpoint de respaldo cloud requiere permisos de respaldo, datos reservados y acceso a todos los cursos. Genera el formato autenticado `DSMBACK2`; por HTTP se rechaza una copia cloud mayor de 4 MiB para no exceder límites de función. Usa el CLI para respaldos grandes y detén el proceso que escribe la base antes de capturar una copia local.

La restauración se hace sólo en una carpeta SQLite nueva o vacía:

```powershell
$env:MATRICULA_BACKUP_PASSWORD = 'Clave-privada-de-prueba-2026!'
npm run restore -- .local\matricula.dsmbak .local\restauracion-nueva
Remove-Item Env:MATRICULA_BACKUP_PASSWORD
```

La restauración verifica integridad SQLite, auditoría, descifrado de fichas y huellas de adjuntos; invalida sesiones. No reemplaza una base existente ni migra datos reales automáticamente.

## Límites de esta verificación

Las pruebas locales reproducibles usan datos sintéticos y SQLite; también existe una suite PGlite para revisar el contrato PostgreSQL. Se comprobaron migración, rol limitado, certificado y persistencia del proyecto Supabase elegido. Se verificaron también variables privadas, login, permisos y persistencia en Vercel. Queda la aceptación presencial del colegio antes de operar con datos reales. Los secretos sólo pueden existir en el administrador de variables del servicio o en un archivo local ignorado por Git.

## Configuración de este proyecto desde terminal

Después de autorizar `npx --yes vercel@48.10.0 login`, se pueden configurar las cinco variables de producción y desplegar sin usar el navegador para manejar el panel:

```powershell
node --env-file=.local/cloud.env scripts/configure-vercel.mjs
```

El archivo `.local/cloud.env` es privado e ignorado por Git. El script pasa los valores por stdin y sólo imprime los nombres de las variables. La cuenta inicial y su contraseña se conservan en `.local/ACCESO-PRUEBAS.txt`; no se publican ni se usan cuentas conocidas de demo en Supabase.

## Verificación del sitio publicado

En https://puramatricula.vercel.app se comprobaron login 200 con cookie Secure, credenciales inválidas 401, acceso por curso y antecedentes reservados 403, conflictos 200/409, PDF, subida/descarga de copia firmada, Excel real con tres filas, rechazo de duplicados, respaldo DSMBACK2 y persistencia al cerrar y abrir sesión. La auditoría conservó su integridad. La base contiene 403 expedientes ficticios de pruebas; no se cargó un padrón real.

`.gitignore` y `.vercelignore` excluyen claves, archivos privados y bases locales. Las variables de producción se configuraron como sensibles mediante stdin. El límite de intentos de login usa la IP reenviada por Vercel en ese entorno y la IP del socket local fuera de él.
