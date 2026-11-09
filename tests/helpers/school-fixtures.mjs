import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeXlsx} from '../../src/report-office.mjs';

const names = [
  'usuarios-sinteticos.xlsx',
  'matricula-por-cursos-sintetica.xlsx',
  'columnas-flexibles-sinteticas.xlsx',
];

const courseColumns = [
  'Apellido Paterno (Estudiante)', 'Apellido Materno (Estudiante)', 'Nombres (Estudiante)', 'RUT (Estudiante)',
  'Apellido Paterno (APODERADO)', 'Apellido Materno (APODERADO)', 'Nombres (Apoderado)', 'RUT (Apoderado)',
  'Contacto (Teléfono)', 'Contacto (Email)      SOLO SI REGISTRÓ', 'DOMICILIO', 'COMUNA',
];

function rut(number) {
  const digits = String(number);
  const sum = Array.from(digits).reverse().reduce((total, digit, index) => total + Number(digit) * (index % 6 + 2), 0);
  const check = 11 - sum % 11;
  return digits + '-' + (check === 11 ? '0' : check === 10 ? 'K' : check);
}

function courses() {
  const levels = [
    'PRE-KINDER', 'KINDER',
    ...Array.from({length: 8}, (_, index) => (index + 1) + '° Básico'),
    ...Array.from({length: 4}, (_, index) => (index + 1) + '° Medio'),
  ];
  return levels.map((name, index) => {
    const ordinal = index + 1;
    const prefix = index % 2 ? ['N°'] : [];
    const headers = [...prefix, ...courseColumns];
    const student = [
      'Sintético', 'Prueba', 'Alumno flexible ' + String(ordinal).padStart(2, '0'), rut(22000000 + index),
      'Adulto', 'Prueba', 'Apoderado ficticio ' + ordinal, '11111112-9',
      '+56911112222', 'contacto@example.test', 'Domicilio ficticio', 'Comuna ficticia',
    ];
    return {name, headers, rows: [Array(headers.length).fill(null), [...(prefix.length ? [ordinal] : []), ...student]]};
  });
}

export function syntheticWorkbook(name) {
  switch (name) {
    case 'usuarios-sinteticos.xlsx':
      return makeXlsx([{
        name: 'Usuarios',
        headers: ['ID de Usuario (no modificar)', 'Nombres', 'Apellidos', 'Rol', 'Curso', 'Sección', 'Fecha Nacimiento', 'Email', 'Contraseña'],
        rows: Array.from({length: 3}, (_, index) => {
          const ordinal = index + 1;
          return ['UI-SYNTH-' + ordinal, 'Alumno ficticio ' + ordinal, 'Prueba Sintética', 'Estudiante', '5° Básico', 'Z', '10/05/2012', 'ficticio' + ordinal + '@synthetic.invalid', 'DESCARTAR'];
        }),
      }]);
    case 'matricula-por-cursos-sintetica.xlsx':
      return makeXlsx(courses());
    case 'columnas-flexibles-sinteticas.xlsx':
      return makeXlsx([{
        name: 'Registro',
        headers: ['Persona', 'Primer apellido', 'Documento', 'Celular', 'Distrito', 'Direccion', 'Contacto correo'],
        rows: [['Alumno columnas', 'Sintético', rut(15000000), '+56911112222', 'Comuna ficticia', 'Dirección ficticia', 'contacto@example.test']],
      }]);
    default:
      throw new Error('Planilla de prueba desconocida.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = new URL('../../.local/xlsx-fixtures/', import.meta.url);
  mkdirSync(directory, {recursive: true});
  for (const name of names) {
    try {
      writeFileSync(new URL(name, directory), syntheticWorkbook(name), {flag: 'wx'});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  console.log('Planillas de prueba disponibles en .local/xlsx-fixtures/');
}
