import { permissions } from '../src/fields.mjs';
export const demoPassword='Demo-matricula-2026!';
export async function seedDemo(store,svc,count=400){
  if((await store.db.prepare('SELECT count(*) AS n FROM users').get()).n)throw new Error('La carga sintética requiere una base vacía.');
  const setup={id:'setup',permissions,allCourses:true,courses:[]};
  const admin=await svc.saveUser(setup,{username:'demo-secretaria',name:'Secretaría de prueba',password:demoPassword,permissions,allCourses:true,courses:[]});
  const courseIds=[];for(const year of [2026,2027])for(const label of ['1° Básico A','2° Básico A','3° Básico A','4° Básico A','1° Medio A','2° Medio A','3° Medio A','4° Medio A'])courseIds.push(await svc.createCourse(admin,{year,name:label}));
  const teacher=await svc.saveUser(admin,{username:'demo-profesor',name:'Profesor/a de prueba',password:demoPassword,permissions:['read','write','documents','export'],courses:[courseIds[0].id]});
  const reader=await svc.saveUser(admin,{username:'demo-lector',name:'Consulta de prueba',password:demoPassword,permissions:['read'],courses:[courseIds[1].id]});
  const unassigned=await svc.saveUser(admin,{username:'demo-sin-cursos',name:'Cuenta sin asignación',password:demoPassword,permissions:['read','write'],courses:[]});
  const records=[];for(let i=0;i<count;i++){
    const number=String(i+1).padStart(3,'0'),r=await svc.create(admin,{year:2026,courseId:courseIds[i%8].id,data:{names:'Estudiante de prueba '+number,surname:'Ejemplo '+number,secondSurname:'Sintético',identifierType:'Otro',identifier:'DEMO-'+number,birthDate:'2012-05-10',guardianName:'Apoderado de prueba '+number,guardianPhone:'Contacto ficticio',emergencyName:'Persona de prueba',emergencyPhone:'Contacto ficticio',address:'Domicilio ficticio',...(i===0?{allergies:'ANTECEDENTE-SINTETICO-RESERVADO',householdRegistry:'SOCIAL-SINTETICO-RESERVADO'}:{})}});
    records.push(i%4===0?r:await svc.transition(admin,r.id,{version:1,action:'enroll',date:'2026-03-02'}));
  }
  return {admin,teacher,reader,unassigned,courses:courseIds,records};
}
