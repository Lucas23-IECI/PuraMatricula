# Evidencia de la primera versión local

Fecha: 5 de octubre de 2026. Todas las identidades, antecedentes y documentos de prueba son sintéticos. No se leyó una base del colegio ni se importó un padrón real. La lectura documental de la ficha de referencia no valida su presentación en Word.

## Resultado y alcance

`npm run check` pasa. `npm test` pasa con **17 resultados, 0 fallos**: el contenedor de aceptación y 16 escenarios, usando servidor HTTP real, sesiones, SQLite y archivos en disco. No se sustituyeron API ni persistencia por mocks. Última ejecución: `.local/api-test-sUc0s4/`, puerto asignado por el sistema y servidor cerrado al terminar.

Los tres recorridos reproducibles de Chrome completaron **21 grupos de comprobaciones** contra la demo real en `127.0.0.1:4318`. Se usaron contextos separados para Secretaría y profesor. Se inspeccionaron capturas de escritorio claro/oscuro, celular y conflicto, además de los PDF renderizados.

Esto prueba una primera versión local. No demuestra instalación escolar, acceso desde varios computadores físicos, capacidad de 400 usuarios concurrentes, aceptación de Dirección ni carga de 400 fichas reales.

## Matriz de aceptación

| Recorrido | Evidencia comprobada | Límite |
| --- | --- | --- |
| 400 expedientes, búsqueda y paginación | API y navegador: 400 fichas iniciales, páginas de 25, sin repetición; nombre e identificador normalizado | Datos ficticios; no benchmark de usuarios concurrentes |
| Alta y duplicados | API y navegador: ficha nueva, borrador; API rechaza RUN inválido e identidad repetida; importación UI bloquea filas repetidas | Identidades provisionales necesitan revisión humana; nombres iguales no se fusionan |
| Guardado y reapertura | API, nueva conexión SQLite y navegador: cambios persistentes, revisión anterior recuperable y autoguardado | Cambios aún no enviados viven en la pestaña |
| Permisos de cursos y datos reservados | API deniega acceso fuera del curso y edición de campo reservado; navegador de profesor no presenta salud ni auditoría | Asignación real y responsables requieren validación institucional |
| Edición del profesor | API conserva antecedentes reservados al guardar campos visibles | Permisos configurados por cuenta y año |
| Concurrencia | API: dos escrituras con la misma revisión producen 200/409; dos cuentas en navegador muestran conflicto y conservan el texto del profesor | Sin fusión automática; la persona debe revisar la última versión |
| Fallo de red | Chrome pasa temporalmente a offline: guardar falla, formulario conserva texto y guarda al recuperar conexión | No hay edición offline persistente ni sincronización de varias pestañas |
| Matrícula, cambio de curso y retiro | API y navegador: confirmación, motivo/fecha, historial y expediente retirado protegido | Reingreso tras retiro necesita definir su procedimiento |
| Renovación y preparación anual | API y navegador: nuevo borrador 2027 mantiene 2026, reinicia autorizaciones/documentos; cursos 2028 no mueven fichas | Autorizaciones y alcance por curso no se heredan automáticamente |
| Autorizaciones | API: religión, imágenes y salidas independientes, con fecha/responsable/versión; fechas inválidas rechazadas | Textos propuestos necesitan validación; firma digital registrada no acredita autenticidad |
| Plantillas | API y navegador: nueva pregunta en otra versión; fichas anteriores mantienen plantilla; base original protegida | Editor actual agrega preguntas; no permite retirar o redefinir campos base |
| Cuentas | Navegador: alta individual de lectura sin cursos; validación HTML del identificador; API aplica sus permisos | Administración puede conceder acceso reservado; debe asignarse a responsables confiables |
| PDF y copia firmada | API devuelve PDF real; navegador descarga y adjunta copia sintética; descarga API conserva bytes; controles de permiso y revisión | Se validó formato y almacenamiento, no autenticidad ni malware en documentos |
| Importación controlada | API y navegador: previsualización, procedencia, duplicados, confirmación; API comprueba ticket y transacción | Solo JSON con cursos propios; no conexión con atrasos, SAE o SIGE |
| CSV de un curso | API y navegador: descarga autorizada, sin antecedentes reservados; denegación de curso ajeno y escape de fórmulas | Exportación administrativa acotada, no expediente reservado completo |
| Auditoría | API y navegador: usuario/acción/fecha/campos, lectura y descargas; cadena HMAC verificada; triggers rechazan cambios/borrado | No inmutabilidad absoluta frente a quien controla servidor y clave |
| Respaldo y restauración | API: 403 fichas y 1 adjunto restaurados; copia descargada en navegador: 410 expedientes anuales y 4 adjuntos restaurados en otra carpeta; sesiones invalidadas; destino ocupado rechazado | Las cifras mayores provienen de altas/renovaciones sintéticas de QA; falta plan de custodia y prueba escolar |
| Protección de solicitudes | API: sesión, CSRF, origen ajeno, rutas privadas y archivo inexistente; campos/adjuntos cifrados | No equivale a una auditoría de seguridad exhaustiva |
| Diseño y tamaño de pantalla | Navegador: 1440×960; 320, 375, 414 y 768 px sin desborde horizontal de la página, temas claro/oscuro | Tabla y navegación permiten desplazamiento interno; falta evaluación asistiva con usuarios |

## Diseño institucional

