import {strToU8, zipSync} from 'fflate';

// Minimal Office Open XML packages with fixed parts. User input is only text,
// never interpreted as formulas, hyperlinks, markup, or relationship targets.
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MIME = 'application/vnd.openxmlformats-officedocument';
const MAX_TEXT = 8_000_000;
const MAX_CELLS = 350_000;

function xmlText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\p{Cs}]/gu, '\uFFFD');
}

function escapeXml(text) {
  return text.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}

function textBudget() {
  let length = 0;
  return (value, max)=>{
    if(value!==null&&value!==undefined&&typeof value!=='string'&&typeof value!=='number')throw new TypeError('Valor de exportación inválido.');
    const text=xmlText(value);
    length+=text.length;
    if(text.length>max||length>MAX_TEXT)throw new RangeError('El texto excede el límite del documento. Reduzca el alcance de la descarga.');
    return text;
  };
}

function contentTypes(overrides) {
  return `${XML}<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([part,type])=>`<Override PartName="/${part}" ContentType="${type}"/>`).join('')}</Types>`;
}

function relationships(items) {
  return `${XML}<Relationships xmlns="${REL}">${items.map(([type,target],i)=>`<Relationship Id="rId${i+1}" Type="${OFFICE}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
}

function packageOffice(parts) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name,body])=>[name,strToU8(body)])),{level:6}));
}

function excelColumn(index) {
  let result='';
  for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;
  return result;
}

function sheetName(value, index, seen) {
  const short=(label,max)=>{let out='';for(const char of label){if(out.length+char.length>max)break;out+=char;}return out;};
  const base=short(xmlText(value).replace(/[:\\/?*\[\]]/g,' ').replace(/\s+/g,' ').trim().replace(/^'+|'+$/g,'').trim(),31).replace(/'+$/,'').trim()||`Hoja ${index+1}`;
  let label=base;
  for(let suffix=2;seen.has(label.toLocaleLowerCase('es-CL'))||label.toLowerCase()==='history';suffix++){
    const append=` (${suffix})`;
    label=short(base,31-append.length)+append;
  }
  seen.add(label.toLocaleLowerCase('es-CL'));
  return label;
}

const SPREADSHEET_STYLES = `${XML}<styleSheet xmlns="${SHEET}">
  <fonts count="2"><font><sz val="11"/><color rgb="FF18283E"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143C63"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function excelCell(value, ref, style, text) {
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new TypeError('Número de exportación inválido.');
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  // Encode literal Excel escape sequences as text too, e.g. an ID containing _x000A_.
  const inline=escapeXml(text(value,32767).replace(/_x[0-9A-Fa-f]{4}_/g,match=>'_x005F_'+match.slice(1))).replace(/\r/g,'&#13;');
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${inline}</t></is></c>`;
}

/**
 * @param {{name:string, headers:string[], rows:(string|number|null)[][]}[]} sheets
 * @returns {Buffer}
 */
