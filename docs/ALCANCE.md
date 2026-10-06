# Primera versión local de matrícula

Inicio: 5 de octubre de 2026. Checkout verificado `main`, `b327254`, limpio antes de comenzar. El alias del proyecto y el checkout canónico resuelven al mismo repositorio. Se revisaron las tareas del proyecto; no había otra tarea activa modificándolo.

## Decisiones

- Código y datos aislados en `matricula/`, sin dependencias de configuración ni bases de atrasos. Servidor único HTTP/HTTPS y SQLite en disco local del servidor, nunca una base SQLite en carpeta de red. Varios computadores utilizarán el navegador contra ese servidor cuando se autorice su instalación y se configure HTTPS.
- Año y curso pertenecen a cada expediente anual. Un estudiante puede tener matrícula en distintos años simultáneamente; preparar el siguiente no cierra el actual. Identidad interna estable y procedencia de importación explícita.
- El Word completo se leyó mediante extracción de todos sus párrafos y tablas OOXML. No se validó visualmente su presentación. Contiene ficha general, padres, apoderados, antecedentes, religión, imágenes, salidas, documentos y retiro. Años dinámicos.
- Lucas confirmó cambios tanto en valores como en preguntas. No definió preguntas nuevas y pidió continuar sin consultas. Se conserva la referencia y se admiten extensiones en nuevas versiones, sin inventar preguntas ni alterar fichas guardadas.
- La información social, médica, judicial, económica, indígena y religiosa se limita a usuarios con permiso reservado; no condiciona el alta ni la confirmación. Cada autorización se conserva por año, decisión, fecha, responsable y versión. La autorización anual de salidas no habilita una salida concreta.
- Primera fuente: esta aplicación gobierna la ficha y matrícula anual; atrasos continúa gobernando sus registros operacionales. No hay sincronización. Antes de integrar debe definirse un único responsable de identidad y curso operacional.
- No se confirmó padrón real ni acceso al servidor. Importación sintética comprobable; cualquier carga real requiere confirmar origen y autorización.

## Aceptación local

Altas, duplicados, borrador y reapertura, edición por curso, ocultación de datos reservados, renovación, traslado, retiro, preparación del año siguiente, versiones de ficha, auditoría de cambios/consultas/descargas, conflicto de edición, PDF, copia firmada, búsqueda/paginación con 400 fichas sintéticas, error de red sin pérdida del formulario, respaldo y restauración en otra carpeta. Evidencia se registra en `VERIFICACION.md`.

## Requisitos antes del uso escolar

Definir campos nuevos, base jurídica/finalidad por dato, conservación, responsables y permisos; validar ficha y consentimientos con Dirección; probar en red escolar con HTTPS y cuentas individuales; aprobar instalación, capacitación, respaldo externo cifrado y recuperación. No se garantiza plazo de una semana ni carga de las 400 fichas. La app no reemplaza SAE o SIGE.
