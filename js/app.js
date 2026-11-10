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
const STEPS = [
  { id: 'style', title: 'Style' },
  { id: 'appearance', title: 'Appearance' },
  { id: 'nose', title: 'Nose' },
  { id: 'palate', title: 'Palate' },
  { id: 'conclusions', title: 'Conclusions' },
  { id: 'wrap', title: 'Wrap-up' },
];
const DEFAULT_BANDS = {
  outstanding: [[95, 100], [18.5, 20]],
  'very good': [[90, 94], [17, 18]],
  good: [[85, 89], [16, 16.5]],
  acceptable: [[80, 84], [15, 15.5]],
  poor: [[70, 79], [12, 14.5]],
  faulty: [[50, 69], [0, 11.5]],
};
const DEFAULT_SETTINGS = { method: 'wset', level: 'l3', structurePlus: true, scale: 100, noteFormat: 'full', customLexicon: [] };

let settings = { ...DEFAULT_SETTINGS };
const ui = { open: {}, step: {}, moreOpen: {}, eventTab: {}, standingsFilter: 'all' };
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
    body = wines.map((w, i) => {
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
              <span class="muted small"><span class="dot dot-${w.colour || 'none'}"></span>${w.colour ? COLOUR_LABEL[w.colour] : 'style not set'}${w.type && w.type !== 'still' ? ' · ' + TYPE_LABEL[w.type] : ''} · ${status}</span>
            </span>
            <span class="wc-score">${t && t.score != null && t.score !== '' ? esc(formatScore(t.score, event.scale)) : ''}</span>
          </a>
          <span class="reorder">
            <button data-act="moveWine" data-id="${w.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
            <button data-act="moveWine" data-id="${w.id}" data-dir="1" ${i === wines.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
          </span>
        </div>`;
    }).join('') || `<div class="empty"><p><b>No wines yet.</b></p><p class="muted">Add them in the order you'll taste them.</p></div>`;
    body += `<a class="fab" href="#/event/${id}/add">+ Add wine</a>`;
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

function styleChips(w) {
  return `
    <div class="field-label">Colour</div>
    <div class="chips big">${['white', 'rose', 'red'].map((c) => `<button type="button" class="chip ${w.colour === c ? 'on' : ''}" data-act="setStyle" data-k="colour" data-v="${c}"><span class="dot dot-${c}"></span>${COLOUR_LABEL[c]}</button>`).join('')}</div>
    <div class="field-label">Type</div>
    <div class="chips big">${['still', 'sparkling', 'fortified'].map((c) => `<button type="button" class="chip ${(w.type || 'still') === c ? 'on' : ''}" data-act="setStyle" data-k="type" data-v="${c}">${TYPE_LABEL[c]}</button>`).join('')}</div>`;
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
      ${hide ? '' : styleChips(w)}
      <button class="btn primary" type="submit">${editing ? 'Save' : 'Add wine'}</button>
      ${editing ? '<button class="btn danger" type="button" data-act="deleteWine">Delete wine</button>' : ''}
    </form>
  `, { title: editing ? 'Wine details' : 'Add wine', back: editing ? `#/wine/${wineId}` : `#/event/${eventId}` });
}

// ---------- tasting
function ensureTasting(w) {
  if (!w.tasting) w.tasting = { methodId: settings.method, levelId: settings.level, values: {}, blic: [] };
  w.tasting.values = w.tasting.values || {};
  return w.tasting;
}

function renderField(f, t, w, level) {
  const val = t.values[f.id];
  const plus = f.plus ? '<span class="plus-tag">Structure+</span>' : '';
  const help = f.help ? `<div class="muted small help">${esc(f.help)}</div>` : '';
  if (f.type === 'single') {
    const opts = f.byColour ? (f.byColour[w.colour] || []) : f.options;
    if (f.byColour && !w.colour) return `<div class="field"><div class="field-label">${esc(f.label)}</div><p class="muted small">Pick a colour on the Style step first.</p></div>`;
    return `<div class="field"><div class="field-label">${esc(f.label)} ${plus}</div>${help}
      <div class="chips ${f.scale ? 'scale' : ''}">${opts.map((o) => `<button class="chip ${val === o ? 'on' : ''}" data-act="pick" data-f="${f.id}" data-v="${attr(o)}">${esc(o)}</button>`).join('')}</div></div>`;
  }
  if (f.type === 'multi') {
    const arr = val || [];
    return `<div class="field"><div class="field-label">${esc(f.label)} ${plus}<span class="muted small"> · any</span></div>${help}
      <div class="chips">${f.options.map((o) => `<button class="chip ${arr.includes(o) ? 'on' : ''}" data-act="toggle" data-f="${f.id}" data-v="${attr(o)}">${esc(o)}</button>`).join('')}</div></div>`;
  }
  if (f.type === 'text') {
    return `<label class="block-label">${esc(f.label)}<textarea rows="2" data-text="${f.id}" placeholder="${attr(f.placeholder || '')}">${esc(val || '')}</textarea></label>`;
  }
  if (f.type === 'lexicon') return renderLexicon(f, t, w, level);
  return '';
}

function renderLexicon(f, t, w, level) {
  const sel = t.values[f.id] || [];
  const colour = w.colour || 'red';
  const key = w.id + f.id;
  const clusters = level.lexicon;
  const main = clusters.filter((c) => c.colours.includes(colour));
  const more = clusters.filter((c) => !c.colours.includes(colour));
  const cl = (c) => {
    const n = sel.filter((s) => s.c === c.id).length;
    const open = ui.open[key + c.id];
    return `
      <div class="cluster ${open ? 'open' : ''} ${n ? 'has' : ''}">
        <button class="cl-head" data-act="cluster" data-k="${key + c.id}"><span>${esc(c.name)}</span>${n ? `<span class="count">${n}</span>` : ''}<span class="chev">${open ? '▾' : '▸'}</span></button>
        ${open ? `<div class="chips">${c.d.map((d) => `<button class="chip ${sel.some((s) => s.c === c.id && s.d === d) ? 'on' : ''}" data-act="descr" data-f="${f.id}" data-c="${c.id}" data-v="${attr(d)}">${esc(d)}</button>`).join('')}</div>` : ''}
      </div>`;
  };
  const byLayer = (list) => ['primary', 'secondary', 'tertiary'].map((layer) => {
    const items = list.filter((c) => c.layer === layer);
    return items.length ? `<div class="layer-title">${layer}</div>${items.map(cl).join('')}` : '';
  }).join('');
  const custom = sel.filter((s) => s.c === 'custom');
  const myLex = settings.customLexicon || [];
  const copyBtn = f.copyFrom ? `<button class="btn small-btn" data-act="copyNose" data-f="${f.id}">Copy from nose</button>` : '';
  return `
    <div class="field lex">
      <div class="field-label">${esc(f.label)} <span class="muted small">· tap a cluster</span></div>
      ${copyBtn}
      ${sel.length ? `<div class="selected-line">${sel.map((s) => `<button class="chip on" data-act="descr" data-f="${f.id}" data-c="${s.c}" data-v="${attr(s.d)}">${esc(s.d)} ✕</button>`).join('')}</div>` : ''}
      ${byLayer(main)}
      ${more.length ? `<button class="more-btn" data-act="more" data-k="${key}">${ui.moreOpen[key] ? '▾' : '▸'} More clusters (${more.length})</button>${ui.moreOpen[key] ? byLayer(more) : ''}` : ''}
      <div class="layer-title">my descriptors</div>
      <div class="chips">
        ${myLex.map((d) => `<button class="chip ${custom.some((s) => s.d === d) ? 'on' : ''}" data-act="descr" data-f="${f.id}" data-c="custom" data-v="${attr(d)}">${esc(d)}</button>`).join('')}
        <span class="add-own"><input placeholder="+ Add your own" data-addown="${f.id}" enterkeyhint="done"><button data-act="addOwn" data-f="${f.id}">Add</button></span>
      </div>
    </div>`;
}

function blicHelper(t) {
  const sel = t.blic || [];
  const n = sel.length;
  const suggestion = ['poor', 'acceptable', 'good', 'very good', 'outstanding'][n];
  return `
    <div class="blic">
      <div class="field-label">BLIC helper <span class="muted small">· tick what this wine has</span></div>
      <div class="chips">${[['B', 'Balance'], ['L', 'Length'], ['I', 'Intensity'], ['C', 'Complexity']].map(([k, l]) => `<button class="chip ${sel.includes(k) ? 'on' : ''}" data-act="blic" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="muted small">Suggests: <b>${suggestion}</b>${t.values.quality && t.values.quality !== suggestion ? ` (you picked ${esc(t.values.quality)}, that's fine)` : ''} <button class="link" data-act="pick" data-f="quality" data-v="${suggestion}">use it</button></div>
    </div>`;
}

function stepSummary(level, sectionId, w, t) {
  const fs = fieldsFor(level, sectionId, w, settings, t);
  const filled = fs.filter((f) => { const v = t.values[f.id]; return Array.isArray(v) ? v.length : v; }).length;
  return { filled, total: fs.length };
}

async function viewWine(id) {
  const w = await db.get('wines', id);
  if (!w) return shell('<p class="muted center">Wine not found.</p>', { title: 'Wine', back: '#/' });
  const { event, wines } = await loadEvent(w.eventId);
  const idx = wines.findIndex((x) => x.id === id);
  const t = ensureTasting(w);
  const level = getLevel(t.methodId, t.levelId);
  const method = getMethod(t.methodId);
  let step = ui.step[id] || (w.colour ? 'appearance' : 'style');
  ui.step[id] = step;

  const stepper = `<div class="stepper">${STEPS.map((s) => {
    let cls = s.id === step ? 'on' : '';
    if (!['style', 'wrap'].includes(s.id)) { const sm = stepSummary(level, s.id, w, t); if (sm.filled === sm.total && sm.total) cls += ' done'; else if (sm.filled) cls += ' part'; }
    if (s.id === 'style' && w.colour) cls += ' done';
    if (s.id === 'wrap' && t.score != null && t.score !== '') cls += ' done';
    return `<button class="${cls}" data-act="step" data-step="${s.id}"><i></i>${s.title}</button>`;
  }).join('')}</div>`;

  let body = '';
  if (step === 'style') {
    body = `<p class="muted">The style decides which options and lexicon clusters you see.</p>${styleChips(w)}
      ${w.colour && w.colour !== 'red' ? `<label class="switch-row"><span>Show tannin <span class="muted small">(orange / skin-contact)</span></span><input type="checkbox" data-act-change="showTannin" ${t.showTannin ? 'checked' : ''}><i></i></label>` : ''}`;
  } else if (step === 'wrap') {
    body = await wrapUp(w, t, level, event, idx);
  } else {
    const fs = fieldsFor(level, step, w, settings, t);
    body = fs.map((f) => renderField(f, t, w, level) + (f.blic ? blicHelper(t) : '')).join('');
  }
  const si = STEPS.findIndex((s) => s.id === step);
  const nav = `<div class="step-nav">
      ${si > 0 ? `<button class="btn" data-act="step" data-step="${STEPS[si - 1].id}">‹ ${STEPS[si - 1].title}</button>` : '<span></span>'}
      ${si < STEPS.length - 1 ? `<button class="btn primary" data-act="step" data-step="${STEPS[si + 1].id}">${STEPS[si + 1].title} ›</button>` : `<button class="btn primary" data-act="finish">${t.done ? 'Save changes' : 'Finish & save'}</button>`}
    </div>
    ${si === STEPS.length - 1 && wines[idx + 1] ? `<button class="btn" data-act="finish" data-next="${wines[idx + 1].id}">Save & taste wine ${idx + 2} ›</button>` : ''}
    <p class="muted tiny center">Your taps are saved automatically as you go.</p>`;
  const sub = `${method.name} · ${level.name}${w.colour ? ' · ' + COLOUR_LABEL[w.colour] : ''}${w.type && w.type !== 'still' ? ' ' + TYPE_LABEL[w.type].toLowerCase() : ''}`;
  return shell(`<div class="wine-sub muted small">${esc(sub)} · wine ${idx + 1} of ${wines.length}</div>${stepper}<div class="step-body">${body}</div>${nav}`,
    { title: displayName(w, event, idx), back: `#/event/${w.eventId}`, actions: (!event.blind || w.revealed) ? `<a class="icon-btn" href="#/event/${w.eventId}/wine/${w.id}/edit" aria-label="Wine details">✎</a>` : '' });
}

async function wrapUp(w, t, level, event, idx) {
  const scale = event.scale;
  const band = bandFor(t.values.quality, scale);
  const min = scale === 20 ? 0 : 50, max = scale === 20 ? 20 : 100, stepv = scale === 20 ? 0.5 : 1;
  const cur = t.score != null && t.score !== '' ? t.score : (band ? band[0] : '');
  const g = ui.guessOpen === w.id ? guess(w, t) : null;
  const fmt = ui.noteFormat || settings.noteFormat;
  const note = generateNote(fmt, w, t, level, event);
  const photos = await db.byIndex('media', 'owner', 'wine:' + w.id);
  const label = w.labelId ? await db.get('media', w.labelId) : null;

  const guessPanel = g ? `
    <div class="guess-panel">
      ${g.filled < 3 ? '<p class="note-box">Fill more of the structure (acidity, tannin, body, alcohol) and some aromas for a sharper guess.</p>' : ''}
      ${g.results.length ? `<ol class="guess-list">${g.results.map((r) => `
        <li><div class="gl-top"><span><b>${esc(r.profile.name)}</b>, ${esc(r.profile.region)}${r.ageHint ? `, ${r.ageHint}` : ''}</span><span class="pct">${r.pct}%</span></div>
        <div class="bar"><i style="width:${r.pct}%"></i></div>
        <div class="muted small">${esc(explain(r))}</div></li>`).join('')}</ol>
        <p class="muted tiny">Percentages are relative likelihoods among the ${g.results.length ? 'candidates in the app\'s knowledge base' : ''}, not true probabilities.</p>`
      : '<p class="muted">No profile in the knowledge base matches this style yet.</p>'}
      <label class="block-label">My guess<input data-text-t="myGuess" value="${attr(t.myGuess || '')}" placeholder="e.g. Nebbiolo, Barolo, 2015"></label>
    </div>` : '';

  const reveal = event.blind ? (w.revealed ? `
      <div class="card reveal-done">
        <div class="field-label">Revealed</div>
        ${label ? `<img src="${mediaURL(label)}" class="reveal-img" alt="Label">` : ''}
        <div><b>${esc(wineTitle(w))}</b></div>
        <div class="muted small">${esc([w.grapes, w.region, w.country].filter(Boolean).join(' · '))}</div>
        <a class="link" href="#/event/${w.eventId}/wine/${w.id}/edit">Fill in or fix details</a>
        <div class="field-label">How was my guess?</div>
        <div class="chips">${['right', 'close', 'wrong'].map((r) => `<button class="chip ${t.guessResult === r ? 'on' : ''}" data-act="guessResult" data-v="${r}">${r}</button>`).join('')}</div>
      </div>` : `<button class="btn reveal-btn" data-act="reveal">👁 Reveal the wine</button>`) : '';

  return `
    <div class="wrap-grid">
      <button class="big-card ${g ? 'on' : ''}" data-act="guess"><span class="bc-icon">🔍</span><b>GUESS</b><span class="muted small">What is it?</span></button>
      <div class="big-card score-card">
        <span class="bc-icon">★</span><b>SCORE</b>
        <input class="score-num" type="number" inputmode="decimal" min="${min}" max="${max}" step="${stepv}" value="${attr(cur)}" data-score placeholder="–">
        <span class="muted small">/${scale}</span>
      </div>
    </div>
    ${guessPanel}
    <input type="range" class="score-range" min="${min}" max="${max}" step="${stepv}" value="${attr(cur === '' ? (scale === 20 ? 16 : 88) : cur)}" data-score-range>
    <div class="muted small center">${band ? `SAT quality <b>${esc(t.values.quality)}</b> suggests ${band[0]}–${band[1]}.` : 'Pick a quality level in Conclusions to get a suggested range.'}
      ${t.score == null || t.score === '' ? (band ? ` <button class="link" data-act="useBand" data-v="${band[0]}">Set ${band[0]}</button>` : '') : ''}</div>
    ${reveal}
    <label class="block-label">My notes<textarea rows="3" data-text-t="myNotes" placeholder="Price, who brought it, food, mood…">${esc(t.myNotes || '')}</textarea></label>
    <div class="field-label">Tasting note</div>
    <div class="seg small-seg">${['full', 'short', 'social'].map((f) => `<button data-act="noteFmt" data-v="${f}" class="${fmt === f ? 'on' : ''}">${{ full: 'WSET full', short: 'Short', social: 'Social' }[f]}</button>`).join('')}</div>
    <div class="note-out" id="noteOut">${esc(note) || '<span class="muted">Your note appears here as you tap.</span>'}</div>
    <div class="row2">
      <button class="btn" data-act="copyNote">Copy</button>
      <button class="btn" data-act="shareNote">Share</button>
    </div>
    <div class="field-label">Photos</div>
    <div class="gallery">
      ${photos.map((m) => `<div class="g-item"><img src="${mediaURL(m)}" alt=""><button class="g-del" data-act="delMedia" data-id="${m.id}">✕</button></div>`).join('')}
      <label class="g-add">📷<br><span class="small">Add</span><input type="file" accept="image/*" multiple hidden data-upload="wine:${w.id}"></label>
    </div>`;
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
  async step(el) { ui.step[currentWineId()] = el.dataset.step; route.lastHash = null; rerender(); },
  async pick(el) {
    await withWine((w, t) => { const f = el.dataset.f; t.values[f] = t.values[f] === el.dataset.v ? undefined : el.dataset.v; });
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
      const arr = t.values[f] || [];
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
    const d = (input.value || '').trim().toLowerCase();
    if (!d) return;
    if (!settings.customLexicon.includes(d)) { settings.customLexicon.push(d); await saveSettings(); }
    await withWine((w, t) => {
      const arr = t.values[el.dataset.f] || [];
      if (!arr.some((s) => s.d === d)) arr.push({ c: 'custom', d });
      t.values[el.dataset.f] = arr;
    });
  },
  async blic(el) {
    await withWine((w, t) => { const v = el.dataset.v; t.blic = (t.blic || []).includes(v) ? t.blic.filter((x) => x !== v) : [...(t.blic || []), v]; });
  },
  async setStyle(el) {
    const k = el.dataset.k, v = el.dataset.v;
    if (location.hash.includes('/add') || location.hash.endsWith('/edit')) {
      readWineForm(); draftWine[k] = v; rerender(); return;
    }
    await withWine((w) => { w[k] = v; });
  },
  async guess() { const id = currentWineId(); ui.guessOpen = ui.guessOpen === id ? null : id; if (ui.guessOpen) await withWine((w, t) => { t.engineGuess = guess(w, t).results.slice(0, 3).map((r) => r.profile.id); }); else rerender(); },
  async finish(el) {
    await flushWine();
    const next = el.dataset.next;
    let eventId;
    await withWine((w, t) => { t.done = true; t.finishedAt = Date.now(); eventId = w.eventId; }, false);
    toast('Tasting saved');
    go(next ? `#/wine/${next}` : `#/event/${eventId}`);
  },
  async useBand(el) { await withWine((w, t) => { t.score = +el.dataset.v; }); },
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
      const other = $app.querySelector(el.dataset.score !== undefined ? '[data-score-range]' : '[data-score]');
      if (other && el.value !== '') other.value = el.value;
    }
    saveWineSoon(w);
    const out = $app.querySelector('#noteOut');
    if (out) {
      const event = await db.get('events', w.eventId);
      out.textContent = generateNote(ui.noteFormat || settings.noteFormat, w, t, getLevel(t.methodId, t.levelId), event);
    }
  }
});

document.addEventListener('keydown', (e) => {
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
