import { db, uid, addMedia, requestPersistence } from './db.js';
import { METHODS, getMethod, getLevel, fieldsFor } from './methods/index.js';
import { generateNote, wineTitle, formatScore } from './note.js';
import { guess, explain } from './guess.js';

// ---------------------------------------------------------------- helpers
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
const COLOUR_LABEL = { white: 'White', rose: 'Rosé', red: 'Red' };
const TYPE_LABEL = { still: 'Still', sparkling: 'Sparkling', fortified: 'Fortified' };
const DEFAULT_BANDS = {
  outstanding: [[95, 100], [18.5, 20]],
  'very good': [[90, 94], [17, 18]],
  good: [[85, 89], [16, 16.5]],
  acceptable: [[80, 84], [15, 15.5]],
  poor: [[70, 79], [12, 14.5]],
  faulty: [[50, 69], [0, 11.5]],
};
const DEFAULT_SETTINGS = { method: 'wset', level: 'l3', structurePlus: true, scale: 100, noteFormat: 'full', mode: 'full', customLexicon: [] };

let settings = { ...DEFAULT_SETTINGS };
const ui = { open: {}, unfold: {}, eventTab: {}, standingsFilter: 'all' };
const urlCache = new Map();
function mediaURL(m) {
  if (!urlCache.has(m.id)) urlCache.set(m.id, URL.createObjectURL(m.blob));
  return urlCache.get(m.id);
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1800);
}


// In-page confirm (window.confirm is blocked in some embedded viewers).
function ask(message, okLabel = 'OK') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><p>${esc(message)}</p><div class="row2"><button class="btn" data-r="0">Cancel</button><button class="btn primary" data-r="1">${esc(okLabel)}</button></div></div>`;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== wrap) return;
      e.stopPropagation();
      wrap.remove();
      resolve(!!b && b.dataset.r === '1');
    });
    document.body.appendChild(wrap);
  });
}

async function saveSettings() { await db.setKV('settings', settings); }

const go = (hash) => { location.hash = hash; };

// Debounced wine saving while tasting.
let saveTimer, pendingWine;
function saveWineSoon(wine) {
  clearTimeout(saveTimer);
  pendingWine = wine;
  saveTimer = setTimeout(flushWine, 250);
}
async function flushWine() {
  clearTimeout(saveTimer);
  const w = pendingWine;
  pendingWine = null;
  if (w) await db.put('wines', w);
}

function scoreToHundred(score, scale) { return scale === 20 ? score * 5 : score; }

function displayName(wine, event, index) {
  if (event && event.blind && !wine.revealed) return `Wine ${index + 1}`;
  return wineTitle(wine);
}

function bandFor(quality, scale) {
  const b = DEFAULT_BANDS[quality];
  if (!b) return null;
  return scale === 20 ? b[1] : b[0];
}

// ---------------------------------------------------------------- shell
function shell(content, { title, back, tab, actions = '' } = {}) {
  const tabs = tab ? `
    <nav class="tabbar">
      <a href="#/" class="${tab === 'events' ? 'on' : ''}"><span class="ti">🍷</span>Events</a>
      <a href="#/standings" class="${tab === 'standings' ? 'on' : ''}"><span class="ti">🏆</span>Standings</a>
      <a href="#/settings" class="${tab === 'settings' ? 'on' : ''}"><span class="ti">⚙︎</span>Settings</a>
    </nav>` : '';
  return `
    <header class="topbar">
      ${back ? `<a class="back" href="${back}" aria-label="Back">‹</a>` : '<span class="back-spacer"></span>'}
      <h1>${esc(title || 'Tasting')}</h1>
      <div class="top-actions">${actions}</div>
    </header>
    <main class="${tab ? 'with-tabs' : ''}">${content}</main>
    ${tabs}`;
}

// ---------------------------------------------------------------- views
async function viewEvents() {
  const events = (await db.all('events')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const wines = await db.all('wines');
  const level = getLevel(settings.method, settings.level);
  const cards = events.map((e) => {
    const ws = wines.filter((w) => w.eventId === e.id);
    const done = ws.filter((w) => w.tasting && w.tasting.score != null && w.tasting.score !== '').length;
    return `
      <a class="card event-card" href="#/event/${e.id}">
        <div class="ec-main">
          <div class="ec-name">${esc(e.name)}</div>
          <div class="muted">${esc(fmtDate(e.date))}${e.place ? ' · ' + esc(e.place) : ''}</div>
        </div>
        <div class="ec-meta">
          <span class="pill">${ws.length} wine${ws.length === 1 ? '' : 's'}</span>
          ${e.blind ? '<span class="pill pill-blind">blind</span>' : ''}
          <span class="muted small">${done}/${ws.length} scored</span>
        </div>
      </a>`;
  }).join('');
  const empty = `
    <div class="empty">
      <div class="empty-icon">🍷</div>
      <p><b>No tastings yet.</b></p>
      <p class="muted">Create an event, add the wines, and taste them with the ${esc(getMethod(settings.method).name)} ${esc(level.name)}.</p>
    </div>`;
  return shell(`
    <div class="method-badge">Method: <b>${esc(getMethod(settings.method).name)}</b> · ${esc(level.name)}${settings.structurePlus ? ' · Structure+' : ''} <a href="#/settings">change</a></div>
    ${events.length ? cards : empty}
    <a class="fab" href="#/event/new">+ New event</a>
  `, { title: 'Events', tab: 'events' });
}

async function viewEventForm(id) {
  const e = id ? await db.get('events', id) : { name: '', date: today(), place: '', scale: settings.scale, blind: false, host: '', theme: '' };
  return shell(`
    <form class="form" id="eventForm" data-id="${attr(id || '')}">
      <label>Name<input name="name" required value="${attr(e.name)}" placeholder="Saturday Burgundy night"></label>
      <label>Date<input name="date" type="date" value="${attr(e.date)}"></label>
      <label>Place<input name="place" value="${attr(e.place)}" placeholder="Ali's place"></label>
      <div class="field-label">Scoring scale</div>
      <div class="seg">
        <label><input type="radio" name="scale" value="100" ${e.scale !== 20 ? 'checked' : ''}><span>100 points</span></label>
        <label><input type="radio" name="scale" value="20" ${e.scale === 20 ? 'checked' : ''}><span>20 points</span></label>
      </div>
      <label class="switch-row"><span><b>Blind tasting</b><br><span class="muted small">Labels stay hidden until you tap Reveal, so GUESS isn't spoiled.</span></span>
        <input type="checkbox" name="blind" ${e.blind ? 'checked' : ''}><i></i></label>
      <label>Host (optional)<input name="host" value="${attr(e.host)}"></label>
      <label>Theme (optional)<input name="theme" value="${attr(e.theme)}" placeholder="e.g. Pinot Noir around the world"></label>
      <button class="btn primary" type="submit">${id ? 'Save' : 'Create event'}</button>
      ${id ? '<button class="btn danger" type="button" data-act="deleteEvent">Delete event</button>' : ''}
    </form>
  `, { title: id ? 'Edit event' : 'New event', back: id ? `#/event/${id}` : '#/' });
}

async function loadEvent(id) {
  const event = await db.get('events', id);
  const wines = (await db.byIndex('wines', 'eventId', id)).sort((a, b) => a.order - b.order);
  return { event, wines };
}

