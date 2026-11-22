'use strict';

const panel = document.querySelector('#panel');
const status = document.querySelector('#status');
const logout = document.querySelector('#logout');
const localDemo = window.parent !== window && window.parent.LocalDemo;
const general = localDemo ? window.parent.location.hash === '#admin' : window.CloudPortal?.general || location.pathname === '/admin';
function navigate(route) {
  if (localDemo) localDemo.navigate(route);
  else if (window.CloudPortal) CloudPortal.navigate(route);
  else location.replace(route);
}
if (localDemo || window.CloudPortal) {
  logout.addEventListener('submit', async event => {
    event.preventDefault();
    try { await (localDemo || CloudPortal).request(general ? 'admin/logout' : 'logout', {}); }
    catch (error) { status.textContent = error.message; }
  });
}
if (general) {
  document.title = 'Admin Mi Sindicato';
  logout.action = '/api/admin/logout';
}
const roles = ['Presidente', 'Tesorero', 'Secretario', 'Revisor de cuentas', 'Socio conductor'];
const platforms = ['Uber', 'Didi', 'Indrive', 'GetGo', 'Cabify', 'Otras'];
const profile = {
  Presidente: ['Administración del sindicato', 'Crea las cuentas del equipo y de los socios conductores.'],
  Tesorero: ['Tesorería', 'Panel del responsable de los ingresos y egresos del sindicato.'],
  Secretario: ['Secretaría', 'Panel del responsable de las actas y los registros del sindicato.'],
  'Revisor de cuentas': ['Revisión de cuentas', 'Panel del encargado de revisar las cuentas del sindicato.'],
  'Socio conductor': ['Portal del socio', 'Aquí tendrás acceso a la información de tu sindicato.']
};

