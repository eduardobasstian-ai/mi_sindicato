// Mode de pruebas generado desde server.js con preparar-local.cjs.

(() => {
  if (location.protocol !== 'file:') return;
  const key = 'misindicato.demo.v1';
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  let data = saved?.data || {unions: [], people: [], links: [], audit: [], lastAdminStep: -1};
  const sessions = new Map(saved?.sessions || []);
  const attempts = new Map();
  const roles = ['Presidente','Tesorero','Secretario','Revisor de cuentas','Socio conductor'];
  const platforms = ['Uber','Didi','Indrive','GetGo','Cabify','Otras'];
  const adminName = '167704514', adminHash = '123456789', adminVersion = 'demo', secureCookie = '';
  const files = new Map([['/admin',true],['/panel',true],['/index.html',true]]);
  let cookies = saved?.cookies || {};
  const crypto = {
    randomUUID: () => window.crypto.randomUUID(),
    randomBytes: () => ({toString: () => Array.from(window.crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,'0')).join('')})
  };
  function passwordHash(value) { return 'demo:' + value; }
  function verify(value, stored) { return stored === 'demo:' + value || (stored === adminHash && value === adminHash); }
  function verifyOtp() { return 0; }
  function persist() { localStorage.setItem(key, JSON.stringify({data, sessions:[...sessions], cookies})); }
  function save(next) { localStorage.setItem(key, JSON.stringify({data:next,sessions:[...sessions],cookies})); data = next; }
  function saveSessions() { persist(); }
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function field(value, label, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, 'Revisa el campo ' + label + '.');
  return value.trim();
}

function rut(value) {
  const id = field(value, 'RUT').replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(id)) fail(400, 'Ingresa el RUT con dígito verificador.');
  return id;
}

function email(value) {
  const address = field(value, 'correo electrónico', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) fail(400, 'Ingresa un correo electrónico válido.');
  return address;
}

function presidentRut(value) {
  const username = field(value, 'RUT del presidente').replace(/\./g, '');
  if (!/^[1-9]\d{6,7}$/.test(username)) fail(400, 'Ingresa el RUT del presidente sin dígito verificador.');
  const sum = [...username].reverse().reduce((total, digit, index) => total + Number(digit) * (2 + index % 6), 0);
  return { username, id: username + '0123456789K'[(11 - sum % 11) % 11] };
}

function createPerson(next, input, type) {
  const id = rut(input.rut);
  if (next.people.some(person => person.id === id)) fail(409, 'Este RUT ya tiene cuenta. Solicita la vinculación al administrador general.');
  const username = field(input.username, 'usuario').toLowerCase();
  if (next.people.some(person => person.username === username)) fail(409, 'Ya existe una cuenta con ese usuario.');
  const password = input.password;
  if (type === 'member') {
    if (typeof password !== 'string' || !/^\d{9}$/.test(password)) fail(400, 'La clave temporal debe tener exactamente 9 dígitos.');
  } else if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    fail(400, 'La clave debe tener entre 12 y 256 caracteres.');
  }
  next.people.push({ id, username, name: field(input.name, 'nombre'), hash: passwordHash(password),
    email: email(input.email), temporaryPassword: true });
  return id;
}

function driverDetails(input) {
  if (!['chilena', 'extranjera'].includes(input.nationalityType)) fail(400, 'Selecciona si es chileno o extranjero.');
  if (!Array.isArray(input.platforms) || !input.platforms.length ||
      !input.platforms.every(platform => platforms.includes(platform))) fail(400, 'Selecciona las plataformas en que trabaja.');
  const year = field(input.vehicleYear, 'año', 4);
  if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getFullYear() + 1) fail(400, 'Ingresa un año de vehículo válido.');
  return {
    nationalityType: input.nationalityType,
    nationality: input.nationalityType === 'chilena' ? 'Chilena' : field(input.nationality, 'nacionalidad'),
    address: field(input.address, 'dirección', 200),
    commune: field(input.commune, 'comuna'),
    platforms: [...new Set(input.platforms)],
    vehicleModel: field(input.vehicleModel, 'modelo del vehículo'),
    vehicleYear: year,
    plate: field(input.plate, 'patente', 20).toUpperCase()
  };
}

