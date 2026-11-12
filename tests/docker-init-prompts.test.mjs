import assert from 'node:assert/strict';
import test from 'node:test';
import {promptBootstrapCredentials} from '../scripts/docker-init.mjs';

test('el asistente permite corregir usuario y clave dentro del mismo intento',async ()=>{
  const secret='clave-ficticia-para-prueba';
  const usernames=['cuenta#','admin-local'];
  const passwords=['corta',secret,'no-coincide-ficticia',secret,secret];
  const steps=[],messages=[];
  const credentials=await promptBootstrapCredentials({},{
    readUsername:async ()=>{steps.push('usuario');return usernames.shift();},
    readSecret:async label=>{steps.push(label.startsWith('Repita')?'confirmación':'contraseña');return passwords.shift();},
    notice:message=>messages.push(message)
  });
  assert.deepEqual(credentials,{username:'admin-local',password:secret});
  assert.deepEqual(steps,['usuario','usuario','contraseña','contraseña','confirmación','contraseña','confirmación']);
  assert.match(messages[0],/3 a 60 caracteres/);
  assert.match(messages[1],/Usuario no válido/);
  assert.match(messages[2],/12 y 200 caracteres/);
  assert.match(messages[3],/no coinciden/);
  assert.ok(messages.every(message=>!message.includes(secret)&&!message.includes('cuenta#')));
});

test('la automatización no abre preguntas y rechaza una entrada inválida una sola vez',async ()=>{
  let reads=0;
  const unexpected=()=>assert.fail('No se debe abrir una pregunta interactiva.');
  const io={readUsername:unexpected,readSecret:unexpected,notice:unexpected,readStdin:async ()=>{reads++;return 'corta';}};
  await assert.rejects(promptBootstrapCredentials({username:'cuenta#',passwordStdin:true},io),/Usuario no válido/);
  assert.equal(reads,0);
  await assert.rejects(promptBootstrapCredentials({username:'admin-local',passwordStdin:true},io),/12 y 200 caracteres/);
  assert.equal(reads,1);
});

test('cancelar la entrada oculta corta el asistente, sin volver a pedir la clave',async ()=>{
  let reads=0;
  const cancel=new Error('Operación cancelada.');
  await assert.rejects(promptBootstrapCredentials({username:'admin-local'},{
    readSecret:async ()=>{reads++;throw cancel;},
    notice:()=>assert.fail('Cancelar no debe tratarse como un error de validación.')
  }),error=>error===cancel);
  assert.equal(reads,1);
});
