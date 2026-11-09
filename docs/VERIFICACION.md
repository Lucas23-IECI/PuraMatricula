# Verificación de PuraMatricula

## Entrada local y escritorio · 9 de noviembre de 2026

El acceso local admite tanto la dirección numérica de loopback como el nombre fijo `matricula.localhost` en el mismo puerto. Otros nombres y solicitudes cruzadas siguen rechazados. El nombre no publica el servicio en la red del colegio ni modifica DNS o hosts.

El instalador crea un acceso directo con el escudo en el escritorio de la cuenta que lo ejecuta. La descarga del ingreso entrega un ZIP con el acceso `.url`; su destino y la ruta del icono provienen de la instalación, no de parámetros de la solicitud. Se comprobaron el archivo ICO en Windows, los scripts en Windows PowerShell 5.1, no sobrescribir otros enlaces, el formato ZIP y la conservación del usuario sin contraseña.

`Recordar mi usuario` es opcional, guarda solo el nombre durante 30 días sin extenderlo en cada ingreso, y admite eliminarlo al desmarcar. Las pruebas rechazan valores vencidos o malformados y toleran localStorage bloqueado. El cambio no altera la sesión de 8 horas.

Cierre de esta revisión: **319 pruebas aprobadas, sin fallos ni omisiones**, y `npm run build` aprobado. En Chromium por terminal se comprobaron ambos accesos locales, la descarga del ZIP y del escudo, primer ingreso y cambio obligatorio de clave, persistencia de la sesión al recargar, base sin estudiantes, recuerdo y vencimiento del usuario, y tamaños de 390 y 1440 px. No hubo errores JavaScript; las respuestas 401 de `/api/session` antes de ingresar o después de salir son las esperadas.

La prueba Docker local aislada incorporó 14 estudiantes sintéticos, edición, PDF, adjunto, respaldo cifrado, restauración y reinicio. Estas comprobaciones no sustituyen probar el instalador en el servidor físico del colegio. Sin certificado, este perfil solo admite el mismo PC; Docker Desktop debe estar iniciado después de reiniciar Windows.

El ZIP completo se extrajo en una carpeta nueva y el instalador se ejecutó realmente con Docker Desktop: verificó hashes, cargó la imagen, solicitó la cuenta en terminal, inicializó y comprobó el servicio. Ese mismo servicio pasó el recorrido de ingreso y escritorio en Chromium. Solo se cambiaron el puerto y los nombres del volumen/red para aislar QA. No se creó ningún acceso en el escritorio personal.

La exportación final usa el formato Docker sin attestations para Linux amd64. Una prueba aislada con Docker simulado y Windows PowerShell 5.1 confirma que el instalador admite el ID de manifiesto o el de configuración de la misma entrega y rechaza otro ID antes de extraerla. No se afirma haber ejecutado un segundo motor con el almacén clásico.

## Edición, filtros y entrega local · 9 de noviembre de 2026

- La ficha abre en consulta; se puede editar, cancelar, guardar solo los cambios y volver a consultar la revisión. El servidor conserva la procedencia de importación y restringe los movimientos de adjuntos del historial a quien puede verlos.
- Suite automatizada: 313 pruebas aprobadas. Chromium sin interfaz comprobó permisos, filtros combinados, edición y reapertura, previsualización de un Excel sintético y los módulos de trabajo en 1440 y 390 px.
- Comparación estructural, local y sin escribir en la base: el libro descargado tiene 14 hojas con columnas de identidad y nombres reconocibles. La carga y las conciliaciones se probaron con planillas sintéticas; el colegio debe revisar la asignación de cursos y el período antes de cargar el libro real.
- La imagen Docker de esta entrega se verificó en Linux amd64 con escritura de una ficha, cookie segura detrás de proxy explícito y respaldo/restauración V3 de ficha y adjunto. La red, el HTTPS institucional y el acceso desde un segundo PC se comprueban en el colegio.

## Estado actual: contexto anual, seguridad y entrega Docker · 8 de noviembre de 2026

Ampliación de vistas y filtros · 8 de noviembre de 2026

Expedientes, estadísticas, pendientes, importaciones, plantillas, cuentas, cursos, auditoría y las colecciones de cada ficha incorporan presentaciones alternativas según el trabajo: tabla, compacta, tarjetas, resumen, gráficos o cronología. Los filtros se aplican antes de contar y paginar; cambiar la presentación conserva el conjunto, los filtros y la página. Las preferencias de presentación se guardan por cuenta y sección, sin guardar búsquedas ni datos de estudiantes.