async function request(route, payload) {
  if (localDemo) return localDemo.request(route, payload);
  if (window.CloudPortal) return CloudPortal.request(route, payload);
  const response = await fetch('/api/' + route, payload === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function element(tag, text, parent) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  parent.append(item);
  return item;
}

function form(title, buttonText, route, onSuccess = render, parent = panel) {
  const node = element('form', '', parent);
  element('h2', title, node);
  const button = document.createElement('button');
  button.textContent = buttonText;
  node.addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = node.querySelector('[role="status"]') || status;
    feedback.textContent = '';
    button.disabled = true;
    try {
      const fields = new FormData(node);
      const payload = Object.fromEntries(fields);
      if (route === 'members' || route === 'members/edit') payload.platforms = fields.getAll('platforms');
      if (route === 'members/edit' || route === 'admin/unions/edit') payload.active = fields.has('active');
      const result = await request(route, payload);
      onSuccess(result);
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  return { node, finish: () => node.append(button) };
}

function input(parent, label, name, options = {}) {
  const control = element('input', '', element('label', label, parent));
  Object.assign(control, { name, required: true }, options);
  return control;
}

function temporaryPasswordField(node) {
  input(node, 'Nueva clave temporal (opcional, 9 dígitos)', 'temporaryPassword', {
    required: false, type: 'password', pattern: '[0-9]{9}', maxLength: 9,
    inputMode: 'numeric', autocomplete: 'new-password'
  });
}

function select(parent, label, name, choices) {
  const control = element('select', '', element('label', label, parent));
  control.name = name;
  control.required = true;
  for (const [value, text] of choices) element('option', text, control).value = value;
}

function driverFields(node) {
  input(node, 'Nombre completo', 'name');
  const rut = input(node, 'RUT completo con dígito verificador', 'rut');
  const username = element('output', 'Se obtiene del RUT completo', element('label', 'Usuario de ingreso (RUT sin dígito verificador)', node));
  rut.addEventListener('input', () => {
    username.textContent = rut.value.replace(/[.\-\s]/g, '').slice(0, -1) || 'Se obtiene del RUT completo';
  });
  input(node, 'Clave temporal de 9 dígitos', 'password', {
    type: 'password', pattern: '[0-9]{9}', maxLength: 9, inputMode: 'numeric', autocomplete: 'new-password'
  });
  input(node, 'Correo electrónico', 'email', { type: 'email' });
  select(node, 'Nacionalidad', 'nationalityType', [
    ['', 'Selecciona una opción'], ['chilena', 'Chileno/a'], ['extranjera', 'Extranjero/a']
  ]);
  const nationality = input(node, 'Indica la nacionalidad', 'nationality', { required: false, disabled: true });
  nationality.parentElement.hidden = true;
  node.elements.nationalityType.addEventListener('change', event => {
    const foreign = event.target.value === 'extranjera';
    nationality.parentElement.hidden = !foreign;
    nationality.disabled = !foreign;
    nationality.required = foreign;
  });
  input(node, 'Dirección', 'address');
  input(node, 'Comuna', 'commune');
  const group = element('fieldset', '', node);
  group.className = 'platforms';
  element('legend', 'Plataformas en que trabaja', group);
  for (const platform of platforms) {
    const label = element('label', '', group);
    const checkbox = element('input', '', label);
    Object.assign(checkbox, { type: 'checkbox', name: 'platforms', value: platform });
    label.append(platform);
  }
  input(node, 'Modelo del vehículo', 'vehicleModel');
  input(node, 'Año del vehículo', 'vehicleYear', { inputMode: 'numeric', pattern: '[0-9]{4}', maxLength: 4 });
  input(node, 'Patente', 'plate', { maxLength: 20 });
}

let adminTab = 'Resumen';

function chart(parent, title, values) {
  const card = element('article', '', parent);
  card.className = 'admin-card';
  element('h3', title, card);
  const entries = values.filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) {
    element('p', 'Aún no hay datos.', card);
    return;
  }
  const colors = ['#ffb51b', '#f67b21', '#e65c77', '#a785f7', '#6c9ffa', '#49c7b0'];
  const body = element('div', '', card);
  body.className = 'admin-chart-body';
  const pie = element('div', '', body);
  pie.className = 'admin-pie';
  pie.setAttribute('aria-hidden', 'true');
  const legend = element('ul', '', body);
  legend.className = 'admin-legend';
  let offset = 0;
  const slices = entries.map(([name, count], index) => {
    const color = colors[index % colors.length];
    const end = offset + count / total * 100;
    const item = element('li', '', legend);
    element('span', '● ', item).style.color = color;
    item.append(name + ' · ' + count + ' (' + Math.round(count / total * 100) + '%)');
    const slice = color + ' ' + offset + '% ' + end + '%';
    offset = end;
    return slice;
  });
  pie.style.background = 'conic-gradient(' + slices.join(', ') + ')';
}

function dashboard({ title, subtitle, username, menu, selected, open, eyebrow }) {
  document.body.classList.add('admin-dashboard');
  const header = logout.parentElement.closest('header');
  if (!header.querySelector('.admin-brand')) {
    const brand = element('div', '', header);
    brand.className = 'admin-brand';
    brand.append(header.querySelector('img'));
    const label = element('div', '', brand);
    element('strong', title, label);
    element('small', subtitle, label);
    const session = element('div', '', header);
    session.className = 'admin-session';
    element('span', 'Sesión · ' + username, session);
    session.append(logout);
  }
  header.querySelector('.admin-brand strong').textContent = title;
  header.querySelector('.admin-brand small').textContent = subtitle;
  const layout = element('div', '', panel);
  layout.className = 'admin-layout';
  const nav = element('nav', '', layout);
  nav.setAttribute('aria-label', 'Administración');
  const navTitle = element('span', 'Administración', nav);
  navTitle.className = 'admin-eyebrow';
  const content = element('div', '', layout);
  for (const [tab, icon] of menu) {
    const button = element('button', '', nav);
    button.type = 'button';
    const symbol = element('span', icon, button);
    symbol.className = 'admin-nav-icon';
    symbol.setAttribute('aria-hidden', 'true');
    element('span', tab, button);
    if (tab === selected) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => open(tab));
  }
  const intro = element('div', '', content);
  intro.className = 'admin-intro';
  const headings = element('div', '', intro);
  element('span', eyebrow, headings).className = 'admin-eyebrow';
  element('h1', selected, headings).tabIndex = -1;

  return { content, intro, headings };
}

