import { writeFileSync } from 'node:fs';
import { baseFields,displayLabel,sections } from '../src/fields.mjs';
const groups={
  identificacion:['Identificar y contactar al estudiante','[A], [B]; protección de datos [C]','Solo nombre/apellido e identificación o estado provisional para borrador interno; no equivale a requisito legal'],
  contactos:['Avisar en emergencia','Finalidad escolar específica a documentar, [C]','Seguimiento recomendado, no bloqueo de matrícula'],
  padres:['Vínculo y contactos de la familia','Finalidad y necesidad a justificar, [C]','Opcional; no exigir datos de un progenitor ausente'],
  apoderados:['Identificar apoderado/tutor y contacto autorizado','[A], [B] para identificación; otros datos sujetos a [C]','Identificación documental según proceso SAE; demás campos no bloquean'],
  matricula:['Registro administrativo anual','Finalidad administrativa escolar; verificar reglas SIGE por separado','Año/curso y estados internos; notas, repitencia, pagos no condicionan'],
  constancias:['Dejar constancia de información institucional entregada','Textos PEI/reglamentos por validar; [C]','No condiciona confirmación en esta versión'],
  autorizaciones:['Decisión independiente de familia por año y finalidad','Religión [E]; difusión [C]; salidas [F]','No obligar una decisión afirmativa; fecha/responsable/versión cuando se registra decisión'],
  documentos:['Constancia de documentos recibidos','[A], [B]; personalidad no es requisito [A]','Documento identificatorio según proceso; otros nunca condicionan'],
  reservados:['Antecedente pertinente para apoyo autorizado','Necesidad, proporcionalidad y fundamento específico pendientes, [C]','Opcional; no convertir en requisito de matrícula'],
  social:['Apoyo social separado del trámite de matrícula','[A] prohíbe solicitar socioeconómicos durante matrícula SAE; posible apoyo posterior requiere fundamento propio [C]','No solicitar durante matrícula SAE; no es requisito'],
  salud:['Atención y apoyo pertinente','Fundamento y necesidad de cada antecedente por validar; dato sensible [C]','Opcional y limitado a lo necesario'],
  judicial:['Resguardo de medidas documentadas','Resolución/medida vigente y finalidad de protección; [C]','Solo pertinente y documentado; no selección o exclusión automática'],
  retiro:['Constancia de entrega documental y retiro','Registro administrativo y finalidad documentada; [C]','Motivo/fecha en movimiento; otros campos opcionales']
};
const intro=`# Ficha y revisión normativa inicial

Revisión: 5 de octubre de 2026. Se leyó el contenido íntegro del Word mediante OOXML (párrafos y tablas; otros componentes de texto cuando existen). La presentación del Word no se ha validado visualmente. La extracción privada permanece en .local y la fuente original fuera de Git. El PDF digital es una composición nueva, no una reproducción visual aprobada del Word.

El archivo mezcla ficha general, antecedentes reservados, encuesta de religión, publicaciones, salidas y retiro. Los cuatro espacios anuales del papel pasan a expedientes por año; los años 2026–2029 del documento no se fijan en código. Edad al 30/03 se calcula según año y nacimiento. Nombre/curso/fecha de cada autorización provienen del expediente correspondiente, sin duplicar su entrada manual. El retiro conserva motivo, fecha, apoderado, funcionario, documentos y firmas.

## Fuentes oficiales verificadas

- [A] [Ayuda Mineduc matrícula SAE](https://www.ayudamineduc.cl/node/9392230): identifica documentación del estudiante/apoderado; durante matrícula SAE no se pueden solicitar antecedentes socioeconómicos ni certificado de conducta y el pago no puede condicionar el trámite. Tampoco se automatiza rechazo por notas o repitencia.
- [B] [SAE preguntas frecuentes](https://www.sistemadeadmisionescolar.cl/preguntas_frecuentes.html): información del proceso y documentos identificatorios. La aplicación interna no asigna cupos SAE ni reemplaza la nómina oficial/SIGE.
- [C] [Ley 19.628, versión vigente anterior a la reforma](https://www.bcn.cl/leychile/navegar?idNorma=141599&idVersion=2023-05-09): tratamiento de datos personales y sensibles. La base jurídica concreta depende del sostenedor, finalidad y situación; no se presume consentimiento universal por una firma de matrícula.
- [D] [Ley 21.719, BCN](https://www.bcn.cl/leychile/navegar?idNorma=1209272): reforma principal con entrada en vigencia el 1 de diciembre de 2026. No se presenta como plenamente vigente el 5 de octubre. Debe revisarse la transición antes del uso del proceso 2027.
- [E] [Decreto 924, artículo 3](https://www.bcn.cl/leychile/navegar?idNorma=16238): clases de religión optativas. La cláusula del Word que impide retirarse durante el año queda pendiente de revisión; no hay bloqueo automático ni selección afirmativa por defecto.
- [F] [Mineduc salidas pedagógicas](https://www.mineduc.cl/regulaciones-sobre-salidas-pedagogicas-y-giras-de-estudio/): autorización escrita y resguardos propios de cada actividad. La decisión anual de la ficha no habilita automáticamente una salida.

El rótulo de salidas se corrige a autorización de salidas, separado de difusión. Los textos del PDF son propuestas administrativas y requieren aprobación institucional. No son una afirmación de cumplimiento integral. No se implementa conservación ilimitada como política aprobada: se preserva el historial técnico mientras se define una tabla de retención por finalidad, exigencias y responsabilidades.

## Mapa de campos

Acceso: R = lectura/edición según permiso y curso; S = además permiso de antecedentes reservados. Adjuntos requieren permiso documental; PDF/exportación requieren permiso de exportación. La copia firmada completa siempre es S. Un profesor puede editar su curso sin recibir el expediente reservado. Conservación P = plazo institucional pendiente; revisiones cifradas sin borrado desde la interfaz hasta definir política. No hay un plazo legal genérico inventado.

| Campo | Sección | Finalidad | Fundamento o revisión | Obligatoriedad | Acceso | Conservación |
| --- | --- | --- | --- | --- | --- | --- |
`;
const rows=baseFields.map(f=>{const [purpose,basis,required]=groups[f.section];return `| ${displayLabel(f)} (${f.key}) | ${sections[f.section]} | ${purpose} | ${basis} | ${required} | ${f.sensitive?'S':'R'} | P |`;}).join('\n');
writeFileSync('docs/FICHA-Y-NORMATIVA.md',intro+rows+`

## Elementos no reducidos a un campo de texto

Año, curso, estudiante interno, versión de plantilla, estado y revisión se guardan estructurados. Fecha, cuenta y acción se auditan. Las decisiones de religión/imágenes/salidas se registran con fecha, responsable y versión del texto; las revisiones conservan los cambios y la evidencia firmada se adjunta al año correspondiente. El motivo y fecha del retiro y las entregas documentales se conservan como movimiento. Firma en papel: espacio de impresión y copia escaneada, sin presentar una declaración digital como firma electrónica verificada.

Los campos adicionales se crean solo cuando una persona autorizada define la pregunta, tipo y acceso. No se inventaron preguntas nuevas. Esta primera versión añade preguntas en versiones futuras y conserva los campos de referencia; modificar/eliminar preguntas de referencia y migrar fichas existentes requiere un diseño adicional explícito. El soporte técnico de un campo no autoriza por sí mismo su recopilación.
`,'utf8');
console.log(`${baseFields.length} campos documentados.`);