function resetTemporaryPassword(person, password) {
  if (password === undefined || password === '') return;
  if (typeof password !== 'string' || !/^\d{9}$/.test(password)) fail(400, 'La clave temporal debe tener exactamente 9 dígitos.');
  person.hash = passwordHash(password);
  person.temporaryPassword = true;
  return person.id;
}

function json(res, payload, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.headers['content-type'] !== 'application/json') fail(415, 'Formato de solicitud inválido.');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) fail(413, 'Solicitud demasiado grande.');
  }
  try { return JSON.parse(body); } catch { fail(400, 'Solicitud inválida.'); }
}

function enabledLink(link) {
  return link.active !== false && data.unions.some(union => union.id === link.union && union.active !== false);
}

function membership(session) {
  return data.links.find(link => link.person === session?.id && link.union === session?.union && enabledLink(link));
}

function panel(session) {
  if (session?.general) {
    const countsByUnion = new Map(data.unions.map(union => [
      union.id, { ...union, affiliations: 0, conductors: 0, members: [] }
    ]));
    const byRole = Object.fromEntries(roles.map(role => [role, 0]));
    const byPerson = new Map();
    const people = new Map(data.people.map(person => [person.id, person]));
    for (const link of data.links) {
      const union = countsByUnion.get(link.union);
      union.affiliations++;
      union.conductors++;
      union.members.push({ id: link.person, name: people.get(link.person).name, role: link.role, active: link.active !== false });
      byRole[link.role]++;
      byPerson.set(link.person, (byPerson.get(link.person) || 0) + 1);
    }
    return {
      general: true, adminName, unions: [...countsByUnion.values()],
      accounts: data.people.length, affiliations: data.links.length, byRole,
      linkedAccounts: [...byPerson.values()].filter(count => count > 1).length,
      audit: data.audit.slice(-15).reverse()
    };
  }
  if (!session) fail(401, 'Inicia sesión.');
  const person = data.people.find(item => item.id === session.id);
  if (person.temporaryPassword) return { temporaryPassword: true };
  const memberships = data.links.filter(link => link.person === session.id && enabledLink(link))
    .map(link => ({ ...link, name: data.unions.find(union => union.id === link.union).name }));
  const active = memberships.find(link => link.union === session.union);
  const members = active?.role === 'Presidente' ? data.links.filter(link => link.union === active.union)
    .map(link => {
      const member = data.people.find(item => item.id === link.person);
      return { id: member.id, name: member.name, username: member.username, email: member.email,
        role: link.role, active: link.active !== false, driver: link.driver,
        shared: data.links.some(other => other.person === member.id && other.union !== link.union),
        platforms: link.driver?.platforms || [], temporaryPassword: Boolean(member.temporaryPassword) };
    }) : [];
  return { name: person.name, memberships, active, members, driver: {
    rut: person.id, username: person.username, email: person.email, ...active?.driver
  } };
}