Se revisaron `frontend/src/styles/institutional.css`, `frontend/src/styles/design-system.css` y `frontend/src/context/ThemeContext.jsx`. Se adaptaron azul institucional, superficies, tipografía Segoe UI, botones y tablas sobrias, y sus modos claro/oscuro. El escudo proviene de `frontend/public/institucional/escudo-ldsm-concepcion.jpg` y tiene una copia propia en esta aplicación. Los archivos originales no se modificaron.

Las capturas locales son `.local/browser-desktop-light.png`, `.local/browser-desktop-dark.png`, `.local/browser-mobile-320.png`, `375`, `414`, `768` y `.local/browser-conflict.png`. La revisión detectó un desborde a 320 px, corregido y vuelto a comprobar en los cuatro tamaños. Se corrigió también el patrón HTML de cuentas para los navegadores actuales: la última pasada de importación/exportación terminó sin errores ni advertencias en consola. Las desconexiones y el conflicto provocados deliberadamente sí generan respuestas de error esperadas.

## Verificación de PDF

Se renderizó con Poppler y se inspeccionaron las **8 páginas** de `.local/api-test-sUc0s4/ficha-2026.pdf`: ficha general y hojas independientes de religión, imágenes y salidas. Todos los encabezados y pies corresponden al estudiante sintético seleccionado, 2026 y 2° Básico A. Se comprobaron mediante extracción con pypdf además de inspección visual.

El expediente de estrés tiene **11 páginas**, incluye retiro y un antecedente cercano al límite del formulario. La extracción conserva sus **68 repeticiones** y el marcador final, y todas las páginas tienen numeración. Se inspeccionó el flujo largo renderizado; no se observó texto recortado. Se corrigieron páginas adicionales producidas por el pie, etiquetas ambiguas de parentesco y un título de sección que quedaba solo al final de página. Poppler avisó de dos fuentes de sustitución; los acentos y símbolos usados en estos especímenes resultaron legibles. No se validaron todos los alfabetos posibles.

El PDF es una propuesta digital basada en los campos del documento, con años dinámicos. No se afirma equivalencia visual exacta con el Word ni aprobación de sus cláusulas.

## Repetir las pruebas

Desde `matricula/`:

```powershell
npm run check
npm test
```

En una terminal mantenga `npm run demo`. Los recorridos siguientes **modifican exclusivamente la demo sintética**, conservan sus cambios y pueden crear nuevas cuentas, versiones y fichas ficticias. Con Chrome disponible, se utilizó `@playwright/cli` 0.1.22:

```powershell
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=matricula-local open http://127.0.0.1:4318 --browser chrome
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=matricula-local run-code --filename tests/browser/workflows.js
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=matricula-local run-code --filename tests/browser/administration.js
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=matricula-local run-code --filename tests/browser/import-export.js
```

Restauración de la última copia sintética descargada, siempre con un destino nuevo:

```powershell
$env:MATRICULA_BACKUP_PASSWORD = 'Clave-sintetica-browser-2026!'
node scripts/restore.mjs .local/browser-backup-final.dsmbak .local/restauracion-qa-nueva
Remove-Item Env:MATRICULA_BACKUP_PASSWORD
```

Las bases, claves, archivos originales, PDF y capturas de QA están excluidos de Git mediante `.gitignore`. La comprobación final del repositorio solo mostró la nueva carpeta `matricula/`; no hubo cambios rastreados en atrasos ni commits.

## Pendientes antes del uso escolar

- Validar campos, finalidad, textos de autorizaciones, acceso y conservación con Dirección. La revisión de fuentes oficiales y el mapa son una base de trabajo; no acreditan cumplimiento integral. Separar cualquier proceso de apoyo social de la matrícula SAE.
- Autorizar y probar servidor escolar, HTTPS, certificados, firewall, permisos de directorio Windows y acceso desde computadores físicos del colegio. Actualmente la demo solo escucha en localhost.
- Definir cuentas reales, capacitación, responsables y respaldo externo cifrado; hacer una restauración supervisada y documentar su recuperación.
- Confirmar la fuente y autorizar carga real. No se ha estimado cuánto demorará Secretaría en incorporar los antecedentes de papel ni se garantiza terminar en una semana.
- Concretar cambios sustantivos de la ficha cuando existan; cualquier integración futura debe definir quién gobierna identidad y curso, evitando dos fuentes contradictorias.

## Ampliación independiente para nube (5 de octubre de 2026)

Pruebas con SQLite y PostgreSQL PGlite, API HTTP real, 400 fichas base y dos cargas de 400 filas ERP. Se verifican búsqueda/paginación, permisos, conflictos 200/409, plantillas anuales, PDF, adjuntos privados, auditoría y respaldo DSMBACK2 restaurado a SQLite. Un fixture XLSX sintético comprueba el contrato de read-excel-file 9.

En el proyecto Supabase PuraMatricula se importaron 400 filas ficticias en unos 6,5 segundos usando inserciones por lotes. Se comprobó reapertura, conflicto de revisión, PDF, adjunto cifrado, respaldo/restauración y cadena de auditoría. Las 12 tablas tienen RLS; anon/authenticated no pueden usar el esquema matricula. La conexión valida la CA oficial de Supabase y utiliza un rol runtime limitado.

QA de navegador por terminal en modo headless: carga de XLSX real, confirmación explícita del curso faltante, importación de tres estudiantes, bloqueo de duplicados y vista móvil 390 px sin desborde horizontal. Capturas y respaldos permanecen ignorados en .local. No se cargaron estudiantes reales. Vercel debe verificarse por separado tras configurar sus variables privadas.
