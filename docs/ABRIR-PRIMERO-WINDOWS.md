# Instalar Matrícula en el PC servidor

1. Extraiga **todo** el ZIP a una carpeta local. Abra Docker Desktop en modo Linux amd64 (Docker Engine 28 o posterior) y espere a que esté listo.
2. En la carpeta extraída, haga doble clic en **INSTALAR MATRICULA** (`INSTALAR MATRICULA.cmd` si Windows muestra las extensiones). El instalador abre una ventana; no hace falta escribir un comando. Cree el primer usuario administrador y una clave temporal de al menos 12 caracteres.
3. Abra el acceso con el escudo que queda en el escritorio. La instalación detecta la IPv4 interna del PC servidor y muestra esa dirección para los otros computadores autorizados. Cambie la clave temporal al entrar.

La base parte vacía y se guarda por separado de Asistencia. El ZIP ya incluye la imagen Docker. Este modo publica Matrícula por la IPv4 interna del PC servidor dentro de la red privada, sin exigir HTTPS institucional para la prueba inicial. HTTPS queda como una mejora posterior.

## Actualizar una instalación existente

Si ya existe `C:\PuraMatricula`, deja Docker y Matrícula en ejecución, descarga la nueva entrega y extrae todo en una carpeta aparte. Haz doble clic en **ACTUALIZAR MATRICULA**. La ventana muestra el número de entrega. El actualizador crea y protege el respaldo automáticamente, sin pedir ninguna clave. Conserva el puerto, el volumen y las cuentas y comprueba el servicio al terminar. Si algo falla después del cambio, restaura la configuración de la imagen anterior.

No borres el volumen, no uses `docker compose down -v` y no cambies el puerto durante la actualización. Si la instalación ya usa otro puerto, se conserva automáticamente.

En **Administración → Cuentas y permisos**, cree una cuenta individual para la persona que vaya a usar Matrícula. Antes de cargar el Excel, haga un respaldo cifrado. En **Organización → Importación**, revise el año, las hojas y los cursos en la vista previa antes de confirmar. La importación incorpora fichas como borradores y no crea cuentas.

Si el instalador muestra un error, la ventana permanece abierta. El destino inicial es `C:\PuraMatricula`. Si ya existe la carpeta o el volumen, conserve los datos y siga `docs\DOCKER-COLEGIO.md` de la instalación existente. Para cambiar el destino o el puerto en una instalación nueva, abra PowerShell en la carpeta del ZIP extraído y ejecute, por ejemplo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\INICIAR-EN-EL-SERVIDOR.ps1 -Destino 'D:\PuraMatricula' -Puerto 4320
```

Después de reiniciar Windows, abra Docker Desktop. Si Matrícula no arrancó automáticamente, abra PowerShell en la carpeta instalada y ejecute `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\docker-colegio.ps1 start`. La guía `docs\DOCKER-COLEGIO.md` incluye los pasos de comprobación, respaldo, restauración y actualización.