async function api(req, res, route) {
  const adminRoute = route.startsWith('/api/admin/') ||
    ['/api/general/login', '/api/unions', '/api/link', '/api/transfer-office'].includes(route);
  const cookieName = adminRoute ? 'sindicato_admin_session' : 'sindicato_session';
  const rawToken = new RegExp('(?:^|; )' + cookieName + '=([a-f0-9]{64})(?:;|$)').exec(req.headers.cookie || '')?.[1];
  const token = rawToken && rawToken;
  const existing = sessions.get(token);
  const session = existing?.expires > Date.now() && Boolean(existing.general) === adminRoute &&
    (adminRoute ? adminVersion && existing.version === adminVersion : data.links.some(link =>
      link.person === existing.id && enabledLink(link) && (!existing.union || link.union === existing.union)))
    ? existing : null;
  if (existing && !session) sessions.delete(token);
  if (req.method === 'POST' && (route === '/api/logout' || route === '/api/admin/logout')) {
    if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Solicitud no autorizada.');
    sessions.delete(token);
    saveSessions();
    res.setHeader('Set-Cookie', cookieName + '=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' + secureCookie);
    res.writeHead(303, { Location: route === '/api/admin/logout' ? '/admin' : '/' });
    return res.end();
  }
  if (req.method === 'GET' && ['/api/panel', '/api/admin/panel'].includes(route)) return json(res, panel(session));
  if (req.method !== 'POST') fail(404, 'Ruta no disponible.');
  const input = await readBody(req);
  if (!input || typeof input !== 'object') fail(400, 'Solicitud inválida.');

  if (route === '/api/login' || route === '/api/general/login') {
    const address = route + ':' + req.socket.remoteAddress;
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    const rate = attempts.get(address) || { count: 0, until: now + 15 * 60_000 };
    if (rate.count >= 10) fail(429, 'Demasiados intentos. Inténtalo en 15 minutos.');
    rate.count++;
    attempts.set(address, rate);
    let identity;
    if (route === '/api/general/login') {
      const step = verifyOtp(input.code);
      if (!adminName || input.username !== adminName || !verify(input.password, adminHash) || step === null) fail(401, 'Credenciales o código inválidos.');
      save({ ...data, lastAdminStep: step });
      identity = { general: true, version: adminVersion };
    } else {
      const identifier = field(input.username, 'usuario');
      const person = data.people.find(item => item.username === identifier.toLowerCase() ||
        item.id === identifier.replace(/[.\-\s]/g, '').toUpperCase());
      if (!person || !verify(input.password, person.hash)) fail(401, 'Usuario o clave incorrectos.');
      const links = data.links.filter(link => link.person === person.id && enabledLink(link));
      if (!links.length) fail(403, 'La cuenta no tiene afiliaciones activas.');
      const union = input.slug && data.unions.find(item => item.slug === input.slug);
      if (input.slug && (!union || !links.some(link => link.union === union.id))) fail(403, 'La cuenta no tiene acceso a este sindicato.');
      identity = { id: person.id, union: union ? union.id : links.length === 1 ? links[0].union : null };
    }
    attempts.delete(address);
    sessions.delete(token);
    const nextToken = crypto.randomBytes(32).toString('hex');
    sessions.set(nextToken,
      { ...identity, expires: now + (identity.general ? 30 : 480) * 60_000 });
    saveSessions();
    res.setHeader('Set-Cookie', cookieName + '=' + nextToken + '; Path=/; HttpOnly; SameSite=Strict' + secureCookie);
    return json(res, { destination: identity.general ? '/admin' : '/panel' });
  }

  if (!session) fail(401, 'Inicia sesión.');
  if (!session.general) {
    const person = data.people.find(item => item.id === session.id);
    if (route === '/api/password' && person.temporaryPassword) {
      if (!verify(input.currentPassword, person.hash)) fail(401, 'La clave temporal es incorrecta.');
      if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256 ||
          input.password === input.currentPassword) fail(400, 'Elige una clave distinta de entre 12 y 256 caracteres.');
      const next = structuredClone(data);
      const updated = next.people.find(item => item.id === session.id);
      updated.hash = passwordHash(input.password);
      delete updated.temporaryPassword;
      save(next);
      for (const [key, value] of sessions) if (key !== token && value.id === session.id) sessions.delete(key);
      saveSessions();
      return json(res, panel(session));
    }
    if (person.temporaryPassword) fail(403, 'Primero cambia tu clave temporal.');
  }
  if (route === '/api/select') {
    if (!data.links.some(link => link.person === session.id && link.union === input.union && enabledLink(link))) fail(403, 'Acceso denegado.');
    session.union = input.union;
    saveSessions();
    return json(res, panel(session));
  }

  const next = structuredClone(data);
  let resetPerson;
  if (route === '/api/admin/unions/delete' && session.general) {
    const union = next.unions.find(item => item.id === input.id);
    if (!union) fail(404, 'Sindicato no encontrado.');
    const affected = new Set(next.links.filter(link => link.union === union.id).map(link => link.person));
    next.unions = next.unions.filter(item => item.id !== union.id);
    next.links = next.links.filter(link => link.union !== union.id);
    next.people = next.people.filter(person => !affected.has(person.id) || next.links.some(link => link.person === person.id));
    next.audit.push({ action: 'Sindicato eliminado', union: union.name, at: new Date().toISOString() });
  } else if (['/api/unions', '/api/admin/unions/edit'].includes(route) && session.general) {
    const editing = route.endsWith('/edit');
    const existingUnion = editing ? next.unions.find(item => item.id === input.id) : null;
    if (editing && !existingUnion) fail(404, 'Sindicato no encontrado.');
    const name = field(input.unionName, 'sindicato');
    const slug = field(input.slug, 'subdominio', 63).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(400, 'Usa letras, números y guiones para el subdominio.');
    if (files.has('/' + slug) || slug === 'api' || slug === 'img' || next.unions.some(union => union.slug === slug && union !== existingUnion)) fail(409, 'Ese nombre de enlace ya está en uso.');
    const unionRut = rut(input.unionRut);
    if (next.unions.some(item => item.rut === unionRut && item !== existingUnion)) fail(409, 'Ya existe un sindicato con ese RUT.');
    const unionEmail = email(input.unionEmail);
    if (existingUnion) {
      if (typeof input.active !== 'boolean') fail(400, 'Indica el estado del sindicato.');
      Object.assign(existingUnion, { name, slug, rut: unionRut, email: unionEmail, active: input.active });
      if (input.temporaryPassword !== undefined && input.temporaryPassword !== '') {
        const target = next.links.find(link => link.union === existingUnion.id && link.person === input.passwordRecipient);
        const person = next.people.find(item => item.id === target?.person);
        if (!person) fail(400, 'Selecciona una cuenta de este sindicato.');
        resetPerson = resetTemporaryPassword(person, input.temporaryPassword);
        next.audit.push({ action: 'Clave temporal asignada a ' + person.name, union: name, at: new Date().toISOString() });
      }
      next.audit.push({ action: input.active ? 'Sindicato actualizado' : 'Sindicato desactivado', union: name, at: new Date().toISOString() });
    } else {
      const president = presidentRut(input.rut);
      const union = crypto.randomUUID();
      const person = createPerson(next, { ...input, rut: president.id, username: president.username }, 'president');
      next.unions.push({ id: union, name, slug, rut: unionRut, email: unionEmail });
      next.links.push({ union, person, role: 'Presidente' });
      next.audit.push({ action: 'Sindicato habilitado', union: name, at: new Date().toISOString() });
    }
  } else if (route === '/api/transfer-office' && session.general) {
    const union = next.unions.find(item => item.id === input.union);
    const candidate = next.links.find(link => link.union === union?.id && link.person === input.person && link.role === 'Socio conductor' && link.active !== false);
    if (!candidate) fail(400, 'Selecciona a un socio sin cargo del mismo sindicato.');
    const current = next.links.find(link => link.union === union.id && link.person === input.current &&
      link.role === input.role && roles.slice(0, -1).includes(link.role));
    if (!current) fail(409, 'El cargo cambió. Actualiza el panel y vuelve a intentarlo.');
    const reason = field(input.reason, 'motivo del cambio', 500);
    candidate.role = current.role;
    current.role = 'Socio conductor';
    next.audit.push({ action: 'Traspaso de cargo', union: union.name, role: candidate.role,
      previousHolder: current.person, newHolder: candidate.person, reason, at: new Date().toISOString() });
  } else if (route === '/api/link' && session.general) {
    const person = rut(input.rut);
    const union = next.unions.find(item => item.id === input.union);
    if (!union || !roles.slice(1).includes(input.role)) fail(400, 'Selecciona el sindicato y el rol.');
    const original = next.links.find(link => link.person === person);
    if (!original) fail(404, 'No se encontró una afiliación existente.');
    if (next.links.some(link => link.person === person && link.union === union.id)) fail(409, 'La cuenta ya está vinculada a ese sindicato.');
    if (next.links.filter(link => link.person === person).length >= 2) fail(409, 'La cuenta ya tiene dos sindicatos vinculados.');
    const reason = field(input.reason, 'resultado de la revisión de políticas', 500);
    next.links.push({ union: union.id, person, role: input.role });
    const source = next.unions.find(item => item.id === original.union);
    next.audit.push({
      action: 'Segunda afiliación autorizada', person, source: source.name,
      union: union.name, role: input.role, reason, at: new Date().toISOString()
    });
  } else if (['/api/members/edit', '/api/members/delete'].includes(route) && membership(session)?.role === 'Presidente') {
    const link = next.links.find(item => item.union === session.union && item.person === input.id);
    if (!link || link.role === 'Presidente') fail(403, 'No puedes modificar esta afiliación desde el directorio.');
    const person = next.people.find(item => item.id === link.person);
    const shared = next.links.some(item => item.person === link.person && item.union !== link.union);
    if (route.endsWith('/delete')) {
      next.links.splice(next.links.indexOf(link), 1);
      if (!shared) next.people.splice(next.people.indexOf(person), 1);
    } else {
      if (typeof input.active !== 'boolean') fail(400, 'Indica el estado de la cuenta.');
      link.active = input.active;
      link.driver = driverDetails(input);
      if (!shared) {
        person.name = field(input.name, 'nombre');
        person.email = email(input.email);
        resetPerson = resetTemporaryPassword(person, input.temporaryPassword);
      } else if (input.temporaryPassword !== undefined && input.temporaryPassword !== '') {
        fail(403, 'Solo el administrador general puede restablecer la clave de una cuenta vinculada.');
      }
    }
    save(next);
    if (route.endsWith('/delete') || !link.active || resetPerson) {
      for (const [key, value] of sessions) {
        if (value.id === person.id && (!shared || value.union === session.union)) sessions.delete(key);
      }
      saveSessions();
    }
    return json(res, panel(session));
  } else if (route === '/api/members' && membership(session)?.role === 'Presidente') {
    if (!roles.slice(1).includes(input.role)) fail(400, 'Selecciona un rol válido.');
    const fullRut = rut(input.rut);
    const identity = presidentRut(fullRut.slice(0, -1));
    if (identity.id !== fullRut) fail(400, 'El dígito verificador del RUT no coincide.');
    const driver = driverDetails(input);
    const person = createPerson(next, { ...input, rut: fullRut, username: identity.username }, 'member');
    next.links.push({ union: session.union, person, role: input.role, driver });
  } else {
    fail(403, 'Acceso denegado.');
  }
  save(next);
  const closeUnion = route === '/api/admin/unions/delete' || (route === '/api/admin/unions/edit' && !input.active);
  if (closeUnion || resetPerson) {
    for (const [key, value] of sessions) {
      if ((closeUnion && value.union === input.id) || (resetPerson && value.id === resetPerson)) sessions.delete(key);
    }
    saveSessions();
  }
  return json(res, panel(session), 201);
}


  window.LocalDemo = {
    async request(route, payload) {
      if (route === 'login') payload = {...payload, slug:sessionStorage.getItem('demoUnion') || ''};
      let status = 200, result, redirect;
      const req = {
        method: payload === undefined ? 'GET' : 'POST',
        headers: {'content-type':'application/json',cookie:Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ')},
        socket: {remoteAddress:'local'},
        async *[Symbol.asyncIterator]() { yield JSON.stringify(payload); }
      };
      const res = {
        setHeader(name,value) { if(name==='Set-Cookie') { const [name,token] = value.split(';')[0].split('='); cookies[name]=token; } },
        writeHead(code,headers) { status=code; redirect=headers?.Location; },
        end(value) { result=value ? JSON.parse(value) : {}; }
      };
      try { await api(req,res,'/api/'+route); persist(); }
      catch(error) { throw new Error(error.status ? error.message : 'No se pudieron guardar los datos locales. Revisa el almacenamiento del navegador.'); }
      if(status>=400) throw new Error(result.error);
      if(redirect) this.navigate(redirect);
      return result;
    },
    navigate(route) {
      if (!['/admin','/panel'].includes(route)) {
        sessionStorage.setItem('demoUnion', route === '/' ? '' : route.slice(1));
      }
      const view = route === '/admin' ? 'admin' : route === '/panel' ? 'panel' : 'login';
      location.hash = view;
      location.reload();
    }
  };
})();
