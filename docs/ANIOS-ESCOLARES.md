# Matrícula e historial por año

El selector superior determina el año de **expedientes, pendientes y estadísticas**. Cada persona puede tener una matrícula independiente por año; cambiar el selector no mueve estudiantes ni cierra años anteriores. Cuentas, plantillas, auditoría y respaldos son gestión general y se identifican como tales en pantalla.

## Consultar y preparar años

- El selector incorpora los años con cursos o matrículas a los que la cuenta tiene acceso.
- «Consultar otro año…» permite elegir entre 1950 y 2100, incluso si todavía no hay datos. Una selección vacía debe mostrar cero expedientes y cero estadísticas, sin traer los del año anterior.
- Cambiar de año guarda primero los cambios pendientes de la ficha. Si el guardado falla, se conserva el año actual. Se reinician curso, búsqueda, estado, página y la revisión de importación anterior.
- En «Cursos y años», agregar un curso permite indicar un año antiguo o futuro. «Preparar otro año» copia cursos a un año posterior; no copia matrículas.
- La recarga conserva el contexto de esa pestaña con la dirección limpia. Cerrar sesión borra ese contexto. Esto organiza la navegación; la autorización de datos sigue ocurriendo en el servidor.

## Cargar una planilla antigua o futura

1. Entrar en Organización → Importación y elegir un archivo `.xlsx`.
2. Revisar el año de destino de la vista previa. Un año único reconocido en la planilla prevalece sobre el del formulario, con una advertencia si difieren. Una planilla sin año utiliza el año elegido en el formulario. No se usa el año de nacimiento como año de matrícula.
3. Un libro con años mezclados o valores de año ambiguos requiere corregir o separar las cargas. No se guarda silenciosamente en el año visible.
4. Revisar hojas, cursos, datos y advertencias. Crear cursos requiere confirmación y permiso. Los cambios de contacto y las matrículas de una persona que ya existe en otro año requieren selección explícita.
5. Confirmar. Solo después de guardar se actualizan los años disponibles y el selector cambia al año importado.

Una matrícula anual importada se crea como **borrador**, vinculada a la misma persona. Conserva las otras matrículas y usa los datos revisados del archivo. No hereda firmas, documentos ni autorizaciones del otro año. Identidades conflictivas, cursos distintos dentro del mismo año, falta de acceso al expediente anterior o reingresos que requieren gestión específica quedan para revisión; no se resuelven adivinando.

## Estadísticas y descargas

Los totales, cursos, pendientes y nóminas se consultan con el año seleccionado y los cursos autorizados de la cuenta. Una persona presente en 2019 y 2026 cuenta una vez en cada año consultado; esas matrículas no se suman en el mismo total. Los movimientos de una ficha se muestran aparte de su matrícula vigente. Los informes y descargas indican el año aplicado.

## Comprobación antes del uso real

Probar con una copia sintética: matrícula actual → importar una matrícula antigua de la misma persona → comprobar ambos años por separado → consultar un año vacío → recargar → volver al año actual. Comprobar también con una cuenta restringida y revisar los archivos descargados. Las pruebas automatizadas y de navegador del proyecto cubren estos recorridos; no sustituyen la aceptación del personal ni una prueba desde otro PC del colegio.