function renderUnionDirectory(data, content, intro) {
  const add = element('button', '+ Nuevo sindicato', intro);
  add.id = 'new-union';
  add.addEventListener('click', () => openUnionDialog(content, add));
  const directory = element('section', '', content);
  const toolbar = element('div', '', directory);
  toolbar.className = 'directory-toolbar';
  element('h2', 'Directorio de sindicatos', toolbar);
  const search = element('input', '', toolbar);
  search.type = 'search';
  search.placeholder = 'Buscar por nombre, RUT o enlace';
  search.setAttribute('aria-label', search.placeholder);
  const scroll = element('div', '', directory);
  scroll.className = 'directory-scroll';
  const table = element('table', '', scroll);
  const header = element('tr', '', element('thead', '', table));
  for (const label of ['Sindicato / RUT', 'Enlace', 'Socios', 'Estado', 'Acciones']) element('th', label, header).scope = 'col';
  const rows = element('tbody', '', table);
  function showRows() {
    const query = search.value.trim().toLocaleLowerCase('es');
    rows.replaceChildren();
    for (const union of data.unions) {
      if (![union.name, union.rut, union.slug].join(' ').toLocaleLowerCase('es').includes(query)) continue;
      const row = element('tr', '', rows);
      const identity = element('td', '', row);
      element('strong', union.name, identity);
      element('small', union.rut, identity);
      const pathCell = element('td', '', row);
      if (union.active === false) pathCell.textContent = '/' + union.slug;
      else {
        const link = element('a', '/' + union.slug, pathCell);
        link.href = '/' + union.slug;
        if (localDemo) {
          link.removeAttribute('target');
          link.onclick = event => { event.preventDefault(); localDemo.navigate('/' + union.slug); };
        }
        link.target = '_blank';
        link.rel = 'noopener';
      }
      element('td', String(union.affiliations), row);
      element('td', union.active === false ? 'Inactivo' : 'Habilitado', row);
      const controls = element('div', '', element('td', '', row));
      controls.className = 'member-actions';
      const edit = element('button', 'Editar', controls);
      edit.className = 'member-secondary';
      edit.addEventListener('click', () => openUnionDialog(content, edit, union));
      const remove = element('button', 'Eliminar', controls);
      remove.className = 'member-danger';
      remove.addEventListener('click', async () => {
        if (!window.confirm('¿Eliminar definitivamente a ' + union.name + ' y todas sus afiliaciones?')) return;
        remove.disabled = true;
        status.textContent = '';
        try {
          render(await request('admin/unions/delete', { id: union.id }));
          panel.querySelector('#new-union').focus();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          remove.disabled = false;
        }
      });
    }
    if (!rows.children.length) element('td', 'No se encontraron sindicatos.', element('tr', '', rows)).colSpan = 5;
  }
  search.addEventListener('input', showRows);
  showRows();
}

