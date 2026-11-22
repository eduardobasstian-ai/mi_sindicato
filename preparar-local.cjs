const fs = require('node:fs');
const source = fs.readFileSync('server.js', 'utf8');
let functions = source.slice(source.indexOf('function fail('), source.indexOf('http.createServer'));
functions = functions.replace(/crypto\.createHash\('sha256'\)\.update\((rawToken|nextToken)\)\.digest\('hex'\)/g, '$1');
const prelude = `
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
`;
const ending = `
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
`;
fs.writeFileSync('local-api.js', '// Mode de pruebas generado desde server.js con preparar-local.cjs.\n' + prelude + functions + ending);
const html = fs.readFileSync('sindicato-panel.html','utf8');
fs.writeFileSync('local-view.js', 'window.localPanelTemplate = ' + JSON.stringify(html) + ';\n');