Se añadieron filtros por identificación, pendientes, contacto, origen, documentos visibles, fechas, estado, curso, persona, acción y módulo según la sección. Las exportaciones de nóminas e informes usan el conjunto completo filtrado y respetan los permisos. La suite local final quedó en **312/312 pruebas aprobadas, 0 fallos y 0 omisiones**; `npm run build` también pasó. La prueba de navegador `tests/browser/filters-views-smoke.js` recorrió Expedientes, Estadísticas, Plantillas e Importación con datos sintéticos y no produjo errores JavaScript.


Cierre local: **254/254 pruebas aprobadas, 0 fallos y 0 omisiones** con `npm test` en serie; `npm run build` aprobado. Log: `.local/final-verified-suite.log`. La ejecución paralela inicial agotó memoria de Windows; no se usa como evidencia válida. El comando de pruebas quedó limitado a un archivo a la vez para evitar ese consumo.

El historial final pasó ocho grupos en navegador con 26 acciones nativas de Atrás/Adelante, recarga, pestañas de ficha y un fallo de guardado interceptado que conservó el formulario. El índice final de áreas pasó siete grupos y 60 combinaciones de tamaño/menú, además de teclado, ayuda, tema y permisos. La aceptación visual del usuario sigue siendo independiente de estas comprobaciones funcionales.

El inicio actual tiene cuatro paneles fotográficos. Las áreas interiores usan un índice de tareas sobre una sola superficie, con accesos completos y respuesta de color al pasar el mouse o enfocar; no repiten los paneles ni presentan una guía por pasos. Las secciones posteriores conservan evidencias de iteraciones anteriores; las descripciones antiguas de alumnos o cifras dentro del Inicio ya no representan su diseño vigente.

Se comprobaron nueve grupos de navegador para años 2019/2026/2030: una persona con tres fichas anuales, confirmación explícita, estadísticas separadas, selector actualizado tras importar, año vacío y recarga, respuesta tardía descartada, Excel con períodos mezclados rechazado y duplicados omitidos. La comparación antes/después mantuvo los 407 expedientes sintéticos de 2026 y añadió uno en 2019 y otro en 2030. Se inspeccionaron las capturas de vista previa y móvil. Guion: `tests/browser/school-years.js`.

Otros seis grupos de navegador comprobaron la URL limpia, pestañas de ficha, recarga/skeleton, contexto por pestaña y limpieza al cambiar de cuenta. Guion: `tests/browser/clean-route.js`. No hubo errores JavaScript; las únicas escrituras fueron autenticación y datos sintéticos de la demo local.

El informe [SEGURIDAD.md](SEGURIDAD.md) identifica los riesgos encontrados, las correcciones y sus límites. La configuración Docker y su entrega se describen en [DOCKER-COLEGIO.md](DOCKER-COLEGIO.md). La primera consulta al motor Docker agotó el tiempo; posteriormente respondió sin que lo reiniciáramos. Se probó un contenedor real aislado: TLS, cuenta individual, PDF, adjunto, recreación con persistencia y respaldo/restauración V3 en otro volumen. La evidencia está en .local/docker-qa-runtime-mw89yczz/evidence.json. Esto todavía no verifica el servidor físico del colegio ni otro PC cliente.

## Índice de tareas y altura estable · 8 de noviembre de 2026

La captura del usuario reveló un defecto que las comprobaciones anteriores de navegación y desborde horizontal no detectaban: aumentar la cantidad crecía la cuadrícula y estiraba la tarjeta ilustrada hasta varios miles de píxeles. Se retiró esa composición. Inicio es ahora un índice de cuatro áreas con acciones directas; al buscar o elegir Borradores, el mismo escenario se transforma en un padrón con salida explícita «Volver al menú». No hay alumnos visibles en reposo ni una columna de presentación junto al padrón.

Los ancestros de la zona de trabajo tienen un presupuesto de altura y pistas que permiten encoger. Solo `#home-results` desplaza sus alumnos; formulario, filtros y paginador están fuera de esa región. Cambiar Lista/Fichas o cantidad conserva la página cuando corresponde, y las fichas de la última página no se estiran para rellenar el área. Volver al menú cancela la búsqueda pendiente y descarta respuestas antiguas. La primera búsqueda se difiere una sola vez, sin dos consultas idénticas. Se conserva la precarga autorizada de Expedientes en segundo plano.