function openUnionDialog(content, trigger, union) {
  const dialog = element('dialog', '', content);
  dialog.className = 'member-dialog';
  dialog.setAttribute('aria-labelledby', 'union-dialog-title');
  const create = form(union ? 'Editar sindicato' : 'Nuevo sindicato', union ? 'Guardar cambios' : 'Guardar',
    union ? 'admin/unions/edit' : 'unions', result => {
      dialog.close();
      render(result);
      panel.querySelector('#new-union').focus();
    }, dialog);
  create.node.querySelector('h2').id = 'union-dialog-title';
  const close = element('button', '×', create.node);
  close.type = 'button';
  close.className = 'member-dialog-close';
  close.setAttribute('aria-label', 'Cerrar ventana');
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); });
  const name = input(create.node, 'Nombre del sindicato', 'unionName', { value: union?.name || '' });
  const slug = input(create.node, 'Nombre del subdominio', 'slug', { value: union?.slug || '', placeholder: 'sucaa', maxLength: 63 });
  const preview = element('p', '', create.node);
  const updatePreview = () => { preview.textContent = 'www.misindicato.cl/' + (slug.value.trim().toLowerCase() || 'sucaa'); };
  slug.addEventListener('input', updatePreview);
  updatePreview();
  input(create.node, 'RUT del sindicato', 'unionRut', { value: union?.rut || '' });
  input(create.node, 'Correo electrónico del sindicato', 'unionEmail', { type: 'email', value: union?.email || '' });
  if (union) {
    Object.assign(element('input', '', create.node), { type: 'hidden', name: 'id', value: union.id });
    const label = element('label', '', create.node);
    label.className = 'member-active';
    Object.assign(element('input', '', label), { type: 'checkbox', name: 'active', checked: union.active !== false });
    label.append('Sindicato activo');
    const president = union.members.find(member => member.role === 'Presidente');
    if (president) element('p', 'Presidencia actual: ' + president.name + '. Para cambiar el titular, abre Cargos directivos.', create.node);
    if (union.members.length) {
      select(create.node, 'Cuenta para restablecer la clave', 'passwordRecipient', union.members.map(member => [
        member.id, member.name + ' · ' + member.role
      ]));
      if (president) create.node.elements.passwordRecipient.value = president.id;
      temporaryPasswordField(create.node);
      element('p', 'Si asignas una clave temporal, se cerrarán las sesiones de esa cuenta en todos sus sindicatos.', create.node);
    }
  } else {
    input(create.node, 'Nombre del presidente', 'name');
    input(create.node, 'RUT del presidente sin dígito verificador', 'rut');
    input(create.node, 'Correo electrónico del presidente', 'email', { type: 'email' });
    input(create.node, 'Clave temporal', 'password', { type: 'password', minLength: 12, autocomplete: 'new-password' });
  }
  element('p', '', create.node).setAttribute('role', 'status');
  const cancel = element('button', 'Cancelar', create.node);
  cancel.type = 'button';
  cancel.className = 'member-secondary';
  cancel.addEventListener('click', () => dialog.close());
  create.finish();
  dialog.showModal();
  name.focus();
}

