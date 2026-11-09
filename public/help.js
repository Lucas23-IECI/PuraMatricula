const enrollmentHelpTopics={
  "password": [
    [
      "Elige tu contraseña personal",
      "La contraseña temporal solo permite completar este paso. Escribe tu clave actual y confirma una nueva de entre 12 y 200 caracteres. El ojo permite comprobar lo escrito."
    ],
    [
      "Ingresa nuevamente",
      "Guardar cierra todas las sesiones de tu cuenta. Vuelve a entrar con la contraseña nueva. Si olvidaste la actual, solicita un restablecimiento a Administración."
    ]
  ],
  "home": [
    ["Elige tu área de trabajo", "Pulsa en cualquier parte de un panel para abrir su área. Con teclado, enfócalo con Tab y pulsa Enter. Al pasar el mouse puedes anticipar el área por su color. Estudiantes reúne el ingreso y la búsqueda; Seguimiento permite continuar borradores, revisar pendientes y ver estadísticas. Cada área muestra las tareas disponibles para tus permisos."],
    ["Tu cuenta y el regreso al inicio", "Mi cuenta reúne tu contraseña, el tema y Salir. Ayuda permanece a su lado. Dentro de los módulos puedes buscar, cambiar el año escolar y consultar datos. Pulsa el escudo del liceo para regresar al inicio; si estás editando, la app te pide guardar los cambios antes de salir."]
  ],
  "students": [
    ["Encuentra a un estudiante", "Escribe el nombre, apellido o identificación y pulsa Buscar. Se abrirá Expedientes con tu búsqueda aplicada, dentro del año y los cursos autorizados para tu cuenta."],
    ["Elige una tarea de estudiantes", "Estos accesos reúnen las tareas de matrícula disponibles para tu cuenta. Puedes iniciar una ficha o entrar a Expedientes para buscar y continuar el trabajo sobre un alumno autorizado."],
    ["Organiza tu espacio de trabajo", "Usa los controles del panel lateral para abrir la navegación o compactarla. Dentro de cada módulo conserva sus filtros y páginas; el escudo del liceo permite regresar al inicio."]
  ],
  "followup": [
    ["Continúa el trabajo del año", "Desde estos accesos puedes continuar borradores, revisar antecedentes pendientes y consultar estadísticas. Las cifras y listas de cada módulo se limitan a tus cursos y permisos."],
    ["Recorre las herramientas", "El panel lateral permite cambiar de módulo. Puedes abrirlo o compactarlo con sus controles, y volver a esta pantalla o al inicio mediante la navegación disponible."]
  ],
  "organization": [
    ["Prepara la organización de matrícula", "Elige la herramienta que necesitas: cursos y años, revisión de una planilla de alumnos o plantillas de la ficha. Solo aparecen los accesos autorizados para tu cuenta."],
    ["Ajusta la navegación", "Los controles del panel lateral permiten abrirlo o compactarlo para dejar más espacio al trabajo. El escudo del liceo regresa al inicio; cada módulo mantiene sus propios controles y páginas."]
  ],
  "administration": [
    ["Elige una tarea de administración", "Desde estos accesos puedes gestionar cuentas, consultar la actividad o preparar respaldos, según tus permisos. Entrar a una herramienta no realiza cambios por sí solo."],
    ["Mantén a mano tus herramientas", "Usa los controles del panel lateral para abrir o compactar la navegación. La ayuda de cada módulo explica sus acciones; el escudo del liceo permite regresar al inicio."]
  ],
  "homeEmpty": [
    ["Tu cuenta necesita accesos", "Tu cuenta todavía no tiene áreas de trabajo asignadas. Contacta con Administración para solicitar los accesos que necesitas. Mientras tanto, puedes usar Ayuda y abrir Mi cuenta para cambiar tu contraseña o salir."]
  ],
  "login": [
    [
      "Ingresa con tu cuenta",
      "Usa el usuario individual que te entregó Administración. Puedes mostrar u ocultar la contraseña con el ojo. Recordar mi usuario es opcional y dura 30 días en este navegador; no guarda la clave."
    ],
    [
      "Si no puedes entrar",
      "Revisa usuario y contraseña. Si olvidaste la clave o la cuenta está inactiva, contacta con Administración. Una clave temporal debe cambiarse antes de abrir los módulos."
    ]
  ],
  "records": [
    [
      "Elige el año escolar",
      "El selector superior cambia el año. Filtra por curso y estado, o busca por nombre o identificación. Recorre la lista con los números o Anterior/Siguiente; Por página cambia cuántos alumnos se muestran."
    ],
    [
      "Abre un expediente",
      "Selecciona el nombre del estudiante para consultar su ficha, documentos e historial. Solo aparecen tus cursos autorizados."
    ],
    [
      "Ingresa un alumno",
      "Nueva matrícula crea un borrador. Busca antes al estudiante para evitar duplicados.",
      "write"
    ],
    [
      "Descarga la selección",
      "Exportar lista ofrece Excel o CSV con los filtros actuales y todas sus páginas. Exportar curso requiere elegir un curso y descarga su CSV. Las nóminas omiten antecedentes reservados.",
      "export"
    ]
  ],
  "record": [
    [
      "Revisa la ficha",
      "Abre sus secciones desplegables. Los datos reservados solo aparecen con autorización. Documentos e Historial corresponden a este estudiante y año."
    ],
    [
      "Guarda tus cambios",
      "Pulsa Editar ficha para habilitar los campos y Guardar cambios para registrar una revisión. Cancelar edición descarta lo que aún no guardaste. Si falla la conexión, conserva la pestaña y vuelve a intentar.",
      "edit-record"
    ],
    [
      "Gestiona la matrícula",
      "Puedes confirmar un borrador, cambiar curso o registrar retiro con fecha y motivo. Preparar otro año crea un borrador separado y reinicia autorizaciones y documentos.",
      "enroll"
    ],
    [
      "Revisa los pendientes",
      "Los avisos señalan antecedentes por revisar. Una autorización pendiente o un antecedente de apoyo no impide confirmar la matrícula."
    ],
    [
      "Descarga un documento",
      "El PDF utiliza la revisión guardada. Más descargas permite Word, PDF y revisiones anteriores; la constancia requiere matrícula confirmada y revisión vigente.",
      "export"
    ]
  ],
  "withdrawn": [
    [
      "Expediente retirado",
      "Se conservan ficha, documentos e historial para consulta. La edición y la carga de archivos están deshabilitadas mientras siga retirada."
    ],
    [
      "Registra un reingreso",
      "Registrar reingreso pide curso, fecha y motivo. En el mismo año reabre la matrícula; en uno posterior crea un borrador. El retiro siempre se conserva.",
      "enroll"
    ],
    [
      "Consulta la historia",
      "Historial permite consultar el retiro y las versiones anteriores. Una matrícula retirada no emite constancia de matrícula vigente."
    ]
  ],
  "conflict": [
    [
      "Conserva tus cambios",
      "Otra persona guardó una revisión nueva. El formulario conserva tus cambios. Revisa la última versión antes de volver a editar."
    ],
    [
      "Compara antes de recargar",
      "Guardar copia de mis cambios descarga un JSON con tu texto; guárdalo solo en una ubicación autorizada. Recargar versión guardada reemplaza el formulario. Después de comparar, vuelve a introducir los cambios pertinentes."
    ]
  ],
  "documents": [
    [
      "Revisa los documentos",
      "Cada archivo corresponde a este expediente y año. Recorre sus páginas con los números o Anterior/Siguiente y ajusta la cantidad con Por página. Descargar requiere acceso al curso y permiso de documentos; los reservados tienen un permiso adicional."
    ],
    [
      "Adjunta un respaldo",
      "Elige tipo y archivo PDF, PNG o JPEG. El máximo se indica en pantalla. Guardar añade una versión y conserva los archivos anteriores; comprueba su aparición en la lista.",
      "upload-record"
    ],
    [
      "Consulta sin modificar",
      "Si no aparece el formulario de carga, faltan permisos de edición y documentos o la matrícula está retirada. Eso no elimina los archivos conservados."
    ]
  ],
  "history": [
    [
      "Consulta el historial",
      "Los movimientos muestran altas, matrícula, traslados, retiro, reingreso y documentos. Las revisiones son las versiones guardadas. Ambas listas tienen páginas independientes, con números, Anterior/Siguiente y cantidad por página."
    ],
    [
      "Abre una revisión",
      "Consultar abre una copia histórica sin restaurar ni reemplazar la ficha vigente. Sus datos visibles siguen sujetos a tus permisos."
    ]
  ],
  "reports": [
    [
      "Selecciona el alcance",
      "Elige año, curso, estado, búsqueda y pendientes; pulsa Aplicar filtros. Solo se cuentan expedientes de tus cursos autorizados."
    ],
    [
      "Abre la lista que explica la cifra",
      "Pulsa una cifra o curso para ver sus expedientes. Las tablas de cursos y alumnos tienen páginas independientes: usa los números, Anterior/Siguiente o Por página. Ocultar lista vuelve al resumen. Cada estudiante cuenta una vez por año; los movimientos se cuentan aparte."
    ],
    [
      "Interpreta las cifras",
      "El informe refleja el estado actual al generarlo, sin reconstruir una fecha histórica. Una búsqueda también reduce los totales. Cambia y aplica los filtros para consultar otro alcance."
    ],
    [
      "Descarga el informe",
      "Informe PDF e Informe Excel descargan el resumen filtrado. Exportar nómina incluye la selección completa, no solo la página visible, en Excel o CSV. Excel puede organizar una hoja por curso. Máximo 10.000 expedientes por reporte.",
      "export"
    ]
  ],
  "pending": [
    [
      "Revisa el trabajo pendiente",
      "Filtra por año, curso, estado o estudiante y pulsa Aplicar filtros. Se señalan contactos, decisiones y documentos por revisar."
    ],
    [
      "Continúa en el expediente",
      "Pulsa el nombre para revisar o completar datos. Usa los números o Anterior/Siguiente para recorrer alumnos y Por página para ajustar la cantidad visible. Los pendientes no convierten un dato opcional en requisito para matricular."
    ],
    [
      "Descarga la selección",
      "Exportar nómina mantiene los filtros de esta bandeja y descarga columnas administrativas de tus cursos autorizados.",
      "export"
    ]
  ],
  "courses": [
    [
      "Organiza los cursos por año",
      "Agregar curso pide año y nombre. Revisa el listado paginado para evitar duplicados: puedes elegir una página y su cantidad de cursos. Consulta otros años con el selector superior.",
      "enroll"
    ],
    [
      "Prepara otro año",
      "Preparar cursos del siguiente año copia su estructura sin trasladar ni matricular estudiantes. Debe asignarse acceso explícito a los cursos nuevos.",
      "enroll"
    ]
  ],
  "users": [
    [
      "Crea una cuenta individual",
      "Nueva cuenta pide nombre, usuario y clave temporal. Un perfil sugerido marca permisos ajustables; no asigna cursos por sí solo.",
      "admin"
    ],
    [
      "Revisa el acceso",
      "Recorre las cuentas con los números o Anterior/Siguiente; Por página cambia la cantidad visible. Configurar permite cambiar permisos, cursos y estado. Todos los cursos concede alcance completo; de lo contrario, selecciona cada curso y año. Limita el acceso reservado a quienes lo necesiten.",
      "admin"
    ],
    [
      "Recupera o retira acceso",
      "Una clave nueva o restablecida debe cambiarse al ingresar. Modificar el acceso invalida sesiones. Siempre debe quedar una administración activa. No compartas cuentas.",
      "admin"
    ]
  ],
  "templates": [
    [
      "Prepara una versión",
      "Escribe un nombre, añade o edita preguntas adicionales y cambia su orden con las flechas. Las versiones y preguntas tienen páginas independientes, con números y cantidad por página. La ficha base y los campos de origen están protegidos.",
      "admin"
    ],
    [
      "Oculta sin borrar",
      "Ocultar retira una pregunta de la nueva versión y conserva las respuestas históricas. Una pregunta reservada no puede perder esa reserva.",
      "admin"
    ],
    [
      "Revisa antes de publicar",
      "Previsualizar versión muestra las preguntas. Descargar vista previa PDF permite revisar una muestra vacía. Si cambias el borrador, debes previsualizar de nuevo antes de Publicar versión.",
      "admin"
    ],
    [
      "Conserva las fichas anteriores",
      "Publicar aplica a fichas nuevas. Las anteriores mantienen su plantilla hasta Actualizar plantilla de esta ficha. El borrador sin publicar se pierde al cerrar o recargar la pestaña.",
      "admin"
    ]
  ],
  "import": [
    [
      "Selecciona el año y el archivo",
      "Admite Excel .xlsx del ERP o con hojas por curso y JSON de altas. Máximo 500 estudiantes y 2 MB por lote. Previsualizar no guarda matrículas.",
      "import"
    ],
    [
      "Revisa hojas y columnas",
      "Incluye o excluye hojas, indica encabezados, revisa cursos y asigna a quién pertenecen contactos y domicilios. Cambiar el mapeo exige previsualizar otra vez.",
      "import"
    ],
    [
      "Entiende los resultados",
      "Revisa todas las páginas de la previsualización usando los números, Anterior/Siguiente y Por página. Nueva ficha crea un borrador; Coincide y Revisión manual se omiten. Revisa las diferencias manuales en el expediente. Cambios de contacto permite seleccionar actualizaciones.",
      "import"
    ],
    [
      "Confirma solo lo revisado",
      "Marca cada actualización que quieras aplicar. Las celdas vacías no borran datos; identidad y curso no cambian automáticamente. Los cursos nuevos requieren confirmación y permiso. Ante cambios concurrentes, vuelve a previsualizar.",
      "import"
    ]
  ],
  "audit": [
    [
      "Consulta la actividad",
      "Se muestra quién actuó, cuándo y sobre qué expediente. Los números y Anterior/Siguiente recorren páginas de 50 eventos. No contiene contraseñas ni valores de antecedentes reservados.",
      "audit"
    ],
    [
      "Comprueba la integridad",
      "La pantalla informa la comprobación de la cadena de auditoría. Si detecta un problema, avisa a Administración y conserva la evidencia. No permite editar o borrar eventos.",
      "audit"
    ]
  ],
  "backup": [
    [
      "Descarga una copia cifrada",
      "Elige una clave independiente de entre 16 y 200 caracteres. Incluye base, historial, clave de almacenamiento y adjuntos. Requiere respaldo, datos reservados y todos los cursos.",
      "backup"
    ],
    [
      "Custodia archivo y clave",
      "Guarda el archivo en una ubicación institucional autorizada y la clave por separado. La aplicación no puede recuperar una clave de respaldo olvidada.",
      "backup"
    ],
    [
      "Verifica la recuperación",
      "La herramienta local restaura en una carpeta nueva; no reemplaces una base activa. Comprueba datos y adjuntos antes de aceptar la copia. Las sesiones restauradas se invalidan.",
      "backup"
    ]
  ],
  "empty": [
    [
      "Tu cuenta aún no tiene módulos",
      "Iniciaste sesión, pero no tienes permisos para abrir módulos. Solicita a Administración que asigne las acciones y cursos de tu trabajo."
    ],
    [
      "Gestiona tu acceso",
      "Puedes cambiar tu contraseña personal o cerrar sesión. No necesitas crear otra cuenta para que Administración ajuste tus permisos."
    ]
  ],
  "newRecord": [
    [
      "Crea un borrador",
      "Selecciona curso del año actual y registra nombres e identificación. Busca primero al estudiante para evitar otra ficha del mismo año."
    ],
    [
      "Si falta identificación",
      "Provisional crea una referencia temporal para revisar después; no sustituye un RUN o IPE. Crear borrador guarda la ficha y Cancelar cierra sin crearlo."
    ]
  ],
  "transfer": [
    [
      "Cambia el curso del mismo año",
      "Elige otro curso autorizado e indica fecha y motivo administrativo. Guardar cambio de curso registra el movimiento y conserva el historial anterior."
    ]
  ],
  "withdraw": [
    [
      "Registra el retiro",
      "Indica fecha y motivo administrativo. Al confirmar se conserva la ficha retirada para consulta. Más adelante puede registrarse un reingreso; no se elimina al estudiante."
    ]
  ],
  "reenter": [
    [
      "Reabre o prepara otro año",
      "Elige curso y año, fecha y motivo. En el mismo año se reabre la matrícula; en uno posterior se crea un borrador sin copiar autorizaciones ni adjuntos. Se conserva el retiro anterior."
    ]
  ],
  "renew": [
    [
      "Prepara una matrícula anual",
      "Elige un curso de un año posterior. Crear borrador anual crea una ficha separada y conserva el actual. Deben revisarse de nuevo autorizaciones, constancias y documentos."
    ]
  ],
  "upgrade": [
    [
      "Actualiza solo esta ficha",
      "Se utiliza la plantilla vigente y se conservan datos y revisiones anteriores. Las preguntas ocultas dejan de aparecer sin borrar su historia. Cancelar mantiene la plantilla actual."
    ]
  ],
  "courseForm": [
    [
      "Agrega un curso",
      "Revisa año y nombre antes de continuar. Se rechazan nombres equivalentes de otro curso del mismo año. Crear un curso no mueve estudiantes ni concede acceso automáticamente."
    ]
  ],
  "yearForm": [
    ["Consulta un año escolar", "Escribe un año entre 1950 y 2100. Seleccionarlo cambia expedientes, pendientes y estadísticas; no modifica ni traslada estudiantes. Los años que incorporas mediante cursos o importaciones aparecen en el selector."],
    ["Confirma el contexto", "Consultar año abre ese período y elimina los filtros de la búsqueda anterior. Si el año todavía no tiene matrículas, la lista y las cifras estarán vacías. Puedes regresar a cualquier año disponible desde el selector superior."]
  ],
  "accountForm": [
    [
      "Configura una cuenta individual",
      "El perfil sugerido marca permisos ajustables; asigna también cursos y años o el alcance de todos los cursos."
    ],
    [
      "Entrega una clave temporal",
      "Al crear o escribir una clave nueva, el titular debe cambiarla al ingresar. Al editar, deja la clave vacía para conservarla. Cuenta activa permite o retira el ingreso."
    ],
    [
      "Revisa antes de guardar",
      "Los cambios de acceso invalidan sesiones. Tu propia clave se cambia en Cambiar contraseña. Siempre debe quedar una administración activa."
    ]
  ],
  "ownPassword": [
    [
      "Cambia tu clave personal",
      "Escribe la actual y repite una nueva de entre 12 y 200 caracteres, distinta de la anterior. El ojo permite verificar cada campo."
    ],
    [
      "Vuelve a ingresar",
      "Guardar invalida tus sesiones. Ingresa nuevamente con la clave nueva. Cancelar conserva la actual."
    ]
  ],
  "questionForm": [
    [
      "Define la pregunta adicional",
      "Elige texto y tipo de respuesta. Para Opciones, separa las alternativas con comas. Antecedente reservado restringe su acceso."
    ],
    [
      "Revisa la versión completa",
      "Añadir al borrador o Guardar pregunta modifica la versión en preparación, sin publicarla. Una pregunta reservada no puede perder su reserva. Después previsualiza y publica la versión para aplicarla a fichas nuevas."
    ]
  ],
  "rosterDownload": [
    [
      "Elige cómo descargar la nómina",
      "Excel conserva identificadores como texto y puede organizar una hoja por curso; CSV contiene una sola tabla. Se aplican el año y filtros de la pantalla de origen."
    ],
    [
      "Revisa el alcance",
      "Se descargan columnas administrativas, sin datos reservados. Máximo 10.000 expedientes: acota por curso o estado si lo superas. La descarga no modifica fichas."
    ]
  ],
  "recordDownload": [
    [
      "Elige documento y revisión",
      "La ficha admite PDF, Word editable y revisiones anteriores. La constancia solo está disponible con matrícula confirmada y revisión vigente."
    ],
    [
      "Cuida la copia descargada",
      "El documento respeta tus permisos y su descarga se audita. Word no sustituye una copia firmada, que se conserva en Documentos."
    ]
  ],
  "revision": [
    [
      "Consulta una copia histórica",
      "Son los datos de esa revisión, sujetos a tus permisos. Cerrar vuelve al expediente sin restaurar ni sobrescribir la ficha vigente."
    ]
  ],
  "reload": [
    [
      "Conserva lo que necesites comparar",
      "Recargar reemplaza tu formulario por la última revisión del servidor. Para conservar cambios propios, cancela y usa Guardar copia de mis cambios antes de continuar."
    ]
  ],
  "dialog": [
    [
      "Revisa antes de continuar",
      "Este formulario actúa sobre la pantalla que lo abrió. Cancelar o Escape cierra sin enviarlo. Durante el envío espera su resultado para evitar acciones duplicadas."
    ]
  ],
  "unavailable": [
    [
      "Revisa tu acceso",
      "La información disponible depende de tus permisos y del estado de la pantalla. Si no puedes continuar, contacta con Administración."
    ]
  ]
};