export function makeXlsx(sheets) {
  if(!Array.isArray(sheets)||sheets.length<1||sheets.length>100)throw new RangeError('Cantidad de hojas inválida.');
  const parts={}, seen=new Set(), text=textBudget(), workbookSheets=[], overrides=[['xl/workbook.xml',`${MIME}.spreadsheetml.sheet.main+xml`],['xl/styles.xml',`${MIME}.spreadsheetml.styles+xml`]], workbookRels=[];
  let cells=0;
  for(const [index,sheet] of sheets.entries()){
    const {headers,rows}=sheet??{};
    if(!Array.isArray(headers)||!headers.length||headers.length>100||!headers.every(v=>typeof v==='string')||!Array.isArray(rows)||rows.length>25000)throw new RangeError('Tamaño de hoja inválido.');
    cells+=(rows.length+1)*headers.length;
    if(cells>MAX_CELLS)throw new RangeError('La exportación supera el límite de celdas. Divida la descarga por curso.');
    const cols=headers.map((_,i)=>excelColumn(i));
    const widths=headers.map(h=>Math.min(50,Math.max(12,h.length+3)));
    const xmlRows=[headers,...rows].map((row,i)=>{
      if(!Array.isArray(row)||row.length!==headers.length)throw new TypeError('Cada fila debe coincidir con sus encabezados.');
      const cells=row.map((value,c)=>{
        if(i>0&&value!==null&&value!==undefined){
          const length=String(value).split(/\r?\n/).reduce((longest,line)=>Math.max(longest,line.length),0);
          widths[c]=Math.min(50,Math.max(widths[c],length+2));
        }
        return excelCell(value,`${cols[c]}${i+1}`,i===0?1:2,text);
      });
      return `<row r="${i+1}"${i===0?' ht="28" customHeight="1"':''}>${cells.join('')}</row>`;
    }).join('');
    const id=index+1, file=`worksheets/sheet${id}.xml`, part=`xl/${file}`, range=`A1:${cols.at(-1)}${rows.length+1}`;
    const colWidths=widths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('');
    parts[part]=`${XML}<worksheet xmlns="${SHEET}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${colWidths}</cols><sheetData>${xmlRows}</sheetData><autoFilter ref="${range}"/></worksheet>`;
    const label=escapeXml(sheetName(sheet.name,index,seen));
    workbookSheets.push(`<sheet name="${label}" sheetId="${id}" r:id="rId${id}"/>`);
    overrides.push([part,`${MIME}.spreadsheetml.worksheet+xml`]);
    workbookRels.push(['worksheet',file]);
  }
  workbookRels.push(['styles','styles.xml']);
  return packageOffice({
    '[Content_Types].xml':contentTypes(overrides),
    '_rels/.rels':relationships([['officeDocument','xl/workbook.xml']]),
    'xl/workbook.xml':`${XML}<workbook xmlns="${SHEET}" xmlns:r="${OFFICE}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets.join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':relationships(workbookRels),
    'xl/styles.xml':SPREADSHEET_STYLES,
    ...parts
  });
}

const WORD_STYLES = `${XML}<w:styles xmlns:w="${WORD}">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="110"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="143C63"/><w:sz w:val="38"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:color w:val="40546C"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Nota"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="45566A"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="143C63"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableLabel"><w:name w:val="Etiqueta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableValue"><w:name w:val="Valor"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

function wordParagraph(text, style='Normal', keep=false) {
  const segments=text.replace(/\r\n?/g,'\n').split(/([\n\t])/).map(part=>part==='\n'?'<w:br/>':part==='\t'?'<w:tab/>':`<w:t xml:space="preserve">${escapeXml(part)}</w:t>`);
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keep?'<w:keepNext/>':''}</w:pPr><w:r>${segments.join('')}</w:r></w:p>`;
}

const WORD_BORDER = ['top','left','bottom','right','insideH','insideV'].map(edge=>`<w:${edge} w:val="single" w:sz="5" w:color="D5DEE7"/>`).join('');
const WORD_MARGIN = ['top','left','bottom','right'].map(edge=>`<w:${edge} w:w="100" w:type="dxa"/>`).join('');

function wordTable(rows, text) {
  const width=[3380,6366];
  const content=rows.map(row=>{
    if(!Array.isArray(row)||row.length!==2)throw new TypeError('Cada fila debe incluir etiqueta y valor.');
    const label=wordParagraph(text(row[0],32767),'TableLabel'),value=wordParagraph(text(row[1],32767),'TableValue');
    return `<w:tr><w:tc><w:tcPr><w:tcW w:w="${width[0]}" w:type="dxa"/><w:shd w:val="clear" w:fill="EFF4F9"/></w:tcPr>${label}</w:tc><w:tc><w:tcPr><w:tcW w:w="${width[1]}" w:type="dxa"/></w:tcPr>${value}</w:tc></w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9746" w:type="dxa"/><w:tblBorders>${WORD_BORDER}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar>${WORD_MARGIN}</w:tblCellMar></w:tblPr><w:tblGrid>${width.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${content}</w:tbl>`;
}

/**
 * @param {{title:string, subtitle?:string, note?:string, groups:{title:string, rows:[string,string][]}[], signatures?:string[]}} input
 * @returns {Buffer}
 */
export function makeDocx({title,subtitle,note,groups,signatures=[]}) {
  if(!Array.isArray(groups)||groups.length>100||!Array.isArray(signatures)||signatures.length>10)throw new RangeError('Tamaño de documento inválido.');
  const text=textBudget();
  const content=[wordParagraph(text(title,32767),'Title')];
  if(subtitle)content.push(wordParagraph(text(subtitle,32767),'Subtitle'));
  if(note)content.push(wordParagraph(text(note,32767),'Note'));
  let totalRows=0;
  for(const group of groups){
    if(!group||!Array.isArray(group.rows)||(totalRows+=group.rows.length)>2000)throw new RangeError('El documento contiene demasiados campos.');
    if(!group.rows.length)continue;
    if(group.title)content.push(wordParagraph(text(group.title,32767),'Heading1'));
    content.push(wordTable(group.rows,text));
  }
  if(signatures.length){
    content.push(wordParagraph('Firmas','Heading1'));
    for(const label of signatures)content.push(wordParagraph('________________________________________','Normal',true),wordParagraph(text(label,32767)));
  }
  return packageOffice({
    '[Content_Types].xml':contentTypes([['word/document.xml',`${MIME}.wordprocessingml.document.main+xml`],['word/styles.xml',`${MIME}.wordprocessingml.styles+xml`]]),
    '_rels/.rels':relationships([['officeDocument','word/document.xml']]),
    'word/_rels/document.xml.rels':relationships([['styles','styles.xml']]),
    'word/styles.xml':WORD_STYLES,
    'word/document.xml':`${XML}<w:document xmlns:w="${WORD}"><w:body>${content.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="540" w:footer="540" w:gutter="0"/></w:sectPr></w:body></w:document>`
  });
}