`tests/browser/home-geometry.js` pasó **112 estados de resultados** (dos selecciones, siete tamaños, dos vistas y cuatro cantidades) y **14 estados del índice**. Al cambiar 4→24, la variación máxima del documento y del escenario fue **0 px**. También pasó pantalla corta 375×480, scroll interno con PageDown, recorrido de foco y última página de un alumno mediante respuesta sintética. La altura máxima observada del escenario fue 636,92 px. Se detectó y corrigió el recorte del año escolar en móvil. Las capturas de 24 alumnos están en `output/playwright/home-index-results-24-{desktop,mobile}.png`; las capturas finales del índice, móvil, oscuro y espera están en `home-index-final-*.png`.

`home-index.js` pasó cinco grupos: composición nueva, alta/búsqueda sin duplicación y respuesta tardía, paginación/módulo, nueve destinos y Enter, ayuda/espera/móvil. `home-shell.js` pasó siete grupos adicionales del índice y resultados; `home-permissions.js` verificó consulta por cursos, sesión administrativa simulada sin lectura, error/reintento y movimiento reducido. El foco permanece en la búsqueda y regresa a ella al cerrar el padrón, siguiendo los [criterios de interacción por teclado de W3C](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).

Verificación final: **160 pruebas aprobadas, 0 fallos y 0 omisiones**, además de `npm run check` y `git diff --check`. Logs: `.local/home-index-suite-final.log`, `home-index-browser.log`, `home-index-workflows.log` y `home-index-permissions.log`. Todo se comprobó localmente con datos sintéticos; no se hicieron commits, pushes ni despliegues.

## Paginación e inicio con fichas · 8 de noviembre de 2026

Verificación final: **157 pruebas aprobadas, 0 fallos y 0 omisiones** con `node --test --test-concurrency=1 tests/*.test.mjs`. También pasan `npm run check` y `git diff --check`.

Se unificaron los controles para la bandeja del Inicio, Expedientes, cuentas, cursos, documentos, movimientos, revisiones, años del estudiante, versiones y preguntas adicionales de plantillas, resumen por curso, alumnos de reportes/Pendientes, Auditoría e importaciones. Las colecciones muestran rango, total, página actual, números y navegación; ofrecen tamaño por página cuando corresponde. El Inicio abre con cuatro fichas y permite alternar Lista/Fichas conservando página y búsqueda. El diseño usa separadores de archivador y movimiento reducido.

Las búsquedas y filtros regresan a la primera página. Una página fuera de rango se limita a la última válida, también en el servidor. Las exportaciones conservan la selección completa. En Auditoría, un `snapshot` fija el corte mientras se navega, de modo que los eventos de consulta nuevos no desplazan ni duplican filas entre páginas.

En Importación, los cambios marcados se guardan mediante índices originales en un conjunto de sesión. Pasar de página en alumnos, advertencias, observaciones o cursos no pierde selecciones ni la aprobación para crear cursos. Una nueva revisión o persona reinicia ese estado. También se limpian cachés y selecciones al cerrar sesión o reingresar tras cambiar cuenta/permisos; las respuestas anteriores no vuelven a rellenarlas.

`tests/browser/pagination.js` pasó seis grupos en la demo local: paginación real del Inicio, tamaños y vistas, filtro/vacío; Expedientes; documentos y colecciones históricas largas con respuesta sintética; cuentas/cursos/plantillas; reportes/Pendientes; Auditoría. Se inspeccionaron capturas en escritorio, móvil y tema oscuro, y anchos de 320 a 3200 px sin desborde. `tests/browser/import-pagination.js` pasó cuatro grupos con 55 filas, 35 advertencias, 23 cursos y una segunda revisión con 35 observaciones: **0 solicitudes de confirmación**, sin cambios en la base. Sus respuestas están marcadas y construidas como sintéticas.

Capturas: `output/playwright/pagination-{cards,list,dark,mobile}-final.png` y `import-pagination-review.png`. Logs: `.local/pagination-browser.log` y `.local/pagination-suite-final.log`. La ayuda y el skeleton corresponden a la nueva vista de cuatro fichas y sus controles. Se adaptaron los recorridos anteriores a los paginadores comunes. Todo sigue local; no se hicieron commits, pushes, despliegues ni operaciones en bases reales.