function standingsList(rows, scaleOf) {
  const scored = rows.filter((r) => r.wine.tasting && r.wine.tasting.score !== undefined && r.wine.tasting.score !== null && r.wine.tasting.score !== '');
  const unscored = rows.filter((r) => !scored.includes(r));
  scored.sort((a, b) => scoreToHundred(+b.wine.tasting.score, scaleOf(b)) - scoreToHundred(+a.wine.tasting.score, scaleOf(a)));
  let rank = 0, last = null;
  const medals = ['🥇', '🥈', '🥉'];
  const li = scored.map((r, i) => {
    const s = scoreToHundred(+r.wine.tasting.score, scaleOf(r));
    if (s !== last) { rank = i + 1; last = s; }
    return `
      <a class="card st-row" href="#/wine/${r.wine.id}">
        <span class="rank">${rank <= 3 ? medals[rank - 1] : rank}</span>
        <span class="dot dot-${r.wine.colour || 'none'}"></span>
        <span class="st-name">${esc(r.name)}${r.sub ? `<br><span class="muted small">${esc(r.sub)}</span>` : ''}</span>
        <span class="st-score">${esc(formatScore(r.wine.tasting.score, scaleOf(r)))}</span>
      </a>`;
  }).join('');
  const un = unscored.map((r) => `
      <a class="card st-row unscored" href="#/wine/${r.wine.id}">
        <span class="rank">–</span><span class="dot dot-${r.wine.colour || 'none'}"></span>
        <span class="st-name">${esc(r.name)}${r.sub ? `<br><span class="muted small">${esc(r.sub)}</span>` : ''}</span>
        <span class="st-score muted">not scored</span>
      </a>`).join('');
  return li + un || '<p class="muted center">No wines yet.</p>';
}

async function viewEvent(id) {
  const { event, wines } = await loadEvent(id);
  if (!event) return shell('<p class="muted center">Event not found.</p>', { title: 'Event', back: '#/' });
  const tab = ui.eventTab[id] || 'wines';
  let body = '';
  if (tab === 'wines') {
    const nextW = wines.find((w) => !(w.tasting && w.tasting.done));
    const doneN = wines.filter((w) => w.tasting && w.tasting.done).length;
    const hero = wines.length ? (nextW
      ? `<a class="hero" href="#/wine/${nextW.id}"><span><span class="small">${doneN} of ${wines.length} tasted</span><b>Taste wine ${wines.indexOf(nextW) + 1}</b></span><span class="hero-arrow">›</span></a>`
      : `<div class="hero done"><span><span class="small">All ${wines.length} tasted</span><b>See the standings</b></span><button class="hero-arrow" data-act="eventTab" data-tab="standings" aria-label="Standings">›</button></div>`) : '';
    body = hero + wines.map((w, i) => {
      const t = w.tasting;
      const status = !t ? 'not started' : (t.done ? 'done ✓' : 'tasting');
      const thumb = !event.blind || w.revealed ? (w.labelId ? `<img class="thumb" data-media="${w.labelId}" alt="">` : '<div class="thumb ph">🍾</div>') : `<div class="thumb ph blind">${i + 1}</div>`;
      return `
        <div class="card wine-card">
          <a class="wc-link" href="#/wine/${w.id}">
            <span class="pos">${i + 1}</span>
            ${thumb}
            <span class="wc-main">
              <span class="wc-name">${esc(displayName(w, event, i))}</span>
              <span class="muted small"><span class="dot dot-${w.colour || 'none'}"></span>${esc(styleLabel(w))} · ${status}</span>
            </span>
            <span class="wc-score">${t && t.score != null && t.score !== '' ? esc(formatScore(t.score, event.scale)) : ''}</span>
          </a>
          <span class="reorder">
            <button data-act="moveWine" data-id="${w.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
            <button data-act="moveWine" data-id="${w.id}" data-dir="1" ${i === wines.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
          </span>
        </div>`;
    }).join('') || `<div class="empty"><p><b>No wines yet.</b></p><p class="muted">Tap a style below to add wine 1. Add them in the order you'll taste them.</p></div>`;
    body += `<div class="card quick-add"><div class="srow-label">Quick add <span class="muted small">· tap a style, wine ${wines.length + 1} is added</span></div>${styleTiles({}, 'quickAdd')}<div class="muted tiny">Label photo and details can be added later${event.blind ? ' or at the reveal' : ''}.</div></div>`;
    body += `<a class="fab" href="#/event/${id}/add">+ Add with label</a>`;
  } else if (tab === 'standings') {
    body = standingsList(wines.map((w, i) => ({ wine: w, name: displayName(w, event, i) })), () => event.scale);
  } else {
    const media = await db.byIndex('media', 'owner', 'event:' + id);
    body = `
      <label class="block-label">Event notes
        <textarea id="eventNotes" rows="6" placeholder="Who came, food, the mood, what to try next time…">${esc(event.notes || '')}</textarea></label>
      <div class="field-label">Photos & videos</div>
      <div class="gallery">
        ${media.map((m) => m.kind === 'video'
          ? `<div class="g-item"><video data-media="${m.id}" controls playsinline></video><button class="g-del" data-act="delMedia" data-id="${m.id}">✕</button></div>`
          : `<div class="g-item"><img data-media="${m.id}" alt=""><button class="g-del" data-act="delMedia" data-id="${m.id}">✕</button></div>`).join('')}
        <label class="g-add">＋<br><span class="small">Add</span><input type="file" accept="image/*,video/*" multiple hidden data-upload="event:${id}"></label>
      </div>`;
  }
  const meta = [fmtDate(event.date), event.place, `${event.scale} pts`, event.blind ? 'blind' : null].filter(Boolean).map(esc).join(' · ');
  return shell(`
    <div class="event-head"><div class="muted">${meta}</div>${event.theme ? `<div class="small">${esc(event.theme)}</div>` : ''}</div>
    <div class="seg seg-tabs">
      ${['wines', 'standings', 'notes'].map((t) => `<button data-act="eventTab" data-tab="${t}" class="${tab === t ? 'on' : ''}">${{ wines: 'Wines', standings: 'Standings', notes: 'Notes & media' }[t]}</button>`).join('')}
    </div>
    ${body}
  `, { title: event.name, back: '#/', actions: `<a class="icon-btn" href="#/event/${id}/edit" aria-label="Edit event">✎</a>` });
}

function wineDetailFields(w) {
  return `
    <label>Producer<input name="producer" value="${attr(w.producer)}" placeholder="Domaine Leflaive"></label>
    <label>Wine / cuvée<input name="name" value="${attr(w.name)}" placeholder="Puligny-Montrachet 1er Cru"></label>
    <div class="row2">
      <label>Vintage<input name="vintage" inputmode="numeric" value="${attr(w.vintage)}" placeholder="2019"></label>
      <label>ABV %<input name="abv" inputmode="decimal" value="${attr(w.abv)}" placeholder="13"></label>
    </div>
    <label>Region / appellation<input name="region" value="${attr(w.region)}" placeholder="Burgundy"></label>
    <label>Country<input name="country" value="${attr(w.country)}" placeholder="France"></label>
    <label>Grape(s)<input name="grapes" value="${attr(w.grapes)}" placeholder="Chardonnay"></label>
    <label>Price / notes<input name="price" value="${attr(w.price)}"></label>`;
}


let draftWine = null;
async function viewAddWine(eventId, wineId) {
  const event = await db.get('events', eventId);
  const editing = !!wineId;
  if (editing) draftWine = await db.get('wines', wineId);
  else if (!draftWine || draftWine.eventId !== eventId || draftWine.saved) draftWine = { id: uid(), eventId, colour: '', type: 'still' };
  const w = draftWine;
  const hide = event.blind && !w.revealed;
  const label = w.labelId ? await db.get('media', w.labelId) : null;
  return shell(`
    <form class="form" id="wineForm">
      <div class="label-shot">
        ${label ? `<img src="${mediaURL(label)}" alt="Label" class="${hide ? 'blurred' : ''}">` : '<div class="label-ph">📷<br>Label photo</div>'}
        <label class="btn">${label ? 'Retake' : 'Take label photo'}<input type="file" accept="image/*" capture="environment" hidden data-upload="label"></label>
      </div>
      ${hide ? `<p class="note-box">Blind event: the label photo is stored but blurred, and details stay hidden until you tap <b>Reveal</b> after guessing. You can leave the details empty and fill them in at the reveal.</p>`
        : `<p class="muted small">AI label reading is planned; for now type the details from the label.</p>${wineDetailFields(w)}`}
      <div class="field-label">Style</div>${styleTiles(w)}
      <button class="btn primary" type="submit">${editing ? 'Save' : 'Add wine'}</button>
      ${editing ? '<button class="btn danger" type="button" data-act="deleteWine">Delete wine</button>' : ''}
    </form>
  `, { title: editing ? 'Wine details' : 'Add wine', back: editing ? `#/wine/${wineId}` : `#/event/${eventId}` });
}

