// icons.js — Icone dell'app.
// - Emoji per le macrocategorie (leggibili, zero peso). Facile da sostituire in futuro
//   con un set di icone disegnate se si vorrà un look ancora più custom.
// - SVG lineari uniformi per la barra di navigazione (stile coerente, monocromatico).

// Icone categoria a LINEA (Cockpit): stroke coerente, griglia 24, centrate otticamente.
// currentColor per ereditare il colore dal contenitore.
const _svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const ICONA_MACRO = {
  'Casa': _svg('<path d="M4 11 12 4.5 20 11"/><path d="M6 9.8V19.5h12V9.8"/><path d="M10 19.5V14.5h4v5"/>'),
  'Trasporti': _svg('<path d="M5 11.5 6.6 7A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.5L19 11.5"/><rect x="4" y="11.5" width="16" height="5" rx="1.5"/><circle cx="8" cy="16.5" r="1.5"/><circle cx="16" cy="16.5" r="1.5"/>'),
  'Tempo Libero': _svg('<path d="M12 3.5 14 8.2 19.2 8.68 15.3 12 16.5 17 12 14.4 7.5 17 8.7 12 4.8 8.68 10 8.2z"/>'),
  'Spese domestiche': _svg('<path d="M6 7h12l-1 12H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
  'Animali Domestici': _svg('<circle cx="8" cy="9" r="1.6"/><circle cx="16" cy="9" r="1.6"/><circle cx="5.5" cy="13" r="1.5"/><circle cx="18.5" cy="13" r="1.5"/><path d="M12 13c-2.5 0-4.5 2-4.5 4a2 2 0 0 0 2 2c1 0 1.5-.5 2.5-.5s1.5.5 2.5.5a2 2 0 0 0 2-2c0-2-2-4-4.5-4z"/>'),
  'Salute': _svg('<path d="M10.5 4h3l.5 3.2a6 6 0 0 1 1.7 1l3-1.2 1.5 2.6-2.5 2a6 6 0 0 1 0 2l2.5 2-1.5 2.6-3-1.2a6 6 0 0 1-1.7 1L13.5 20h-3l-.5-3.2a6 6 0 0 1-1.7-1l-3 1.2L3.8 14.4l2.5-2a6 6 0 0 1 0-2l-2.5-2 1.5-2.6 3 1.2a6 6 0 0 1 1.7-1z"/><circle cx="12" cy="12" r="2.2"/>'),
  'Abbigliamento': _svg('<path d="M8 4 5 7l2 2 1-1v11h8V8l1 1 2-2-3-3-2 1.5a3 3 0 0 1-4 0z"/>'),
  'Lavoro': _svg('<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M4 12h16"/>'),
  'Viaggi': _svg('<path d="M20.5 14 13 11.5V5.2a1 1 0 0 0-2 0V11.5L3.5 14v1.7l7.5-2v3.2l-2 1.4v1.3l3-.9 3 .9v-1.3l-2-1.4v-3.2l7.5 2z"/>'),
  'Assicurazioni': _svg('<path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  'Investimenti': _svg('<path d="M4 18V9M9 18V5M14 18v-7M19 18v-4"/>'),
  'Entrate': _svg('<path d="M12 3v18M6 9l6-6 6 6"/><rect x="5" y="14" width="14" height="6" rx="1.5"/>'),
  'Altro': _svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v.01M11 12h1v4h1"/>'),
};
export const iconaMacro = (nome) => ICONA_MACRO[nome] || ICONA_MACRO['Altro'];

// Icona per tipo movimento (fallback quando manca la macro)
export const iconaTipo = (tipo) => tipo === 'entrata' ? ICONA_MACRO['Entrate'] : tipo === 'trasferimento' ? ICONA_MACRO['Investimenti'] : ICONA_MACRO['Altro'];

// --- SVG bottom nav (24x24, stroke currentColor) ---
export const NAV_SVG = {
  spese: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/></svg>',
  movimenti: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  patrimonio: '<svg viewBox="0 0 24 24"><path d="M12 3l9 7v11H3V10z"/><path d="M9 21v-6h6v6"/></svg>',
  ricorrenti: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M18 4v5h-5M6 20v-5h5"/></svg>',
  analisi: '<svg viewBox="0 0 24 24"><path d="M5 21V10M12 21V4M19 21v-7"/></svg>',
  impostazioni: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

// Icone UI di servizio (form inserimento, conti, azioni impostazioni) — stile a linea.
export const UI_SVG = {
  casa: _svg('<path d="M4 11 12 4.5 20 11"/><path d="M6 9.8V19.5h12V9.8"/><path d="M10 19.5V14.5h4v5"/>'),
  risparmio: _svg('<path d="M4 8h16v10H4z"/><path d="M4 8l2-4h12l2 4"/><path d="M9 12h6"/>'),
  descrizione: _svg('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  conto: _svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>'),
  tag: _svg('<path d="M7 7h.01M4 4h7l9 9-7 7-9-9z"/>'),
  importo: _svg('<path d="M12 3v18M8 7h5a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h6"/>'),
  ripeti: _svg('<path d="M4.5 12a7.5 7.5 0 0 1 13-5M19.5 12a7.5 7.5 0 0 1-13 5"/><path d="M17.5 3.5v3.5H14M6.5 20.5V17h3.5"/>'),
  hashtag: _svg('<path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16"/>'),
  calendario: _svg('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>'),
  backup: _svg('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 19h16"/>'),
  excel: _svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  ripristina: _svg('<path d="M12 21V9M8 13l4-4 4 4"/><path d="M4 5h16"/>'),
  investimento: _svg('<path d="M4 18V9M9 18V5M14 18v-7M19 18v-4"/>'),
};
