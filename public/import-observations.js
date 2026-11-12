(() => {
  const rows = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
  const yearOf = value => Number.isInteger(value) && value >= 1950 && value <= 2100 ? value : null;
  const rowOf = value => Number.isInteger(value) && value >= 1 && value <= 1048576 ? value : null;
  const labels = Object.freeze({
    NOMBRES_AUSENTES: 'Falta el nombre del estudiante.',
    APELLIDO_AUSENTE: 'Falta el apellido paterno del estudiante.',
    IDENTITY_FIELD_REQUIRED: 'Falta un campo de identificación obligatorio.',
    IDENTIDAD_AUSENTE: 'Falta la identificación del estudiante.',
    IDENTIFIER_REQUIRED: 'Falta la identificación del estudiante.',
    IDENTIFIER_TYPE_INVALID: 'Revisar el tipo de documento indicado.',
    IPE_CONFIRMATION_INVALID: 'Volver a previsualizar y revisar las confirmaciones de IPE.',
    IDENTIFICADOR_LARGO: 'Revisar la columna asignada a la identificación.',
    RUT_INVALIDO: 'Revisar la identificación en el registro oficial.',
    RUN_INVALID: 'Verificar el RUN completo en el registro oficial.',
    DUPLICADO_IDENTIDAD: 'Identificación repetida. Comparar ambas filas antes de corregir.',
    FECHA_INVALIDA: 'Revisar la fecha de nacimiento.',
    DATE_INVALID: 'Revisar la fecha de nacimiento.',
    CURSO_AMBIGUO: 'Elegir explícitamente el curso de destino.',
    CURSO_AUSENTE: 'Asignar el curso de destino.',
    COURSE_MAPPING_INVALID: 'Revisar la asignación del curso.',
    COURSE_PERMISSION_DENIED: 'La cuenta necesita permiso para editar el curso de destino.',
    IMPORT_YEAR_INVALID: 'Revisar el año de matrícula indicado en la planilla.',
    IMPORT_YEARS_MIXED: 'Separar las filas de distintos años de matrícula.',
    HOJA_NO_RECONOCIDA: 'Asignar las columnas de esta hoja o excluirla de la revisión.',
    ENCABEZADO_DUPLICADO: 'Distinguir las columnas con el mismo encabezado.',
    ENCABEZADO_NO_EXISTE: 'Verificar el nombre de la columna asignada.',
    MAPEO_INVALIDO: 'Revisar la asignación de hojas y columnas.',
    MAPEO_COLUMNA_INVALIDO: 'Revisar el encabezado asignado a la columna.',
    MAPEO_HOJA_INVALIDO: 'Revisar la configuración de esta hoja.',
    MAPEO_ADMINISTRATIVO_INCOMPLETO: 'Completar las columnas de nombre, apellido e identificación.',
    FORMATOS_MEZCLADOS: 'Seleccionar un solo tipo de padrón.',
    TITULAR_INVALIDO: 'Revisar a quién corresponden los contactos y el domicilio.',
    LIMITE_FILAS: 'Reducir la cantidad de filas por revisión.',
    IMPORT_TEMPLATE_SOURCE_FIELDS_MISSING: 'Preparar los campos de importación de la plantilla.',
    LIBRO_VACIO: 'El libro no contiene hojas reconocibles.',
    FILAS_AUSENTES: 'La selección no contiene filas de estudiantes.'
  });
  const identityLabels = Object.freeze({
    possibleIpe: 'Posible IPE. Confirmar el tipo en el registro oficial y conservar el número original.',
    checkDigit: 'El dígito verificador no coincide. Verificar el RUN completo en el registro oficial.',
    format: 'El formato de la identificación requiere revisión.',
    unknownDocumentType: 'El tipo de documento indicado no se reconoce.'
  });

  // Workbook tab titles and proposed course names are untrusted text. Print
  // ordinals and canonical school levels only; never copy arbitrary labels.
  function canonicalLevel(value) {
    if (typeof value !== 'string' || value.length > 80) return '';
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const early = /^(PRE[ -]?)?KINDER(?: +([A-Z]))?$/.exec(normalized);
    if (early) return (early[1] ? 'Prekínder' : 'Kínder') + (early[2] ? ' ' + early[2] : '');
    const grade = /^([1-8])\s*[°º]? +(?:BASICO|MEDIO)(?: +([A-Z]))?$/.exec(normalized);
    if (!grade) return '';
    const middle = /\bMEDIO\b/.test(normalized);
    if (middle && Number(grade[1]) > 4) return '';
    return grade[1] + '° ' + (middle ? 'Medio' : 'Básico') + (grade[2] ? ' ' + grade[2] : '');
  }
  function rowRanges(values) {
    const sorted = [...new Set(values.filter(value => rowOf(value) !== null))].sort((a,b) => a-b), ranges = [];
    for (let i=0; i<sorted.length; i++) {
      const first=sorted[i];
      while (sorted[i+1] === sorted[i]+1) i++;
      ranges.push(first === sorted[i] ? String(first) : first + '–' + sorted[i]);
    }
    return ranges.join(', ');
  }
  function issueLabel(issue) {
    if (issue.code === 'RUT_INVALIDO' && typeof issue.reason === 'string' && Object.hasOwn(identityLabels, issue.reason)) return identityLabels[issue.reason];
    return typeof issue.code === 'string' && Object.hasOwn(labels, issue.code) ? labels[issue.code] : 'Otra observación. Consultar la vista previa.';
  }

  function hasDiagnostics(preview) {
    return rows(preview?.errors).length > 0 || rows(preview?.coursesToCreate).length > 0;
  }
  function format(preview) {
    if (!hasDiagnostics(preview)) return '';
    const errors=rows(preview.errors), courses=rows(preview.coursesToCreate), sheetOrder=new Map();
    rows(preview.sheetSummaries).forEach((sheet,index) => {
      if (typeof sheet.name === 'string' && !sheetOrder.has(sheet.name)) sheetOrder.set(sheet.name,index+1);
    });
    const sheetLabel = name => {
      if (!sheetOrder.has(name)) return 'Hoja sin número';
      const level=canonicalLevel(name);
      return 'Hoja ' + sheetOrder.get(name) + (level ? ' (' + level + ')' : '');
    };
    const locate = (sheet,row) => {
      const number = rowOf(row);
      return [sheet ? sheetLabel(sheet) : '', number ? 'fila ' + number : ''].filter(Boolean).join(', ') || 'Revisión general';
    };
    const lines = ['Observaciones de importación de matrícula', 'Uso interno del colegio. La descarga no confirma ni guarda la importación.'];
    const year=yearOf(preview.year);
    if (year) lines.push('Año de destino: ' + year + '.');
    if (sheetOrder.size) lines.push('La numeración sigue el orden de Hojas y cursos en la vista previa.');

    const blockers=errors.filter(error=>error.code!=='CURSO_NO_RESUELTO');
    if (blockers.length) {
      lines.push('', 'Observaciones por resolver: ' + blockers.length);
      for (const issue of blockers) {
        const firstRow=rowOf(issue.firstRow);
        const previous=issue.code==='DUPLICADO_IDENTIDAD' && (issue.firstSheet || firstRow) ? ' Primera aparición: ' + locate(issue.firstSheet,firstRow) + '.' : '';
        lines.push('- ' + locate(issue.sheet,issue.row) + ': ' + issueLabel(issue) + previous);
      }
    }

    const pending=errors.filter(issue=>issue.code==='CURSO_NO_RESUELTO');
    if (pending.length) {
      const groups=new Map();
      for (const issue of pending) {
        const label=issue.sheet?sheetLabel(issue.sheet):'Sin hoja indicada';
        if (!groups.has(label)) groups.set(label,[]);
        groups.get(label).push(rowOf(issue.row));
      }
      lines.push('', 'Filas que necesitan curso de destino: ' + pending.length);
      for (const [label,numbers] of groups) {
        const known=rowRanges(numbers), unknown=numbers.filter(number=>number===null).length;
        lines.push('- ' + label + ': ' + [known ? 'filas ' + known : '', unknown ? unknown + ' sin número de fila' : ''].filter(Boolean).join('; ') + '.');
      }
    }
    if (courses.length) {
      lines.push('', 'Cursos propuestos para revisión: ' + courses.length);
      courses.forEach((course,index) => {
        const level=canonicalLevel(course.name), count=Number.isInteger(course.count) && course.count>=1 && course.count<=1048576 ? course.count : null;
        lines.push('- Propuesta ' + (index+1) + (level ? ' (' + level + ')' : '') + (count ? ': ' + count + (count===1 ? ' fila' : ' filas') : '') + '.');
      });
    }
    return lines.join('\r\n') + '\r\n';
  }

  function download(preview) {
    const report=format(preview);
    if (!report) return false;
    const year=yearOf(preview.year), url=URL.createObjectURL(new Blob(['\uFEFF',report],{type:'text/plain;charset=utf-8'})), link=document.createElement('a');
    link.href=url;link.download='observaciones-matricula'+(year ? '-'+year : '')+'.txt';
    document.body.append(link);
    try { link.click(); }
    finally { link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
    return true;
  }
  window.EnrollmentImportObservations=Object.freeze({hasDiagnostics,format,download});
})();