## Inicio por actividades · 8 de noviembre de 2026

Verificación final: **123 pruebas aprobadas, 0 fallos, 0 omisiones**, con `node --test --test-concurrency=1 tests/*.test.mjs`. Log: `.local/launcher-tests-final.log`. `npm run check` y `git diff --check` también pasan. La prueba final del navegador está en `.local/launcher-browser-final.log`.

La portada cambia su panel de trabajo al elegir Estudiantes, Seguimiento, Organización o Administración. Las actividades y herramientas se filtran por los permisos de la cuenta. Inicio no tiene navegación lateral; esta aparece al entrar a un módulo o una ficha. La marca del liceo vuelve a Inicio.

Estudiantes y Seguimiento muestran una bandeja de hasta cinco fichas autorizadas. La búsqueda se actualiza mientras se escribe, los filtros cambian la bandeja sin abandonar Inicio y cada resultado abre su ficha. Enter abre Expedientes con la misma búsqueda y estado. Una respuesta atrasada no sustituye una búsqueda posterior. Los resultados se reutilizan en memoria y se actualizan en segundo plano; crear, editar, importar o cerrar sesión invalida la caché.

`tests/browser/home-shell.js` pasó siete grupos: ingreso y ficha directa; alta/búsqueda/filtros; respuestas retenidas; teclado y selección repetida; ocho destinos con navegación contextual; nueve anchos de 320 a 5120 px y ambos temas; ayuda y recarga sin errores de JavaScript o CSP. Se comprobaron adicionalmente las cuatro actividades en cinco anchos cada una. Los anchos amplios verifican que la portada aprovecha más del 90% de la ventana, sin el límite fijo anterior. Esto verifica redistribución del espacio; no se atribuye a la prueba headless un cambio real del zoom del navegador.

`home-permissions.js` comprobó una cuenta de lectura real de la demo (50 expedientes autorizados), una sesión administrativa simulada sin permiso de alumnos, ocultación del aviso de pruebas según metadatos, fallo/reintento de la bandeja y movimiento reducido. La sesión administrativa simulada valida comportamiento visual, no equivale a crear o verificar otra cuenta en producción. `home-redesign.js`, `home-mobile.js`, `home-cache.js` y `brand-home.js` también pasaron sus recorridos del nuevo Inicio.

El skeleton comparte las regiones y la geometría de la portada: título, actividades, panel y resumen. La ayuda resalta cada región y se adapta a las actividades autorizadas. Capturas: `output/playwright/launcher-{desktop,mobile,dark,loading}.png` y `launcher-{students,followup,organization,admin}.png`. Todos los recorridos usan datos sintéticos locales. No se hicieron commits, pushes, despliegues, migraciones remotas ni conexiones con la aplicación de atrasos.