function renderAdmin(data) {
  function open(tab) {
    adminTab = tab;
    status.textContent = '';
    render(data);
    panel.querySelector('h1').focus();
  }
  const { content, intro, headings } = dashboard({
    title: 'Admin Mi Sindicato', subtitle: 'Administración general de la plataforma',
    username: data.adminName, selected: adminTab, open, eyebrow: 'Control del sistema',
    menu: [['Resumen', '◆'], ['Sindicatos', '▦'], ['Cargos directivos', '♙'],
      ['Vinculaciones', '↔'], ['Registro de acciones', '☷']]
  });

  if (adminTab === 'Resumen') {
    element('p', 'Supervisa los sindicatos, sus cuentas y los permisos de acceso.', headings);
    element('button', 'Gestionar sindicatos', intro).addEventListener('click', () => open('Sindicatos'));
    const metrics = element('div', '', content);
    metrics.className = 'admin-metrics';
    for (const [label, value] of [
      ['Sindicatos habilitados', data.unions.filter(union => union.active !== false).length],
      ['Cuentas registradas', data.accounts],
      ['Afiliaciones', data.affiliations],
      ['Socios conductores', data.accounts],
      ['Cuentas vinculadas', data.linkedAccounts]
    ]) {
      const card = element('article', '', metrics);
      card.className = 'admin-card';
      element('small', label, card);
      element('strong', String(value), card);
    }
    const overview = element('section', '', content);
    element('h2', 'Distribución de sindicatos y accesos', overview);
    const charts = element('div', '', overview);
    charts.className = 'admin-charts';
    chart(charts, 'Afiliaciones por sindicato', data.unions.map(union => [union.name, union.affiliations]));
    chart(charts, 'Afiliaciones por cargo principal', Object.entries(data.byRole));
    chart(charts, 'Socios conductores por sindicato', data.unions.map(union => [union.name, union.conductors]));
    chart(charts, 'Cuentas por tipo de afiliación', [
      ['Un sindicato', data.accounts - data.linkedAccounts], ['Dos sindicatos', data.linkedAccounts]
    ]);
  } else if (adminTab === 'Sindicatos') {
    renderUnionDirectory(data, content, intro);
  } else if (adminTab === 'Cargos directivos') {
    element('p', 'Traspasa un cargo a otro socio del mismo sindicato.', headings);
    const eligible = data.unions.filter(union => union.members.some(member => member.role !== 'Socio conductor') &&
      union.members.some(member => member.role === 'Socio conductor' && member.active !== false));
    if (eligible.length) {
      const transfer = form('Traspasar cargo', 'Confirmar traspaso', 'transfer-office', render, content);
      select(transfer.node, 'Sindicato', 'union', eligible.map(union => [union.id, union.name]));
      select(transfer.node, 'Titular y cargo actual', 'current', []);
      select(transfer.node, 'Socio que recibirá el cargo', 'person', []);
      const roleField = element('input', '', transfer.node);
      roleField.type = 'hidden';
      roleField.name = 'role';
      const unionField = transfer.node.elements.union;
      const personField = transfer.node.elements.person;
      const currentField = transfer.node.elements.current;
      currentField.addEventListener('change', () => {
        roleField.value = currentField.selectedOptions[0].dataset.role || '';
      });
      const updateCandidates = () => {
        const union = eligible.find(item => item.id === unionField.value);
        personField.replaceChildren();
        currentField.replaceChildren();
        element('option', 'Selecciona un socio', personField).value = '';
        element('option', 'Selecciona un cargo', currentField).value = '';
        roleField.value = '';
        for (const member of union.members) {
          if (member.role === 'Socio conductor') {
            if (member.active !== false) element('option', member.name, personField).value = member.id;
          } else {
            const option = element('option', member.role + ' · ' + member.name, currentField);
            option.value = member.id;
            option.dataset.role = member.role;
          }
        }
      };
      updateCandidates();
      unionField.addEventListener('change', updateCandidates);
      element('p', 'El titular saliente conservará su cuenta como socio conductor. Puedes traspasar el cargo a un socio del mismo sindicato que actualmente no tenga otro cargo.', transfer.node);
      input(transfer.node, 'Motivo del cambio', 'reason', { maxLength: 500 });
      transfer.finish();
    } else {
      const notice = element('section', '', content);
      element('p', 'Para traspasar un cargo, el sindicato debe tener un titular y al menos un socio sin cargo disponible.', notice);
    }
  } else if (adminTab === 'Vinculaciones') {
    if (data.unions.length < 2) {
      element('p', 'Habilita al menos dos sindicatos para autorizar una segunda afiliación.', content);
      return;
    }
    const link = form('Autorizar segunda afiliación', 'Autorizar vinculación', 'link', render, content);
    input(link.node, 'RUT de la cuenta existente', 'rut');
    select(link.node, 'Sindicato de destino', 'union', data.unions.map(union => [union.id, union.name]));
    select(link.node, 'Rol en el segundo sindicato', 'role', roles.slice(1).map(role => [role, role]));
    const reason = element('textarea', '', element('label', 'Resultado de las consultas y revisión de políticas', link.node));
    Object.assign(reason, { name: 'reason', required: true, maxLength: 500 });
    link.finish();
  } else {
    const audit = element('section', '', content);
    element('h2', 'Registro de autorizaciones', audit);
    for (const entry of data.audit) {
      const time = new Date(entry.at).toLocaleString('es-CL');
      const detail = entry.newHolder
        ? [entry.union, entry.role, entry.previousHolder + ' → ' + entry.newHolder, entry.reason]
        : entry.person
        ? [entry.person, entry.source + ' → ' + entry.union, entry.role, entry.reason]
        : [entry.union];
      element('p', [time, entry.action, ...detail].join(' · '), audit);
    }
    if (!data.audit.length) element('p', 'Todavía no hay acciones registradas.', audit);
  }
}