// ---------- tasting sheet (one page: Look, Smell, Taste, Verdict)
function ensureTasting(w) {
  if (!w.tasting) w.tasting = { methodId: settings.method, levelId: settings.level, values: {}, blic: [], mode: settings.mode || 'full' };
  w.tasting.values = w.tasting.values || {};
  if (!w.tasting.mode) w.tasting.mode = 'full';
  return w.tasting;
}

// Style tiles used when adding a wine and on the sheet.
const STYLE_TILES = [
  { k: 'white', label: 'White', colour: 'white', type: 'still' },
  { k: 'rose', label: 'Rosé', colour: 'rose', type: 'still' },
  { k: 'red', label: 'Red', colour: 'red', type: 'still' },
  { k: 'sparkling', label: 'Sparkling', colour: 'white', type: 'sparkling' },
  { k: 'fortified', label: 'Fortified', colour: 'red', type: 'fortified' },
  { k: 'sweet', label: 'Sweet', colour: 'white', type: 'still', sweet: true },
];
function styleKey(w) {
  if (!w.colour) return '';
  if (w.sweet) return 'sweet';
  if (w.type === 'sparkling') return 'sparkling';
  if (w.type === 'fortified') return 'fortified';
  return w.colour;
}
function styleTiles(w, act = 'styleTile') {
  const cur = styleKey(w);
  return `<div class="tiles6">${STYLE_TILES.map((s) => `<button type="button" class="tile tile-${s.k} ${cur === s.k ? 'on' : ''}" data-act="${act}" data-v="${s.k}">${s.label}</button>`).join('')}</div>`;
}
function styleLabel(w) {
  if (!w.colour) return 'style not set';
  return [COLOUR_LABEL[w.colour], w.type && w.type !== 'still' ? TYPE_LABEL[w.type].toLowerCase() : null, w.sweet ? 'sweet' : null].filter(Boolean).join(' · ');
}

const SHORT = {
  'medium(-)': 'med–', 'medium(+)': 'med+', medium: 'med', pronounced: 'pron.', 'hazy (faulty?)': 'hazy', 'unclean (faulty?)': 'unclean',
  'fully developed': 'developed', 'tired/past its best': 'tired', 'medium-dry': 'm-dry', 'medium-sweet': 'm-sweet',
  'can drink now, but has potential for ageing': 'now, will age', 'drink now: not suitable for ageing or further ageing': 'drink now',
  'suitable for bottle ageing': 'will age', 'not suitable for bottle ageing': 'drink now',
};
const short = (o) => SHORT[o] || o;

const SECTIONS = [
  { id: 'look', sat: 'appearance', title: 'Look' },
  { id: 'smell', sat: 'nose', title: 'Smell' },
  { id: 'taste', sat: 'palate', title: 'Taste' },
  { id: 'verdict', sat: 'conclusions', title: 'Verdict' },
];
const QUICK_FIELDS = { appearance: ['colour', 'intensityA'], nose: ['aromas'], palate: ['sweetness', 'acidity', 'tannin', 'body', 'finish'], conclusions: ['quality'] };

// Fields shown in a section for this wine, tasting mode and settings.
function sheetFields(level, sec, w, t) {
  let fs = fieldsFor(level, sec.sat, w, settings, t);
  if (t.mode === 'quick') fs = fs.filter((f) => QUICK_FIELDS[sec.sat].includes(f.id));
  return fs;
}

// Palate flavours default to the nose until the taster edits them.
function flavoursOf(t) { return t.values.flavours ?? (t.values.aromas || []).map((a) => ({ ...a })); }
function derived(t) { return { ...t, values: { ...t.values, flavours: flavoursOf(t) } }; }

function isFilled(f, t) {
  const v = f.id === 'flavours' ? flavoursOf(t) : t.values[f.id];
  return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
}
// Required = the one-of-many lines and the aroma/flavour lexicons (not optional extras).
const isRequired = (f) => !f.plus && (f.type === 'single' || f.type === 'lexicon');

function sectionProgress(level, sec, w, t) {
  const fs = sheetFields(level, sec, w, t).filter(isRequired);
  let total = fs.length, filled = fs.filter((f) => isFilled(f, t)).length;
  if (sec.id === 'look') { total += 1; if (w.colour) filled += 1; }
  if (sec.id === 'verdict') { total += 1; if (t.score != null && t.score !== '') filled += 1; }
  return { filled, total, done: total > 0 && filled === total };
}

function sectionSummary(level, sec, w, t) {
  const fs = sheetFields(level, sec, w, t);
  const parts = [];
  if (sec.id === 'look') parts.push(styleLabel(w));
  for (const f of fs) {
    const v = f.id === 'flavours' ? flavoursOf(t) : t.values[f.id];
    if (Array.isArray(v)) { if (v.length) parts.push(v.map((x) => (typeof x === 'string' ? x : x.d)).slice(0, 5).join(', ')); }
    else if (v && f.type !== 'text') parts.push(f.scale ? `${f.label.toLowerCase()} ${v}` : v);
  }
  if (sec.id === 'verdict' && t.score != null && t.score !== '') parts.push(`${t.score} pts`);
  return parts.join(' · ');
}

function segRow(f, t, opts) {
  const val = t.values[f.id];
  const cols = opts.length > 6 ? 3 : opts.length;
  return `<div class="srow" data-field="${f.id}" data-empty="${val ? 0 : 1}">
      <div class="srow-label">${esc(f.label)}${f.plus ? ' <span class="plus-tag">S+</span>' : ''}</div>
      <div class="seg-bar" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">${opts.map((o) => `<button class="${val === o ? 'on' : ''}" data-act="pick" data-f="${f.id}" data-v="${attr(o)}" aria-label="${attr(o)}">${esc(short(o))}</button>`).join('')}</div>
    </div>`;
}

function multiRow(f, t) {
  const arr = t.values[f.id] || [];
  return `<div class="srow" data-field="${f.id}">
      <div class="srow-label">${esc(f.label)} <span class="muted small">· optional${f.plus ? ', Structure+' : ''}</span></div>
      <div class="chips">${f.options.map((o) => `<button class="chip ${arr.includes(o) ? 'on' : ''}" data-act="toggle" data-f="${f.id}" data-v="${attr(o)}">${esc(o)}</button>`).join('')}</div>
    </div>`;
}

function textRow(f, t) {
  return `<label class="block-label">${esc(f.label)}<textarea rows="2" data-text="${f.id}" placeholder="${attr(f.placeholder || '')}">${esc(t.values[f.id] || '')}</textarea></label>`;
}

// The structure grid: every scale on one compact grid, columns line up.
function structureGrid(fields, t, level) {
  const five = level.id !== 'l2';
  const cols = five ? 5 : 3;
  const heads = five ? ['low', 'med–', 'med', 'med+', 'high'] : ['low', 'med', 'high'];
  const rows = fields.map((f) => {
    const val = t.values[f.id];
    const spans = f.options.length === cols ? f.options.map(() => 1) : (f.options.length === 3 && cols === 5 ? [2, 1, 2] : f.options.map(() => 1));
    return `<div class="g-label" data-field="${f.id}" data-empty="${val ? 0 : 1}"><b>${esc(f.label.replace('Flavour intensity', 'Flavour int.').replace('Tannin level', 'Tannin'))}</b><span>${val ? esc(val) : ''}</span></div>
      ${f.options.map((o, i) => `<button class="g-cell ${val === o ? 'on' : ''}" style="grid-column: span ${spans[i]}" data-act="pick" data-f="${f.id}" data-v="${attr(o)}" aria-label="${attr(f.label + ': ' + o)}"></button>`).join('')}`;
  }).join('');
  return `<div class="sgrid" style="grid-template-columns: 96px repeat(${cols}, minmax(0, 1fr))">
      <span></span>${heads.map((h) => `<span class="g-head">${h}</span>`).join('')}
      ${rows}
    </div>`;
}

