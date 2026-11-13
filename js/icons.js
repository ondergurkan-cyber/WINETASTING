// Line icons and small engravings (see DESIGN.md: no emoji as icons).
// All strokes use currentColor so they follow the text colour in light and dark mode.

const svg = (body, size = 24, extra = '') =>
  `<svg class="ic" ${extra} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v11h12V9"/><path d="M10 20v-5.5h4V20"/>',
  glass: '<path d="M7 3h10l-.6 5.2A4.4 4.4 0 0 1 12 12.2a4.4 4.4 0 0 1-4.4-4L7 3Z"/><path d="M7.4 7h9.2"/><path d="M12 12.2V20"/><path d="M8.5 20.5h7"/>',
  glasses: '<path d="M4 3h6l-.4 4a2.6 2.6 0 0 1-5.2 0L4 3Z"/><path d="M7 9.6V19"/><path d="M5 19.5h4"/><path d="M14 3h6l-.4 4a2.6 2.6 0 0 1-5.2 0L14 3Z"/><path d="M17 9.6V19"/><path d="M15 19.5h4"/>',
  bottle: '<path d="M10.5 2.5h3v4.2c0 .9 3 2.1 3 5.3v8.2a1.3 1.3 0 0 1-1.3 1.3H8.8a1.3 1.3 0 0 1-1.3-1.3V12c0-3.2 3-4.4 3-5.3V2.5Z"/><path d="M7.5 13.5h9v4.5h-9z"/>',
  shop: '<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5 4.6 4h14.8L21 9.5"/><path d="M3 9.5c0 1.4 1.1 2.3 2.3 2.3S7.6 10.9 7.6 9.5c0 1.4 1.1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1 2.3 2.2 2.3s2.2-.9 2.2-2.3c0 1.4 1.1 2.3 2.3 2.3S21 10.9 21 9.5"/><path d="M10 20v-5h4v5"/>',
  laurel: '<path d="M12 21v-4"/><path d="M8.5 21h7"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5.5H4.5v1A3 3 0 0 0 7.4 9.5"/><path d="M17 5.5h2.5v1a3 3 0 0 1-2.9 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  pencil: '<path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20Z"/><path d="M14 6.8l3.2 3.2"/>',
  trash: '<path d="M4 6.5h16"/><path d="M9.5 6.5V4.2h5v2.3"/><path d="M6.2 6.5 7 20h10l.8-13.5"/><path d="M10.2 10v6.5M13.8 10v6.5"/>',
  back: '<path d="M14.5 5 7.5 12l7 7"/>',
  next: '<path d="M9.5 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  quill: '<path d="M20 4c-6 .5-11.5 5-13 12.5L5 20"/><path d="M8.2 13.5h5.6"/><path d="M20 4c0 5-3 9.5-9 10.5"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
  mail: '<path d="M3.5 6h17v12h-17z"/><path d="m4 6.5 8 6.5 8-6.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5Z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  cloud: '<path d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.6A5.6 5.6 0 0 0 7 9.6a4.5 4.5 0 0 0 0 8.9Z"/>',
  sync: '<path d="M19 8.5A7.5 7.5 0 0 0 5.6 7.2"/><path d="M5 4v3.5h3.5"/><path d="M5 15.5a7.5 7.5 0 0 0 13.4 1.3"/><path d="M19 20v-3.5h-3.5"/>',
};

export function icon(name, size = 24) {
  return svg(P[name] || '', size);
}

// Small engravings for empty states: the icon drawn inside a stamped seal with
// fine hatching, in copper, so empty screens read like a page from an old almanac.
export function engraving(name) {
  const hatch = Array.from({ length: 5 }, (_, i) => {
    const y = 88 + i * 3;
    const half = Math.sqrt(Math.max(0, 44 * 44 - (y - 60) * (y - 60))) - 6;
    return `<path d="M${(60 - half).toFixed(1)} ${y}h${(half * 2).toFixed(1)}" opacity=".45"/>`;
  }).join('');
  return `<svg class="engraving" width="120" height="120" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <circle cx="60" cy="60" r="54" stroke-width="1.2"/>
    <circle cx="60" cy="60" r="48" stroke-width=".8" stroke-dasharray="2 4"/>
    <g stroke-width=".8">${hatch}</g>
    <g transform="translate(40 30) scale(1.667)" stroke-width="1.2">${P[name] || ''}</g>
  </svg>`;
}