La interacción se estudió a partir de [Carbon: tiles y sus estados](https://www.carbondesignsystem.com/building-blocks/core/components/tile/guidelines), sus [criterios de accesibilidad](https://www.carbondesignsystem.com/building-blocks/core/components/tile/accessibility) y [GOV.UK: navegación de servicios](https://design-system.service.gov.uk/patterns/navigate-a-service/). Las ilustraciones y componentes se implementaron en el código de la aplicación.

## Ampliación local del 7 de noviembre de 2026

Resultado de esa revisión: **106 pruebas aprobadas, 0 fallos, 0 omisiones**, ejecutadas con `node --test --test-concurrency=2 --test-reporter=tap tests/*.test.mjs`. Su log está en `.local/refresh-qa-rU5YJL/tests.tap`; la segunda revisión anterior se conserva en `.local/revision-total-fy76C3/tests.tap`. `npm run check` también pasó. Son pruebas locales con SQLite y PostgreSQL/PGlite; no se accedió a Supabase ni a Vercel y no se hicieron commit, push, despliegue o migraciones remotas. Todos los alumnos y archivos de QA son ficticios.

### Recarga y skeleton según la ubicación

La recarga mostraba un formulario de acceso fijo y reiniciaba la vista a Expedientes. Ahora `loading.js`, cargado antes de la aplicación, dibuja el skeleton de la sección del fragmento de URL. La pantalla restaura módulo, año, expediente y pestaña después de validar la sesión, los permisos y el acceso al registro. Existen formas para los nueve módulos, acceso, cambio de contraseña y ficha/documentos/historial. Se comparte el mismo generador con las esperas internas; el primer frame respeta tema oscuro y movimiento reducido.

El fragmento admite solo vista, año, UUID de expediente y pestaña. No guarda nombres, RUN, búsquedas, contraseñas ni contenido de ficha en la URL o en almacenamiento del navegador. Los formularios sin enviar, archivos seleccionados y borradores de plantilla no se restauran. Una sesión caducada limpia la ruta; una caída temporal de metadatos muestra Reintentar y conserva la ubicación en lugar de presentar un cierre de sesión falso.

`tests/loading-route.test.mjs` añadió ocho pruebas. `tests/browser/refresh-skeletons.js` pasó **20 escenarios**: se retienen `/app.js`, `/api/session` y `/api/meta` por separado para inspeccionar la estructura antes del código principal, durante la autenticación y antes de recuperar los metadatos. Cubre los nueve módulos, las tres pestañas, año distinto, acceso, contraseña temporal, cuenta sin módulos, permisos restringidos, expediente ajeno, sesión caducada, ruta inválida, reintento, tema oscuro y 320 px. Capturas y log: `.local/refresh-qa-rU5YJL/`. También volvió a pasar `loading-controls.js` con sus diez grupos de espera, errores y controles de contraseña. Esto sigue siendo una corrección local; el piloto Vercel no se actualizó.

### Revisión visual y de uso del 7 de noviembre

La cabecera se reorganizó en contexto de pantalla, año escolar, Ayuda, tema y sesión. `Salir` es una única acción roja visible en escritorio y móvil; Cancelar y cerrar formularios siguen la misma convención. La navegación se divide en Matrícula y Administración, y el nombre de la cuenta queda visible también en móvil. Se aumentaron textos de trabajo, etiquetas y controles, manteniendo objetivos táctiles de al menos 44 px y las tablas/pestañas con desplazamiento interno cuando corresponde.

`tests/browser/ui-ux.js` pasó ocho grupos: nueve módulos con contexto y navegación activa, 320/375/768/1024/1440 px sin desborde, contraste de salida **6,53:1 claro y 9,44:1 oscuro**, foco inicial de formularios, ayuda sin perder datos, CSV sin opciones Excel activas, preguntas opcionales condicionadas al tipo, revisión histórica sin guardar, auditoría legible y salida que limpia la sesión. Las capturas están en `.local/uiux-qa-YL0PlE/`. Las comprobaciones anteriores de ayuda, recarga, permisos, skeletons, cuentas, importación y documentos siguen pasando en la misma demo sintética.

La revisión adicional comprobó que los pasos del `?` resaltan filtros, indicadores y movimientos con `.help-highlight`, desplazan el elemento al centro disponible y limpian el resaltado al cerrar. `tests/browser/help-examples.js` pasó los 36 contextos existentes de ayuda; `email-field.js` comprobó ejemplos y autocompletado para correo del estudiante/apoderado y el correo de emergencia en una ficha nueva. El campo de emergencia se agrega a la siguiente versión de plantilla; las fichas históricas conservan su versión hasta actualizarse explícitamente.

`tests/browser/home-cache.js` comprobó que tocar el escudo/nombre abre la portada propia, que sus acciones llevan a módulos reales y que volver a Expedientes reutiliza la lista precargada sin mantener el skeleton visible. La precarga y caché viven solo en memoria de la sesión, se invalidan al editar o cerrar sesión y respetan permisos. La portada reutiliza estadísticas autorizadas sin inventar métricas. La segunda iteración visual redujo la portada a un centro de decisiones con tres acciones grandes, tres estados compactos y herramientas secundarias; en escritorio usa dos columnas y en móvil una columna sin desborde.

### Segunda revisión solicitada por el usuario

La primera pasada dejó fallos que la cifra de pruebas anterior no detectaba. Se reprodujeron y corrigieron:

- El `?` global quedaba bloqueado al abrir un formulario modal. Ahora cada formulario tiene su propio botón, contenido específico y ayuda superpuesta que conserva los valores, el formulario y el foco.
- Una cuenta sin módulos recibía instrucciones de expedientes. Una ficha retirada ofrecía guardar y la ayuda de documentos ofrecía adjuntar sin todas las condiciones necesarias. Ahora se distinguen esos estados, conflictos, contraseña temporal y permisos combinados.
- Estadísticas comparaba una propiedad de propietario que nunca guardaba: pulsar una cifra o curso borraba los filtros y no abría el detalle. Ahora conserva selección y página en el contexto correcto y reinicia al cambiar de persona, año o módulo.
- Guardar no actualizaba la lista de revisiones ni los pendientes del expediente en pantalla. El resultado de edición incluye ambos; Historial y Más descargas presentan inmediatamente las revisiones intermedias.
- Cancelar/Escape durante un envío podía dejar que una respuesta tardía alterase otra pantalla o cerrase otro formulario. Se bloquea el cierre mientras se envía y se comprueba la identidad del formulario antes de mostrar el resultado.
- Volver a Expedientes desde una ficha abierta en Estadísticas/Pendientes dejaba el menú anterior marcado. Se actualizan contenido y navegación juntos.
- Durante los 250 ms de espera de búsqueda seguían disponibles los resultados anteriores. Ahora se retiran al escribir y se invalidan las respuestas previas inmediatamente. `tests/browser/search-consistency.js` comprueba ese intervalo y la identidad de la ficha abierta.

`tests/ui-state.test.mjs` añade seis regresiones con los scripts reales. `tests/browser/help-coverage.js` pasó **36 escenarios** de ayuda y navegación, recorriendo todos los pasos, Anterior/Siguiente/Listo, cierre con ×, Enter, Escape y recuperación de foco. Incluye los nueve módulos, las tres pestañas de ficha, todos los formularios actuales, retirada/reingreso, conflicto, contraseña temporal, cuenta sin módulos, pendientes al guardar y envío retenido. `help-permissions.js` contrastó los controles y la ayuda de lectura, profesor y consulta documental sin edición. Se inspeccionaron capturas de ayuda normal y sobre formulario a 320 px, en claro y oscuro. Sus logs y capturas están en `.local/revision-total-fy76C3/`.

También pasaron nuevamente los ocho recorridos `workflows`, `administration`, `import-export`, `loading-controls`, `flexible-enrollment`, `operations`, `accounts` y `template-import-review`: **47 grupos de comprobaciones** de navegador, sin contar la revisión específica de ayuda. Se descargaron otra vez PDF de ficha/constancia/informe y Word, y se restauró la nueva copia cifrada en una carpeta separada: **425 expedientes ficticios y 1 adjunto**. La demo habitual de `127.0.0.1:4318` se inició con su base sintética existente y se comprobó allí el botón de los nueve módulos; no se borró esa base.

Tras corregir la espera de búsqueda, volvieron a pasar `workflows`, `loading-controls` y `help-coverage`. El recorrido de altas ahora elige su curso explícitamente: la importación agrega otros cursos válidos y no se debe asumir el primer elemento del selector. En `confirmados/` se comprobó además, con extracción independiente, que el PDF de ficha (8 páginas), la constancia y el Word contienen la identificación ficticia seleccionada `DEMO-002`. Se inspeccionaron las nueve páginas de la ficha ampliada de QA, el informe y las constancias renderizadas; la revisión visual del Word en Office sigue pendiente.

### Cambios y comprobaciones actuales

| Área | Verificado | Alcance pendiente |
| --- | --- | --- |
| Ayuda contextual | Botón `?` en acceso, nueve módulos y formularios; contenido por estado/permisos, pasos, teclado y foco; prueba móvil a 320 px | Capacitación y evaluación con el personal |
| Cuentas | Alta, perfiles sugeridos editables, cursos, edición, desactivación, cambio obligatorio de clave temporal, cambio propio y revocación de sesiones; protección de última administración activa | Crear y aceptar cuentas reales en la instalación escolar |
| Estadísticas y pendientes | Filtros por año, curso, estado, búsqueda y pendientes; una ficha por estudiante/año; movimientos separados, detalle y paginación; alcance por permisos | Las cifras muestran el estado actual, sin cortes históricos ni analítica socioeconómica |
| PDF, Word y nóminas | Descargas reales desde navegador y HTTP; PDF de ficha/revisión y constancia, Word editable, estadísticas PDF/Excel y nómina Excel/CSV; identificadores como texto y protección de fórmulas | Excel exporta columnas administrativas fijas; Word aún necesita revisión visual en Office |
| Historial y reingreso | Retiro y reingreso del mismo año; borrador para un año posterior, sin copiar autorizaciones ni adjuntos; historial anterior preservado; permisos en cursos de origen/destino | Aceptar el procedimiento institucional de reingreso |
| Plantillas | Borrador, alta/edición/orden/ocultación de extras; vista previa y PDF de muestra; publicación explícita con ticket ligado a persona, versión y contenido; conflicto al cambiar la base | Campos base protegidos; el borrador no publicado se pierde al cerrar la pestaña |
| Importación selectiva | Casos nuevos, coincidentes, con cambios o revisión manual; selección explícita; celdas vacías no borran; identidad/curso no cambian automáticamente; ticket y conflicto de revisión; transacción atómica | Cada formato real nuevo necesita mapearse y revisarse antes de una carga autorizada |
| Arranque escolar | Configuración con SQLite independiente, HTTPS, validación de certificado y rechazo de demo/conexión cloud; certificado sintético temporal sin instalación | No se configuró un servidor real, firewall, servicio de Windows ni acceso desde PCs físicos |
| Respaldo | Copia cifrada descargada desde la interfaz y restaurada en carpeta nueva: **425 fichas ficticias y 1 adjunto**; comprobación de integridad por el restaurador | Falta custodia externa y restauración supervisada en el colegio |

Las regresiones de API incluyen permisos sobre la revisión histórica y el curso actual, exclusión de antecedentes reservados, plantillas ocultas, fechas de reingreso y concurrencia. Se corrigió durante QA la vista previa PDF de una plantilla: faltaba un identificador de muestra. Su respuesta HTTP, publicación y descarga quedan cubiertas por `tests/operations-http.test.mjs`.

### Navegador y documentos

Los recorridos `tests/browser/operations.js`, `accounts.js` y `template-import-review.js` pasaron contra un servidor HTTP local y una base demo separada, usando Chrome **sin ventana visible**. Cubren ayuda, filtros, descargas, pendientes a 390 px, cuentas en contexto separado, contraseña temporal/propia, retiro/reingreso y plantilla/importación selectiva. `final-review.js` completó las capturas, descarga de respaldo y cierre de sesión. Los recorridos modifican la demo ficticia y no se deben ejecutar sobre una instalación real.

Se inspeccionaron visualmente las pantallas de estadísticas, ayuda, cuentas y plantillas en 1440×960. Las capturas y el respaldo están en `.local/qa-ampliacion-qX6vCv/`. Se renderizaron con Poppler el informe PDF y la constancia descargados; sus páginas se inspeccionaron sin texto recortado ni solapamientos. Se comprobó estructura y contenido de XLSX/DOCX con lectores independientes. **No se verificó la paginación visual del DOCX**: el renderizador no pudo ejecutarse por ausencia de LibreOffice; no se instaló software ni se controló Office.

La restauración comprobada en esta pasada se repite con una copia sintética y un destino nuevo:

```powershell
$env:MATRICULA_BACKUP_PASSWORD = 'Clave-respaldo-ficticio-2026!'
node scripts/restore.mjs .local/qa-ampliacion-qX6vCv/operaciones-respaldo.dsmbak .local/otra-restauracion-nueva
Remove-Item Env:MATRICULA_BACKUP_PASSWORD
```

### Límites y siguiente aceptación

La aplicación continúa independiente del sistema de atrasos. Las pruebas locales no demuestran integración, despliegue actualizado, carga real, concurrencia de cientos de usuarios ni aceptación institucional. Los pasos siguientes en un servidor escolar son los de [SERVIDOR-COLEGIO.md](SERVIDOR-COLEGIO.md): red/certificados, dos computadores, permisos, persistencia y recuperación. Antes de incorporar datos reales deben aceptarse ficha, accesos y responsables.

## Evidencia histórica de la primera versión local

El resto del documento conserva pruebas de versiones anteriores. Las referencias a nube, cantidades antiguas y limitaciones ya resueltas describen aquellas pasadas; el resultado vigente de este checkout es el de la sección anterior.

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

QA de navegador por terminal en modo headless: carga de XLSX real, confirmación explícita del curso faltante, importación de tres estudiantes, bloqueo de duplicados y vista móvil 390 px sin desborde horizontal. Capturas y respaldos permanecen ignorados en .local. No se cargaron estudiantes reales. Vercel se verificó después de configurar sus variables privadas: login, permisos por curso, campos/adjuntos reservados, conflicto200/409, Excel, PDF, respaldo y persistencia tras volver a entrar. La base cloud contiene 403 expedientes ficticios. Las 42 pruebas automatizadas locales pasan.

## Contraseñas y espera en pantalla

`tests/browser/loading-controls.js` comprueba el ojo con mouse y teclado en acceso, cuentas y respaldo; los skeletons de recarga, expedientes, paginación, ficha, cuentas, auditoría e importación; y los indicadores de acceso, guardado y PDF. Retiene respuestas HTTP para comprobar la espera, simula fallos para verificar el reintento y evita que respuestas anteriores sustituyan la pantalla actual. Verifica 320/390 px, colores del tema oscuro y movimiento reducido. Solo admite la demo local y usa datos ficticios; las capturas quedan en `.local/`.

```powershell
npx --yes --package @playwright/cli@0.1.22 playwright-cli -s=matricula-local run-code --filename tests/browser/loading-controls.js
```

## Importación flexible y evolución de fichas (3 de noviembre de 2026)

Se verificó alta manual, edición, reapertura, comuna y apoderado; lectura de un XLSX sintético de catorce hojas; mapeo de encabezados alternativos; curso existente o creación explícita; titularidad separada de contacto y domicilio; fila/hoja de origen y bloqueo de reimportación. La fila de encabezados puede indicarse explícitamente. Los formatos desconocidos requieren mapear o excluir sus hojas y las mezclas ambiguas no permiten confirmar.

Los tests HTTP prueban preparación explícita e idempotente de los campos de importación y actualización de ficha con conflicto409. SQLite y PostgreSQL PGlite verifican importación, edición y evolución de plantilla, preservación de revisiones y de datos reservados. RUN/tipo no pueden modificarse con permiso de edición básico. La creación de cursos rechaza nombres equivalentes.

`tests/browser/flexible-enrollment.js` usa exclusivamente una demo local sintética nueva y los dos fixtures XLSX ficticios del repositorio. Comprueba el recorrido completo de alta, importación de14alumnos, ajustes de columnas, guardado, actualización de ficha anterior, duplicados y vista móvil. Se inspeccionaron capturas en claro y oscuro,390px y320px. La suite automatizada contiene 67 pruebas. Esta evidencia no acredita instalación en el servidor del colegio ni autoriza carga de datos reales.

## Áreas de trabajo, navegación y ayuda visual (8 de noviembre de 2026)

Verificación exclusivamente local con la demo sintética: 160 pruebas automatizadas, comprobación de sintaxis y revisión de diferencias aprobadas. Los cuatro paneles completos abren Estudiantes, Seguimiento, Organización o Administración; cada área conserva sus tareas y accesos autorizados. La navegación lateral admite 240/72/0 px, conserva filtros al cambiar de tamaño y restaura la preferencia al recargar. En móvil funciona como panel superpuesto con Escape, cierre exterior y devolución del foco.

Recorridos actuales de navegador:

- `tests/browser/areas-sidebar.js`: panel completo, cuatro áreas, búsqueda, navegación, preferencias y primer frame de los skeletons.
- `tests/browser/areas-permissions.js`: lector limitado a 50 expedientes, áreas administrativas sin consultas de alumnos, restauración de rutas, permisos y reintento sin perder filtros. No escribe datos.
- `tests/browser/help-spotlight.js`: máscara con hueco real, 48 pasos en escritorio y 38 en móvil; el objetivo conserva sus píxeles originales y el exterior se atenúa. Incluye scroll, redimensionamiento, teclado, foco y formularios.
- `tests/browser/home-transition.js`: regreso progresivo al inicio, cancelación de una transición anterior, protección del guardado y movimiento reducido.

Expedientes se verificó con 25/50/100 filas, filtros, desplazamiento conservado al compactar u ocultar la navegación y apertura de la ficha completa. El número de filas no aumenta la altura del documento. En pantallas bajas, el documento crece únicamente lo necesario para los controles y un panel de tabla de altura acotada. Se revisaron 320×740, 375×812, 375×480, 768×480, 1024×600, 1600×480 y 1600×900. Las capturas quedan en `output/playwright/` y los logs locales en `.local/`.

Esta revisión no incluyó publicación, migraciones remotas ni información de estudiantes reales.