function render(data) {
  panel.replaceChildren();
  logout.hidden = false;
  if (data.general) return renderAdmin(data);
  if (data.temporaryPassword) {
    const change = form('Cambia tu clave temporal', 'Guardar nueva clave', 'password');
    input(change.node, 'Clave temporal', 'currentPassword', { type: 'password', autocomplete: 'current-password' });
    input(change.node, 'Nueva clave', 'password', { type: 'password', minLength: 12, autocomplete: 'new-password' });
    change.finish();
    return;
  }

  document.body.classList.toggle('admin-dashboard', data.active?.role === 'Presidente');
  if (data.active?.role !== 'Presidente') {
    const header = logout.closest('header');
    const brand = header.querySelector('.admin-brand');
    const session = header.querySelector('.admin-session');
    if (brand && session) {
      header.append(brand.querySelector('img'), logout);
      brand.remove();
      session.remove();
    }
  }
  if (data.active?.role !== 'Presidente') element('h1', 'Hola, ' + data.name, panel);
  if (data.memberships.length > 1) {
    const switcher = form('Tu cuenta tiene dos sindicatos vinculados', 'Abrir sindicato', 'select');
    switcher.node.classList.add('union-switcher');
    select(switcher.node, 'Sindicato y perfiles', 'union', data.memberships.map(link => [
      link.union, link.name + ' · ' + (link.role === 'Socio conductor' ? link.role : 'Socio conductor + ' + link.role)
    ]));
    if (data.active) switcher.node.elements.union.value = data.active.union;
    switcher.finish();
  }
  if (!data.active) return;
  if (data.active.role === 'Presidente') return renderPresident(data);
  renderDriver(data, panel);
  if (data.active.role === 'Socio conductor') return;
  const area = element('section', '', panel);
  element('h2', data.active.role, area);
  const [title, description] = profile[data.active.role];
  element('h3', title, area);
  element('p', description, area);
}

function renderDriver(data, parent) {
  const memberArea = element('section', '', parent);
  element('h2', data.active.name + ' · Socio conductor', memberArea);
  element('h3', profile['Socio conductor'][0], memberArea);
  element('p', profile['Socio conductor'][1], memberArea);
  if (data.driver) {
    const details = element('dl', '', memberArea);
    const driver = data.driver;
    for (const [label, value] of [
      ['RUT', driver.rut], ['Usuario', driver.username], ['Correo', driver.email],
      ['Nacionalidad', driver.nationality], ['Dirección', driver.address], ['Comuna', driver.commune],
      ['Plataformas', driver.platforms?.join(', ')], ['Modelo', driver.vehicleModel],
      ['Año', driver.vehicleYear], ['Patente', driver.plate]
    ]) {
      if (!value) continue;
      element('dt', label, details);
      element('dd', value, details);
    }
  }
}

let presidentTab = 'Resumen';

function renderPresident(data) {
  function open(tab) {
    presidentTab = tab;
    status.textContent = '';
    render(data);
    panel.querySelector('h1').focus();
  }
  const { content, intro, headings } = dashboard({
    title: 'Panel de Presidencia', subtitle: data.active.name, username: data.name,
    selected: presidentTab, open, eyebrow: 'Administración del sindicato',
    menu: [['Resumen', '◆'], ['Socios conductores', '▦'], ['Cargos directivos', '♙'], ['Mi ficha', '☷']]
  });
  if (presidentTab === 'Mi ficha') return renderDriver(data, content);
  if (presidentTab === 'Resumen') {
    element('p', 'Consulta la composición de tu sindicato.', headings);
    element('button', 'Gestionar socios', intro).addEventListener('click', () => open('Socios conductores'));
    const metrics = element('div', '', content);
    metrics.className = 'admin-metrics';
    const byRole = role => data.members.filter(member => member.role === role).length;
    const totals = [['Socios conductores', data.members.length],
      ...roles.slice(0, -1).map(role => [role, byRole(role)])];
    for (const [label, value] of totals) {
      const card = element('article', '', metrics);
      card.className = 'admin-card';
      element('small', label, card);
      element('strong', String(value), card);
    }
    const overview = element('section', '', content);
    element('h2', 'Composición del sindicato', overview);
    chart(overview, 'Socios por cargo principal', roles.map(role => [role, byRole(role)]));
    return;
  }
  if (presidentTab === 'Socios conductores') {
    element('p', 'Registra socios y consulta sus accesos al sindicato.', headings);
    return renderMemberDirectory(data, content, intro);
  }
  const list = element('section', '', content);
  const officers = presidentTab === 'Cargos directivos';
  element('h2', officers ? 'Titulares de cargos' : 'Socios registrados', list);
  for (const member of data.members) {
    if (!officers || member.role !== 'Socio conductor') {
      element('p', member.name + ' · ' + member.role, list);
    }
  }
}