// Quick picks: the descriptors most typical for this style.
const QUICK_PICKS = {
  red: ['blackcurrant', 'black cherry', 'raspberry', 'red cherry', 'black plum', 'blackberry', 'black pepper', 'vanilla', 'cedar', 'smoke', 'leather', 'earth', 'tobacco', 'mushroom', 'violet'],
  white: ['lemon', 'lime', 'grapefruit', 'apple', 'pear', 'peach', 'apricot', 'pineapple', 'passion fruit', 'grass', 'blossom', 'butter', 'vanilla', 'honey', 'wet stones'],
  rose: ['strawberry', 'raspberry', 'red cherry', 'redcurrant', 'cranberry', 'peach', 'grapefruit', 'lemon', 'blossom', 'rose', 'wet stones', 'candy'],
  sparkling: ['lemon', 'apple', 'pear', 'peach', 'blossom', 'biscuit', 'brioche', 'bread', 'toast', 'pastry', 'almond', 'honey'],
  fortified: ['blackberry', 'black plum', 'raisin', 'prune', 'fig', 'chocolate', 'coffee', 'caramel', 'toffee', 'walnut', 'hazelnut', 'almond'],
};
function findCluster(lexicon, d, colour) {
  const hits = lexicon.filter((c) => c.d.includes(d));
  return hits.find((c) => c.colours.includes(colour)) || hits[0];
}
function quickPicks(w, level) {
  const list = w.type === 'sparkling' ? QUICK_PICKS.sparkling : w.type === 'fortified' ? QUICK_PICKS.fortified : QUICK_PICKS[w.colour || 'red'];
  const out = [];
  for (const d of list) { const c = findCluster(level.lexicon, d, w.colour || 'red'); if (c) out.push({ c: c.id, d }); }
  for (const d of (settings.customLexicon || []).slice(-3)) out.push({ c: 'custom', d });
  return out;
}

function aromaPicker(f, t, w, level) {
  const sel = f.id === 'flavours' ? flavoursOf(t) : (t.values[f.id] || []);
  const key = w.id + f.id;
  const has = (c, d) => sel.some((s) => s.d === d && (s.c === c || c === 'custom' || s.c === 'custom'));
  const colour = w.colour || 'red';
  const wheelOpen = ui.open['wheel' + key];
  const clusters = [...level.lexicon].sort((a, b) => (b.colours.includes(colour) ? 1 : 0) - (a.colours.includes(colour) ? 1 : 0));
  const wheel = wheelOpen ? ['primary', 'secondary', 'tertiary'].map((layer) => {
    const items = clusters.filter((c) => c.layer === layer);
    return `<div class="layer-title">${layer}</div><div class="wheel">${items.map((c) => `
        <div class="wheel-cl wl-${layer}"><div class="wheel-name">${esc(c.name)}</div>
          <div class="chips">${c.d.map((d) => `<button class="chip ${has(c.id, d) ? 'on' : ''}" data-act="descr" data-f="${f.id}" data-c="${c.id}" data-v="${attr(d)}">${esc(d)}</button>`).join('')}</div></div>`).join('')}</div>`;
  }).join('') : '';
  const picks = quickPicks(w, level);
  return `<div class="srow" data-field="${f.id}" data-empty="${sel.length ? 0 : 1}">
      <div class="srow-label">${esc(f.label.replace(' characteristics', ''))} <span class="muted small">· ${sel.length ? `${sel.length} picked` : 'pick any'}${f.id === 'flavours' && t.values.flavours === undefined && sel.length ? ', copied from the nose' : ''}</span></div>
      ${sel.length ? `<div class="chips picked">${sel.map((s) => `<button class="chip on" data-act="descr" data-f="${f.id}" data-c="${s.c}" data-v="${attr(s.d)}" aria-label="Remove ${attr(s.d)}">${esc(s.d)} ✕</button>`).join('')}</div>` : ''}
      <div class="search-wrap">
        <input class="aroma-search" type="search" placeholder="Search aromas… e.g. cass, pepper, petrol" data-aroma-search="${f.id}" autocomplete="off" enterkeyhint="done">
        <div class="search-results" data-results="${f.id}"></div>
      </div>
      ${!wheelOpen ? `<div class="muted tiny qp-title">Quick picks for ${esc(styleLabel(w).toLowerCase())}</div>
      <div class="qpicks">${picks.map((p) => `<button class="qp ${has(p.c, p.d) ? 'on' : ''}" data-act="descr" data-f="${f.id}" data-c="${p.c}" data-v="${attr(p.d)}">${esc(p.d)}</button>`).join('')}</div>` : ''}
      <button class="link wheel-btn" data-act="wheel" data-k="${key}">${wheelOpen ? '‹ Back to quick picks' : `Open aroma wheel (all ${level.lexicon.length} clusters) ›`}</button>
      ${wheel}
    </div>`;
}

// Live search across the level's lexicon and my own descriptors.
function searchResults(fid, q, w, t, level) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return '';
  const alias = { cass: 'blackcurrant', cassis: 'blackcurrant', kero: 'petrol', gas: 'petrol', oak: 'vanilla', minerality: 'wet stones', mineral: 'wet stones' };
  const seen = new Set();
  const hits = [];
  for (const c of level.lexicon) for (const d of c.d) {
    if ((d.includes(q) || c.name.toLowerCase().includes(q) || (alias[q] && d === alias[q]) || Object.keys(alias).some((a) => a.startsWith(q) && alias[a] === d)) && !seen.has(d)) { seen.add(d); hits.push({ c: c.id, d, cl: c.name }); }
  }
  for (const d of settings.customLexicon || []) if (d.includes(q) && !seen.has(d)) { seen.add(d); hits.push({ c: 'custom', d, cl: 'mine' }); }
  const exact = hits.some((h) => h.d === q);
  return hits.slice(0, 8).map((h) => `<button class="sr" data-act="descr" data-f="${fid}" data-c="${h.c}" data-v="${attr(h.d)}"><b>${esc(h.d)}</b><span>${esc(h.cl)}</span></button>`).join('')
    + (exact ? '' : `<button class="sr sr-add" data-act="addOwn" data-f="${fid}" data-v="${attr(q)}"><b>+ Add “${esc(q)}”</b><span>to my descriptors</span></button>`);
}

function renderSection(sec, level, w, t, event, idx, wines) {
  const prog = sectionProgress(level, sec, w, t);
  const key = w.id + sec.id;
  const folded = prog.done && !ui.unfold[key];
  if (folded) {
    return `<button class="sec folded" id="sec-${sec.id}" data-act="unfold" data-k="${key}">
        <span class="sec-dot done"></span>
        <span class="sec-sum"><span class="sec-title ok">${sec.title.toUpperCase()} ✓</span><span>${esc(sectionSummary(level, sec, w, t))}</span></span>
        <span class="muted small">Edit</span>
      </button>`;
  }
  const fs = sheetFields(level, sec, w, t);
  let body = '';
  if (sec.id === 'look') {
    body += `<div class="srow" data-field="style" data-empty="${w.colour ? 0 : 1}"><div class="srow-label">Style</div>${styleTiles(w)}</div>`;
    if (w.colour && w.colour !== 'red') body += `<label class="switch-row small-switch"><span>Show tannin <span class="muted small">(orange / skin-contact)</span></span><input type="checkbox" data-act-change="showTannin" ${t.showTannin ? 'checked' : ''}><i></i></label>`;
  }
  const plusFields = fs.filter((f) => f.plus);
  const mainFields = fs.filter((f) => !f.plus);
  if (sec.id === 'taste') {
    const gridFields = mainFields.filter((f) => f.type === 'single' && f.scale && f.id !== 'sweetness');
    const sweet = mainFields.find((f) => f.id === 'sweetness');
    if (sweet) body += segRow(sweet, t, sweet.options);
    if (gridFields.length) body += `<div class="srow-label">Structure <span class="muted small">· one tap per row</span></div>${structureGrid(gridFields, t, level)}`;
    for (const f of mainFields.filter((x) => !gridFields.includes(x) && x !== sweet)) body += renderSheetField(f, t, w, level);
  } else if (sec.id === 'verdict') {
    body += verdictBody(mainFields, t, w, level, event);
  } else {
    for (const f of mainFields) body += renderSheetField(f, t, w, level);
  }
  if (plusFields.length) {
    const open = ui.open['plus' + key] || plusFields.some((f) => isFilled(f, t));
    body += open ? `<div class="plus-box"><div class="srow-label">Structure+ <span class="muted small">· Beyond Flavour, optional</span></div>${plusFields.map((f) => renderSheetField(f, t, w, level)).join('')}</div>`
      : `<button class="plus-toggle" data-act="plusOpen" data-k="${key}"><span><b>Structure+</b> <span class="muted small">${plusFields.map((f) => f.label.toLowerCase()).slice(0, 2).join(', ')}…</span></span><span class="link">Show ›</span></button>`;
  }
  const foldBtn = prog.done ? `<button class="link" data-act="fold" data-k="${key}">Done ▴</button>` : `<span class="muted small">${prog.filled}/${prog.total}</span>`;
  return `<section class="sec open" id="sec-${sec.id}">
      <div class="sec-head"><span class="sec-title">${sec.title.toUpperCase()}</span>${foldBtn}</div>
      ${body}
    </section>`;
}

