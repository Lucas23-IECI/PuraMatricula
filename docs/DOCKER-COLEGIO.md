# PuraMatricula en Docker: entrega al colegio

La aplicación se ejecuta en el PC servidor del colegio. Los computadores de Secretaría y Dirección entran con su navegador; no necesitan Node.js ni Docker. Después de copiar esta entrega al servidor, el funcionamiento no depende del PC donde se desarrolló.

Es un proyecto independiente del sistema de asistencia: un servicio `puramatricula`, su red `puramatricula_private` y su volumen `puramatricula_data`. El volumen contiene SQLite, adjuntos cifrados y `storage.key`. No se usa la base de asistencia ni se conecta con Supabase automáticamente.

## Qué preparar para el primer día

- El ZIP de entrega y su archivo `.sha256`, conservados juntos.
- Docker Desktop con motor Linux/WSL 2 en Windows, o Docker Engine y Compose en Linux. Los asistentes utilizan Compose moderno con `up --wait`; use Compose 2.20 o posterior.
- Una carpeta local para el código, por ejemplo `C:\PuraMatricula`, fuera de OneDrive y del proyecto de asistencia.
- Si se construye desde el ZIP, el primer build necesita Internet para obtener la imagen Node 24 y las dependencias fijadas en `package-lock.json`. Con una imagen acompañante cargada se utiliza el camino sin red descrito más abajo. El PC servidor no necesita instalar Node.
- Si aún no hay HTTPS, el modo local permite empezar desde el PC servidor. El acceso desde otros equipos requiere HTTPS o el acceso remoto al escritorio del servidor que el colegio ya tenga autorizado y configurado.

El ZIP de fuentes y la imagen Docker son artefactos distintos. El ZIP no incluye una imagen; una imagen acompañante se prueba y exporta por separado, junto con su propio SHA-256. Los asistentes no publican imágenes.

## Verificación local de Docker

La preparación se probó en un proyecto Docker aislado con datos ficticios, usando Docker Engine 29.6.1 y Node 24.22.2 dentro de la imagen. Se comprobaron usuario UID 1000, raíz de solo lectura, inicialización sin contraseña predeterminada, TLS nativo, doctor, healthcheck e ingreso con cookie `Secure`. También se creó una ficha con PDF y adjunto, se recreó el contenedor y se confirmó que los datos continuaban disponibles.

El respaldo cifrado V3 se generó dentro del contenedor y se copió al host. Su restauración atómica en otro volumen recuperó una ficha y un adjunto, invalidó las sesiones anteriores y conservó una auditoría válida. Los contenedores, volúmenes y la red de esa prueba se retiraron tras comprobar sus etiquetas; el stack de asistencia permaneció independiente.

Estas pruebas verifican el funcionamiento local del contenedor. La instalación del colegio todavía debe comprobar su IP o DNS, las reglas de red y la confianza del certificado desde los computadores de Secretaría. Identifique siempre la entrega concreta mediante sus archivos SHA-256.

## Comprobar y extraer la entrega

En PowerShell, compare el hash del ZIP con el valor del archivo acompañante antes de extraer:

```powershell
Get-FileHash .\PuraMatricula-entrega.zip -Algorithm SHA256
Get-Content .\PuraMatricula-entrega.zip.sha256
Expand-Archive -LiteralPath .\PuraMatricula-entrega.zip -DestinationPath C:\PuraMatricula
Set-Location C:\PuraMatricula
```

El nombre real del ZIP lleva la versión y la fecha; sustituya el del ejemplo. Dentro se incluyen `MANIFEST.sha256` y `RELEASE.json` para comprobar los archivos y la versión. En Linux puede usar `sha256sum -c archivo.zip.sha256`. El ZIP no debe contener `docker.env`, datos, bases, respaldos, certificados privados, `.local`, `node_modules` ni resultados de pruebas. Las fotografías incluidas son recursos de interfaz; su atribución está en `docs/RECURSOS-VISUALES.md`.

Es un ZIP operativo: no incluye la suite de pruebas ni los recorridos del navegador. `npm run build` permite comprobar la sintaxis del código incluido cuando se dispone de Node 24 y dependencias; la batería completa se ejecuta en el checkout de desarrollo, antes de preparar la entrega.

## Instalación sin Internet con imagen acompañante

Lleve también el archivo de imagen `.tar` y su `.sha256`. Compruebe su hash y cárguelo en Docker, usando el nombre real de la entrega:

