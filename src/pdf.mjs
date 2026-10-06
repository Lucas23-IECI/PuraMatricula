import PDFDocument from 'pdfkit';
import { sections,displayLabel,ageAtSchoolCutoff } from './fields.mjs';
export async function createFichaPdf(record,fields,course,template,limited=false){
  const doc=new PDFDocument({size:'A4',margins:{top:72,bottom:64,left:48,right:48},bufferPages:true,info:{Title:`Ficha matrícula ${record.year}`,Author:'Colegio Domingo Santa María'}});
  const chunks=[];doc.on('data',x=>chunks.push(x));const complete=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const heading=(text)=>{if(doc.y>680)doc.addPage();doc.font('Helvetica-Bold').fontSize(12).fillColor('#28618c').text(text,48,doc.y,{width:499});doc.moveDown(.5);};
  const line=(label,value)=>{
    const text=String(value||'—');const labelHeight=doc.font('Helvetica').fontSize(9).heightOfString(label,{width:155}),height=Math.max(24,doc.fontSize(10).heightOfString(text,{width:334})+12,labelHeight+12);
    if((height<690&&doc.y+height>765)||doc.y>700)doc.addPage();const y=doc.y,page=doc.page;
    doc.fillColor('#586672').font('Helvetica').fontSize(9).text(label,48,y,{width:155});doc.fillColor('#202a35').fontSize(10).text(text,213,y,{width:334});
    const end=doc.page===page?Math.max(doc.y,y+labelHeight,y+12):doc.y;
    doc.strokeColor('#d8dee3').lineWidth(.5).moveTo(48,end+6).lineTo(547,end+6).stroke();doc.y=end+12;
  };
  heading('Ficha de matrícula general');
  doc.font('Helvetica').fontSize(10).fillColor('#334b55').text(`Año ${record.year} · Curso ${course.name} · Estado ${record.status==='draft'?'Borrador':record.status==='enrolled'?'Matriculado':'Retirado'}`);doc.moveDown();
  doc.fontSize(9).text(`${template.name} · Revisión ${record.version}`);doc.moveDown();
  if(limited){doc.fillColor('#8c4118').text('Vista limitada: se omiten antecedentes reservados. Esta copia no representa el expediente completo.');doc.moveDown();}
  doc.fillColor('#4c5c63').fontSize(9).text('Plantilla digital basada en la ficha de referencia. Requiere validación institucional antes de uso escolar. Los antecedentes de apoyo son opcionales.');doc.moveDown();
  for(const [section,title] of Object.entries(sections)){
    if(['autorizaciones','retiro'].includes(section))continue;const group=fields.filter(f=>f.section===section);if(!group.length)continue;heading(title+(group.every(f=>f.sensitive)?' · acceso reservado':''));for(const field of group)line(displayLabel(field),record.data[field.key]);if(section==='matricula')line(`Edad al 30/03/${record.year}`,ageAtSchoolCutoff(record.data.birthDate,record.year));
  }
  doc.moveDown();doc.fontSize(10).text('Firma apoderado/a: __________________________',48,doc.y);doc.moveDown();doc.text('Nombre y firma funcionario/a: __________________________',48,doc.y);
  const texts={religion:['Encuesta sobre clases de religión','Las clases de religión son optativas para el estudiante y su familia. Registre la preferencia declarada por el apoderado o tutor.'],images:['Autorización de difusión de imágenes y audio','Registre por separado la decisión informada sobre difusión de fotografías, audio y material audiovisual en los medios definidos por el establecimiento. El alcance y la versión del texto deben constar en esta ficha.'],outings:['Autorización anual de salidas pedagógicas','Registre la decisión anual sobre salidas pedagógicas acompañadas por personal del establecimiento. Esta constancia no sustituye la autorización escrita ni los demás resguardos de cada actividad concreta.']};
  for(const [prefix,[title,text]] of Object.entries(texts)){
    const group=fields.filter(f=>f.key.startsWith(prefix)&&f.section==='autorizaciones');if(!group.length)continue;doc.addPage();heading(title);doc.font('Helvetica').fontSize(11).text(text,{width:499});doc.moveDown(1.5);
    line('Estudiante',record.name);line('Año y curso',`${record.year} · ${course.name}`);for(const field of group)line(field.label,record.data[field.key]);line('Identificador del apoderado',record.data.guardianIdentifier);line('Teléfono de contacto',record.data.guardianPhone);doc.moveDown(2);doc.text('Firma del apoderado/a o tutor/a: ________________________',48,doc.y);doc.moveDown(2);doc.text('Fecha y firma del establecimiento: ______________________',48,doc.y);
    doc.moveDown(2);doc.fontSize(9).fillColor('#4c5c63').text('La decisión digital es una constancia administrativa. Adjunte la copia firmada para conservar su respaldo.');
  }
  if(record.status==='withdrawn'){
    doc.addPage();heading('Datos de retiro');const event=record.events?.find(x=>x.action==='withdraw');line('Estudiante',record.name);line('Año y curso',`${record.year} · ${course.name}`);line('Fecha de baja',event?.detail.date);line('Motivo',event?.detail.reason);for(const f of fields.filter(x=>x.section==='retiro'))line(f.label,record.data[f.key]);doc.moveDown(2);doc.text('Firma de apoderado/a: ________________________');doc.moveDown(2);doc.text('Firma de funcionario/a: ______________________');
  }
  const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica-Bold').fontSize(10).fillColor('#28618c').text('DOMINGO SANTA MARÍA · MATRÍCULA',48,35,{width:499,lineBreak:false});doc.font('Helvetica').fontSize(8).fillColor('#586672').text(`${record.name} · ${record.year} · ${course.name}`,48,51,{width:499,lineBreak:false});doc.text(`Expediente ${record.id.slice(0,8)} · Revisión ${record.version} · Página ${i+1} de ${range.count}`,48,805,{width:499,lineBreak:false});doc.page.margins.bottom=bottom;}
  doc.end();return complete;
}
