// Home art: the painted hero, printer's ornaments and engraved glasses.
const SVG_OPEN = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

// The Home hero: a painted vineyard (generated for this app, no third-party art) fills the top of
// the page edge to edge and melts into the paper; the date and the day's line sit on the quiet sky.
// Dark mode ("The Cellar at Night") gets the same scene by moonlight. Only the matching picture loads.
export function homeHero(text) {
  return `<header class="hero-plate">
    <picture class="hero-pic">
      <source media="(prefers-color-scheme: dark)" srcset="images/hero-night.webp">
      <img class="hero-art" src="images/hero-day.webp" alt="" width="1344" height="752" decoding="async" fetchpriority="high">
    </picture>
    <div class="hero-text">${text}</div>
  </header>`;
}

// A printer's ornament between bands of the page: two rules and a vine leaf with tendrils.
export function fleuron() {
  return `<div class="fleuron"><svg viewBox="0 0 120 24" width="144" height="29" ${SVG_OPEN}>
    <path d="M2 12h34M84 12h34" stroke-width=".8"/>
    <path d="M36 12c4 0 6-4 3-5.5s-4.5 2.5-1.5 3.5M84 12c-4 0-6-4-3-5.5s4.5 2.5 1.5 3.5" stroke-width=".9"/>
    <path class="fl-leaf" d="M60 20c-1.6-1.8-4.4-2.4-6.6-1.6.4-2.4-.8-4.4-3-5.4 2.2-.8 3-2.8 2.4-4.8 2.2.6 4.4-.2 5.4-2.2.6 1.4 1.2 2 1.8 2.4.6-.4 1.2-1 1.8-2.4 1 2 3.2 2.8 5.4 2.2-.6 2 .2 4 2.4 4.8-2.2 1-3.4 3-3 5.4-2.2-.8-5-.2-6.6 1.6Z" stroke-width=".9"/>
    <path d="M60 20V9.5M60 15.5l-4.5-3M60 15.5l4.5-3" stroke-width=".6"/>
    <circle cx="46" cy="12" r="1.1" stroke-width=".8"/><circle cx="74" cy="12" r="1.1" stroke-width=".8"/>
  </svg></div>`;
}

// An engraved wine glass, filled to the share of tastings in that colour.
export function tasteGlass(colour, share) {
  const top = 12, bottom = 50;
  const y = (bottom - (bottom - top) * Math.max(0, Math.min(1, share))).toFixed(1);
  const bowl = 'M15 8C14 30 20 49 30 51C40 49 46 30 45 8Z';
  const id = `tg-${colour}`;
  return `<svg class="taste-glass" viewBox="0 0 60 90" width="60" height="90" ${SVG_OPEN}>
    <defs><clipPath id="${id}"><path d="${bowl}"/></clipPath></defs>
    <g clip-path="url(#${id})">
      <rect class="tg-wine sw-${colour}" x="10" y="${y}" width="40" height="50" stroke="none"/>
      <path d="M15 ${y}h30" stroke-width=".8"/>
      <path d="M41 14c.4 12-1.6 24-6 31M43.5 14c.3 11-1 21-4 28M38.5 16c.4 11-1.4 21-5.4 28" stroke-width=".5"/>
    </g>
    <path d="${bowl}" stroke-width="1.1"/>
    <path d="M18.5 12c0 8 1.6 16 4 22" stroke-width=".7" opacity=".6"/>
    <path d="M30 51v28" stroke-width="1.1"/><path d="M32 53v24" stroke-width=".5"/>
    <path d="M18 82c3-2 21-2 24 0c-3 1.6-21 1.6-24 0Z" stroke-width="1.1"/>
    <path d="M22 82.5h16" stroke-width=".5"/>
  </svg>`;
}
