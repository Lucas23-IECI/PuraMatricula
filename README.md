# PuraMatricula · Domingo Santa María

Aplicación independiente de matrícula con ejecución local y despliegue Vercel/Supabase para pruebas. No utiliza la base, credenciales, API ni servidor de atrasos. Los archivos de referencia y los datos operacionales no pertenecen a Git. Ver [alcance](docs/ALCANCE.md), [mapa de campos](docs/FICHA-Y-NORMATIVA.md), [evidencia](docs/VERIFICACION.md) y [guía local/cloud](docs/CLOUD.md).

El destino operativo es el **servidor del Colegio Domingo Santa María**, inicialmente como aplicación independiente. La integración dentro del sistema escolar es una opción posterior; [guía del servidor](docs/SERVIDOR-COLEGIO.md).

## Primer día en el colegio

Sin HTTPS institucional, ejecute Matrícula en Docker **solo en el PC servidor** y abra `http://matricula.localhost:4319/` en su navegador. Si el nombre no abre, use `http://127.0.0.1:4319/`. La [guía de Docker](docs/DOCKER-COLEGIO.md#primer-día-sin-certificado-modo-local) explica el arranque offline y el acceso directo de escritorio. El volumen nace sin estudiantes, cursos ni cuentas predefinidas: el asistente pide crear el primer usuario administrador y su clave temporal. Al ingresar, esa persona cambia la clave y puede crear las cuentas individuales y asignar sus permisos.

Antes de incorporar estudiantes, cree un respaldo inicial. En **Organización → Importación** seleccione el año escolar, previsualice el Excel, compruebe el destino de cada hoja y resuelva filas observadas. Solo la confirmación escribe en el volumen. Las altas entran como borradores; las coincidencias y los cambios a fichas existentes se revisan por separado. No se importan usuarios ni contraseñas desde el Excel.

Este repositorio contiene fuentes; el paquete offline se distribuye por separado. La entrega fue verificada localmente con Docker y datos sintéticos en un volumen descartable. No incluye el padrón, una base de demostración, respaldos ni las credenciales de la instalación escolar.

## Alumnos y archivos con formatos distintos

Además del alta y edición individual, la importación reconoce el Excel Usuarios del ERP, padrones administrativos y libros con una hoja por curso. La previsualización permite incluir o excluir hojas, indicar la fila de encabezados, ajustar columnas y elegir cursos existentes. No inventa año ni sección. Hasta 500 estudiantes y 2 MB por lote; bloquea identidades inválidas, duplicados y formatos ambiguos antes de confirmar.

El teléfono, correo, domicilio y comuna de un padrón por curso se conservan como datos de origen. Quien importa decide si corresponden al estudiante o al apoderado. Las columnas de acceso no crean cuentas. Las fichas incluyen comuna y procedencia de la importación. La revisión distingue alumnos nuevos, coincidencias, cambios de contacto y casos que necesitan revisión manual. Cada actualización debe seleccionarse antes de confirmar; una celda vacía nunca borra un dato existente. Cambios de identidad, apoderado o curso no se aplican automáticamente.

En una instalación anterior, Administración puede usar **Preparar campos de importación**, en Plantillas o desde el aviso de Importación. Crea una versión nueva sin alterar las fichas existentes. Una persona con edición y gestión de matrícula puede actualizar la plantilla de una ficha desde su expediente; las revisiones anteriores se conservan. Cambiar RUN/tipo requiere gestión o administración en el curso. Nuevos formatos se prueban con fixtures ficticios, sin subir archivos reales a Git o al piloto público.

## Años escolares y servidor del colegio

El contexto anual de expedientes, pendientes y estadísticas incluye años antiguos y futuros (1950–2100). Las planillas Excel detectan su año antes de guardar; una matrícula de la misma persona en otro año requiere revisión y selección explícita, conservando sus otros expedientes. Ver [Años escolares](docs/ANIOS-ESCOLARES.md).

La entrega Docker es independiente de la app de asistencia, con persistencia propia y sin unir cuentas ni bases. Instalación, comprobaciones, respaldo y recuperación: [Docker en el colegio](docs/DOCKER-COLEGIO.md). La revisión de seguridad y los límites comprobados están en [SEGURIDAD.md](docs/SEGURIDAD.md). El paquete local no equivale a una instalación comprobada en el servidor escolar.

## Vercel y Supabase

La aplicación incluye un handler `api/index.mjs`, una migración PostgreSQL versionada y un adaptador asíncrono compatible con SQLite/PostgreSQL. El piloto histórico se publicó en [puramatricula.vercel.app](https://puramatricula.vercel.app) con Supabase privado; [docs/CLOUD.md](docs/CLOUD.md) conserva su configuración y evidencia anterior. En esta ampliación no se accedió al piloto ni se actualizó su código o su base. Las cuentas de nube usan contraseñas privadas; las cuentas demo descritas abajo son exclusivamente locales.

## Demostración local

Requiere Node 24.15 o superior. Desde esta carpeta:

```powershell
npm ci --ignore-scripts
npm run demo
```

Abrir http://127.0.0.1:4318. Cuenta sintética `demo-secretaria`, clave de prueba `Demo-matricula-2026!`. Otras cuentas sintéticas: `demo-profesor` (solo 1° Básico A 2026), `demo-lector` (consulta 2° Básico A 2026), `demo-sin-cursos` (sin expedientes autorizados), misma clave exclusivamente de demostración. La demo está restringida a localhost y marcada con datos sintéticos. Nunca cargar datos reales en ella. Conserva sus cambios en `.local/demo/`; no se borra automáticamente. Para una prueba nueva use otra carpeta de pruebas, sin eliminar una base existente.

Las pruebas de importación generan sus planillas en memoria. Para recorrerlas en navegador, ejecute `node tests/helpers/school-fixtures.mjs`; los `.xlsx` se crean en `.local/xlsx-fixtures/`, fuera de Git.

Las dependencias de aplicación son `pdfkit`, `pg`, `read-excel-file` y `fflate`, fijadas con lockfile. UI HTML/CSS/JavaScript servida por el mismo proceso, sin CDN, fuentes remotas ni servicios externos. SQLite se abre mediante Node; no instalar PostgreSQL ni otros servicios para la demo. El estilo adapta el sistema visual institucional y su escudo local: azul, tipografía Segoe UI, tablas sobrias y modos claro/oscuro. El escudo es una copia del recurso institucional existente; no establece dependencia de ejecución con atrasos.

## Recorridos

Secretaría puede crear una ficha, guardarla como borrador y volver a abrirla; cada cambio incrementa una revisión. Se gestiona la matrícula anual por separado de los datos administrativos. Confirmar no exige antecedentes de apoyo ni decisiones afirmativas de religión/imágenes/salidas. Cambiar curso y retirar requieren motivo y fecha. Renovar crea otro borrador anual y reinicia constancias/autorizaciones/documentos sin cerrar el actual. Preparar cursos del año siguiente no mueve estudiantes.

Un estudiante retirado puede reingresar con fecha, motivo y curso autorizado: en el mismo año se reabre su expediente y se conservan retiro y reingreso en el historial; en un año posterior se crea un borrador nuevo, manteniendo el expediente retirado. El botón `?` explica el recorrido de cada pantalla y permite avanzar con teclado.

Al recargar se recuperan sección, año, expediente y pestaña, con un skeleton propio desde el primer arranque. La dirección se mantiene limpia; el contexto validado se conserva por pestaña sin nombres, búsquedas ni contenido de fichas. Atrás y Adelante recorren las secciones, los años y las pestañas visitadas; una salida cuyo guardado falla conserva la ficha. La sesión y los permisos se comprueban antes de mostrar datos; una caída de red permite reintentar sin perder la ubicación. Los cambios sin guardar y los archivos seleccionados no se recuperan al cerrar o recargar.

La interfaz usa una cabecera agrupada con el año, ayuda, tema y sesión; `Salir` queda visible en rojo y los formularios usan verbos concretos como Crear cuenta, Registrar retiro o Guardar cambios. La navegación se separa en Matrícula y Administración, la tipografía base es legible para trabajo de oficina y la distribución se mantiene entre 320 y 1440 px. Auditoría muestra una acción comprensible y deja el código técnico plegado para quien necesite revisarlo.

El escudo y el nombre del liceo abren la portada **Inicio de matrícula**, que es independiente de Expedientes. Presenta cuatro paneles fotográficos verticales: Estudiantes, Seguimiento, Organización y Administración. Cada panel completo abre su área, con un índice de accesos directos sobre una sola superficie; el inicio no muestra estadísticas ni listas de alumnos. Dentro de los módulos el menú lateral puede ampliarse, compactarse u ocultarse. No copia la portada de la aplicación de atrasos. La lista de Expedientes se precarga en memoria durante la sesión y, al volver a ella, muestra el último resultado inmediatamente mientras actualiza en segundo plano. No se guardan fichas en localStorage.

Los campos de ficha muestran ejemplos de formato para nombres, RUN/IPE, teléfonos, domicilios, comunas y correos. Hay correo del estudiante, apoderado, suplente y emergencia; los campos usan autocompletado del navegador solo cuando corresponde y los antecedentes sensibles mantienen `autocomplete=off`. El botón `?` deja visible el bloque que está explicando y oscurece el resto; lo sigue al desplazarse y elimina la máscara al cerrar.

Las cuentas tienen permisos independientes y alcance por curso, sin cargos fijos. Para un profesor jefe asigne lectura/edición y sus cursos; no conceda antecedentes reservados por defecto. Las asignaciones de un año no se heredan al siguiente. Permiso de administración permite configurar cuentas; auditoría, datos reservados y respaldo tienen permisos separados. Quien administra permisos puede concederlos y por ello debe ser persona de confianza.

Administración puede crear, editar, desactivar y restablecer cuentas, usando perfiles sugeridos ajustables. Las claves nuevas o restablecidas son temporales y deben cambiarse antes de usar los módulos. Cada persona puede cambiar su propia contraseña con la actual; hacerlo invalida sus sesiones. No se permite dejar la instalación sin una cuenta administradora activa.

Las preguntas se amplían creando otra versión de la plantilla; las fichas anteriores mantienen su estructura. El editor permite añadir, editar, reordenar y ocultar preguntas adicionales. La publicación exige previsualizar los cambios; también permite descargar una muestra PDF. Ocultar conserva respuestas y revisiones históricas. Los campos base y de procedencia permanecen protegidos, y una pregunta reservada no puede perder su reserva. El borrador de plantilla vive en la pestaña hasta publicarlo; no hay preguntas institucionales nuevas aprobadas automáticamente.

La edición detecta conflictos de revisión: una versión vieja recibe 409 y no sobreescribe. La interfaz conserva el formulario para comparar, descargar sus cambios o recargar la última versión. Ante un fallo de red mantiene el texto en la pestaña y permite reintentar; no guarda datos sensibles en localStorage. Cambios no enviados se perderían si se fuerza el cierre de la pestaña; aparece aviso del navegador. Borradores ya guardados se recuperan desde servidor.

La ficha se descarga en PDF o Word (`.docx`) por estudiante/año/revisión; la constancia de matrícula se emite para la revisión vigente de una matrícula confirmada. Se admiten copia firmada y adjuntos PDF/PNG/JPEG hasta 5 MB localmente y 2 MB en Vercel. Las descargas requieren permiso y quedan auditadas. Una ficha sin acceso reservado se marca limitada. Word es una copia editable; se verificó su estructura, pero falta revisar su presentación en Office. La carga no verifica autenticidad de la firma ni el contenido semántico del documento. Salud/apoyo/judicial no se consideran requisitos de matrícula. **No solicitar antecedentes socioeconómicos durante matrícula SAE**: su eventual uso pertenece a un proceso de apoyo separado y validado.

**Estadísticas** presenta matrícula vigente, borradores, retirados, pendientes y movimientos por curso. Cada estudiante cuenta una vez por año; los movimientos se muestran aparte. **Pendientes** permite abrir los expedientes que necesitan revisión. Ambas vistas respetan los cursos autorizados y filtran por año, curso, estado y búsqueda. Las cifras reflejan el estado actual al generar el informe, sin reconstruir cortes históricos. Se descargan informes PDF/Excel y nóminas Excel/CSV, incluida una hoja por curso. Las nóminas usan columnas administrativas fijas, conservan identificadores como texto y omiten antecedentes reservados; el límite es de 10.000 expedientes por reporte.

Importación Excel `.xlsx` de la hoja `Usuarios` del ERP original, con previsualización, cursos propuestos y confirmación; hasta 500 estudiantes por lote. También admite importación JSON con duplicados por identidad/origen, validación y aplicación transaccional. Formato: lista de `{ year, courseId, origin, originId, data: { names, surname, identifierType, identifier } }`. Los identificadores de curso son los de esta app, visibles en meta API con autenticación. La revisión de Excel permite seleccionar actualizaciones de contacto compatibles; las coincidencias sin cambios se omiten y las contradicciones necesitan revisión manual. La vía JSON conserva su contrato de altas nuevas. No hay fusión por nombre, renovación automática ni carga real en esta ampliación; las identidades provisionales deben regularizarse manualmente.

## Base independiente vacía

Solo después de validar el uso de esa base, configure `MATRICULA_DATA` con una carpeta exclusiva y nueva. `node scripts/init.mjs` crea la primera cuenta administradora con `MATRICULA_INITIAL_USER` y `MATRICULA_INITIAL_PASSWORD` (mínimo 12 caracteres), sin imprimir la contraseña y con cambio obligatorio al ingresar. Quite esa variable tras inicializar. `npm start` usa por defecto `.local/manual/` y escucha únicamente en localhost. No crea cuentas conocidas de demo en una base normal. No coloque esa carpeta en OneDrive ni comparta el archivo SQLite en red.

Variables propias: `MATRICULA_DATA`, `MATRICULA_PORT` (4318), `MATRICULA_HOST` (127.0.0.1), `MATRICULA_ORIGIN`, `MATRICULA_TLS_KEY`, `MATRICULA_TLS_CERT`. La app no lee `.env` de atrasos. Acceso LAN exige HTTPS y origen explícito; la demo no puede exponerse por LAN. Instalación escolar, certificados, firewall, servidor, copias externas y datos reales requieren autorización y aceptación separadas. Todavía no se han configurado ni probado en el colegio.

El arranque escolar usa `npm run school:check` y `npm run school:start`: comprueba rutas absolutas, base local inicializada, origen HTTPS y certificado vigente correspondiente al origen, y rechaza una base demo o una conexión cloud accidental. La [guía escolar](docs/SERVIDOR-COLEGIO.md) detalla la prueba manual desde dos computadores, sin instalar servicios de Windows.

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