function renderSheetField(f, t, w, level) {
  if (f.type === 'single') {
    if (f.byColour) {
      if (!w.colour) return '';
      return segRow(f, t, f.byColour[w.colour] || []);
    }
    return segRow(f, t, f.options);
  }
  if (f.type === 'multi') return multiRow(f, t);
  if (f.type === 'text') return textRow(f, t);
  if (f.type === 'lexicon') return aromaPicker(f, t, w, level);
  return '';
}

function verdictBody(fields, t, w, level, event) {
  const scale = event.scale;
  const quality = fields.find((f) => f.id === 'quality');
  let out = '';
  if (quality && quality.blic) {
    const sel = t.blic || [];
    out += `<div class="srow"><div class="srow-label">Does it have…</div>
      <div class="seg-bar blic-bar" style="grid-template-columns: repeat(4, minmax(0, 1fr))">${[['B', 'Balance'], ['L', 'Length'], ['I', 'Intensity'], ['C', 'Complexity']].map(([k, l]) => `<button class="${sel.includes(k) ? 'on' : ''}" data-act="blic" data-v="${k}">${l}</button>`).join('')}</div></div>`;
  }
  if (quality) {
    const n = (t.blic || []).length;
    const sugg = quality.blic && n ? ['poor', 'acceptable', 'good', 'very good', 'outstanding'][n] : null;
    const val = t.values.quality;
    out += `<div class="srow" data-field="quality" data-empty="${val ? 0 : 1}"><div class="srow-label">${esc(quality.label)}${sugg ? ` <span class="muted small">· BLIC suggests ${sugg}</span>` : ''}</div>
      <div class="seg-bar" style="grid-template-columns: repeat(3, minmax(0, 1fr))">${quality.options.map((o) => `<button class="${val === o ? 'on' : ''} ${sugg === o && val !== o ? 'sugg' : ''}" data-act="pick" data-f="quality" data-v="${attr(o)}">${esc(o)}</button>`).join('')}</div></div>`;
  }
  const band = bandFor(t.values.quality, scale);
  const min = scale === 20 ? 0 : 50, max = scale === 20 ? 20 : 100, stepv = scale === 20 ? 0.5 : 1;
  const has = t.score != null && t.score !== '';
  out += `<div class="srow" data-field="score" data-empty="${has ? 0 : 1}">
      <div class="score-line"><span class="srow-label">Score${band ? ` <span class="muted small">· ${esc(t.values.quality)} = ${band[0]}–${band[1]}</span>` : ''}</span>
        <span class="score-big"><input type="number" inputmode="decimal" min="${min}" max="${max}" step="${stepv}" value="${attr(has ? t.score : '')}" data-score placeholder="–" aria-label="Score"><span>/${scale}</span></span></div>
      <input type="range" class="score-range" min="${min}" max="${max}" step="${stepv}" value="${attr(has ? t.score : (band ? band[0] : (scale === 20 ? 16 : 88)))}" data-score-range aria-label="Score slider">
    </div>`;
  for (const f of fields.filter((x) => x.id !== 'quality')) out += renderSheetField(f, t, w, level);
  return out;
}

async function viewWine(id) {
  const w = await db.get('wines', id);
  if (!w) return shell('<p class="muted center">Wine not found.</p>', { title: 'Wine', back: '#/' });
  const { event, wines } = await loadEvent(w.eventId);
  const idx = wines.findIndex((x) => x.id === id);
  const t = ensureTasting(w);
  const level = getLevel(t.methodId, t.levelId);
  const method = getMethod(t.methodId);

  const progress = SECTIONS.map((s) => ({ s, p: sectionProgress(level, s, w, t) }));
  const strip = `<div class="pstrip">${progress.map(({ s, p }) => {
    const pct = p.total ? Math.round((p.filled / p.total) * 100) : 0;
    return `<button data-act="jump" data-sec="${s.id}" class="${p.done ? 'done' : pct ? 'part' : ''}"><i><b style="width:${pct}%"></b></i><span>${s.title}${p.done ? ' ✓' : ''}</span></button>`;
  }).join('')}</div>`;

  const sections = SECTIONS.map((s) => renderSection(s, level, w, t, event, idx, wines)).join('');
  const extras = await wrapExtras(w, t, level, event, idx, wines);
  const sub = `${method.name} · ${level.name} · ${styleLabel(w)}${event.blind && !w.revealed ? ' · blind' : ''}`;
  const modeToggle = `<div class="mode-toggle" role="group" aria-label="Mode">
      <button class="${t.mode === 'quick' ? 'on' : ''}" data-act="mode" data-v="quick">Quick</button>
      <button class="${t.mode !== 'quick' ? 'on' : ''}" data-act="mode" data-v="full">Full SAT</button></div>`;
  return shell(`<div class="sheet-head"><div class="wine-sub muted small">${esc(sub)} · wine ${idx + 1} of ${wines.length}</div>${modeToggle}</div>${strip}<div class="sheet">${sections}${extras}</div>`,
    { title: displayName(w, event, idx), back: `#/event/${w.eventId}`, actions: (!event.blind || w.revealed) ? `<a class="icon-btn" href="#/event/${w.eventId}/wine/${w.id}/edit" aria-label="Wine details">✎</a>` : '' });
}

