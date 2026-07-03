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
  // il chrome (header) si aggiorna PRIMA del render: così il componente può
  // sovrascriverlo quando serve (es. breadcrumb del drill in Analisi).
  _updateChrome(name);
  await handler(root, params);

  window.scrollTo(0, 0);
};

// Aggiorna barra di navigazione attiva e visibilità del tasto indietro
const ROTTE_PRINCIPALI = ['spese', 'movimenti', 'patrimonio', 'ricorrenti', 'analisi'];
const _updateChrome = (name) => {
  document.querySelectorAll('.bottom-nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === name));
  const back = document.getElementById('btn-back');
  if (back) back.style.display = ROTTE_PRINCIPALI.includes(name) ? 'none' : 'flex';
  // HEADER COMPATTO: nelle pagine principali il titolo è ridondante (c'è il tab
  // evidenziato sotto) e sparisce; resta nelle sottopagine come breadcrumb.
  // La lente vive solo nei Movimenti. Il selettore periodo (head-seg) vive
  // nell'header in Spese e Movimenti; il + si sposta a destra nelle sottopagine.
  const titolo = document.getElementById('view-title');
  if (titolo) titolo.style.display = ROTTE_PRINCIPALI.includes(name) ? 'none' : 'block';
  const lente = document.getElementById('btn-search');
  if (lente) lente.style.display = (name === 'movimenti' || name === 'ricerca') ? 'flex' : 'none';
  const seg = document.getElementById('head-seg');
  if (seg) {
    const usaSeg = name === 'spese' || name === 'movimenti';
    seg.style.display = usaSeg ? 'flex' : 'none';
    if (!usaSeg) seg.innerHTML = '';
  }
  const spacer = document.getElementById('head-spacer');
  if (spacer) spacer.style.display = (ROTTE_PRINCIPALI.includes(name) && name !== 'spese' && name !== 'movimenti') ? 'block' : 'none';
  const headerEl = document.getElementById('app-header');
  if (headerEl) headerEl.classList.toggle('sub', !ROTTE_PRINCIPALI.includes(name));
};

export const initRouter = () => {
  window.addEventListener('hashchange', renderCurrent);
  if (!location.hash) location.hash = '#/spese';
  else renderCurrent();
};

export { ROTTE_PRINCIPALI };
