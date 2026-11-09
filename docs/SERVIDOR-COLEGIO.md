# PuraMatricula en un servidor del colegio

> Para la entrega Docker del colegio, sigue [DOCKER-COLEGIO.md](DOCKER-COLEGIO.md): incluye instalación asistida, HTTPS independiente, diagnóstico y recuperación. Esta guía conserva la alternativa manual con Node en Windows.

Esta guía prepara una prueba **local e independiente** en un computador o servidor del Colegio Domingo Santa María. El proceso usa SQLite en el disco del servidor, HTTPS y cuentas individuales. No toca el sistema de atrasos, no conecta con Vercel/Supabase y no instala un servicio de Windows por sí solo.

La primera ejecución debe ser manual. La automatización del arranque, el firewall definitivo y la carga de datos reales se deciden después de aceptar la prueba con Dirección y Secretaría.

## Antes de empezar

- Use Windows con Node.js 24.x, una cuenta de servicio separada y un puerto interno reservado, por ejemplo `4318`.
- Mantenga el proyecto en una carpeta local del servidor, fuera de OneDrive, carpetas compartidas y el repositorio público.
- Cree una carpeta exclusiva para los datos. No use `.local\demo` ni una carpeta que contenga `synthetic-demo.flag`.
- Asigne permisos NTFS de lectura/escritura de la carpeta de datos y lectura de la clave TLS únicamente a la cuenta que ejecutará Matrícula y a administradores autorizados. No otorgue acceso de escritura a todos los usuarios del servidor.
- Defina una IP interna estable para que Secretaría pueda abrir la aplicación, por ejemplo `10.0.0.25` (el arranque escolar actual acepta una IP o `localhost`). El certificado debe contener exactamente esa IP en su SAN.

El certificado de producción debe provenir de la autoridad certificadora que administre la red del colegio. Un certificado autofirmado sirve sólo para una prueba temporal y debe instalarse como confiable en los computadores de prueba; no se debe ocultar el aviso del navegador.

## Crear la base local y la cuenta inicial

Abra PowerShell en la carpeta del proyecto y use una carpeta nueva. La contraseña inicial se entrega sólo por variable de entorno, se cambia al ingresar y se quita al terminar:

```powershell
$env:MATRICULA_DATA = 'C:\Datos\PuraMatricula'
$env:MATRICULA_INITIAL_USER = 'administracion'
$env:MATRICULA_INITIAL_PASSWORD = 'clave-temporal-larga-de-prueba'
node scripts/init.mjs
Remove-Item Env:MATRICULA_INITIAL_PASSWORD
```

Conserve `storage.key` dentro de la carpeta de datos con ACL restringida. No la copie al repositorio ni la envíe por correo. Si la carpeta ya contiene una cuenta, `init.mjs` se detiene para no reemplazarla.

## Variables para el arranque manual

Configure rutas absolutas y el mismo puerto en el origen HTTPS y en la regla del firewall:

```powershell
$env:MATRICULA_DATA = 'C:\Datos\PuraMatricula'
$env:MATRICULA_HOST = '10.0.0.25'
$env:MATRICULA_PORT = '4318'
$env:MATRICULA_ORIGIN = 'https://10.0.0.25:4318/'
$env:MATRICULA_TLS_CERT = 'C:\Seguridad\matricula.cer.pem'
$env:MATRICULA_TLS_KEY = 'C:\Seguridad\matricula.key.pem'
```

`school-start.mjs` exige HTTPS, valida que el certificado esté vigente y comprueba que corresponda al host. También rechaza `MATRICULA_DATABASE_URL`: este procedimiento es SQLite local y no debe apuntar accidentalmente a Supabase.

Primero valide y luego inicie en la misma consola:

```powershell
npm run school:check
npm run school:start
```

El mensaje de comprobación sólo valida archivos y certificado; todavía hay que probar la conexión desde Secretaría. Para detener la instancia manual use `Ctrl+C`. No configure aún el Programador de tareas, NSSM ni un servicio de Windows: el arranque automático queda para después de la aceptación.

## Prueba desde dos computadores