function renderMemberDirectory(data, content, intro) {
  const add = element('button', '+ Nuevo socio', intro);
  add.id = 'new-member';
  const directory = element('section', '', content);
  const toolbar = element('div', '', directory);
  toolbar.className = 'directory-toolbar';
  const heading = element('div', '', toolbar);
  element('h2', 'Directorio de socios', heading);
  element('p', 'Los socios deben cambiar su clave temporal en el primer ingreso.', heading);
  const search = element('input', '', toolbar);
  search.type = 'search';
  search.placeholder = 'Buscar por nombre, usuario o cargo';
  search.setAttribute('aria-label', search.placeholder);
  const table = element('table', '', element('div', '', directory));
  table.parentElement.className = 'directory-scroll';
  const header = element('tr', '', element('thead', '', table));
  for (const label of ['Nombre / usuario', 'Cargo', 'Plataformas', 'Acceso', 'Acciones']) {
    element('th', label, header).scope = 'col';
  }
  const rows = element('tbody', '', table);
  function showRows() {
    const query = search.value.trim().toLocaleLowerCase('es');
    rows.replaceChildren();
    for (const member of data.members) {
      if (![member.name, member.username, member.role].join(' ').toLocaleLowerCase('es').includes(query)) continue;
      const row = element('tr', '', rows);
      const identity = element('td', '', row);
      element('strong', member.name, identity);
      element('small', member.username, identity);
      element('span', member.role, element('td', '', row)).className = 'directory-badge';
      element('td', member.platforms?.join(', ') || '—', row);
      element('td', member.active === false ? 'Inactivo' : member.temporaryPassword ? 'Clave temporal' : 'Habilitado', row);
      const actions = element('td', '', row);
      if (member.role === 'Presidente') continue;
      const controls = element('div', '', actions);
      controls.className = 'member-actions';
      const edit = element('button', 'Editar', controls);
      edit.className = 'member-secondary';
      edit.addEventListener('click', () => openMemberDialog(content, edit, member));
      const remove = element('button', 'Eliminar', controls);
      remove.className = 'member-danger';
      remove.addEventListener('click', async () => {
        if (!window.confirm('¿Eliminar a ' + member.name + ' de este sindicato? Perderá el acceso a este sindicato.')) return;
        status.textContent = '';
        remove.disabled = true;
        try {
          render(await request('members/delete', { id: member.id }));
          panel.querySelector('#new-member').focus();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          remove.disabled = false;
        }
      });
    }
    if (!rows.children.length) {
      element('td', query ? 'No se encontraron socios.' : 'Aún no hay socios registrados.', element('tr', '', rows)).colSpan = 5;
    }
  }
  search.addEventListener('input', showRows);
  showRows();
  add.addEventListener('click', () => openMemberDialog(content, add));
}

