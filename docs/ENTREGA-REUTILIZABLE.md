# Entrega reutilizable para Windows

## Instalar en el colegio

1. Descargue `PuraMatricula-Instalador-Windows.zip` desde **Assets** de la versión en GitHub y extraiga todo en una carpeta local.
2. Abra Docker Desktop y espere a que esté listo. Se necesita el motor local Linux amd64, Docker Engine 28 o posterior.
3. Haga doble clic en **INSTALAR MATRICULA.cmd** desde la carpeta extraída. Cree la primera cuenta administradora cuando se lo pida.
4. Abra el acceso del escritorio. La dirección interna queda escrita en `docker.env` como `MATRICULA_ORIGIN` y se muestra al terminar la instalación.

La imagen va dentro del ZIP. El servidor no necesita clonar el repositorio, instalar Node ni compilar. La base empieza vacía. El instalador de Windows configura el acceso por la IPv4 interna del servidor. Compruebe esa dirección desde otro equipo de la red del colegio después de instalar. Si ya hay una instalación, conserve su volumen y use el actualizador.

Para una instalación existente, la entrega incluye **ACTUALIZAR MATRICULA.cmd**. Comprueba que el contenedor corresponda a la carpeta, imagen y volumen configurados, crea un respaldo cifrado y conserva el puerto y el volumen. El actualizador está limitado a saltos de imagen sin migraciones de base declaradas. Si el servicio no supera la comprobación, restaura los archivos anteriores e intenta volver a iniciar la imagen anterior. El volumen y el respaldo cifrado se conservan.

## Preparar y publicar otra versión

Desde el repositorio, use Node.js 24, npm, Docker con Buildx y `tar`. Prepare la entrega desde un commit limpio que esté publicado en GitHub y corresponda exactamente a la versión a entregar:

```powershell
npm ci
npm test
npm run release:windows -- --entrega colegio.7
```

El resultado queda en `output/release/windows-<stamp>/`: el instalador `PuraMatricula-Instalador-Windows.zip` y su archivo `.sha256`. Los insumos se limitan a la aplicación, los scripts, la configuración pública, la guía y la imagen Linux amd64. Revise que no haya datos reales, cuentas, respaldos, certificados privados ni secretos en el ZIP o el código de la versión.

Para una entrega nueva, cambie `colegio.7` por su número. Es el identificador que se muestra al actualizar, separado de la versión base de la imagen Docker.

Pruebe el ZIP extraído en un entorno Docker separado y vacío: doble clic, inicio de sesión, acceso directo, reinicio y respaldo/restauración con datos sintéticos. Pruebe también el actualizador sobre una instalación sintética ya inicializada, con un puerto distinto, verificando que no cambie el volumen y que una falla vuelva a la imagen anterior. En **GitHub Releases**, cree una versión con una etiqueta nueva sobre el mismo commit y adjunte el ZIP y el checksum. Mantenga el nombre del ZIP para conservar el enlace `releases/latest/download/PuraMatricula-Instalador-Windows.zip` cuando esa entrega sea la más reciente. Compruebe la descarga y su SHA-256 antes de compartir el enlace. Si el repositorio es privado, quien lo descargue necesita acceso.

## Adaptar a otro colegio

Use este repositorio como base de un proyecto separado, con instalación, cuentas y base nuevas. La generación del ZIP es reutilizable; la aplicación todavía tiene identidad y reglas del colegio actual que hay que revisar:

- **Identidad:** cambie nombre, ciudad, escudo e icono; revise ingreso, portada, mensajes, acceso directo y encabezados de PDF e informes. Para inventariar las referencias actuales, use `rg -n -i 'domingo santa mar|concepci.n|escudo|dsm' public src scripts docs`.
- **Operación:** valide la ficha, campos obligatorios, cursos, permisos, formatos y mapeo de planillas con el colegio nuevo. Genere ejemplos sintéticos propios y pruebe importación, edición y exportación.
- **Aislamiento:** mantenga claves, copias y volúmenes separados. Si dos instalaciones van en el mismo servidor, asigne carpeta, proyecto Compose, contenedores, red, volumen y puerto propios. Si se usan en el mismo navegador, revise también nombres de host y cookies: puertos distintos por sí solos no separan cookies de un mismo host. El instalador de un clic actual se entrega para una sola instalación por servidor; pruebe la coexistencia antes de distribuir una adaptación.