const enrollmentDialogTopics={
  "Nueva matrícula": "newRecord",
  "Cambiar curso": "transfer",
  "Registrar retiro": "withdraw",
  "Registrar reingreso": "reenter",
  "Preparar matrícula de otro año": "renew",
  "Actualizar plantilla de esta ficha": "upgrade",
  "Agregar curso": "courseForm",
  "Consultar otro año": "yearForm",
  "Nueva cuenta": "accountForm",
  "Configurar cuenta": "accountForm",
  "Cambiar contraseña": "ownPassword",
  "Añadir pregunta": "questionForm",
  "Editar pregunta": "questionForm",
  "Exportar nómina": "rosterDownload",
  "Descargas de la ficha": "recordDownload",
  "Recargar ficha guardada": "reload"
};
function enrollmentDialogHelpTopic(title){return /^Revisión \d+$/.test(title)?'revision':enrollmentDialogTopics[title]||'dialog';}
function enrollmentHelpTopic(trigger){
  const form=trigger?.closest('#dialog');
  if(form)return form.dataset.helpTopic||'dialog';
  if(state.user?.mustChangePassword)return 'password';
  if(!state.user||!state.meta)return 'login';
  if(state.record){
    if(state.tab!=='ficha')return state.tab;
    return state.conflict?'conflict':state.record.status==='withdrawn'?'withdrawn':'record';
  }
  if(state.view==='home'&&!['read','enroll','import','admin','audit','backup'].some(permission=>can(permission)))return 'homeEmpty';
  return state.view;
}
function enrollmentHelpStepAllowed(condition){
  if(condition==='edit-record')return can('write')&&state.record?.status!=='withdrawn';
  if(condition==='upload-record')return can('documents')&&can('write')&&state.record?.status!=='withdrawn';
  return !condition||can(condition);
}