1. En el servidor abra `https://10.0.0.25:4318/`, cambie la contraseña temporal y cree únicamente estudiantes ficticios.
2. En un computador de Secretaría abra el mismo origen HTTPS. Confirme que el certificado es confiable, que el navegador no cambia el host y que el inicio de sesión funciona con una cuenta individual.
3. Compruebe alta, guardado, reapertura, búsqueda, PDF, adjunto, renovación, traslado, retiro, permisos por curso y ocultación de antecedentes reservados.
4. Desde el segundo computador abra la misma ficha y guárdela después de que el primero la cambie. Debe aparecer un conflicto `409` y conservarse el texto pendiente para revisión.
5. Detenga y vuelva a iniciar el proceso manualmente. Verifique que la ficha, el historial y la auditoría continúan disponibles.
6. Pruebe el respaldo con el servidor detenido. Restaure en una carpeta nueva y vacía, verifique una ficha y un adjunto, e invalide las sesiones restauradas antes de considerar el respaldo aceptado.

No use todavía el padrón real, RUT reales, documentos firmados reales ni antecedentes médicos/sociales. La prueba debe registrar quién validó cada recorrido y qué campos o permisos aún requieren decisión institucional.

## Respaldo y recuperación

El respaldo local requiere una contraseña independiente y acceso autorizado a datos reservados y a todos los cursos. Detenga el proceso para capturar una copia consistente:

```powershell
$env:MATRICULA_BACKUP_PASSWORD = 'otra-clave-larga-solo-para-la-prueba'
npm run backup -- C:\Respaldos\matricula-prueba.dsmbak
Remove-Item Env:MATRICULA_BACKUP_PASSWORD

$env:MATRICULA_BACKUP_PASSWORD = 'otra-clave-larga-solo-para-la-prueba'
npm run restore -- C:\Respaldos\matricula-prueba.dsmbak C:\Datos\PuraMatricula-restaurada
Remove-Item Env:MATRICULA_BACKUP_PASSWORD
```

La carpeta de restauración debe estar vacía y separada de la carpeta activa. No sobrescriba la base en producción. Custodie archivo y contraseña por canales distintos y documente una restauración supervisada antes de aceptar el piloto.

## Criterio de aceptación y límites

La prueba escolar termina cuando Secretaría puede trabajar desde dos computadores, se verifican los permisos y conflictos, se recupera un respaldo y Dirección aprueba la ficha, los campos reservados, los responsables y la retención. Después se puede definir un servicio de Windows, una regla de firewall acotada a la LAN y una carga real gradual.

La aplicación continúa independiente del sistema de atrasos. No se integran identidades ni se fusionan estudiantes por nombre. Vercel/Supabase, la importación real y cualquier integración futura tienen sus propios controles y no forman parte de este arranque local.
## Validación de entrega en el colegio

En el servidor, use la etiqueta fechada indicada en la entrega. Mientras no haya certificado, use el [modo local](DOCKER-COLEGIO.md#primer-día-sin-certificado-modo-local) en el propio PC servidor. Para habilitar otros PC, defina el origen HTTPS de Matrícula y compruebe que el nombre o la IP usados estén en el certificado y que los equipos confíen en su CA. Limite el puerto a la red institucional y ejecute `check` del asistente Docker.

Desde un segundo PC, compruebe el ingreso con una cuenta individual, la lectura y edición de una ficha ficticia, y el acceso limitado por curso. Genere un respaldo cifrado, restáurelo en un volumen separado y verifique allí el expediente, su historial y los adjuntos. La guía `DOCKER-COLEGIO.md` incluye los comandos. Complete estas verificaciones antes de autorizar datos reales.

## Integración futura con Asistencia

Las aplicaciones conservan su base, cuentas y sesiones propias. Para un primer piloto, evaluar un intercambio unidireccional de curso y matrícula vigente (referencia escolar estable, año, curso y estado). Matrícula conserva la autoridad sobre esos datos; Asistencia conserva la de sus registros. Evitar nombres como llave de coincidencia y enviar identificación u otros datos personales solo si el colegio confirma que son necesarios.

El intercambio deberá tener un contrato versionado, credenciales de servicio de alcance limitado, una vista previa de altas y conflictos, procesamiento idempotente y auditoría sin antecedentes reservados. Empezar con registros ficticios y sin sincronización automática. No se habilita ninguna conexión en esta entrega.