// Guess, note, photos, reveal and the save buttons, below the Verdict.
async function wrapExtras(w, t, level, event, idx, wines) {
  const dt = derived(t);
  const gOpen = ui.guessOpen === w.id;
  const nOpen = ui.noteOpen === w.id;
  const g = guess(w, dt);
  const top = g.results[0];
  const fmt = ui.noteFormat || settings.noteFormat;
  const note = generateNote(fmt, w, dt, level, event);
  const photos = await db.byIndex('media', 'owner', 'wine:' + w.id);
  const label = w.labelId ? await db.get('media', w.labelId) : null;

  const guessPanel = gOpen ? `
    <div class="panel">
      ${g.filled < 3 ? '<p class="note-box">Fill more of the structure and a few aromas for a sharper guess.</p>' : ''}
      ${g.results.length ? `<ol class="guess-list">${g.results.map((r) => `
        <li><div class="gl-top"><span><b>${esc(r.profile.name)}</b>, ${esc(r.profile.region)}${r.ageHint ? `, ${r.ageHint}` : ''}</span><span class="pct">${r.pct}%</span></div>
        <div class="bar"><i style="width:${r.pct}%"></i></div>
        <div class="muted small">${esc(explain(r))}</div></li>`).join('')}</ol>
        <p class="muted tiny">Relative likelihoods among the app's wine profiles, not true probabilities.</p>`
      : '<p class="muted">No profile in the knowledge base matches this style yet.</p>'}
      <label class="block-label">My guess<input data-text-t="myGuess" value="${attr(t.myGuess || '')}" placeholder="e.g. Nebbiolo, Barolo, 2015"></label>
    </div>` : '';

  const notePanel = nOpen ? `
    <div class="panel">
      <div class="seg small-seg">${['full', 'short', 'social'].map((f) => `<button data-act="noteFmt" data-v="${f}" class="${fmt === f ? 'on' : ''}">${{ full: 'WSET full', short: 'Short', social: 'Social' }[f]}</button>`).join('')}</div>
      <div class="note-out" id="noteOut">${esc(note) || '<span class="muted">Your note appears here as you tap.</span>'}</div>
      <div class="row2"><button class="btn" data-act="copyNote">Copy</button><button class="btn" data-act="shareNote">Share</button></div>
      <label class="block-label">My notes<textarea rows="3" data-text-t="myNotes" placeholder="Price, who brought it, food, mood…">${esc(t.myNotes || '')}</textarea></label>
      <div class="field-label">Photos</div>
      <div class="gallery">
        ${photos.map((m) => `<div class="g-item"><img src="${mediaURL(m)}" alt=""><button class="g-del" data-act="delMedia" data-id="${m.id}" aria-label="Delete photo">✕</button></div>`).join('')}
        <label class="g-add">📷<br><span class="small">Add</span><input type="file" accept="image/*" multiple hidden data-upload="wine:${w.id}"></label>
      </div>
    </div>` : '';

  const reveal = event.blind ? (w.revealed ? `
      <div class="card reveal-done">
        <div class="field-label">Revealed</div>
        ${label ? `<img src="${mediaURL(label)}" class="reveal-img" alt="Label">` : ''}
        <div><b>${esc(wineTitle(w))}</b></div>
        <div class="muted small">${esc([w.grapes, w.region, w.country].filter(Boolean).join(' · '))}</div>
        <a class="link" href="#/event/${w.eventId}/wine/${w.id}/edit">Fill in or fix details</a>
        <div class="field-label">How was my guess?</div>
        <div class="seg-bar" style="grid-template-columns: repeat(3, minmax(0, 1fr))">${['right', 'close', 'wrong'].map((r) => `<button class="${t.guessResult === r ? 'on' : ''}" data-act="guessResult" data-v="${r}">${r}</button>`).join('')}</div>
      </div>` : `<button class="btn reveal-btn" data-act="reveal">Reveal the wine</button>`) : '';

  const next = wines.slice(idx + 1).find((x) => !(x.tasting && x.tasting.done)) || wines[idx + 1];
  return `
    <div class="wrap-grid">
      <button class="big-card ${gOpen ? 'on' : ''}" data-act="guess"><b>GUESS</b><span class="muted small">${top && g.filled >= 3 ? `${esc(top.profile.name)} ${top.pct}%` : 'What is it?'}</span></button>
      <button class="big-card ${nOpen ? 'on' : ''}" data-act="noteToggle"><b>NOTE</b><span class="muted small">Copy · share · photos</span></button>
    </div>
    ${guessPanel}${notePanel}${reveal}
    <button class="btn primary big-btn" data-act="finish">${t.done ? 'Save changes' : 'Finish & save'}</button>
    ${next ? `<button class="btn" data-act="finish" data-next="${next.id}">Save & taste wine ${wines.indexOf(next) + 1} ›</button>` : ''}
    <p class="muted tiny center">Your taps are saved automatically as you go.</p>`;
}

// ---------- global standings
async function viewStandings() {
  const events = await db.all('events');
  const wines = await db.all('wines');
  const evById = Object.fromEntries(events.map((e) => [e.id, e]));
  const f = ui.standingsFilter;
  const rows = [];
  for (const e of events) {
    const ws = wines.filter((w) => w.eventId === e.id).sort((a, b) => a.order - b.order);
    ws.forEach((w, i) => {
      if (f !== 'all' && (f.startsWith('c:') ? w.colour !== f.slice(2) : w.eventId !== f.slice(2))) return;
      rows.push({ wine: w, name: displayName(w, e, i), sub: e.name });
    });
  }
  return shell(`
    <div class="filter-row">
      <select data-act-change="standingsFilter">
        <option value="all">All wines</option>
        <optgroup label="Colour">${['white', 'rose', 'red'].map((c) => `<option value="c:${c}" ${f === 'c:' + c ? 'selected' : ''}>${COLOUR_LABEL[c]}</option>`).join('')}</optgroup>
        <optgroup label="Event">${events.map((e) => `<option value="e:${e.id}" ${f === 'e:' + e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>
      </select>
    </div>
    <p class="muted small">20-point scores are compared as ×5.</p>
    ${standingsList(rows, (r) => (evById[r.wine.eventId] || {}).scale)}
  `, { title: 'Standings', tab: 'standings' });
}

// ---------- settings
async function viewSettings() {
  const method = getMethod(settings.method);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  return shell(`
    <section class="set-sec">
      <h2>Tasting method</h2>
      ${METHODS.map((m) => `
        <label class="radio-row ${m.comingSoon ? 'disabled' : ''}">
          <input type="radio" name="method" value="${m.id}" ${settings.method === m.id ? 'checked' : ''} ${m.comingSoon ? 'disabled' : ''} data-act-change="method">
          <span><b>${esc(m.name)}</b>${m.comingSoon ? ' <span class="pill">coming soon</span>' : `<br><span class="muted small">${esc(m.description || '')}</span>`}</span>
        </label>`).join('')}
    </section>
    <section class="set-sec">
      <h2>${esc(method.name)} level</h2>
      ${method.levels.map((l) => `
        <label class="radio-row"><input type="radio" name="level" value="${l.id}" ${settings.level === l.id ? 'checked' : ''} data-act-change="level">
          <span><b>${esc(l.name)}</b><br><span class="muted small">${{ l2: '3-step scales (low, medium, high), sweetness dry to sweet, quality only.', l3: '5-step scales, development, mousse for sparkling, readiness for drinking. Default.', l4: '5-step scales, tannin nature, palate texture, quality and ageing with written reasons.' }[l.id] || ''}</span></span></label>`).join('')}
      <p class="muted small">New wines use this level. Wines you already tasted keep the level they were tasted with.</p>
    </section>
    <section class="set-sec">
      <h2>Options</h2>
      <label class="switch-row"><span><b>Structure+ panel</b><br><span class="muted small">Extra Beyond Flavour fields: acid shape, tannin location and texture, bitterness, brightness. Sharpens GUESS.</span></span>
        <input type="checkbox" ${settings.structurePlus ? 'checked' : ''} data-act-change="structurePlus"><i></i></label>
      <div class="field-label">Default scoring scale</div>
      <div class="seg">${[100, 20].map((s) => `<label><input type="radio" name="scale" value="${s}" ${settings.scale === s ? 'checked' : ''} data-act-change="scale"><span>${s} points</span></label>`).join('')}</div>
      <div class="field-label">Default tasting mode</div>
      <div class="seg">${[['quick', 'Quick'], ['full', 'Full SAT']].map(([v, l]) => `<label><input type="radio" name="mode" value="${v}" ${settings.mode === v ? 'checked' : ''} data-act-change="defaultMode"><span>${l}</span></label>`).join('')}</div>
      <p class="muted small">Quick shows only the key lines (style, aromas, structure, quality, score). You can switch on each wine.</p>
      <div class="field-label">Tasting note format</div>
      <div class="seg">${['full', 'short', 'social'].map((s) => `<label><input type="radio" name="noteFormat" value="${s}" ${settings.noteFormat === s ? 'checked' : ''} data-act-change="noteFormat"><span>${{ full: 'WSET full', short: 'Short', social: 'Social' }[s]}</span></label>`).join('')}</div>
    </section>
    <section class="set-sec">
      <h2>My lexicon</h2>
      <div class="chips">${(settings.customLexicon || []).map((d) => `<button class="chip" data-act="delLex" data-v="${attr(d)}">${esc(d)} ✕</button>`).join('') || '<span class="muted small">Descriptors you add while tasting appear here.</span>'}</div>
    </section>
    <section class="set-sec">
      <h2>Data</h2>
      <p class="muted small">Everything is stored on this device only${persisted ? ' (protected from automatic clean-up)' : ''}. iPhone and iPad keep separate data for now; export here and import on the other device to move it.</p>
      <div class="row2"><button class="btn" data-act="export">Export backup</button><label class="btn">Import backup<input type="file" accept="application/json,.json" hidden data-import></label></div>
      <button class="btn danger" data-act="wipe">Delete all data</button>
    </section>
    <section class="set-sec about">
      <h2>About</h2>
      <p class="muted small">Install: open this page in Safari, tap Share, then <b>Add to Home Screen</b>. It then opens full screen and works offline.</p>
      <p class="muted tiny">The WSET Systematic Approach to Tasting Wine® and Wine-Lexicons are copyright Wine & Spirit Education Trust and are used here for personal study. Publishing this app requires WSET's written permission.</p>
    </section>
  `, { title: 'Settings', tab: 'settings' });
}