const helpTargetSelectors={
  home:['.home-index-row','.home-utilities'],
  students:['#area-search','#area-actions .area-task || #area-actions','[data-action="sidebar-toggle"] || [data-action="sidebar-compact"] || .area-heading'],
  followup:['#area-actions .area-task || #area-actions','[data-action="sidebar-toggle"] || [data-action="sidebar-compact"] || .area-heading'],
  organization:['#area-actions .area-task || #area-actions','[data-action="sidebar-toggle"] || [data-action="sidebar-compact"] || .area-heading'],
  administration:['#area-actions .area-task || #area-actions','[data-action="sidebar-toggle"] || [data-action="sidebar-compact"] || .area-heading'],
  homeEmpty:['.home-no-modules h2 || .home-no-modules'],
  login:['#login [name="username"]','#login-password'],
  password:['#required-password input','#required-password button[type="submit"]'],
  records:['#year-select','.student-button || .table-panel','[data-action="new"]','[data-action="export-roster"]'],
  record:['#record-tab .section summary || #record-tab','[data-action="save"] || [data-action="edit-record"]','.record-aside [data-action="enroll"] || .record-aside [data-action="transfer"] || .record-aside','#record-pending','[data-action="record-downloads"] || [data-action="pdf"]'],
  withdrawn:['#record-tab .section summary || #record-tab','[data-action="reenter"]','[data-tab="history"]'],
  conflict:['.callout.error','[data-action="draft-copy"]'],
  documents:['#record-attachments || #record-tab h2','#upload','#record-tab h2'],
  history:['.timeline li || .timeline','[data-action="revision"]'],
  reports:['#report-filters','.report-indicators','.report-movements','[data-report-action="summary"]'],
  pending:['#report-filters','#report-list-title','[data-report-action="roster"]'],
  courses:['#courses-list .stat-line || #courses-list || .two-col','#prepare-year','[data-action="new-course"]'],
  users:['[data-action="new-user"]','[data-action="edit-user"] || .table-panel','[data-action="edit-user"] || .table-panel'],
  templates:['#template-name','[data-template="toggle"] || .file-row','#template-preview:not(:empty) || [data-template="preview"]','.file-row'],
  import:['#import-form [name="file"] || #import-form','#import-config:not(:empty) || #import-form [name="file"]','#import-preview:not(:empty) || #import-form button[type="submit"] || #import-form button','[data-action="commit-import"] || #import-form button[type="submit"] || #import-form button'],
  audit:['.table-panel tbody tr || .table-panel','.callout'],
  backup:['#backup-form','.callout'],
  empty:['.topbar','.sidebar-foot'],
  newRecord:['#dialog [name="names"]','#dialog [name="identifier"]','#dialog [type="submit"]'],
  transfer:['#dialog [name="courseId"]','#dialog [name="reason"]','#dialog [type="submit"]'],
  withdraw:['#dialog [name="reason"]','#dialog [name="date"]','#dialog [type="submit"]'],
  reenter:['#dialog [name="courseId"]','#dialog [name="reason"]','#dialog [type="submit"]'],
  renew:['#dialog [name="courseId"]','#dialog [type="submit"]'],
  upgrade:['#dialog .dialog-heading','#dialog [type="submit"]'],
  courseForm:['#dialog [name="year"]','#dialog [name="name"]','#dialog [type="submit"]'],
  yearForm:['#dialog [name="year"]','#dialog [type="submit"]'],
  accountForm:['#dialog [name="name"]','#dialog [name="username"]','#dialog [name="password"]','#dialog [type="submit"]'],
  ownPassword:['#dialog [name="currentPassword"]','#dialog [name="newPassword"]','#dialog [type="submit"]'],
  questionForm:['#dialog [name="label"]','#dialog [name="type"]','#dialog [name="options"]','#dialog [type="submit"]'],
  rosterDownload:['#dialog [name="format"]','#dialog [name="layout"]','#dialog [type="submit"]'],
  recordDownload:['#dialog [name="kind"]','#dialog [name="format"]','#dialog [type="submit"]'],
  revision:['#dialog .dialog-heading','#dialog [data-action="close-dialog"]'],
  reload:['#dialog .dialog-heading','#dialog [type="submit"]'],
  dialog:['#dialog .dialog-heading','#dialog [type="submit"]'],
  unavailable:['.topbar']
};
let activeHelpTarget=null;
function helpTargetFor(topic,index){
  const selectors=helpTargetSelectors[topic]||helpTargetSelectors.unavailable;
  const preferred=selectors[Math.min(index,selectors.length-1)];
  if(!preferred)return null;
  for(const selector of preferred.split('||').map(value=>value.trim())){
    try{
      for(const target of document.querySelectorAll(selector)){
        const box=target.getBoundingClientRect(),style=window.getComputedStyle(target);
        if(box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden')return target;
      }
    }catch{}
  }
  return null;
}
function clearHelpTarget(){
  if(activeHelpTarget){activeHelpTarget.classList.remove('help-highlight');activeHelpTarget.removeAttribute('data-help-highlight');activeHelpTarget=null;}
}
function highlightHelpTarget(topic,index){
  clearHelpTarget();
  const target=helpTargetFor(topic,index);
  if(!target||target===document.getElementById('help-dialog'))return null;
  activeHelpTarget=target;
  target.classList.add('help-highlight');target.setAttribute('data-help-highlight','true');
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  try{target.scrollIntoView({block:'center',inline:'nearest',behavior:reduced?'auto':'smooth'});}catch{try{target.scrollIntoView({block:'nearest'});}catch{}}
  return target;
}
function helpSpotlightBox(target,panelBox){
  if(!target?.isConnected)return null;
  const box=target.getBoundingClientRect(),padding=6;
  const left=Math.max(0,box.left-panelBox.left-padding),top=Math.max(0,box.top-panelBox.top-padding);
  const right=Math.min(panelBox.width,box.right-panelBox.left+padding),bottom=Math.min(panelBox.height,box.bottom-panelBox.top+padding);
  if(right<=left||bottom<=top)return null;
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
function positionHelpSpotlight(panel){
  if(!panel.open)return;
  const tooltip=panel.querySelector('.help-tooltip'),mask=panel.querySelector('.help-mask'),shade=panel.querySelector('.help-mask-shade'),frame=panel.querySelector('.help-focus-frame');
  if(!tooltip||!mask||!shade||!frame)return;
  const viewport=panel.getBoundingClientRect(),width=viewport.width,height=viewport.height,margin=16,gap=12;
  const box=helpSpotlightBox(activeHelpTarget,viewport),outer=`M0 0H${width}V${height}H0Z`;
  mask.setAttribute('viewBox',`0 0 ${width} ${height}`);
  shade.setAttribute('d',outer+(box?`M${box.left} ${box.top}H${box.right}V${box.bottom}H${box.left}Z`:''));
  frame.setAttribute('visibility',box?'visible':'hidden');
  if(box){frame.setAttribute('x',String(box.left));frame.setAttribute('y',String(box.top));frame.setAttribute('width',String(box.width));frame.setAttribute('height',String(box.height));}
  panel.dataset.spotlight=String(Boolean(box));
  const preferredWidth=Math.min(420,width-margin*2),minimumWidth=Math.min(240,width-margin*2),minimumHeight=Math.min(180,Math.max(100,height*.35));
  const spaces=box?[
    {side:'right',left:box.right+gap,top:margin,width:width-box.right-gap-margin,height:height-margin*2},
    {side:'left',left:margin,top:margin,width:box.left-gap-margin,height:height-margin*2},
    {side:'bottom',left:margin,top:box.bottom+gap,width:width-margin*2,height:height-box.bottom-gap-margin},
    {side:'top',left:margin,top:margin,width:width-margin*2,height:box.top-gap-margin}
  ]:[];
  let best=null;
  for(const space of spaces){
    if(space.width<minimumWidth||space.height<minimumHeight)continue;
    const candidateWidth=Math.min(preferredWidth,space.width);
    tooltip.style.width=candidateWidth+'px';tooltip.style.maxHeight=Math.max(0,height-margin*2)+'px';
    const naturalHeight=tooltip.getBoundingClientRect().height,candidateHeight=Math.min(naturalHeight,space.height);
    const score=(naturalHeight<=space.height?1000000:0)+candidateWidth/preferredWidth*10000+candidateHeight;
    if(best&&score<=best.score)continue;
    const horizontal=space.side==='top'||space.side==='bottom';
    const left=horizontal?Math.max(space.left,Math.min(box.left+box.width/2-candidateWidth/2,space.left+space.width-candidateWidth)):space.left;
    const top=horizontal?(space.side==='top'?box.top-gap-candidateHeight:space.top):Math.max(space.top,Math.min(box.top+box.height/2-candidateHeight/2,space.top+space.height-candidateHeight));
    best={...space,width:candidateWidth,height:candidateHeight,left,top,score};
  }
  if(!best){
    tooltip.style.width=preferredWidth+'px';tooltip.style.maxHeight=Math.max(0,height-margin*2)+'px';
    const cardHeight=tooltip.getBoundingClientRect().height;
    best={side:'center',left:(width-preferredWidth)/2,top:Math.max(margin,(height-cardHeight)/2),width:preferredWidth,height:Math.min(cardHeight,height-margin*2)};
  }
  tooltip.style.width=best.width+'px';tooltip.style.maxHeight=best.height+'px';tooltip.style.left=best.left+'px';tooltip.style.top=best.top+'px';
  tooltip.dataset.placement=best.side;
  const overlap=box?Math.max(0,Math.min(best.left+best.width,box.right)-Math.max(best.left,box.left))*Math.max(0,Math.min(best.top+best.height,box.bottom)-Math.max(best.top,box.top)):0;
  panel.dataset.spotlightOverlap=String(overlap>1);
}
function showEnrollmentHelp(trigger){
  const panel=document.getElementById('help-dialog');
  if(!panel||panel.open)return;
  const topic=enrollmentHelpTopic(trigger);
  panel.dataset.topic=topic;
  const topicSteps=enrollmentHelpTopics[topic]||enrollmentHelpTopics.unavailable;
  const available=topicSteps.filter(step=>enrollmentHelpStepAllowed(step[2]));
  const steps=available.length?available:enrollmentHelpTopics.unavailable;
  let index=0,frameRequest=0,closed=false;
  const schedule=()=>{if(closed||frameRequest)return;frameRequest=requestAnimationFrame(()=>{frameRequest=0;positionHelpSpotlight(panel);});};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  const draw=()=>{
    const [title,description]=steps[index];
    panel.innerHTML=`<svg class="help-mask" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path class="help-mask-shade" fill-rule="evenodd"></path><rect class="help-focus-frame" rx="7" fill="none"></rect></svg><section class="help-tooltip"><header class="help-header"><div><p class="eyebrow">Ayuda de esta pantalla · ${index+1} de ${steps.length}</p><h2 id="help-title" tabindex="-1">${esc(title)}</h2></div><button type="button" class="close-button danger" data-help="close" aria-label="Cerrar ayuda">×</button></header><p id="help-description">${esc(description)}</p><div class="actions"><button type="button" data-help="back" ${index===0?'disabled':''}>Anterior</button><button type="button" class="primary" data-help="next">${index===steps.length-1?'Listo':'Siguiente'}</button></div></section>`;
    const sourceIndex=topicSteps.indexOf(steps[index]),target=highlightHelpTarget(sourceIndex<0?'unavailable':topic,Math.max(0,sourceIndex));
    observer?.disconnect();if(target)observer?.observe(target);observer?.observe(panel.querySelector('.help-tooltip'));
    positionHelpSpotlight(panel);schedule();panel.querySelector('#help-title').focus({preventScroll:true});
  };
  const cleanup=()=>{
    if(closed)return;closed=true;clearHelpTarget();observer?.disconnect();
    if(frameRequest)cancelAnimationFrame(frameRequest);
    document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);
    window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);
    panel.removeAttribute('data-spotlight');panel.removeAttribute('data-spotlight-overlap');
  };
  panel.setAttribute('aria-describedby','help-description');
  panel.onkeydown=event=>{
    if(event.key!=='Tab')return;
    const controls=[...panel.querySelectorAll('.help-tooltip button:not([disabled]),.help-tooltip [href],.help-tooltip input:not([disabled]),.help-tooltip [tabindex]:not([tabindex="-1"])')];
    if(!controls.length)return;
    const active=document.activeElement,first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
  };
  panel.onclick=event=>{const action=event.target.closest('[data-help]')?.dataset.help;if(action==='close'||(action==='next'&&index===steps.length-1)){cleanup();panel.close();}else if(action==='back'&&index>0){index--;draw();}else if(action==='next'){index++;draw();}};
  panel.oncancel=cleanup;
  panel.onclose=()=>{cleanup();if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  try{panel.showModal();draw();}catch(error){cleanup();throw error;}
}
