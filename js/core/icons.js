// icons.js — Icone dell'app.
// - Emoji per le macrocategorie (leggibili, zero peso). Facile da sostituire in futuro
//   con un set di icone disegnate se si vorrà un look ancora più custom.
// - SVG lineari uniformi per la barra di navigazione (stile coerente, monocromatico).

export const ICONA_MACRO = {
  'Casa': '🏠',
  'Trasporti': '🚗',
  'Tempo Libero': '🎭',
  'Spese domestiche': '🛒',
  'Animali Domestici': '🐾',
  'Salute': '💊',
  'Abbigliamento': '👕',
  'Lavoro': '💼',
  'Viaggi': '✈️',
  'Assicurazioni': '🛡️',
  'Investimenti': '💠',
  'Entrate': '💰',
  'Altro': '🏷️',
};
export const iconaMacro = (nome) => ICONA_MACRO[nome] || '🏷️';

// Icona per tipo movimento (fallback quando manca la macro)
export const iconaTipo = (tipo) => tipo === 'entrata' ? '💰' : tipo === 'trasferimento' ? '💠' : '🏷️';

// --- SVG bottom nav (24x24, stroke currentColor) ---
export const NAV_SVG = {
  spese: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/></svg>',
  movimenti: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  patrimonio: '<svg viewBox="0 0 24 24"><path d="M12 3l9 7v11H3V10z"/><path d="M9 21v-6h6v6"/></svg>',
  ricorrenti: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M18 4v5h-5M6 20v-5h5"/></svg>',
  analisi: '<svg viewBox="0 0 24 24"><path d="M5 21V10M12 21V4M19 21v-7"/></svg>',
  impostazioni: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};
