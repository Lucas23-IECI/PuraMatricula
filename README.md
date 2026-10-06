# PuraMatricula · Domingo Santa María

Aplicación independiente de matrícula con ejecución local y despliegue Vercel/Supabase para pruebas. No utiliza la base, credenciales, API ni servidor de atrasos. Los archivos de referencia y los datos operacionales no pertenecen a Git. Ver [alcance](docs/ALCANCE.md), [mapa de campos](docs/FICHA-Y-NORMATIVA.md), [evidencia](docs/VERIFICACION.md) y [guía local/cloud](docs/CLOUD.md).

## Vercel y Supabase

La aplicación ya incluye un handler `api/index.mjs`, una migración PostgreSQL versionada y un adaptador asíncrono compatible con SQLite/PostgreSQL. La configuración de Vercel y Supabase es una etapa separada: [docs/CLOUD.md](docs/CLOUD.md) enumera variables privadas, migración, límites de adjuntos, importación del padrón, respaldos y restauración. No se debe interpretar este repositorio como evidencia de un despliegue live; primero hay que configurar y probar una instancia sintética aislada.

## Demostración local

Requiere Node 24.15 o superior. Desde esta carpeta:

```powershell
npm ci --ignore-scripts
npm run demo
```

Abrir http://127.0.0.1:4318. Cuenta sintética `demo-secretaria`, clave de prueba `Demo-matricula-2026!`. Otras cuentas sintéticas: `demo-profesor` (solo 1° Básico A 2026), `demo-lector` (consulta 2° Básico A 2026), `demo-sin-cursos` (sin expedientes autorizados), misma clave exclusivamente de demostración. La demo está restringida a localhost y marcada con datos sintéticos. Nunca cargar datos reales en ella. Conserva sus cambios en `.local/demo/`; no se borra automáticamente. Para una prueba nueva use otra carpeta de pruebas, sin eliminar una base existente.

Las dependencias de aplicación son `pdfkit`, `pg` y `read-excel-file`, fijadas con lockfile. UI HTML/CSS/JavaScript servida por el mismo proceso, sin CDN, fuentes remotas ni servicios externos. SQLite se abre mediante Node; no instalar PostgreSQL ni otros servicios para la demo. El estilo adapta el sistema visual institucional y su escudo local: azul, tipografía Segoe UI, tablas sobrias y modos claro/oscuro. El escudo es una copia del recurso institucional existente; no establece dependencia de ejecución con atrasos.

## Recorridos

Secretaría puede crear una ficha, guardarla como borrador y volver a abrirla; cada cambio incrementa una revisión. Se gestiona la matrícula anual por separado de los datos administrativos. Confirmar no exige antecedentes de apoyo ni decisiones afirmativas de religión/imágenes/salidas. Cambiar curso y retirar requieren motivo y fecha. Renovar crea otro borrador anual y reinicia constancias/autorizaciones/documentos sin cerrar el actual. Preparar cursos del año siguiente no mueve estudiantes.

Las cuentas tienen permisos independientes y alcance por curso, sin cargos fijos. Para un profesor jefe asigne lectura/edición y sus cursos; no conceda antecedentes reservados por defecto. Las asignaciones de un año no se heredan al siguiente. Permiso de administración permite configurar cuentas; auditoría, datos reservados y respaldo tienen permisos separados. Quien administra permisos puede concederlos y por ello debe ser persona de confianza.

Las preguntas se amplían creando otra versión de la plantilla; las fichas anteriores mantienen su estructura. La primera versión del editor agrega preguntas y conserva los campos base del Word. Cambiar o quitar campos base exige una adaptación posterior de la plantilla validada; no hay preguntas nuevas institucionales inventadas o aprobadas.

La edición detecta conflictos de revisión: una versión vieja recibe 409 y no sobreescribe. La interfaz conserva el formulario para comparar, descargar sus cambios o recargar la última versión. Ante un fallo de red mantiene el texto en la pestaña y permite reintentar; no guarda datos sensibles en localStorage. Cambios no enviados se perderían si se fuerza el cierre de la pestaña; aparece aviso del navegador. Borradores ya guardados se recuperan desde servidor.

PDF por estudiante/año/revisión, copia firmada, adjuntos PDF/PNG/JPEG hasta 5 MB localmente y 2 MB en Vercel, descarga auditada y CSV de un curso con permiso. La vista PDF de profesores sin datos reservados se marca limitada. La carga no verifica autenticidad de la firma ni el contenido semántico del documento. Salud/apoyo/judicial no se consideran requisitos de matrícula. **No solicitar antecedentes socioeconómicos durante matrícula SAE**: su eventual uso pertenece a un proceso de apoyo separado y validado.