// ---------------------------------------------------------------- router
async function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const p = h.split('/').filter(Boolean);
  const keepScroll = route.lastHash === h;
  const y = window.scrollY;
  let html;
  try {
    if (!p.length) html = await viewEvents();
    else if (p[0] === 'standings') html = await viewStandings();
    else if (p[0] === 'settings') html = await viewSettings();
    else if (p[0] === 'event' && p[1] === 'new') html = await viewEventForm();
    else if (p[0] === 'event' && p[2] === 'edit') html = await viewEventForm(p[1]);
    else if (p[0] === 'event' && p[2] === 'add') html = await viewAddWine(p[1]);
    else if (p[0] === 'event' && p[2] === 'wine' && p[4] === 'edit') html = await viewAddWine(p[1], p[3]);
    else if (p[0] === 'event') html = await viewEvent(p[1]);
    else if (p[0] === 'wine') html = await viewWine(p[1]);
    else html = await viewEvents();
  } catch (err) {
    console.error(err);
    html = shell(`<p class="note-box">Something went wrong: ${esc(err.message)}</p>`, { title: 'Error', back: '#/' });
  }
  $app.innerHTML = html;
  hydrateMedia();
  route.lastHash = h;
  window.scrollTo(0, keepScroll ? y : 0);
  if (ui.scrollNext) {
    const from = $app.querySelector(`[data-field="${ui.scrollNext}"]`);
    ui.scrollNext = null;
    const all = [...$app.querySelectorAll('[data-field]')];
    const start = from ? all.indexOf(from) : -1;
    const nxt = all.slice(start + 1).find((n) => n.dataset.empty === '1');
    if (nxt) {
      const r = nxt.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.7 || r.top < 80) nxt.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

async function hydrateMedia() {
  for (const el of $app.querySelectorAll('[data-media]')) {
    const m = await db.get('media', el.dataset.media);
    if (m) el.src = mediaURL(m);
  }
}

const rerender = () => route();
const currentWineId = () => { const p = location.hash.split('/'); return p[1] === 'wine' ? p[2] : null; };
const currentEventId = () => { const p = location.hash.split('/'); return p[1] === 'event' ? p[2] : null; };

async function withWine(fn, render = true) {
  const id = currentWineId();
  if (!id) return;
  await flushWine();
  const w = await db.get('wines', id);
  ensureTasting(w);
  await fn(w, w.tasting);
  await db.put('wines', w);
  if (render) rerender();
}

// ---------------------------------------------------------------- actions
const actions = {
  async eventTab(el) { ui.eventTab[currentEventId()] = el.dataset.tab; rerender(); },
  async pick(el) {
    const f = el.dataset.f;
    let set = false;
    await withWine(async (w, t) => {
      set = t.values[f] !== el.dataset.v;
      t.values[f] = set ? el.dataset.v : undefined;
      if (f === 'quality' && set && !t.scoreTouched) {
        const ev = await db.get('events', w.eventId);
        const band = bandFor(el.dataset.v, ev.scale);
        if (band) { const mid = (band[0] + band[1]) / 2; t.score = ev.scale === 20 ? Math.round(mid * 2) / 2 : Math.round(mid); }
      }
    }, false);
    if (set) ui.scrollNext = f;
    rerender();
  },
  async mode(el) { await withWine((w, t) => { t.mode = el.dataset.v; }); },
  async unfold(el) { ui.unfold[el.dataset.k] = true; rerender(); },
  async fold(el) { ui.unfold[el.dataset.k] = false; rerender(); },
  async plusOpen(el) { ui.open['plus' + el.dataset.k] = true; rerender(); },
  async wheel(el) { ui.open['wheel' + el.dataset.k] = !ui.open['wheel' + el.dataset.k]; rerender(); },
  async noteToggle() { const id = currentWineId(); ui.noteOpen = ui.noteOpen === id ? null : id; rerender(); },
  async jump(el) {
    const id = currentWineId();
    ui.unfold[id + el.dataset.sec] = true;
    await route();
    const sec = $app.querySelector('#sec-' + el.dataset.sec);
    if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  async styleTile(el) {
    const s = STYLE_TILES.find((x) => x.k === el.dataset.v);
    const apply = (w) => { w.colour = s.colour; w.type = s.type; w.sweet = !!s.sweet; };
    if (location.hash.includes('/add') || location.hash.endsWith('/edit')) { readWineForm(); apply(draftWine); rerender(); return; }
    await withWine((w) => apply(w), false);
    ui.scrollNext = 'style';
    rerender();
  },
  async quickAdd(el) {
    const eventId = currentEventId();
    const s = STYLE_TILES.find((x) => x.k === el.dataset.v);
    const existing = await db.byIndex('wines', 'eventId', eventId);
    const w = { id: uid(), eventId, colour: s.colour, type: s.type, sweet: !!s.sweet, order: existing.length, createdAt: Date.now(), saved: true };
    await db.put('wines', w);
    toast(`Wine ${existing.length + 1} added: ${s.label}`);
    rerender();
  },
  async toggle(el) {
    await withWine((w, t) => {
      const f = el.dataset.f, v = el.dataset.v;
      const arr = t.values[f] || [];
      t.values[f] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    });
  },
  async descr(el) {
    await withWine((w, t) => {
      const f = el.dataset.f, c = el.dataset.c, d = el.dataset.v;
      const arr = f === 'flavours' ? flavoursOf(t) : (t.values[f] || []);
      const i = arr.findIndex((s) => s.c === c && s.d === d);
      if (i >= 0) arr.splice(i, 1); else arr.push({ c, d });
      t.values[f] = arr;
    });
  },
  async copyNose(el) {
    await withWine((w, t) => {
      const cur = t.values[el.dataset.f] || [];
      for (const a of t.values.aromas || []) if (!cur.some((s) => s.c === a.c && s.d === a.d)) cur.push({ ...a });
      t.values[el.dataset.f] = cur;
    });
    toast('Copied aromas from the nose');
  },
  async cluster(el) { ui.open[el.dataset.k] = !ui.open[el.dataset.k]; rerender(); },
  async more(el) { ui.moreOpen[el.dataset.k] = !ui.moreOpen[el.dataset.k]; rerender(); },
  async addOwn(el) {
    const input = $app.querySelector(`[data-addown="${el.dataset.f}"]`);
    const d = (el.dataset.v || (input && input.value) || '').trim().toLowerCase();
    if (!d) return;
    if (!settings.customLexicon.includes(d)) { settings.customLexicon.push(d); await saveSettings(); }
    await withWine((w, t) => {
      const arr = el.dataset.f === 'flavours' ? flavoursOf(t) : (t.values[el.dataset.f] || []);
      if (!arr.some((s) => s.d === d)) arr.push({ c: 'custom', d });
      t.values[el.dataset.f] = arr;
    });
  },
  async blic(el) {
    await withWine((w, t) => { const v = el.dataset.v; t.blic = (t.blic || []).includes(v) ? t.blic.filter((x) => x !== v) : [...(t.blic || []), v]; });
  },
  async guess() { const id = currentWineId(); ui.guessOpen = ui.guessOpen === id ? null : id; if (ui.guessOpen) await withWine((w, t) => { t.engineGuess = guess(w, derived(t)).results.slice(0, 3).map((r) => r.profile.id); }); else rerender(); },
  async finish(el) {
    await flushWine();
    const next = el.dataset.next;
    let eventId;
    await withWine((w, t) => { t.values.flavours = flavoursOf(t); t.done = true; t.finishedAt = Date.now(); eventId = w.eventId; }, false);
    toast('Tasting saved');
    go(next ? `#/wine/${next}` : `#/event/${eventId}`);
  },
  async noteFmt(el) { ui.noteFormat = el.dataset.v; rerender(); },
  async copyNote() {
    const text = $app.querySelector('#noteOut').innerText;
    try { await navigator.clipboard.writeText(text); toast('Note copied'); } catch (e) { const r = document.createRange(); r.selectNodeContents($app.querySelector('#noteOut')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Text selected: tap Copy'); }
  },
  async shareNote() {
    const text = $app.querySelector('#noteOut').innerText;
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) { /* cancelled */ } } else actions.copyNote();
  },
  async reveal() {
    if (!(await ask('Reveal this wine? Make your guess first.', 'Reveal'))) return;
    await withWine((w) => { w.revealed = true; });
  },
  async guessResult(el) { await withWine((w, t) => { t.guessResult = el.dataset.v; }); },
  async moveWine(el) {
    const { wines } = await loadEvent(currentEventId());
    const i = wines.findIndex((w) => w.id === el.dataset.id);
    const j = i + +el.dataset.dir;
    if (j < 0 || j >= wines.length) return;
    [wines[i], wines[j]] = [wines[j], wines[i]];
    for (let k = 0; k < wines.length; k++) { wines[k].order = k; await db.put('wines', wines[k]); }
    rerender();
  },
  async delMedia(el) {
    if (!(await ask('Delete this photo or video?', 'Delete'))) return;
    await db.del('media', el.dataset.id);
    rerender();
  },
  async deleteEvent() {
    const id = currentEventId();
    if (!(await ask('Delete this event and all its wines?', 'Delete'))) return;
    for (const w of await db.byIndex('wines', 'eventId', id)) await db.del('wines', w.id);
    await db.del('events', id);
    go('#/');
  },
  async deleteWine() {
    if (!(await ask('Delete this wine and its tasting?', 'Delete'))) return;
    await db.del('wines', draftWine.id);
    go(`#/event/${draftWine.eventId}`);
  },
  async delLex(el) { settings.customLexicon = settings.customLexicon.filter((d) => d !== el.dataset.v); await saveSettings(); rerender(); },
  async export() {
    const data = { app: 'tasting', version: 1, exportedAt: new Date().toISOString(), settings, events: await db.all('events'), wines: await db.all('wines') };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], `tasting-backup-${today()}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { /* fall through */ } }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  },
  async wipe() {
    if (!(await ask('Delete all events, wines, photos and settings on this device?', 'Delete all'))) return;
    await db.clearAll(); settings = { ...DEFAULT_SETTINGS, customLexicon: [] }; go('#/'); rerender();
  },
};

const changeActions = {
  async method(el) { settings.method = el.value; settings.level = getMethod(el.value).defaultLevel; await saveSettings(); rerender(); },
  async level(el) { settings.level = el.value; await saveSettings(); rerender(); },
  async structurePlus(el) { settings.structurePlus = el.checked; await saveSettings(); },
  async scale(el) { settings.scale = +el.value; await saveSettings(); },
  async noteFormat(el) { settings.noteFormat = el.value; ui.noteFormat = null; await saveSettings(); },
  async defaultMode(el) { settings.mode = el.value; await saveSettings(); },
  async standingsFilter(el) { ui.standingsFilter = el.value; rerender(); },
  async showTannin(el) { await withWine((w, t) => { t.showTannin = el.checked; }); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  e.preventDefault();
  actions[el.dataset.act](el);
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.actChange && changeActions[el.dataset.actChange]) return changeActions[el.dataset.actChange](el);
  if (el.dataset.upload !== undefined) return handleUpload(el);
  if (el.dataset.import !== undefined) return handleImport(el);
});

document.addEventListener('input', async (e) => {
  const el = e.target;
  const wid = currentWineId();
  if (el.dataset.aromaSearch && wid) {
    const fid = el.dataset.aromaSearch;
    const w = pendingWine && pendingWine.id === wid ? pendingWine : await db.get('wines', wid);
    const t = ensureTasting(w);
    const box = $app.querySelector(`[data-results="${fid}"]`);
    if (box) box.innerHTML = searchResults(fid, el.value, w, t, getLevel(t.methodId, t.levelId));
    return;
  }
  if (el.id === 'eventNotes') {
    const ev = await db.get('events', currentEventId());
    ev.notes = el.value; saveEventSoon(ev);
  } else if (wid && (el.dataset.text || el.dataset.textT || el.dataset.score !== undefined || el.dataset.scoreRange !== undefined)) {
    const w = pendingWine && pendingWine.id === wid ? pendingWine : await db.get('wines', wid);
    const t = ensureTasting(w);
    if (el.dataset.text) t.values[el.dataset.text] = el.value;
    else if (el.dataset.textT) t[el.dataset.textT] = el.value;
    else {
      t.score = el.value === '' ? null : +el.value;
      t.scoreTouched = true;
      const other = $app.querySelector(el.dataset.score !== undefined ? '[data-score-range]' : '[data-score]');
      if (other && el.value !== '') other.value = el.value;
    }
    saveWineSoon(w);
    const out = $app.querySelector('#noteOut');
    if (out) {
      const event = await db.get('events', w.eventId);
      out.textContent = generateNote(ui.noteFormat || settings.noteFormat, w, derived(t), getLevel(t.methodId, t.levelId), event);
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.aromaSearch) {
    e.preventDefault();
    const first = $app.querySelector(`[data-results="${e.target.dataset.aromaSearch}"] .sr`);
    if (first) first.click();
    return;
  }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.addown) { e.preventDefault(); actions.addOwn({ dataset: { f: e.target.dataset.addown } }); }
});

let evTimer;
function saveEventSoon(ev) { clearTimeout(evTimer); evTimer = setTimeout(() => db.put('events', ev), 300); }

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'eventForm') {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const ev = id ? await db.get('events', id) : { id: uid(), createdAt: Date.now(), notes: '' };
    Object.assign(ev, { name: fd.get('name').trim(), date: fd.get('date'), place: fd.get('place').trim(), scale: +fd.get('scale'), blind: fd.get('blind') === 'on', host: fd.get('host').trim(), theme: fd.get('theme').trim() });
    await db.put('events', ev);
    go(`#/event/${ev.id}`);
  } else if (form.id === 'wineForm') {
    readWineForm();
    const w = draftWine;
    const isNew = !(await db.get('wines', w.id));
    if (isNew) {
      const existing = await db.byIndex('wines', 'eventId', w.eventId);
      w.order = existing.length;
      w.createdAt = Date.now();
    }
    w.saved = true;
    await db.put('wines', w);
    go(isNew ? `#/event/${w.eventId}` : `#/wine/${w.id}`);
  }
});

