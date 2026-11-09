import { checkPassword, hashPassword } from './store.mjs';
import { fail } from './service.mjs';
import { permissions } from './fields.mjs';

// Existing hashes keep their original format. A temporary password is still
// a salted hash; the prefix records only that the next login is restricted.
const temporaryPrefix = 'temporary$';
const hashPattern = /^[a-f0-9]{32}:[a-f0-9]{128}$/;
const isTemporary = hash => typeof hash === 'string' && hash.startsWith(temporaryPrefix);
const validNewPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 200 && value.trim().length >= 12;

export function verifyAccountPassword(password, storedHash) {
  if (typeof password !== 'string' || password.length > 200 || typeof storedHash !== 'string') return false;
  const hash = isTemporary(storedHash) ? storedHash.slice(temporaryPrefix.length) : storedHash;
  return hashPattern.test(hash) && checkPassword(password, hash);
}

export function createAccounts(store, svc) {
  const { db, transaction, audit } = store;
  const decodeUser = row => row && ({ ...svc.decodeUser(row), mustChangePassword: isTemporary(row.password) });
  const findActive = async id => await db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id);
  const activeAdmin = async user => {
    const actor = decodeUser(await findActive(user?.id || ''));
    if (!actor) fail(401, 'Inicie sesión para continuar.');
    if (actor.mustChangePassword) fail(403, 'Cambia tu contraseña temporal antes de continuar.', 'PASSWORD_CHANGE_REQUIRED');
    svc.requirePermission(actor, 'admin');
    return actor;
  };

  const save = async (actor, input, id) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Datos de cuenta inválidos.');
    const supplied = input.password !== undefined && input.password !== null && input.password !== '';
    if ((!id || supplied) && !validNewPassword(input.password)) fail(400, 'La contraseña debe tener entre 12 y 200 caracteres.');
    if (id === actor.id && supplied) fail(400, 'Usa Cambiar contraseña para actualizar tu propia clave.', 'USE_OWN_PASSWORD_CHANGE');
    if (input.active !== undefined && typeof input.active !== 'boolean') fail(400, 'Estado de cuenta inválido.');
    if (input.allCourses !== undefined && typeof input.allCourses !== 'boolean') fail(400, 'Alcance de cursos inválido.');
    const saved = await svc.saveUser(actor, input, id);
    if (supplied) {
      const row = await db.prepare('SELECT password FROM users WHERE id=?').get(saved.id);
      await db.prepare('UPDATE users SET password=? WHERE id=?').run(temporaryPrefix + row.password, saved.id);
    }
    const administrators = await db.prepare('SELECT permissions FROM users WHERE active=1').all();
    if (!administrators.some(row => JSON.parse(row.permissions).includes('admin'))) fail(409, 'Debe quedar al menos una cuenta administradora activa.', 'LAST_ADMIN_REQUIRED');
    return decodeUser(await db.prepare('SELECT * FROM users WHERE id=?').get(saved.id));
  };

  const bootstrap = input => transaction(async () => {
    if (await db.prepare('SELECT id FROM users LIMIT 1').get()) fail(409, 'Esta base ya tiene cuentas.', 'ACCOUNTS_ALREADY_INITIALIZED');
    return save({ id:'setup', permissions:['admin'], courses:[], allCourses:true }, {
      name:'Administración de matrícula', ...input, permissions, courses:[], allCourses:true, active:true
    });
  });

  const saveUser = (user, input, id) => transaction(async () => save(await activeAdmin(user), input, id));
  const list = async user => {
    await activeAdmin(user);
    const users = (await db.prepare('SELECT * FROM users ORDER BY name,username').all()).map(decodeUser);
    const courses = await db.prepare('SELECT id,year,name FROM courses ORDER BY year DESC,name,id').all();
    return { users, courses };
  };

  const changePassword = (user, input) => transaction(async () => {
    const row = await findActive(user?.id || '');
    if (!row) fail(401, 'Inicie sesión para continuar.');
    if (!validNewPassword(input?.newPassword)) fail(400, 'La nueva contraseña debe tener entre 12 y 200 caracteres.');
    if (!verifyAccountPassword(input?.currentPassword, row.password)) fail(403, 'La contraseña actual no es correcta.', 'CURRENT_PASSWORD_INVALID');
    if (input.newPassword === input.currentPassword) fail(400, 'Elige una contraseña distinta de la actual.', 'PASSWORD_UNCHANGED');
    await db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(input.newPassword), row.id);
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
    await audit(row.id, 'user.password.change', row.id, { temporaryReplaced:isTemporary(row.password) });
    return { ok:true };
  });

  const openSession = (verified, { tokenHash, csrf, expires }) => transaction(async () => {
    const row = await findActive(verified.id);
    if (!row || row.password !== verified.password || row.username !== verified.username) fail(401, 'Las credenciales cambiaron. Vuelve a iniciar sesión.', 'CREDENTIALS_CHANGED');
    await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    await db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires) VALUES(?,?,?,?)').run(tokenHash, row.id, csrf, expires);
    await audit(row.id, 'login.success', '', {});
    return decodeUser(row);
  });
  return { decodeUser, list, saveUser, bootstrap, changePassword, openSession };
}
