# Revisión de seguridad y preparación del servidor escolar

La revisión local del 8 de noviembre de 2026 corrigió un bloqueo de disponibilidad por cuerpos HTTP incompletos y reforzó la configuración del proxy HTTPS. Se verificaron sesiones, permisos y solicitudes con datos sintéticos. Esto aporta evidencia del código; la confianza del certificado, el proxy, los permisos del volumen, las copias y la instalación real deben comprobarse en el servidor escolar antes de introducir alumnos reales.

## Hallazgos y correcciones

| ID | Prioridad | Evidencia y resultado |
| --- | --- | --- |
| SEC-01 | Alta, corregido | Antes, `store.withRequest` envolvía también la lectura de red. Un POST anónimo a `/api/login` con JSON incompleto retenía la cola SQLite e impedía responder otra petición independiente. [server.mjs](../src/server.mjs#L55) ahora lee y valida el cuerpo antes de entrar a la cola. La prueba falló antes del cambio y pasó después. |
| SEC-02 | Media, corregido | El mismo límite de 8 MiB se aplicaba al acceso. [server.mjs](../src/server.mjs#L20) limita el acceso a 16 KiB y las demás cargas JSON a 8 MiB; verifica tanto `Content-Length` como los bytes efectivamente recibidos. Hay un máximo de ocho cuerpos en lectura simultánea. El noveno recibe 503 y `Retry-After`; el exceso de tamaño recibe 413, incluso con transferencia por fragmentos. |
| SEC-03 | Media, configuración reforzada | [server.mjs](../src/server.mjs#L32) rechaza `secure:true` sin un origen público HTTPS explícito y rechaza orígenes con ruta, credenciales, consulta o fragmento. El proxy es una decisión de arranque; las cabeceras reenviadas no activan TLS por sí solas. |
| SEC-04 | Baja, corregido | Al cerrar sesión, la cookie no conservaba el atributo `Secure` del modo HTTPS. [server.mjs](../src/server.mjs#L76) ahora lo incluye también al borrarla. La prueba comprueba además que el token revocado deja de funcionar. |
| SEC-05 | Media, corregido en revisión independiente | El preflight de XLSX limitaba celdas, pero admitía 600.000 etiquetas XML vacías sin coordenadas: un ZIP de 2.580 bytes expandía 2.400.085 bytes y podía obligar al lector a construir un DOM desproporcionado. El responsable de [xlsx-safety.mjs](../src/xlsx-safety.mjs#L67) añadió un presupuesto global de elementos. El mismo repro ahora falla de forma controlada con `XLSX_SIZE_LIMIT`; las 22 pruebas del guard pasan. No se provocó agotamiento de memoria para verificarlo. |
| SEC-06 | Alta, corregido en la descarga HTTP | El respaldo en JSON/base64 podía copiar una fuente grande varias veces en memoria. [backup.mjs](../src/backup.mjs#L7) ahora comprueba una fuente máxima de 32 MiB antes de crear el snapshot o leer archivos completos; la restauración del formato anterior admite hasta 64 MiB. [server.mjs](../src/server.mjs#L134) conserva el error tipado 413/`BACKUP_FILE_REQUIRED`, en vez de convertirlo en 400. Un archivo sintético disperso de 33 MiB demuestra el rechazo sin `VACUUM` ni snapshot y con el servidor todavía respondiendo. Las contraseñas inválidas mantienen 400; los fallos internos usan un mensaje genérico sin rutas privadas. |
| SEC-07 | Media, corregido en revisión independiente | La primera validación del formato de respaldo en archivos omitía el ancho de metadatos de usuarios y plantillas. Una plantilla sintética con `fields` de 8.388.625 bytes se publicaba pese a la cota de 8 MiB por valor. [backup-file.mjs](../src/backup-file.mjs#L116) ahora limita todas las columnas de texto conocidas, exige el esquema esperado y valida la forma del JSON antes de publicar. La nueva prueba de metadatos anchos, JSON y columnas desconocidas pasa. |

La lectura acotada antes de reservar recursos compartidos y los límites de HTTP reducen ataques de disponibilidad; siguen siendo necesarios los límites de conexión y tiempos del proxy. Véanse [OWASP: denegación de servicio](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html) y [Node 24: tiempos del servidor HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html#serverrequesttimeout).

## Controles comprobados

- El servidor autoriza `Host` y compara `Origin` cuando el cliente lo envía. No habilita CORS abierto.
- Cada operación autenticada de escritura exige el token CSRF asociado a la sesión. No basta conocer una URL, un UUID o enviar una cookie ajena al token.
- La cookie contiene un token aleatorio de 32 bytes, con `HttpOnly`, `SameSite=Strict`, alcance `/` y `Secure` en TLS/proxy seguro. La base guarda su SHA-256, no el token entregado al navegador. La duración absoluta es de ocho horas.
- Las claves se verifican mediante hashes con sal aleatoria. El acceso con clave temporal queda restringido al cambio inicial. Cambiar o restablecer una clave revoca sus sesiones; abrir una sesión vuelve a comprobar que la cuenta siga activa y sus credenciales no hayan cambiado.
- Los permisos y el alcance de cursos se aplican en servidor. La cuenta administradora activa final está protegida frente a cambios concurrentes.
- Las respuestas tienen `Cache-Control: no-store`, `nosniff`, política de referencia restrictiva, CSP y protección frente a incrustación. Las descargas se envían como adjuntos con nombres codificados.
- Los archivos estáticos se sirven desde una lista explícita. Las solicitudes de `.env`, código de servidor, base, clave de almacenamiento y respaldos reciben 404.
- Los mensajes de error HTTP son genéricos para fallos internos. El registro de consola utiliza nombre y código del error, sin imprimir contraseñas, cuerpos ni fichas completas. La auditoría conserva acciones y metadatos administrativos; las pruebas integradas comprueban la ausencia de secretos y documentos completos.

Estos controles corresponden a las recomendaciones de [OWASP sobre sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [protección CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). La revisión no certifica todas las rutas frente a cualquier ataque.

## URL limpia y navegación

La dirección limpia es una mejora de uso. No concede acceso ni oculta una ficha a alguien que ya tenga permisos. El estado de navegación guardado en `sessionStorage` se limita a valores validados de módulo, año, UUID del expediente y pestaña, junto con el identificador y la posición del historial de esa pestaña; se limpia al salir. No se deben guardar allí claves, cookies de sesión, tokens CSRF ni copias de las fichas.

La autenticación, la autorización por curso y el CSRF continúan en el servidor aunque se manipule ese estado del navegador. `sessionStorage` es almacenamiento del origen y de la pestaña, accesible a su JavaScript; no constituye un almacén de secretos. Referencia: [MDN: sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage).

## Planillas, adjuntos y contexto anual

La lectura escolar acepta contenido binario en memoria; una ruta o un texto no se interpreta como archivo local. [xlsx-safety.mjs](../src/xlsx-safety.mjs) comprueba estructura ZIP, coherencia de cabeceras, nombres, expansión real acotada y CRC antes de entregar los XML al lector. También limita la cuadrícula materializada, la profundidad y el total de elementos XML, y rechaza declaraciones DTD. Los presupuestos se aplican conjuntamente: un archivo puede alcanzar el límite de elementos antes del de celdas. Los valores vigentes están centralizados en `XLSX_LIMITS`; un archivo rechazado puede necesitar una copia limpia o división en archivos menores. Una firma y una extensión válidas no prueban que un documento sea inocuo. Referencia: [OWASP: carga de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

Los adjuntos siguen su control de tipo, tamaño, acceso al expediente y permiso de antecedentes reservados. El límite de cuerpo HTTP incluye la codificación JSON/base64 y puede ser distinto del tamaño final del archivo.

El año forma parte del alcance administrativo. Se valida en el rango 1950–2100; `meta.availableYears` ofrece los años autorizados y `meta.yearRange` publica el rango admitido. La importación usa columnas o encabezados escolares explícitos del archivo para establecer el año y bloquea fuentes contradictorias o inválidas. No debe adivinarlo desde el nombre del archivo, fechas de nacimiento o identificadores. La vista previa mantiene la advertencia cuando la fuente difiere del año elegido en pantalla y exige revisión antes de aplicar.

## Contrato del servidor escolar

Se mantienen dos formas explícitas de servir HTTPS:

1. TLS nativo: `createApp({tls, origin:'https://nombre-del-servidor:puerto', host})`, con certificado y clave propios del servidor. El arranque escolar valida configuración, vigencia y nombre del certificado.
2. Proxy escolar: el launcher de Docker exige `MATRICULA_BEHIND_TLS_PROXY=1` y un `MATRICULA_ORIGIN` HTTPS fijo. Invoca `createApp({secure:true, origin, host:'0.0.0.0'})` dentro del contenedor. El puerto HTTP publicado queda en `127.0.0.1:4319` del anfitrión para el proxy local. El proxy debe conservar el `Host` público y proporcionar un certificado confiable desde los equipos del colegio. Para un proxy en otra red Docker se debe declarar esa red explícitamente y mantener el puerto interno fuera de la LAN.

No se heredan usuarios, volúmenes, bases ni redes de la aplicación de asistencia. `X-Forwarded-Host` y `X-Forwarded-Proto` no se usan para autorizar un origen. El reconocimiento de IP reenviada que ya existe para el entorno Vercel es específico de ese entorno administrado y no habilita confianza equivalente en un proxy escolar.

El launcher prepara un contrato de ejecución. Que el daemon Docker no estuviera disponible durante una comprobación local significa que no existe evidencia de construcción ni de ejecución del contenedor en esa comprobación. La revisión HTTP se realizó contra procesos Node y bases temporales locales.

## Respaldos grandes del servidor

[backup-file.mjs](../src/backup-file.mjs) incorpora el formato local SQLite `DSMBACK3`. Los comandos `npm run backup -- "archivo.dsmbak"` y `npm run restore -- "archivo.dsmbak" "carpeta-nueva"` utilizan las rutas explícitas y la clave configurada en `MATRICULA_BACKUP_PASSWORD`; el respaldo necesita además `MATRICULA_DATA`. La clave debe mantenerse fuera del repositorio y de los argumentos de la línea de comandos.

El formato usa AES-256-GCM con clave derivada mediante scrypt y procesa bloques de 64 KiB. Admite una base SQLite de hasta 16 GiB, hasta 100.000 adjuntos de como máximo 16 MiB cifrados cada uno y un presupuesto total de 64 GiB. Cada valor de texto comprobado al restaurar tiene una cota de 8 MiB. Son límites de aceptación; el disco y los recursos disponibles pueden exigir valores menores. PostgreSQL mantiene su respaldo lógico anterior acotado; no se afirma que este nuevo formato lo convierta en streaming.

La restauración escribe primero un spool privado y autentica el archivo completo antes de materializar sus entradas. Después comprueba nombres permitidos, cantidades, esquema, JSON, integridad SQLite, auditoría y adjuntos en una carpeta privada de preparación. Solo publica esa carpeta mediante renombrado cuando todo es válido; el destino debe ser nuevo o vacío y las sesiones restauradas se eliminan. Hay que disponer de espacio para el spool y la copia restaurada, además del archivo de respaldo. El tratamiento por bloques limita memoria, pero sigue utilizando disco temporal.

Las pruebas incluyen una fuente superior al límite HTTP, varios adjuntos, clave incorrecta, truncado y alteración, frames con rutas y tamaños indebidos, auditoría o adjuntos corruptos, formatos anteriores y metadatos demasiado anchos. La suite independiente de archivos completó siete pruebas; esto no sustituye una restauración de ensayo en el servidor escolar.

## Riesgos residuales y comprobaciones antes de alumnos reales

| Prioridad | Pendiente |
| --- | --- |
| Alta, operación | Verificar HTTPS y confianza del certificado desde el equipo de Secretaría, aislamiento del puerto HTTP y recuperación de un respaldo en otra carpeta. Estas condiciones dependen del servidor real. |
| Alta, almacenamiento | Proteger la carpeta de datos, los WAL y los respaldos con permisos privados y un usuario de servicio limitado. AES-GCM protege campos y archivos sellados, pero SQLite conserva nombres e índices/metadatos legibles. La base completa no está cifrada. `storage.key` y la clave del respaldo necesitan custodia propia; `0600` no sustituye las ACL de Windows. |
| Media, disponibilidad | El límite de acceso se basa en la dirección observada. Detrás de un proxy escolar varias personas comparten ese contador. Hace falta comprobar este comportamiento en la instalación y aplicar límites por conexión/solicitud en el proxy; no se atribuye identidad a cabeceras arbitrarias del cliente. La limitación en memoria de SQLite se reinicia al reiniciar el proceso. |
| Media, acceso humano | Las ocho horas de sesión no son un cierre por inactividad. Mantener cuentas individuales, bloqueo de pantalla y salida al terminar. MFA y un vencimiento por inactividad requieren una decisión de producto y pruebas de conservación del formulario durante un vencimiento. |
| Media, documentos | Los límites y las firmas de archivos reducen riesgos de lectura y expansión. No existe evidencia de análisis antivirus de todos los documentos ni garantía frente a cualquier documento malicioso. Conservar descargas bajo permisos y aplicar el control institucional correspondiente. |
| Continua | Mantener Node y dependencias actualizados y repetir las pruebas después de cambios del parser, el proxy, sesiones, permisos o restauración. Un resultado de auditoría de dependencias es una instantánea. |

## Evidencia reproducible

```powershell
node --test tests/security-http.test.mjs
node --test tests/accounts.test.mjs tests/operations-http.test.mjs tests/integration.test.mjs
node --test tests/xlsx-safety.test.mjs
node --test tests/backup-file.test.mjs
node --check src/server.mjs
git diff --check
```

La ejecución conjunta de los cuatro archivos HTTP/cuentas/integración completó 27 pruebas. Tras añadir la comprobación de transferencia por fragmentos y la regresión de respaldo grande, `security-http.test.mjs` completó seis pruebas. La revisión independiente del guard XLSX completó 22 pruebas y 3.000 mutaciones de un ZIP sintético sin excepciones nativas no controladas. Son pruebas sintéticas locales; no se leyeron bases escolares reales, claves de producción ni archivos privados para esta revisión.

### Protección de edición y documentos

La ficha consulta por defecto y guarda solo campos modificados con la revisión vigente. El servidor rechaza cambios de procedencia desde la ficha y correos modificados con formato inválido. El historial de la ficha omite movimientos de adjuntos fuera de los permisos efectivos de la cuenta. Estos controles se probaron con una ficha ficticia, incluso con permisos de consulta, documentos y antecedentes reservados por separado.
