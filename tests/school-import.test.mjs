import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate,
  normalizeRutAndDv,
  normalizeSchoolWorkbook,
  normalizeStudentRow,
  validateRut
} from '../src/school-import.mjs';

const headers = [
  'ID de Usuario (no modificar)', 'RUT', 'DV', 'Tipo de documento', 'País emisor',
  'Nombres', 'Apellidos', 'Email', 'Teléfono', 'Rol', 'Curso', 'Sección',
  'Género', 'Fecha Nacimiento', 'Nombre Usuario', 'RUT Apoderado', 'Contraseña'
];

test('normaliza la hoja Usuarios ERP con identidad y campos de matrícula', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    headers,
    ['erp-001', '11111111', '1', 'RUN', 'CL', 'Ana María', 'Pérez Soto', 'ana@example.cl', '+56911112222', 'Estudiante', '1° Básico', 'A', 'F', '01/03/2018', 'ana.erp', '11111111-1', 'secreto'],
    ['erp-002', '11111112', '9', 'RUN', 'CL', 'Ana María', 'Pérez Soto', 'ana2@example.cl', '+56911112223', 'Estudiante', '1° Básico', 'A', 'F', 43160, '', '', ''],
  ] }, { year: 2026, courses: [{ id: 'course-1', name: '1° Básico', year: 2026 }] });

  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].originId, 'erp-001');
  assert.equal(result.rows[0].identity.value, '11111111-1');
  assert.equal(result.rows[0].data.surname, 'Pérez');
  assert.equal(result.rows[0].data.secondSurname, 'Soto');
  assert.equal(result.rows[0].data.birthDate, '2018-03-01');
  assert.equal(result.rows[0].data.phone, '+56911112222');
  assert.equal(result.rows[0].data.sourceBarcode, '');
  assert.equal(result.rows[0].data.sourceIdentifierType, 'RUN');
  assert.equal(result.rows[0].courseId, 'course-1');
  assert.equal(result.rows[0].account, null);
  assert.equal(Object.hasOwn(result.rows[0].data, 'password'), false);
  assert.equal(Object.hasOwn(result.rows[0].data, 'username'), false);
  assert.ok(result.warnings.some((warning) => warning.code === 'CUENTA_IGNORADA'));
});

test('no fusiona nombres iguales y bloquea identidad de origen repetida', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Apellidos', 'Rol'],
    ['same-name-1', '11111111', '1', 'Alex', 'Gómez', 'Estudiante'],
    ['same-name-2', '11111112', '9', 'Alex', 'Gómez', 'Estudiante'],
    ['same-name-1', '11111113', '7', 'Alex', 'Gómez', 'Estudiante']
  ] });
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.filter((error) => error.code === 'DUPLICADO_IDENTIDAD').length, 1);
  assert.deepEqual(result.rows.map((row) => row.data.names), ['Alex', 'Alex']);
});

test('bloquea colisión entre ID ERP y RUN aunque ambos difieran en la otra columna', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Apellidos', 'Rol'],
    ['erp-a', '11111111', '1', 'Alex', 'Gómez', 'Estudiante'],
    ['erp-b', '11111111', '1', 'Otro', 'Nombre', 'Estudiante']
  ] });
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors[0].code, 'DUPLICADO_IDENTIDAD');
});

test('ignora roles ajenos y nunca conserva usuario o contraseña', () => {
  const row = normalizeStudentRow({
    'ID de Usuario (no modificar)': 'teacher-1', Rol: 'Docente', Nombres: 'No', Apellidos: 'Importar', Contraseña: 'secret'
  }, { rowNumber: 8 });
  assert.equal(row.row, null);
  assert.equal(row.ignored.code, 'ROL_IGNORADO');

  const student = normalizeStudentRow({
    'ID de Usuario (no modificar)': 'student-1', Rol: 'Estudiante', Nombres: 'Sí', Apellidos: 'Importar', 'Nombre Usuario': 'login', Contraseña: 'secret'
  });
  assert.equal(student.row.account, null);
  assert.equal(Object.hasOwn(student.row, 'username'), false);
  assert.equal(Object.hasOwn(student.row.data, 'password'), false);
  assert.ok(student.warnings.some((warning) => warning.code === 'CUENTA_IGNORADA'));
});

test('acepta el padrón administrativo exportado y lo convierte si Usuarios no existe', () => {
  const result = normalizeSchoolWorkbook({
    'Padrón administrativo': [
      ['ID interno', 'Estudiante', 'Curso', 'Identificador principal', 'Documento completo', 'País', 'Matrícula'],
      ['42', 'Alex Gómez', '2° Medio', 'RUN chileno', '11111111-1', 'CL', 'VIGENTE']
    ],
    Identificadores: [
      ['ID interno', 'Estudiante', 'Tipo', 'Valor completo', 'Principal'],
      ['42', 'Alex Gómez', 'RUN chileno', '11111111-1', 'Sí']
    ]
  }, { year: 2026 });
  assert.equal(result.administrativeRows.length, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].identity.value, '11111111-1');
  assert.equal(result.rows[0].data.surname, 'Alex');
  assert.equal(result.rows[0].data.secondSurname, 'Gómez');
});

test('normaliza fecha serial, RUT y errores de identidad sin nombres', () => {
  assert.equal(normalizeDate(43160), '2018-03-01');
  assert.deepEqual(normalizeRutAndDv('11.111.111-1'), { rut: '11111111', dv: '1' });
  assert.equal(validateRut('11111111', '1'), true);
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'RUT', 'DV', 'Nombres', 'Rol'],
    ['', '11111111', '1', '', 'Estudiante']
  ] });
  assert.ok(result.errors.some((error) => error.code === 'NOMBRES_AUSENTES'));
});

test('marca cursos que no pueden resolverse en la configuración recibida', () => {
  const result = normalizeSchoolWorkbook({ Usuarios: [
    ['ID de Usuario (no modificar)', 'Nombres', 'Apellidos', 'Curso', 'Rol'],
    ['erp-1', 'Alex', 'Gómez', '3° Básico', 'Estudiante']
  ] }, { year: 2026, courses: [{ id: 'course-1', name: '1° Básico', year: 2026 }] });
  assert.deepEqual(result.unresolvedCourses, [{ key: '3basico|2026', name: '3° Básico', year: 2026 }]);
  assert.equal(result.errors[0].code, 'CURSO_NO_RESUELTO');
  assert.equal(result.canImport, false);
});
