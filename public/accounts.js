const suggestedAccountProfiles = Object.freeze({
  secretaria: { label:'Secretaría', permissions:['read','write','enroll','import','documents','export'] },
  direccion: { label:'Dirección', permissions:['read','export'] },
  profesor: { label:'Profesor/a', permissions:['read','write'] },
  consulta: { label:'Solo consulta', permissions:['read'] }
});

function accountLoginAfterChange(message) {
  const demo=Boolean(state.demo ?? state.meta?.demo);
  enrollmentTemplateDraft=null;
  clearSessionViewData();
  Object.assign(state,{user:null,csrf:'',meta:null,view:'home',year:null,course:'',status:'',q:'',page:1,pageSize:25,auditSnapshot:null,record:null,draft:{},editing:false,dirty:false,saving:false,conflict:false,users:[],accountCourses:[],importRows:null,importTicket:null,importPreview:null,importOptions:null});
  login(demo);
  if(message)notice(message);
}

function ownPasswordFields(prefix) {
  return [
    [`${prefix}-current`,'Contraseña actual','currentPassword','autocomplete="current-password" required maxlength="200"'],
    [`${prefix}-new`,'Nueva contraseña','newPassword','autocomplete="new-password" minlength="12" maxlength="200" required'],
    [`${prefix}-confirm`,'Repetir nueva contraseña','confirmation','autocomplete="new-password" minlength="12" maxlength="200" required']
  ].map(([id,label,name,attrs])=>passwordField(id,label,attrs).replace('name="password"',`name="${name}"`)).join('');
}

async function submitOwnPassword(formData) {
  const currentPassword=formData.get('currentPassword'),newPassword=formData.get('newPassword');
  if(newPassword!==formData.get('confirmation'))throw new Error('Las nuevas contraseñas no coinciden.');
  await api('/api/account/password',{method:'POST',body:{currentPassword,newPassword}});
  accountLoginAfterChange('Contraseña cambiada. Ingresa con tu nueva clave.');
}

function openPasswordChange() {
  dialog('Cambiar contraseña',`<p class="muted">Usa al menos 12 caracteres. Al guardar se cerrarán todas las sesiones de tu cuenta.</p><div class="fields">${ownPasswordFields('own-password')}</div>`,submitOwnPassword);
}

function renderRequiredPasswordChange() {
  EnrollmentLoading.writeRoute({view:'password'});
  $('#app').innerHTML=`<main class="login"><section class="login-story"><p class="eyebrow">Colegio Domingo Santa María</p><h1>Protege tu cuenta</h1><p>Tu acceso es individual. Elige una contraseña que solo tú conozcas.</p></section><section class="login-form-area"><form id="required-password" class="login-form"><div class="brand"><img class="brand-crest" src="/escudo.jpg" width="54" height="54" alt=""><div><strong>Liceo Domingo Santa María</strong><span>Concepción · Matrícula</span></div></div><div class="login-heading"><h1>Cambia tu contraseña temporal</h1>${helpControl()}</div><p class="muted">Antes de entrar, elige una clave nueva de al menos 12 caracteres.</p>${ownPasswordFields('required-password')}<p id="required-password-error" class="error-text" role="alert"></p><button class="primary" type="submit">Guardar nueva contraseña</button><button id="required-password-logout" class="cancel-button" type="button">Cerrar sesión</button></form></section></main>`;
  $('#required-password').onsubmit=async e=>{
    e.preventDefault();
    const form=e.currentTarget,button=e.submitter;
    if(button.disabled)return;
    setBusy(button,true,'Guardando…');
    $('#required-password-error').textContent='';
    try{await submitOwnPassword(new FormData(form));}
    catch(error){$('#required-password-error').textContent=error.message;}
    finally{setBusy(button,false);}
  };
  $('#required-password-logout').onclick=async e=>{
    const button=e.currentTarget;
    setBusy(button,true,'Cerrando sesión…');
    try{await api('/api/logout',{method:'POST'});accountLoginAfterChange();}
    catch(error){$('#required-password-error').textContent=error.message;}
    finally{setBusy(button,false);}
  };
}