```powershell
Get-FileHash .\puramatricula-imagen.tar -Algorithm SHA256
Get-Content .\puramatricula-imagen.tar.sha256
docker image load --input .\puramatricula-imagen.tar
```

Prepare `docker.env` con el origen real, el modo TLS o proxy y las rutas de certificados propias. Si todavía no existe, puede copiar `docker.env.example`; conserve un archivo existente en lugar de sobrescribirlo. Configure `MATRICULA_IMAGE` con **el mismo nombre y etiqueta que muestra la imagen cargada**, indicados en la entrega. El valor predeterminado es `puramatricula:0.2.0`, pero no lo suponga si el artefacto entregado indica otro.

Cuando los certificados y la configuración estén listos, inicialice sin construir ni descargar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker-colegio.ps1 init -UseImage
```

En Linux/WSL, después de verificar y cargar el mismo `.tar`, ejecute:

```sh
sh scripts/docker-colegio.sh init --use-image
```

Esta opción comprueba con `docker image inspect` que la imagen configurada ya esté disponible, solicita la cuenta inicial y valida el arranque. No ejecuta `build`, `pull` ni `npm ci`; por tanto no requiere red para instalar las dependencias de la aplicación. Si falta la imagen, se detiene en lugar de buscarla remotamente. Docker y su motor deben estar instalados y listos previamente; el acceso entre el servidor y los PC clientes sigue requiriendo la LAN.

La imagen incluida en la entrega local usa el formato Docker para una sola plataforma, Linux amd64, sin attestations. El instalador comprueba el SHA-256 del TAR antes de cargarlo y admite el identificador de manifiesto o de configuración declarado para ese mismo archivo. Así no depende del [almacén clásico o containerd](https://docs.docker.com/engine/storage/containerd/) que use el equipo; no hace falta cambiar el almacén de Docker Desktop.

La opción de imagen local corresponde solo a `init`. `update` conserva su procedimiento normal de respaldo y construcción; no incorpora una actualización offline automática.

## Primer día sin certificado: modo local

Use la entrega que incluye `compose.local.yaml`. En el servidor, con Docker Engine **28 o posterior** y el motor Linux local, compruebe los hashes, importe la imagen y extraiga las fuentes en una carpeta nueva. Copie el archivo de configuración local de la entrega como `docker.env` para conservar la etiqueta fechada exacta.

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker-colegio.ps1 init -Mode local -UseImage
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker-colegio.ps1 check

Abra **http://matricula.localhost:4319/** en el navegador del mismo PC servidor. Si el navegador no resuelve el nombre, use `http://127.0.0.1:4319/`. Ambos llegan al mismo servicio y a la misma base. El asistente pide el nombre de usuario y una clave temporal oculta. Al entrar, cámbiela y cree las cuentas individuales que usarán Matrícula. Si ya se inicializó la base, utilice `start` y `check`, en vez de repetir `init`. Si el puerto está ocupado, cambie `MATRICULA_LOCAL_PORT` a otro puerto libre y utilice esa misma dirección; si la base ya se inicializó, utilice `start`.

El instalador deja un acceso directo con el escudo en el escritorio de la cuenta de Windows que lo ejecuta. Para otra cuenta del mismo PC, la persona puede descargar desde el ingreso un ZIP con el acceso directo, extraerlo y moverlo a su escritorio. También puede ejecutar `scripts\crear-acceso-directo.ps1` desde su cuenta; la opción `-UsarIP` crea el acceso con la dirección alternativa. No se instalan aplicaciones en el navegador ni se modifica DNS.

En el ingreso, **Recordar mi usuario en este equipo** guarda solo el nombre de usuario durante 30 días desde que se elige al ingresar. Es opcional, se puede desmarcar y depende del navegador y la dirección que se use. No guarda la contraseña ni amplía la duración de la sesión. En un equipo compartido, mantenga la opción desmarcada.

