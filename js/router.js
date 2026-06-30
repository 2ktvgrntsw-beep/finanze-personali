// router.js — routing minimale basato su hash (#/nome-rotta).
// Nessuna modifica funzionale rispetto alla v1.2: era già generico (qualunque rotta
// passa per registerRoute), quindi le 9 nuove rotte v1.3 funzionano senza toccare
// questo file. Solo riformattato per leggibilità (era una singola riga lunghissima).

const routes = {};

export const registerRoute = (name, handler) => { routes[name] = handler; };

export const navigate = (name) => {
  if (location.hash !== `#/${name}`) location.hash = `#/${name}`;
  else renderRoute();
};

const renderRoute = async () => {
  const name = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  const handler = routes[name] || routes['dashboard'];

  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));

  const root = document.getElementById('app-root');
  root.innerHTML = '';
  await handler(root);
};

export const initRouter = () => {
  window.addEventListener('hashchange', renderRoute);
  if (!location.hash) location.hash = '#/dashboard';
  else renderRoute();
};
