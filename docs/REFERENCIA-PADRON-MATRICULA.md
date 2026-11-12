# Referencia del padrón de matrícula por curso

Lucas proporcionó un Excel local como referencia del formato usado en el colegio. El archivo original y sus registros personales permanecen fuera del repositorio. Esta nota conserva únicamente la estructura y las decisiones pendientes. No se ha importado a ninguna base.

## Estructura observada

- Catorce hojas por nivel: prekínder, kínder, primero a octavo básico y primero a cuarto medio.
- Una fila por estudiante, con encabezados en la primera fila. Algunas hojas incorporan una columna de numeración denominada `N°`, `Cantidad` o sin etiqueta. Otras no tienen esa columna.
- Doce columnas de contenido: apellidos paterno y materno, nombres y RUT del estudiante; apellidos paterno y materno, nombres y RUT del apoderado; teléfono de contacto, correo de contacto, domicilio y comuna.
- El curso se expresa mediante el nombre de la hoja. No hay una columna de año escolar ni de sección.
- Hay filas de numeración o espacios sin datos de estudiante. No deben convertirse en alumnos ni contarse como registros.

## Relación con el importador actual

La revisión inicial encontró que el importador de `Usuarios` no reconocía esta estructura. La adaptación ya admite las hojas por curso y las etiquetas como `Nombres (Estudiante)`, permite ajustar columnas y no usa el fallback que omitía el resto del libro. Se comprobó con un XLSX completamente ficticio de catorce hojas, no con una carga del padrón real.

| Columna de referencia | Destino previsto |
| --- | --- |
| Apellido Paterno (Estudiante) | `surname` |
| Apellido Materno (Estudiante) | `secondSurname` |
| Nombres (Estudiante) | `names` |
| RUT (Estudiante) | Identificador RUN sujeto a validación; un documento no válido exige revisión, sin asignarle otro tipo automáticamente |
| Nombres y apellidos del apoderado | `guardianName`, conservando las partes de origen para revisión |
| RUT (Apoderado) | `guardianIdentifier` con revisión de formato |
| Contacto (Teléfono) y Contacto (Email) | Elegir titularidad; sin elección, conservar como contacto de origen |
| DOMICILIO | Elegir titularidad; sin elección, conservar como domicilio de origen |
| COMUNA | Comuna del estudiante o apoderado según la titularidad elegida; siempre conservar la de origen |
| Nombre de hoja | Curso propuesto para el año elegido y confirmado por quien importa |
| Numeración | Referencia de fila; nunca identificador del estudiante |

## Comportamiento comprobado con datos ficticios

1. Leer todas las hojas compatibles y mostrar el conteo por hoja, incluidas las excluidas y sus motivos. Rechazar mezclas ambiguas de formatos en lugar de omitirlas silenciosamente.
2. Resolver por encabezados normalizados, sin asumir posiciones fijas. Confirmar año, curso y sección cuando corresponda, sin inventar una sección A.
3. Conservar hoja y fila de origen, ignorar filas sin datos de alumno y validar duplicados dentro del libro y frente a la base.
4. Mostrar errores de identidad y coincidencias para revisión humana; no fusionar por nombre ni sobrescribir alumnos existentes automáticamente.
5. Previsualizar el lote completo antes de confirmar. Mantener la transacción y las comprobaciones de permisos del servidor.
6. Probar con un fixture completamente ficticio: hojas con y sin numeración, niveles de párvulos, variantes de nombre de hoja, filas vacías, curso sin resolver, RUT inválido y duplicado entre dos hojas. No convertir el archivo real en fixture.

Este padrón sirve para iniciar las fichas con identidad y contacto. No contiene la ficha completa, sus documentos ni sus autorizaciones. El destino operativo sigue siendo el servidor del Colegio Domingo Santa María; una integración con la aplicación escolar queda para una decisión posterior.

## Resolver observaciones antes de guardar

La vista previa distingue las filas detectadas, las que aparecen en la lista de revisión y las que quedaron fuera. Los cursos pendientes se muestran agrupados por destino, con la cantidad de filas por curso. Usa **Revisar hojas y cursos** para asignar un curso existente o, si corresponde, autorizar la creación de los cursos pendientes cuando se pueda confirmar la carga. El nombre de una hoja no acredita la sección.

El filtro **Tipo de observación** permite revisar posibles IPE, otras identificaciones y duplicados sin quitar el bloqueo del lote. Puedes descargar un informe de observaciones de todo el lote para revisión interna, con ubicación por hoja y fila. Las hojas están numeradas en el orden de **Hojas y cursos**.

Si el registro oficial confirma un IPE, marca **Confirmé que es un IPE** en esa fila y pulsa **Volver a previsualizar**. Puedes desmarcarlo en **IPE declarados en la revisión** y revisar nuevamente. Esto conserva el identificador, se aplica al archivo y la configuración de origen revisados y no guarda fichas hasta confirmar la carga. También se admite una columna `Tipo de documento` con `IPE` explícito. Las demás identificaciones y los duplicados se resuelven contra el registro oficial; no se modifica el dígito ni se elige una fila por su orden. Verifica el año y los cursos antes de guardar.