El puerto se publica exclusivamente en `127.0.0.1` sobre una red Docker dedicada. No abra reglas de firewall, no configure reenvío de puertos y no use la IP del servidor para este modo. Docker Engine anterior a 28 no es apto para este perfil: [Docker documenta la limitación](https://docs.docker.com/engine/network/port-publishing/).

Antes de incorporar el padrón, compruebe que una cuenta autorizada puede ingresar y que otra cuenta no puede acceder a cursos que no le corresponden. Revise el año y destino de cada hoja en la previsualización de Importación, y haga un respaldo cifrado. El respaldo debe quedar en una ubicación institucional autorizada y su clave por separado. Si una hoja requiere ajuste, corríjala o déjela fuera de esa carga; confirmar el padrón crea borradores y no sustituye la confirmación de matrícula.

Cuando esté listo el certificado, haga un respaldo, detenga Matrícula y conserve `MATRICULA_DATA_VOLUME`. Configure el modo `tls` o `proxy` en el mismo proyecto, ejecute `start` y `check` y valide desde otro PC. No vuelva a inicializar la base.

## Opción recomendada: HTTPS propio en el puerto 4433

Esta opción no requiere modificar el stack de asistencia ni ocupar sus puertos 80/443. El archivo **completo** `compose.tls.yaml` ejecuta el servidor HTTPS de Matrícula y publica el puerto 4433 en la LAN.

1. Reserve una IP estable del PC servidor o un nombre DNS interno. `10.0.0.25` es solo un ejemplo; use el que corresponda al colegio.
2. Solicite a la CA institucional un certificado PEM cuyo SAN incluya exactamente esa IP o ese nombre. Para el ejemplo, el origen será `https://10.0.0.25:4433`.
3. Prepare estos archivos propios, fuera del ZIP y con permisos restringidos:

   ```text
   certificados/matricula.crt   certificado PEM y cadena pública necesaria
   certificados/matricula.key   clave privada PEM propia de Matrícula
   ```

   También se pueden configurar rutas absolutas en `docker.env`. No copie las claves ni la carpeta HTTPS del sistema de asistencia. La clave privada solo queda en el servidor y se monta como solo lectura. El arranque comprueba que certificado y clave correspondan, que el certificado esté vigente y que identifique el host/IP configurado. Si la clave exige una passphrase, el administrador debe preparar un formato compatible con el servicio; no guarde esa passphrase en `docker.env`.

   En Linux, el contenedor ejecuta con UID/GID `1000`: debe poder leer los PEM y atravesar los directorios necesarios. La clave privada propia debe tener dueño `1000` y permisos `600`, o una ACL equivalente; el certificado público puede tener permisos `644`. En Windows, restrinja los permisos NTFS a los responsables del servidor y a la cuenta necesaria para Docker Desktop. El doctor comprueba que los montajes permitan leer los archivos; no modifica sus permisos ni los certificados.
4. Abra Docker Desktop manualmente y espere a que el motor esté listo.
5. En una consola de la carpeta del proyecto ejecute:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker-colegio.ps1 init
   ```

   Elija `tls`, escriba el origen completo con `:4433` y confirme el puerto 4433. El asistente crea `docker.env` sin contraseñas, construye la imagen y solicita usuario y contraseña temporal dentro del contenedor. Si lleva una imagen ya cargada, use `init -UseImage` como se describe en la sección anterior. La contraseña se escribe oculta y debe cambiarse al ingresar. No hay una contraseña predeterminada.
6. El asistente valida volumen y TLS con `docker-start.mjs --check`, inicia el servicio y espera su healthcheck. Si falla, conserva la configuración y los datos; no inicialice otro volumen para ocultar el error.

La configuración resultante contiene, entre otros valores:

```dotenv
MATRICULA_DOCKER_MODE=tls
MATRICULA_PUBLIC_ORIGIN=https://10.0.0.25:4433
MATRICULA_TLS_PORT=4433
MATRICULA_TLS_BIND=0.0.0.0
MATRICULA_TLS_CERT_FILE=./certificados/matricula.crt
MATRICULA_TLS_KEY_FILE=./certificados/matricula.key
MATRICULA_DATA_VOLUME=puramatricula_data
MATRICULA_NETWORK_NAME=puramatricula_private
```

El puerto del origen, el publicado y el del servidor HTTPS deben coincidir. Si el equipo tiene varias interfaces, el administrador puede restringir `MATRICULA_TLS_BIND` a la IP de la LAN. No es necesario abrir puertos del router hacia Internet.

## Acceso desde Secretaría y firewall

El administrador debe permitir el puerto elegido únicamente desde la red autorizada. Un ejemplo de regla de Windows, para el perfil real de la red y ejecutada en PowerShell elevado, es:

```powershell
New-NetFirewallRule -DisplayName 'PuraMatricula HTTPS LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4433 -RemoteAddress LocalSubnet -Profile Domain,Private
```

El asistente **no ejecuta** esta regla. El administrador debe comprobar la exposición efectiva de Docker Desktop y las políticas de la red. No habilite una regla para todas las redes públicas.

En cada PC cliente, la CA pública que firma el certificado debe estar en el almacén de confianza correspondiente. Si se usa una CA interna, el administrador distribuye su certificado público, nunca su clave privada. El navegador debe reconocer el certificado sin saltarse advertencias.

Desde Secretaría abra el origen exacto, por ejemplo `https://10.0.0.25:4433`, e ingrese con una cuenta individual. Compruebe la contraseña temporal, búsqueda, guardado, reapertura, descargas y permisos desde un segundo PC. Un healthcheck dentro del contenedor no comprueba DNS, firewall ni la confianza del navegador de Secretaría.

## Alternativa: proxy HTTPS institucional ya preparado

Use `MATRICULA_DOCKER_MODE=proxy` cuando el administrador ya haya preparado un virtual host HTTPS independiente para Matrícula. En este modo el asistente selecciona `compose.yaml` y publica **solo** `127.0.0.1:4319`; ese HTTP no debe exponerse a la LAN.

```dotenv
MATRICULA_DOCKER_MODE=proxy
MATRICULA_PUBLIC_ORIGIN=https://matricula.colegio.ejemplo
MATRICULA_HTTP_PORT=4319
```

El origen público es fijo y HTTPS. El proxy debe preservar el `Host` completo, incluido el puerto si lo tiene. El launcher activa cookies `Secure` expresamente; no confía en cabeceras `X-Forwarded-*` para decidir si una solicitud es segura ni para identificar usuarios.

Ejemplo de bloque a adaptar **en el proxy existente**, sin crear otro servicio que compita por 80/443:

```nginx
server {
    listen 443 ssl;
    server_name matricula.colegio.ejemplo;
    # Configure aqui el certificado y la politica TLS institucional.
    # Esta entrega no contiene certificados ni claves del proxy.
    client_max_body_size 8m;
    location / {
        proxy_pass http://127.0.0.1:4319;
        proxy_set_header Host $http_host;
        proxy_set_header Forwarded "";
        proxy_set_header X-Forwarded-For "";
        proxy_read_timeout 60s;
    }
}
```

Si el proxy es otro contenedor, `127.0.0.1` se refiere a ese contenedor. Declare explícitamente en `docker.env` el nombre de su red externa:

```dotenv
MATRICULA_PROXY_NETWORK=red_del_proxy_preparada_por_el_administrador
```

Solo entonces el asistente añade `compose.proxy.yaml`. En esa red, el upstream usa el alias explícito `http://puramatricula-backend:4318`. Esto no comparte volúmenes ni conecta bases; el administrador decide la ruta y el certificado del nuevo virtual host. Los intentos de acceso detrás de un proxy pueden compartir dirección de red para el control de intentos: las cuentas siguen siendo individuales.

## Operación diaria

Ejecute siempre desde la carpeta del proyecto. El asistente fija explícitamente proyecto, archivo Compose y `docker.env`; no detecta ni administra automáticamente otros stacks.

| Acción | PowerShell | Linux/WSL |
|---|---|---|
| Iniciar | `.\scripts\docker-colegio.ps1 start` | `sh scripts/docker-colegio.sh start` |
| Revisar configuración, TLS y salud interna | `.\scripts\docker-colegio.ps1 check` | `sh scripts/docker-colegio.sh check` |
| Detener solo Matrícula | `.\scripts\docker-colegio.ps1 stop` | `sh scripts/docker-colegio.sh stop` |
| Crear respaldo | `.\scripts\docker-colegio.ps1 backup` | `sh scripts/docker-colegio.sh backup` |
| Probar restauración aislada | `.\scripts\docker-colegio.ps1 restore -BackupFile C:\Respaldos\copia.dsmbak` | `sh scripts/docker-colegio.sh restore /respaldos/copia.dsmbak` |
| Actualizar con respaldo previo | `.\scripts\docker-colegio.ps1 update` | `sh scripts/docker-colegio.sh update` |

En Linux/WSL, `sh scripts/docker-colegio.sh init` realiza la instalación asistida con build; `init --use-image` utiliza la imagen local cargada. Todos los `compose run` de inicialización, doctor, respaldo y restauración bloquean descargas con `--pull never`. Los scripts comprueban el motor con un límite de diez segundos; no abren ni reinician Docker Desktop. Si una consola de PowerShell bloquea scripts, use `powershell -NoProfile -ExecutionPolicy Bypass -File ...` para esa invocación, sin cambiar la política global del equipo.

El servicio utiliza usuario sin privilegios, raíz de solo lectura, capacidades eliminadas, `no-new-privileges`, cierre ordenado de treinta segundos y `restart: unless-stopped`. Reiniciar el PC no elimina el volumen; Docker debe estar configurado por el administrador para arrancar en ese servidor. No configure depender de una sesión abierta en el PC de desarrollo.

## Respaldo y restauración comprobable

El volumen se monta en `/data` y guarda **juntos** `matricula.sqlite`, `storage.key` y los adjuntos cifrados dentro de `/data/matricula`. Esta subcarpeta también permite restaurar de forma atómica sin renombrar el punto de montaje. Perder `storage.key` impide descifrar la información, aunque se conserve la base. No copie una base SQLite abierta por separado como procedimiento de respaldo.

```powershell
.\scripts\docker-colegio.ps1 backup -BackupFile E:\Respaldos\matricula-lunes.dsmbak
.\scripts\docker-colegio.ps1 restore -BackupFile E:\Respaldos\matricula-lunes.dsmbak
```

El respaldo solicita otra contraseña oculta de al menos dieciséis caracteres. Si Matrícula estaba ejecutándose, se detiene solo ese servicio, se crea una copia consistente y se vuelve a iniciar. Si estaba detenida, se conserva ese estado. El archivo cifrado se copia al destino sin sobrescribir archivos existentes; también queda una copia cifrada en `/data/matricula/backups` del volumen. Si la copia al host falla, se conserva el archivo parcial para revisión. No se borran respaldos automáticamente.

`restore` crea un volumen nuevo con nombre `puramatricula_restore_...`, monta el respaldo de entrada como solo lectura y verifica base, auditoría y adjuntos. Las sesiones restauradas se invalidan. No reemplaza el volumen activo ni publica puertos de la restauración. Conserve el nombre del volumen que imprime el asistente.

Para una aceptación completa, pruebe además el volumen restaurado en otra carpeta de configuración: otro proyecto Compose, otro puerto y otra red. En modo local use un puerto de loopback libre; en modo de red use un origen HTTPS de prueba con su certificado. Declare allí el volumen restaurado como `MATRICULA_DATA_VOLUME`; no reutilice el archivo de configuración activo ni su puerto. El responsable debe abrir una ficha y un adjunto desde el navegador antes de considerar aceptada la recuperación. La promoción de ese volumen al servicio activo es una decisión explícita del administrador.

Custodie al menos una copia fuera del PC servidor y la contraseña por un canal separado. El ZIP de código y una etiqueta de imagen no reemplazan un respaldo de datos. No use `docker compose down -v`, `docker volume prune` ni elimine el volumen para resolver problemas de arranque.

## Actualización y recuperación

Conserve el ZIP y la imagen anterior. Extraiga cada nueva entrega en una carpeta propia, verifique SHA-256 y conserve su `docker.env` y las rutas privadas de sus certificados. Nunca extraiga un ZIP sobre una carpeta de datos o respaldos.

`update` exige un respaldo correcto antes de construir, conserva una etiqueta local de la imagen anterior y reconstruye solo Matrícula. Durante la compilación puede seguir ejecutándose la versión anterior. Después reemplaza el servicio y espera su salud. No ejecuta Git ni publica nada.

Si la construcción falla, la versión que estaba en ejecución no se sustituye. Si la nueva versión arranca pero falla la comprobación, revise el estado y conserve el respaldo: no se revierte automáticamente la base. Una recuperación que implique datos debe probarse en un volumen nuevo y promoverse expresamente. No lance una imagen antigua contra una base modificada suponiendo que son compatibles.

Para renovar certificados propios, el administrador reemplaza únicamente los PEM de Matrícula, comprueba SAN y fechas, y programa `stop`, `start` y `check`. Confirme después la conexión desde Secretaría.

## Qué queda por validar en el colegio

La entrega local permite revisar configuración y ensayar con datos ficticios; no acredita por sí sola el funcionamiento del PC físico, el firewall, el certificado de los clientes ni la restauración supervisada. Antes del padrón real, Secretaría y Dirección deben aceptar el flujo, las cuentas, los cursos, los permisos y la recuperación. La integración futura con asistencia queda separada.

Referencias técnicas: [servicios de Docker Compose](https://docs.docker.com/reference/compose-file/services/), [salud y orden de arranque](https://docs.docker.com/compose/how-tos/startup-order/), [proxy HTTP de Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header).