function readWineForm() {
  const form = $app.querySelector('#wineForm');
  if (!form || !draftWine) return;
  for (const k of ['producer', 'name', 'vintage', 'abv', 'region', 'country', 'grapes', 'price']) {
    if (form.elements[k]) draftWine[k] = form.elements[k].value.trim();
  }
}

async function handleUpload(el) {
  const files = [...el.files];
  if (!files.length) return;
  const owner = el.dataset.upload;
  if (owner === 'label') {
    readWineForm();
    const m = await addMedia('label:' + draftWine.id, 'image', files[0]);
    if (draftWine.labelId) await db.del('media', draftWine.labelId);
    draftWine.labelId = m.id;
    if (await db.get('wines', draftWine.id)) await db.put('wines', draftWine);
  } else {
    for (const f of files) await addMedia(owner, f.type.startsWith('video/') ? 'video' : 'image', f);
    toast(files.length === 1 ? 'Added' : `Added ${files.length}`);
  }
  rerender();
}

async function handleImport(el) {
  const f = el.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'tasting') throw new Error('Not a tasting backup');
    if (!(await ask(`Import ${data.events.length} events and ${data.wines.length} wines? Items with the same id are replaced.`, 'Import'))) return;
    for (const ev of data.events) await db.put('events', ev);
    for (const w of data.wines) await db.put('wines', w);
    toast('Imported');
    rerender();
  } catch (err) { toast('Import failed: ' + err.message); }
}

// ---------------------------------------------------------------- boot
async function boot() {
  settings = { ...DEFAULT_SETTINGS, ...(await db.getKV('settings', {})) };
  settings.customLexicon = settings.customLexicon || [];
  window.addEventListener('hashchange', route);
  await route();
  requestPersistence();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* not available in this context */ }
  }
}
boot();
