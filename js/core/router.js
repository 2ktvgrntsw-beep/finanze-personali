// router.js — Routing basato su hash con supporto a parametri.
// Formato rotta: #/nome?chiave=valore&... — i parametri servono per il drill-down
// (es. #/spese?macro=Casa&cat=Bollette) e per i filtri dei movimenti.

const routes = {};
let _current = null;

export const registerRoute = (name, handler) => { routes[name] = handler; };

// Costruisce un hash con parametri
export const buildHash = (name, params = {}) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `#/${name}${q ? '?' + q : ''}`;
};

export const navigate = (name, params = {}) => {
  const h = buildHash(name, params);
  if (location.hash === h) renderCurrent(); else location.hash = h;
};

export const parseHash = () => {
  const raw = location.hash.replace(/^#\//, '') || 'spese';
  const [name, query] = raw.split('?');
  const params = {};
  if (query) for (const pair of query.split('&')) {
    const [k, v] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return { name, params };
};

export const currentRoute = () => _current;

export const renderCurrent = async () => {
  const { name, params } = parseHash();
  _current = { name, params };
  const handler = routes[name] || routes['spese'];

  const root = document.getElementById('app-root');
  root.className = 'app-main view-' + name;
  root.innerHTML = '';
  await handler(root, params);

  _updateChrome(name);
  window.scrollTo(0, 0);
};

// Aggiorna barra di navigazione attiva e visibilità del tasto indietro
const ROTTE_PRINCIPALI = ['spese', 'movimenti', 'patrimonio', 'ricorrenti', 'analisi'];
const _updateChrome = (name) => {
  document.querySelectorAll('.bottom-nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === name));
  const back = document.getElementById('btn-back');
  if (back) back.style.display = ROTTE_PRINCIPALI.includes(name) ? 'none' : 'flex';
};

export const initRouter = () => {
  window.addEventListener('hashchange', renderCurrent);
  if (!location.hash) location.hash = '#/spese';
  else renderCurrent();
};

export { ROTTE_PRINCIPALI };
