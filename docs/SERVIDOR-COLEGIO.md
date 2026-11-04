# PuraMatricula en el servidor del colegio

El destino operativo es el servidor del Colegio Domingo Santa María. PuraMatricula funcionará inicialmente como aplicación independiente. Vercel y Supabase son el piloto con datos ficticios. La integración en la aplicación del colegio es una decisión futura.

## Primera instalación de prueba

1. Verificar sistema operativo, versión de Node, puerto disponible, dirección interna, HTTPS y quién administra el servidor. Usar una instancia de Matrícula independiente, sin modificar el servicio de asistencia.
2. Configurar una cuenta de servicio y un directorio de datos exclusivo, fuera del repositorio y de carpetas sincronizadas. El modo local usa SQLite en disco del servidor. Probar el arranque automático y la recuperación después de reiniciar.
3. Usar una base normal de prueba con cuentas individuales y un padrón ficticio. La demo local está limitada a localhost; no exponerla en la red del colegio.
4. Desde un computador de Secretaría, verificar acceso por HTTPS, importación Excel, ficha, guardado y reapertura, permisos por curso, PDF y adjuntos. Probar alta, renovación, traslado y retiro. Anotar las decisiones pendientes sobre reingreso y campos reservados.
5. Restaurar un respaldo en una carpeta vacía y comprobar fichas, historial y adjuntos. Acordar quién hace y custodia las copias. Solo después de aceptar el piloto, autorizar y programar una primera carga real acotada.

## Integración opcional

Empezar en lectura con datos ficticios, enlazando la ficha por ID interno de alumno y curso. El sistema del colegio conserva el padrón, el catálogo y la matrícula vigente; PuraMatricula conserva ficha anual, versiones, documentos y autorizaciones. El sistema escolar maneja vigencia de matrícula; el vínculo con el año de la ficha requiere una regla explícita. Antes de habilitar escritura, definir permisos por curso y acceso reservado, sesión, auditoría y reconciliación de identificadores. No unir alumnos por nombre ni copiar migraciones entre aplicaciones.