function openAccountEditor(id) {
  const account=id ? state.users?.find(user=>user.id===id) : { permissions:['read'],courses:[],active:true };
  if(!account){notice('No se encontró esa cuenta. Vuelve a cargar la lista.');return;}
  const isSelf=id===state.user.id, catalog=state.accountCourses ?? state.meta.courses;
  const years=[...new Set(catalog.map(course=>course.year))].sort((a,b)=>b-a);
  const courseGroups=years.map(year=>`<details ${Number(year)===Number(state.year)||catalog.some(course=>course.year===year&&account.courses.includes(course.id))?'open':''}><summary>${esc(year)}</summary><div class="checklist">${catalog.filter(course=>course.year===year).map(course=>`<label><input type="checkbox" name="courses" value="${esc(course.id)}" ${account.courses.includes(course.id)?'checked':''}>${esc(course.name)}</label>`).join('')}</div></details>`).join('');
  const password=isSelf ? '<p class="hint wide">Para cambiar tu clave, usa la opción «Cambiar contraseña».</p>' : passwordField('account-password',id?'Nueva clave temporal (opcional)':'Contraseña temporal',`autocomplete="new-password" minlength="12" maxlength="200" ${id?'':'required'}`);
  const temporary=account.mustChangePassword ? '<p class="hint">Esta cuenta todavía debe cambiar su contraseña temporal.</p>' : '';
  dialog(id?'Configurar cuenta':'Nueva cuenta',`
    <div class="fields">
      <label>Nombre<input name="name" value="${esc(account.name||'')}" maxlength="120" required></label>
      <label>Usuario<input name="username" value="${esc(account.username||'')}" pattern="([a-z0-9._]|-){3,60}" maxlength="60" required></label>
      ${password}
    </div>
    ${temporary}
    ${isSelf?'':'<p class="hint">La persona deberá elegir una clave nueva al entrar con su contraseña temporal.</p>'}
    <label class="spaced" for="account-profile">Perfil sugerido</label><select id="account-profile">
      <option value="">Seleccionar perfil</option>
      ${Object.entries(suggestedAccountProfiles).map(([key,preset])=>`<option value="${key}">${esc(preset.label)}</option>`).join('')}
    </select>
    <p class="hint">El perfil solo marca permisos iniciales. Puedes ajustarlos y asignar cursos por separado.</p>
    <fieldset class="fieldset spaced"><legend>Permisos</legend><div class="checklist">
      ${state.meta.permissions.map(permission=>`<label><input type="checkbox" name="permissions" value="${esc(permission)}" ${account.permissions.includes(permission)?'checked':''} ${isSelf&&permission==='admin'?'disabled':''}>${esc(state.meta.permissionLabels[permission])}</label>`).join('')}
    </div></fieldset>
    <fieldset class="fieldset spaced"><legend>Cursos</legend>
      <div class="checklist"><label><input type="checkbox" name="allCourses" ${account.allCourses?'checked':''}>Autorizar todos los cursos, incluidos futuros</label></div>
      ${courseGroups||'<p class="hint">Todavía no hay cursos para asignar.</p>'}
    </fieldset>
    <div class="checklist"><label><input type="checkbox" name="active" ${account.active?'checked':''} ${isSelf?'disabled':''}>Cuenta activa</label></div>
  `,async fd=>{
    const selected=fd.getAll('permissions');
    if(isSelf&&!selected.includes('admin'))selected.push('admin');
    await api(id?'/api/users/'+encodeURIComponent(id):'/api/users',{method:id?'PUT':'POST',body:{
      name:fd.get('name'),username:fd.get('username'),password:fd.get('password')||'',permissions:selected,
      courses:fd.getAll('courses'),allCourses:fd.has('allCourses'),active:isSelf||fd.has('active')
    }});
    if(isSelf){accountLoginAfterChange('Configuración guardada. Ingresa nuevamente.');return;}
    await renderUsers();
    notice(id?'Cuenta actualizada.':'Cuenta creada. Su titular debe cambiar la clave temporal.');
  });
  $('#account-profile').onchange=e=>{
    const profile=suggestedAccountProfiles[e.currentTarget.value];
    if(!profile)return;
    $('#dialog-form').querySelectorAll('input[name="permissions"]:not(:disabled)').forEach(input=>{input.checked=profile.permissions.includes(input.value);});
  };
}