function openMemberDialog(content, trigger, member) {
  const dialog = element('dialog', '', content);
  dialog.className = 'member-dialog';
  dialog.setAttribute('aria-labelledby', 'new-member-title');
  const create = form(member ? 'Editar socio' : 'Nuevo socio', member ? 'Guardar cambios' : 'Guardar socio',
    member ? 'members/edit' : 'members', result => {
    dialog.close();
    render(result);
    panel.querySelector('#new-member').focus();
  }, dialog);
  const title = create.node.querySelector('h2');
  title.id = 'new-member-title';
  const close = element('button', '×', create.node);
  close.className = 'member-dialog-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar ventana');
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger.focus();
  });
  driverFields(create.node);
  if (member) {
    const fields = create.node.elements;
    for (const [key, value] of Object.entries({ ...member.driver, name: member.name, email: member.email, rut: member.id })) {
      if (key !== 'platforms' && fields[key] && typeof value === 'string') fields[key].value = value;
    }
    fields.rut.dispatchEvent(new Event('input'));
    fields.rut.readOnly = true;
    fields.name.readOnly = Boolean(member.shared);
    fields.email.readOnly = Boolean(member.shared);
    fields.password.disabled = true;
    fields.password.parentElement.hidden = true;
    fields.nationalityType.dispatchEvent(new Event('change'));
    for (const checkbox of create.node.querySelectorAll('input[name="platforms"]')) {
      checkbox.checked = member.platforms?.includes(checkbox.value) || false;
    }
    const id = element('input', '', create.node);
    Object.assign(id, { type: 'hidden', name: 'id', value: member.id });
    element('output', member.role, element('label', 'Cargo actual', create.node));
    const label = element('label', '', create.node);
    label.className = 'member-active';
    Object.assign(element('input', '', label), { type: 'checkbox', name: 'active', checked: member.active !== false });
    label.append('Cuenta activa');
    if (member.shared) {
      element('p', 'El nombre y correo de una cuenta vinculada se conservan en ambos sindicatos. Admin Mi Sindicato puede restablecer su clave.', create.node);
    } else {
      temporaryPasswordField(create.node);
    }
  } else {
    select(create.node, 'Cargo adicional', 'role', ['Socio conductor', ...roles.slice(1, -1)].map(role => [
      role, role === 'Socio conductor' ? 'Ninguno (solo socio conductor)' : role
    ]));
  }
  element('p', '', create.node).setAttribute('role', 'status');
  const cancel = element('button', 'Cancelar', create.node);
  cancel.className = 'member-secondary';
  cancel.type = 'button';
  cancel.addEventListener('click', () => dialog.close());
  create.finish();
  dialog.showModal();
  create.node.elements.name.focus();
}

function generalLogin() {
  const login = form('Admin Mi Sindicato', 'Ingresar', 'general/login', () => {
    if (localDemo) localDemo.navigate('/admin');
    else location.reload();
  });
  input(login.node, 'Usuario', 'username', { autocomplete: 'username' });
  input(login.node, 'Clave', 'password', { type: 'password', autocomplete: 'current-password' });
  if (localDemo) {
    element('p', 'Admin de pruebas · Usuario 167704514 · Clave 123456789. Usa datos ficticios. El autenticador se comprueba en la versión con servidor.', login.node);
  } else {
    input(login.node, 'Código de autenticación', 'code', { required: !window.CloudPortal, inputMode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}' });
    if (window.CloudPortal) element('p', 'En el primer ingreso deja el código vacío para configurar Google Authenticator. Después ingresa su código de seis dígitos.', login.node);
  }
  login.finish();
  if (window.CloudPortal) {
    const recover=element('button', 'Establecer o recuperar clave de Admin', panel);
    recover.type='button';
    recover.onclick=async()=>{
      const email=window.prompt('Correo de administración general', 'eduardo.basstian@gmail.com');
      if(!email)return;
      try { await CloudPortal.recover(email); status.textContent='Revisa tu correo y abre el enlace para establecer la clave.'; }
      catch(error){status.textContent=error.message;}
    };
  }
}

if (window.CloudPortal?.recovery) {
  const recovery=form('Establecer contraseña', 'Guardar clave', 'unused', ()=>{});
  input(recovery.node,'Nueva contraseña (mínimo 12 caracteres)','password',{type:'password',minLength:12});
  recovery.finish();
  recovery.node.addEventListener('submit',async event=>{
    event.stopImmediatePropagation();
    event.preventDefault();
    try{await CloudPortal.recoveryPassword(recovery.node.elements.password.value);}
    catch(error){status.textContent=error.message;}
  },true);
} else request(general ? 'admin/panel' : 'panel').then(data => {
  if (data.temporaryPassword || Boolean(data.general) === general) render(data);
  else navigate(data.general ? '/admin' : '/panel');
}).catch(error => {
  if (general) generalLogin();
  else if (error.message === 'Inicia sesión.') navigate('/');
  else status.textContent = error.message;
});