Importación Excel `.xlsx` de la hoja `Usuarios` del ERP original, con previsualización, cursos propuestos y confirmación; hasta 500 estudiantes por lote. También admite importación JSON con duplicados por identidad/origen, validación y aplicación transaccional. Formato: lista de `{ year, courseId, origin, originId, data: { names, surname, identifierType, identifier } }`. Los identificadores de curso son los de esta app, visibles en meta API con autenticación. Las identidades existentes se rechazan para que una persona revise la renovación; no hay fusión automática. No se ha leído ni importado ningún padrón real. Nombres iguales con documentos distintos no se fusionan automáticamente; las identidades provisionales deben regularizarse manualmente.

## Base independiente vacía

Solo después de validar el uso de esa base, configure `MATRICULA_DATA` con una carpeta exclusiva y nueva. `node scripts/init.mjs` crea la primera cuenta con `MATRICULA_INITIAL_USER` y `MATRICULA_INITIAL_PASSWORD` (mínimo 12 caracteres), sin imprimir la contraseña. Quite esa variable tras inicializar. `npm start` usa por defecto `.local/manual/` y escucha únicamente en localhost. No crea cuentas conocidas de demo en una base normal. No coloque esa carpeta en OneDrive ni comparta el archivo SQLite en red.

Variables propias: `MATRICULA_DATA`, `MATRICULA_PORT` (4318), `MATRICULA_HOST` (127.0.0.1), `MATRICULA_ORIGIN`, `MATRICULA_TLS_KEY`, `MATRICULA_TLS_CERT`. La app no lee `.env` de atrasos. Acceso LAN exige HTTPS y origen explícito; la demo no puede exponerse por LAN. Instalación escolar, certificados, firewall, servidor, copias externas y datos reales requieren autorización y aceptación separadas. Todavía no se han configurado ni probado en el colegio.

Fichas, revisiones y adjuntos cifrados con AES-256-GCM. La clave local `storage.key` debe protegerse junto con el directorio mediante permisos del sistema; en Windows el modo de archivo de Node no reemplaza una ACL. Nombres/indexación de búsqueda y metadatos administrativos permanecen en SQLite para consultar; no es cifrado completo de disco. La auditoría contiene acciones, campos cambiados y huellas HMAC, nunca contraseñas/tokens/contenido de documentos o valores reservados. Su cadena se verifica y los triggers impiden edición/borrado por la aplicación. Quien controla el proceso, la base y la clave en el sistema operativo puede alterar estos controles; definir acceso al servidor y custodia externa es requisito de operación, no evidencia de inmutabilidad absoluta.

## Respaldo y recuperación

La interfaz permite descarga cifrada completa solo con permisos de respaldo y datos reservados, más acceso a todos los cursos. Clave independiente de al menos 16 caracteres. La copia reúne snapshot consistente de SQLite, clave de almacenamiento y adjuntos dentro de una envoltura cifrada autenticada. Conserve la clave de respaldo fuera del archivo.

Para una prueba local con datos sintéticos:

```powershell
$env:MATRICULA_BACKUP_PASSWORD = 'Clave-sintetica-ejemplo-2026!'
npm run restore -- .local\copia.dsmbak .local\restauracion-nueva
Remove-Item Env:MATRICULA_BACKUP_PASSWORD
```

El destino debe ser nuevo/vacío y no se sobreescribe. Se verifica SQLite, cadena de auditoría, descifrado de fichas y huellas de adjuntos; las sesiones anteriores se invalidan. CLI de respaldo: definir `MATRICULA_DATA` y `MATRICULA_BACKUP_PASSWORD`, luego `npm run backup -- ruta\nueva.dsmbak`. Para CLI, detener el servidor de matrícula antes de respaldar, evitando que otro proceso cambie adjuntos mientras se capturan. No detener ni tocar atrasos. Restauración con una copia real requiere autorización, carpeta aislada y prueba antes de reemplazar el servicio. El plan de recuperación escolar y las copias programadas externas aún están pendientes.

## Verificación reproducible

```powershell
npm run check
npm test
node scripts/build-field-map.mjs
```

Las pruebas crean bases sintéticas en `.local/api-test-*`, servidor en puerto aleatorio y 400 fichas ficticias. Se preservan los artefactos para inspección; no se abren bases reales. El servidor de pruebas se cierra al terminar. Los recorridos de navegador y PDF renderizado se documentan aparte de las pruebas de API.
