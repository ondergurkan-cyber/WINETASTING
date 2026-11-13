import { db, uid, addMedia, requestPersistence } from './db.js';
import { METHODS, getMethod, getLevel, fieldsFor } from './methods/index.js';
import { generateNote, wineTitle, formatScore } from './note.js';
import { guess, explain } from './guess.js';
import { scanLabel, testKey } from './scan.js';
import { icon, engraving } from './icons.js';
import * as sync from './sync.js';

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
const DEFAULT_SETTINGS = { method: 'wset', level: 'l3', advanced: false, scale: 100, noteFormat: 'full', mode: 'full', customLexicon: [], autoScan: true, currency: '€' };

let settings = { ...DEFAULT_SETTINGS };
let apiKey = ''; // the user's own Anthropic key; device only, never exported
const ui = { open: {}, unfold: {}, eventTab: {}, standingsFilter: 'all', cellarFilter: 'in', aiFilled: {} };
const money = (n) => (n == null || n === '' || isNaN(n) ? '' : `${settings.currency || ''}${(+n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/[^0-9.]/g, '')); return isNaN(x) ? null : x; };
const thisYear = () => new Date().getFullYear();
const urlCache = new Map();
function mediaURL(m) {
  if (!urlCache.has(m.id)) urlCache.set(m.id, URL.createObjectURL(m.blob));
  return urlCache.get(m.id);
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, Math.max(1800, msg.length * 60));
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
      <a href="#/" class="${tab === 'home' ? 'on' : ''}"><span class="ti">${icon('home')}</span>Home</a>
      <a href="#/events" class="${tab === 'tasting' ? 'on' : ''}"><span class="ti">${icon('glass')}</span>Tasting</a>
      <a href="#/cellar" class="${tab === 'cellar' ? 'on' : ''}"><span class="ti">${icon('bottle')}</span>Cellar</a>
      <a href="#/merchants" class="${tab === 'merchants' ? 'on' : ''}"><span class="ti">${icon('shop')}</span>Merchants</a>
      <a href="#/standings" class="${tab === 'standings' ? 'on' : ''}"><span class="ti">${icon('laurel')}</span>Standings</a>
    </nav>` : '';
  return `
    <header class="topbar">
      ${back ? `<a class="back" href="${back}" aria-label="Back">${icon('back', 22)}</a>` : syncMark()}
      <h1>${esc(title || 'Tasting')}</h1>
      <div class="top-actions">${actions || (tab ? `<a class="icon-btn" href="#/settings" aria-label="Settings">${icon('gear', 20)}</a>` : '')}</div>
    </header>
    <main class="${[tab ? 'with-tabs' : '', tab === 'home' ? 'home' : ''].join(' ').trim()}">${content}</main>
    ${tabs}`;
}

// Small cloud in the top-left corner of the main screens: is this device in step with the others?
function syncInfo(x = sync.state()) {
  if (!sync.configured() || x.status === 'off') return null;
  if (!x.signedIn) return { cls: 'out', label: 'Not syncing. Sign in to share data across your devices.' };
  if (x.status === 'syncing') return { cls: 'busy', label: x.progress || 'Syncing…' };
  if (x.status === 'offline') return { cls: 'wait', label: x.pending ? `Offline. ${x.pending} change${x.pending === 1 ? '' : 's'} will sync when you are back online.` : 'Offline. Changes will sync when you are back online.' };
  if (x.status === 'error') return { cls: 'err', label: 'Sync problem: ' + (x.message || 'unknown') };
  if (x.pending) return { cls: 'wait', label: `${x.pending} change${x.pending === 1 ? '' : 's'} waiting to sync` };
  return { cls: 'ok', label: x.lastSync ? 'Synced ' + ago(x.lastSync) : 'Synced' };
}
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function syncMark() {
  const i = syncInfo();
  if (!i) return '<span class="back-spacer"></span>';
  return `<a class="back sync-mark ${i.cls}" href="#/settings" data-sync-mark aria-label="${attr(i.label)}" title="${attr(i.label)}">${icon('cloud', 22)}<i></i></a>`;
}
function paintSync() {
  const i = syncInfo();
  document.querySelectorAll('[data-sync-mark]').forEach((a) => {
    if (!i) return;
    a.className = `back sync-mark ${i.cls}`;
    a.setAttribute('aria-label', i.label); a.title = i.label;
  });
  const line = document.querySelector('[data-sync-line]');
  if (line && i) line.textContent = i.label;
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
      <div class="empty-icon">${engraving('glass')}</div>
      <p><b>No tastings yet.</b></p>
      <p class="muted">Create an event, add the wines, and taste them with the ${esc(getMethod(settings.method).name)} ${esc(level.name)}.</p>
    </div>`;
  return shell(`
    ${homeTabs('events')}
    <div class="method-badge">Method: <b>${esc(getMethod(settings.method).name)}</b> · ${esc(level.name)}${settings.advanced ? ' · Advanced' : ''} <a href="#/settings">change</a></div>
    ${events.length ? cards : empty}
    <a class="fab" href="#/new">+ New tasting</a>
  `, { title: 'Tasting', tab: 'tasting' });
}

function homeTabs(on) {
  return `<div class="seg seg-tabs">
      <a href="#/events" class="${on === 'events' ? 'on' : ''}">Events</a>
      <a href="#/mywines" class="${on === 'mywines' ? 'on' : ''}">My Wines</a>
    </div>`;
}

// ---------- Home: one page over everything the book holds
const scoreOf = (w) => (w.tasting && w.tasting.score != null && w.tasting.score !== '' ? +w.tasting.score : null);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const shortDate = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { return d || ''; } };
function qualityFor(s100) {
  for (const [q, b] of Object.entries(DEFAULT_BANDS)) if (s100 >= b[0][0]) return q.charAt(0).toUpperCase() + q.slice(1);
  return '';
}
function topCounts(list, n = 3) {
  const m = new Map();
  for (const x of list) { const k = x.trim(); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

async function viewHome() {
  const [events, allWines, bottles, merchants, mediaIds] = await Promise.all([db.all('events'), db.all('wines'), db.all('bottles'), db.all('merchants'), db.keys('media')]);
  const evById = Object.fromEntries(events.map((e) => [e.id, e]));
  const y = String(thisYear());
  const now = today();
  const inYear = (d) => !!d && d.startsWith(y);
  // Wines that belong somewhere: in an event that still exists, or a saved single tasting.
  const wines = allWines.filter((w) => (w.eventId ? evById[w.eventId] : w.saved));
  const pos = {};
  for (const e of events) wines.filter((w) => w.eventId === e.id).sort((a, b) => a.order - b.order).forEach((w, i) => { pos[w.id] = i; });
  const ev = (w) => (w.eventId ? evById[w.eventId] : null);
  const dateOf = (w) => (w.eventId ? (ev(w) || {}).date : w.date) || '';
  const scaleOf = (w) => (w.eventId ? (ev(w) || {}).scale : w.scale) === 20 ? 20 : 100;
  const nameOf = (w) => displayName(w, ev(w), pos[w.id] || 0);
  const hidden = (w) => { const e = ev(w); return !!(e && e.blind && !w.revealed); };
  const whereOf = (w) => (w.eventId ? (ev(w) || {}).name : ['My Wines', w.place].filter(Boolean).join(' · '));
  const byDate = (a, b) => dateOf(b).localeCompare(dateOf(a)) || (b.updatedAt || 0) - (a.updatedAt || 0);

  const tasted = wines.filter((w) => w.tasting && (w.tasting.done || scoreOf(w) != null)).sort(byDate);
  const singles = wines.filter((w) => !w.eventId).sort(byDate);
  const inCellar = bottles.filter((b) => (b.qty || 0) > 0);
  const bottleCount = inCellar.reduce((n, b) => n + (b.qty || 0), 0);
  const cellarValue = inCellar.reduce((n, b) => n + (b.qty || 0) * (num(b.price) || 0), 0);
  const spentYear = bottles.filter((b) => b.merchantId && inYear(b.purchaseDate)).reduce((n, b) => n + (b.bought ?? b.qty ?? 0) * (num(b.price) || 0), 0);
  const boughtYear = bottles.filter((b) => inYear(b.purchaseDate)).reduce((n, b) => n + (b.bought ?? b.qty ?? 0), 0);
  const nothing = !events.length && !wines.length && !bottles.length && !merchants.length;

  const head = `<div class="masthead">
      <h2 class="mast-date">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
      <p class="descriptor">${nothing ? 'A fresh book. Every glass, bottle and shop you add shows up here.'
        : esc([tasted.filter((w) => inYear(dateOf(w))).length ? `${plural(tasted.filter((w) => inYear(dateOf(w))).length, 'wine')} tasted in ${y}` : `No tastings yet in ${y}`, bottleCount ? `${plural(bottleCount, 'bottle')} in the cellar` : ''].filter(Boolean).join(', ')) + '.'}</p>
    </div>`;

  if (nothing) {
    return shell(`${head}
      <div class="empty home-empty"><div class="empty-icon">${engraving('glass')}</div>
        <p><b>Start your book</b></p>
        <p class="muted">Taste a wine, put a bottle in the cellar or note a shop you like. This page then keeps the totals, what needs you, and your latest notes.</p></div>
      <div class="start-list">
        <a class="card choice" href="#/new"><span class="choice-icon">${icon('glass', 26)}</span><span><b>Taste a wine</b><br><span class="muted small">An event with several wines, or a single glass.</span></span></a>
        <a class="card choice" href="#/cellar/new"><span class="choice-icon">${icon('bottle', 26)}</span><span><b>Add bottles</b><br><span class="muted small">What you own, where it sits, when to drink it.</span></span></a>
        <a class="card choice" href="#/merchant/new"><span class="choice-icon">${icon('shop', 26)}</span><span><b>Add a merchant</b><br><span class="muted small">The shops and importers you buy from.</span></span></a>
      </div>
      ${homeFooter(mediaIds.length)}
    `, { title: 'Home', tab: 'home' });
  }

  // ---- needs you
  const todo = [];
  for (const w of wines.filter((x) => x.tasting && !x.tasting.done).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 2)) {
    todo.push({ href: `#/wine/${w.id}`, ic: 'quill', kind: 'go', title: `Continue ${nameOf(w)}`, sub: [whereOf(w), dateOf(w) && shortDate(dateOf(w))].filter(Boolean).join(' · ') });
  }
  const soon = inCellar.filter((b) => ['soon', 'past'].includes(windowStatus(b).k));
  if (soon.length) {
    const past = soon.filter((b) => windowStatus(b).k === 'past').length;
    todo.push({ href: '#/cellar/soon', ic: 'bottle', kind: 'warn', title: `${plural(soon.reduce((n, b) => n + (b.qty || 0), 0), 'bottle')} to drink soon`, sub: (past ? `${past} past ${past === 1 ? 'its' : 'their'} window · ` : '') + soon.slice(0, 2).map(wineTitle).join(', ') });
  }
  for (const e of events.filter((x) => x.date && x.date > now).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 1)) {
    const n = wines.filter((w) => w.eventId === e.id).length;
    todo.push({ href: `#/event/${e.id}`, ic: 'glasses', kind: 'plain', title: `${e.name}`, sub: `Coming up ${shortDate(e.date)} · ${n ? plural(n, 'wine') + ' lined up' : 'no wines added yet'}` });
  }
  const needs = `<section class="home-sec" aria-labelledby="h-needs">
      <h2 class="sec-h" id="h-needs">Needs you</h2>
      ${todo.length ? `<div class="todo">${todo.map((t) => `<a class="todo-row ${t.kind}" href="${t.href}">
          <span class="todo-ic">${icon(t.ic, 20)}</span>
          <span class="todo-main"><b>${esc(t.title)}</b><span class="muted small">${esc(t.sub)}</span></span>
          <span class="todo-go">${icon('next', 18)}</span></a>`).join('')}</div>`
        : '<p class="calm">Nothing waiting. No open tastings, and no bottle is near the end of its window.</p>'}
    </section>`;

  // ---- instruments: average score and blind guesses (or the cellar when there are none)
  const scoredYear = tasted.filter((w) => scoreOf(w) != null && inYear(dateOf(w)));
  const scoredPool = scoredYear.length ? scoredYear : tasted.filter((w) => scoreOf(w) != null);
  const avg = scoredPool.length ? scoredPool.reduce((n, w) => n + scoreToHundred(scoreOf(w), scaleOf(w)), 0) / scoredPool.length : null;
  const guesses = wines.filter((w) => w.tasting && w.tasting.guessResult);
  const gr = { right: 0, close: 0, wrong: 0 };
  for (const w of guesses) gr[w.tasting.guessResult] = (gr[w.tasting.guessResult] || 0) + 1;
  const inst = [];
  if (avg != null) {
    const p = Math.max(0, Math.min(1, (avg - 50) / 50));
    inst.push(`<a class="instrument" href="#/standings">
        <span class="inst-label">Average score</span>
        <span class="gauge" style="--a:${(p * 270).toFixed(1)}deg" role="img" aria-label="Average score ${Math.round(avg)} out of 100">
          <span class="gauge-face"><b class="gauge-num">${Math.round(avg)}</b><span class="gauge-unit">of 100</span></span></span>
        <span class="descriptor">${esc(qualityFor(avg))}</span>
        <span class="inst-cap">${esc(scoredYear.length ? `${plural(scoredYear.length, 'score')} in ${y}` : `${plural(scoredPool.length, 'score')} in all`)}</span>
      </a>`);
  }
  if (guesses.length) {
    const n = guesses.length;
    const a = (gr.right / n) * 270, b = a + (gr.close / n) * 270, c = b + (gr.wrong / n) * 270;
    inst.push(`<a class="instrument" href="#/events">
        <span class="inst-label">Blind guesses</span>
        <span class="gauge guess" style="--a:${a.toFixed(1)}deg;--b:${b.toFixed(1)}deg;--c:${c.toFixed(1)}deg" role="img" aria-label="${gr.right} right, ${gr.close} close, ${gr.wrong} wrong">
          <span class="gauge-face"><b class="gauge-num">${gr.right}</b><span class="gauge-unit">of ${n} right</span></span></span>
        <span class="descriptor">${esc(gr.right / n >= 0.6 ? 'A sharp palate' : gr.right + gr.close >= n / 2 ? 'Getting close' : 'Keep tasting blind')}</span>
        <span class="inst-cap"><span><i class="k k-right"></i>${gr.right} right</span><span><i class="k k-close"></i>${gr.close} close</span><span><i class="k k-wrong"></i>${gr.wrong} wrong</span></span>
      </a>`);
  } else if (bottles.length) {
    const ready = inCellar.filter((b) => windowStatus(b).k === 'ready').reduce((n, b) => n + (b.qty || 0), 0);
    const p = bottleCount ? ready / bottleCount : 0;
    inst.push(`<a class="instrument" href="#/cellar">
        <span class="inst-label">Ready to drink</span>
        <span class="gauge" style="--a:${(p * 270).toFixed(1)}deg" role="img" aria-label="${ready} of ${bottleCount} bottles ready to drink">
          <span class="gauge-face"><b class="gauge-num">${ready}</b><span class="gauge-unit">of ${plural(bottleCount, 'bottle')}</span></span></span>
        <span class="descriptor">${esc(!bottleCount ? 'The cellar is empty' : p >= 0.5 ? 'Plenty to open' : 'Mostly resting')}</span>
        <span class="inst-cap">${esc(soon.length ? `${plural(soon.length, 'wine')} to drink soon` : 'Bottles inside their window')}</span>
      </a>`);
  }
  const instruments = inst.length ? `<section class="home-sec instruments" aria-label="Instruments">${inst.join('')}</section>` : '';

  // ---- the register: every kind of record, with totals
  const lastEvent = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const lastBottle = [...bottles].sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || '') || (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const lastBuy = [...bottles].filter((b) => b.merchantId).sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''))[0];
  const lastMerchant = lastBuy ? merchants.find((m) => m.id === lastBuy.merchantId) : null;
  const rows = [
    { href: '#/events', ic: 'glasses', name: 'Events', sub: events.filter((e) => e.blind).length ? `${events.filter((e) => e.blind).length} blind` : '',
      total: events.length, unit: events.length === 1 ? 'event' : 'events', year: events.filter((e) => inYear(e.date)).length, yUnit: 'held',
      last: lastEvent ? [lastEvent.name, lastEvent.date && fmtDate(lastEvent.date)] : null },
    { href: '#/standings', ic: 'laurel', name: 'Tastings', sub: 'events and single wines',
      total: tasted.length, unit: 'notes', year: tasted.filter((w) => inYear(dateOf(w))).length, yUnit: 'tasted',
      last: tasted[0] ? [nameOf(tasted[0]), [scoreOf(tasted[0]) != null && formatScore(scoreOf(tasted[0]), scaleOf(tasted[0])), dateOf(tasted[0]) && fmtDate(dateOf(tasted[0]))].filter(Boolean).join(' · ')] : null },
    { href: '#/mywines', ic: 'glass', name: 'My Wines', sub: 'single tastings',
      total: singles.length, unit: singles.length === 1 ? 'wine' : 'wines', year: singles.filter((w) => inYear(w.date)).length, yUnit: 'added',
      last: singles[0] ? [wineTitle(singles[0]), [singles[0].place, singles[0].date && fmtDate(singles[0].date)].filter(Boolean).join(' · ')] : null },
    { href: '#/cellar', ic: 'bottle', name: 'Cellar', sub: [plural(inCellar.length, 'wine'), cellarValue ? money(cellarValue) + ' value' : ''].filter(Boolean).join(' · '),
      total: bottleCount, unit: bottleCount === 1 ? 'bottle' : 'bottles', year: boughtYear, yUnit: 'bought',
      last: lastBottle ? [wineTitle(lastBottle), lastBottle.purchaseDate ? 'added ' + fmtDate(lastBottle.purchaseDate) : ''] : null },
    { href: '#/merchants', ic: 'shop', name: 'Merchants', sub: merchants.length ? '' : 'shops and importers',
      total: merchants.length, unit: merchants.length === 1 ? 'merchant' : 'merchants', year: spentYear ? money(spentYear) : 0, yUnit: 'spent',
      last: lastMerchant ? [lastMerchant.name, lastBuy.purchaseDate ? 'bought ' + fmtDate(lastBuy.purchaseDate) : ''] : null },
  ];
  const register = `<section class="home-sec" aria-labelledby="h-reg">
      <h2 class="sec-h" id="h-reg">Your records</h2>
      <div class="register">
        <div class="reg-head" aria-hidden="true"><span></span><span>Total</span><span>${esc(y)}</span><span>Latest</span></div>
        ${rows.map((r) => `<a class="reg-row" href="${r.href}" aria-label="${attr(`${r.name}: ${r.total} ${r.unit}, ${r.year} ${r.yUnit} in ${y}${r.last ? ', latest ' + r.last.filter(Boolean).join(', ') : ''}`)}">
          <span class="reg-name"><span class="reg-ic">${icon(r.ic, 18)}</span><span><b>${esc(r.name)}</b>${r.sub ? `<span class="muted small">${esc(r.sub)}</span>` : ''}</span></span>
          <span class="reg-num"><b>${esc(r.total)}</b><span>${esc(r.unit)}</span></span>
          <span class="reg-num year"><b>${esc(r.year || 0)}</b><span>${esc(r.yUnit)}</span></span>
          <span class="reg-last">${r.last ? `<span>${esc(r.last[0])}</span><span class="dateline">${esc(r.last[1] || '')}</span>` : '<span class="muted">Nothing yet</span>'}</span>
        </a>`).join('')}
      </div>
    </section>`;

  // ---- recent tastings, as a timeline
  const recent = tasted.slice(0, 6);
  const timeline = recent.length ? `<section class="home-sec" aria-labelledby="h-recent">
      <h2 class="sec-h" id="h-recent">Recently tasted</h2>
      <ol class="timeline">${recent.map((w) => `<li><a href="#/wine/${w.id}">
          <span class="dateline">${esc(dateOf(w) ? fmtDate(dateOf(w)) : 'No date')}</span>
          <span class="tl-row"><span class="tl-main"><b><span class="dot dot-${hidden(w) ? 'none' : (w.colour || 'none')}"></span>${esc(nameOf(w))}</b><span class="muted small">${esc(whereOf(w) || '')}</span></span>
          <span class="tl-score">${scoreOf(w) != null ? esc(formatScore(scoreOf(w), scaleOf(w))) : '<i>no score</i>'}</span></span></a></li>`).join('')}</ol>
    </section>` : '';

  // ---- best of the year
  const best = (scoredYear.length ? scoredYear : tasted.filter((w) => scoreOf(w) != null))
    .sort((a, b) => scoreToHundred(scoreOf(b), scaleOf(b)) - scoreToHundred(scoreOf(a), scaleOf(a))).slice(0, 3);
  const top = best.length ? `<section class="home-sec" aria-labelledby="h-top">
      <h2 class="sec-h" id="h-top">${scoredYear.length ? `Best of ${esc(y)}` : 'Best so far'}</h2>
      ${best.map((w, i) => `<a class="card st-row" href="#/wine/${w.id}"><span class="rank top top${i + 1}">${i + 1}</span><span class="st-name">${esc(nameOf(w))}<br><span class="muted small">${esc(whereOf(w) || '')}</span></span><span class="st-score">${esc(formatScore(scoreOf(w), scaleOf(w)))}</span></a>`).join('')}
      <a class="more" href="#/standings">All standings ${icon('next', 16)}</a>
    </section>` : '';

  // ---- what you taste: colour split, grapes and countries (blind wines stay hidden until revealed)
  const open = tasted.filter((w) => !hidden(w));
  const col = { white: 0, rose: 0, red: 0 };
  for (const w of open) if (col[w.colour] != null) col[w.colour]++;
  const colN = col.white + col.rose + col.red;
  const grapes = topCounts(open.flatMap((w) => String(w.grapes || '').split(/[,/&+]| and /i)));
  const countries = topCounts(open.map((w) => w.country || ''));
  const taste = colN ? `<section class="home-sec" aria-labelledby="h-taste">
      <h2 class="sec-h" id="h-taste">What you taste</h2>
      <div class="card taste">
        <div class="split" role="img" aria-label="${attr(['white', 'rose', 'red'].map((c) => `${col[c]} ${COLOUR_LABEL[c]}`).join(', '))}">${['white', 'rose', 'red'].filter((c) => col[c]).map((c) => `<i class="sw-${c}" style="flex:${col[c]}"></i>`).join('')}</div>
        <div class="split-key">${['white', 'rose', 'red'].map((c) => `<span><span class="dot dot-${c}"></span>${COLOUR_LABEL[c]} <b>${col[c]}</b></span>`).join('')}</div>
        ${grapes.length || countries.length ? `<dl class="facts taste-facts">
          ${grapes.length ? `<dt>Grapes</dt><dd>${grapes.map(([k, n]) => `${esc(k)} <span class="muted">${n}</span>`).join(' · ')}</dd>` : ''}
          ${countries.length ? `<dt>Countries</dt><dd>${countries.map(([k, n]) => `${esc(k)} <span class="muted">${n}</span>`).join(' · ')}</dd>` : ''}
        </dl>` : ''}
      </div>
    </section>` : '';

  return shell(`${head}
    <div class="home-grid">
      <div class="home-col">${needs}</div>
      <div class="home-col">${instruments}</div>
    </div>
    ${register}
    <div class="home-grid">
      <div class="home-col">${timeline}</div>
      <div class="home-col">${top}${taste}</div>
    </div>
    ${homeFooter(mediaIds.length)}
    <a class="fab" href="#/new">+ New tasting</a>
  `, { title: 'Home', tab: 'home' });
}

function homeFooter(mediaCount) {
  const level = getLevel(settings.method, settings.level);
  const s = syncInfo();
  return `<section class="home-sec book-facts" aria-labelledby="h-book">
      <h2 class="sec-h" id="h-book">This book</h2>
      <dl class="facts">
        <dt>Method</dt><dd>${esc(getMethod(settings.method).name)} ${esc(level.name)} · ${settings.mode === 'quick' ? 'Quick' : 'Full SAT'}${settings.advanced ? ' · Advanced' : ''}</dd>
        <dt>Media</dt><dd>${esc(plural(mediaCount, 'photo or video', 'photos and videos'))}</dd>
        <dt>Sync</dt><dd data-sync-line>${esc(s ? s.label : 'This device only')}</dd>
      </dl>
      <a class="more" href="#/settings">Settings ${icon('next', 16)}</a>
    </section>`;
}

// ---------- new tasting: event or single wine
function viewNewTasting() {
  return shell(`
    <p class="muted">What are you tasting?</p>
    <a class="card choice" href="#/event/new"><span class="choice-icon">${icon('glasses', 28)}</span><span><b>Event</b><br><span class="muted small">A tasting with several wines: name, date, place, standings, optional blind mode.</span></span></a>
    <a class="card choice" href="#/single/new"><span class="choice-icon">${icon('glass', 28)}</span><span><b>Single wine</b><br><span class="muted small">A glass at a restaurant, a dinner, a bottle at home. Saved in My Wines with its date and place.</span></span></a>
    <a class="card choice" href="#/cellar"><span class="choice-icon">${icon('bottle', 28)}</span><span><b>Open a bottle from my cellar</b><br><span class="muted small">Pick a bottle; it is taken out of the cellar and the tasting starts.</span></span></a>
  `, { title: 'New tasting', back: '#/' });
}

// ---------- My Wines: single tastings, grouped by month
async function viewMyWines() {
  const wines = (await db.all('wines')).filter((w) => !w.eventId && w.saved)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const groups = new Map();
  for (const w of wines) {
    let k = 'No date';
    try { if (w.date) k = new Date(w.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) { /* keep */ }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  const body = [...groups].map(([k, ws]) => `
    <div class="group-head">${esc(k)} <span class="muted small">· ${ws.length}</span></div>
    ${ws.map((w) => {
      const t = w.tasting;
      return `<a class="card wine-card wc-link" href="#/wine/${w.id}">
          ${w.labelId ? `<img class="thumb" data-media="${w.labelId}" alt="">` : `<div class="thumb ph">${icon('glass', 22)}</div>`}
          <span class="wc-main">
            <span class="wc-name">${esc(wineTitle(w))}</span>
            <span class="muted small"><span class="dot dot-${w.colour || 'none'}"></span>${esc([w.place, fmtDate(w.date)].filter(Boolean).join(' · '))}${t && t.done ? '' : ' · tasting'}</span>
          </span>
          <span class="wc-score">${t && t.score != null && t.score !== '' ? esc(formatScore(t.score, w.scale || 100)) : ''}</span>
        </a>`;
    }).join('')}`).join('');
  const empty = `<div class="empty"><div class="empty-icon">${engraving('glass')}</div><p><b>No single wines yet.</b></p><p class="muted">Tasting a glass at a restaurant or a bottle at home? Tap <b>+ New tasting</b> and pick <b>Single wine</b>. Its place works as a reminder of where you had it.</p></div>`;
  return shell(`${homeTabs('mywines')}${wines.length ? body : empty}<a class="fab" href="#/single/new">+ Single wine</a>`, { title: 'Tasting', tab: 'tasting' });
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
  `, { title: id ? 'Edit event' : 'New event', back: id ? `#/event/${id}` : '#/events' });
}

// The event a wine belongs to; single wines get a stand-in "My Wines" event.
async function wineCtx(w) {
  if (w.eventId) {
    const { event, wines } = await loadEvent(w.eventId);
    if (event) return { event, wines, idx: wines.findIndex((x) => x.id === w.id) };
  }
  return { event: { id: null, name: 'My Wines', scale: w.scale === 20 ? 20 : 100, blind: false, single: true }, wines: [w], idx: 0 };
}
const backFor = (w) => (w.eventId ? `#/event/${w.eventId}` : '#/mywines');
const editFor = (w) => (w.eventId ? `#/event/${w.eventId}/wine/${w.id}/edit` : `#/single/${w.id}/edit`);

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
    const li = scored.map((r, i) => {
    const s = scoreToHundred(+r.wine.tasting.score, scaleOf(r));
    if (s !== last) { rank = i + 1; last = s; }
    return `
      <a class="card st-row" href="#/wine/${r.wine.id}">
        <span class="rank ${rank <= 3 ? 'top top' + rank : ''}">${rank}</span>
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
  if (!event) return shell('<p class="muted center">Event not found.</p>', { title: 'Event', back: '#/events' });
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
      const thumb = !event.blind || w.revealed ? (w.labelId ? `<img class="thumb" data-media="${w.labelId}" alt="">` : `<div class="thumb ph">${icon('bottle', 22)}</div>`) : `<div class="thumb ph blind">${i + 1}</div>`;
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
          ${ui.editList === id ? `<button class="row-del" data-act="deleteWine" data-id="${w.id}" aria-label="Delete wine ${i + 1}">${icon('trash', 20)}</button>` : `<span class="reorder">
            <button data-act="moveWine" data-id="${w.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up', 16)}</button>
            <button data-act="moveWine" data-id="${w.id}" data-dir="1" ${i === wines.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down', 16)}</button>
          </span>`}
        </div>`;
    }).join('') || `<div class="empty"><p><b>No wines yet.</b></p><p class="muted">Tap a style below to add wine 1. Add them in the order you'll taste them.</p></div>`;
    body += `<div class="list-tools">${wines.length ? `<button class="link" data-act="editList">${ui.editList === id ? 'Done' : 'Delete wines…'}</button>` : '<span></span>'}<button class="link danger-link" data-act="deleteEvent">Delete event</button></div>`;
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
        <label class="g-add">${icon('plus', 26)}<span class="small">Add</span><input type="file" accept="image/*,video/*" multiple hidden data-upload="event:${id}"></label>
      </div>`;
  }
  const meta = [fmtDate(event.date), event.place, `${event.scale} pts`, event.blind ? 'blind' : null].filter(Boolean).map(esc).join(' · ');
  return shell(`
    <div class="event-head"><div class="muted">${meta}</div>${event.theme ? `<div class="small">${esc(event.theme)}</div>` : ''}</div>
    <div class="seg seg-tabs">
      ${['wines', 'standings', 'notes'].map((t) => `<button data-act="eventTab" data-tab="${t}" class="${tab === t ? 'on' : ''}">${{ wines: 'Wines', standings: 'Standings', notes: 'Notes & media' }[t]}</button>`).join('')}
    </div>
    ${body}
  `, { title: event.name, back: '#/events', actions: `<a class="icon-btn" href="#/event/${id}/edit" aria-label="Edit event">${icon('pencil', 20)}</a>` });
}

function wineDetailFields(w, { price = true } = {}) {
  const ai = ui.aiFilled[w.id] || { fields: [], uncertain: [] };
  const cls = (k) => (ai.uncertain.includes(k) ? ' class="ai-check"' : ai.fields.includes(k) ? ' class="ai-ok"' : '');
  const tag = (k) => (ai.uncertain.includes(k) ? ' <span class="ai-tag warn">check</span>' : ai.fields.includes(k) ? ' <span class="ai-tag">AI</span>' : '');
  return `
    <label${cls('producer')}>Producer${tag('producer')}<input name="producer" value="${attr(w.producer)}" placeholder="Domaine Leflaive"></label>
    <label${cls('name')}>Wine / cuvée${tag('name')}<input name="name" value="${attr(w.name)}" placeholder="Puligny-Montrachet 1er Cru"></label>
    <div class="row2">
      <label${cls('vintage')}>Vintage${tag('vintage')}<input name="vintage" inputmode="numeric" value="${attr(w.vintage)}" placeholder="2019"></label>
      <label${cls('abv')}>ABV %${tag('abv')}<input name="abv" inputmode="decimal" value="${attr(w.abv)}" placeholder="13"></label>
    </div>
    <label${cls('region')}>Region / appellation${tag('region')}<input name="region" value="${attr(w.region)}" placeholder="Burgundy"></label>
    <label${cls('country')}>Country${tag('country')}<input name="country" value="${attr(w.country)}" placeholder="France"></label>
    <label${cls('grapes')}>Grape(s)${tag('grapes')}<input name="grapes" value="${attr(w.grapes)}" placeholder="Chardonnay"></label>
    ${price ? `<label>Price / notes<input name="price" value="${attr(w.price)}"></label>` : ''}`;
}

// Label photo with camera button and the AI scan button/status.
function labelBlock(obj, label, kind, hide) {
  const st = ui.scanState && ui.scanState.id === obj.id ? ui.scanState : null;
  let scan = '';
  if (label) {
    if (st && st.busy) scan = '<p class="scan-status"><span class="spin"></span> Reading the label…</p>';
    else if (!apiKey) scan = `<p class="muted small">AI label reading is off. <a href="#/settings">Add your API key in Settings</a> to fill these details from the photo.</p>`;
    else scan = `<button class="btn" type="button" data-act="scanLabel" data-kind="${kind}">${icon('quill', 18)} ${st && st.done ? 'Read the label again' : 'Read label with AI'}</button>${st && st.error ? `<p class="note-box">${esc(st.error)}</p>` : ''}${st && st.done ? `<p class="muted small">${hide ? 'Label read. Details stay hidden until you reveal the wine.' : 'Filled from the label. Fields marked <b>check</b> are uncertain, so look them over.'}</p>` : ''}`;
  }
  return `<div class="label-shot">
      ${label ? `<img src="${mediaURL(label)}" alt="Label" class="${hide ? 'blurred' : ''}">` : `<div class="label-ph">${icon('camera', 30)}<br>Label photo</div>`}
      <label class="btn">${label ? 'Retake' : 'Take label photo'}<input type="file" accept="image/*" capture="environment" hidden data-upload="${kind === 'bottle' ? 'blabel' : 'label'}"></label>
      ${label ? `<button class="btn danger" type="button" data-act="delLabel" data-kind="${kind}">Remove photo</button>` : ''}
      ${scan}
    </div>`;
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
      ${labelBlock(w, label, 'wine', hide)}
      ${hide ? `<p class="note-box">Blind event: the label photo is stored but blurred, and details stay hidden until you tap <b>Reveal</b> after guessing. You can leave the details empty and fill them in at the reveal.</p>`
        : wineDetailFields(w)}
      <div class="field-label">Style</div>${styleTiles(w)}
      <button class="btn primary" type="submit">${editing ? 'Save' : 'Add wine'}</button>
      ${editing ? '<button class="btn danger" type="button" data-act="deleteWine">Delete wine</button>' : ''}
    </form>
  `, { title: editing ? 'Wine details' : 'Add wine', back: editing ? `#/wine/${wineId}` : `#/event/${eventId}` });
}

// ---------- single wine (My Wines): details, date, place, scale
async function viewSingleForm(wineId) {
  const editing = !!wineId;
  if (editing) draftWine = await db.get('wines', wineId);
  else if (!draftWine || draftWine.eventId || draftWine.saved) draftWine = { id: uid(), eventId: null, single: true, colour: '', type: 'still', date: today(), place: '', scale: settings.scale };
  const w = draftWine;
  const label = w.labelId ? await db.get('media', w.labelId) : null;
  const sc = w.scale === 20 ? 20 : 100;
  return shell(`
    <form class="form" id="singleForm">
      ${labelBlock(w, label, 'wine', false)}
      ${wineDetailFields(w)}
      <div class="field-label">Style</div>${styleTiles(w)}
      <div class="row2">
        <label>Date<input name="date" type="date" value="${attr(w.date || today())}"></label>
        <div><div class="field-label">Score out of</div>
          <div class="seg">${[100, 20].map((v) => `<label><input type="radio" name="scale" value="${v}" ${sc === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
      </div>
      <label>Where<input name="place" value="${attr(w.place)}" placeholder="Restaurant, city, a friend's home…"></label>
      <div class="loc-row">
        <button class="btn" type="button" data-act="useLocation">${icon('pin', 18)} ${w.lat ? 'Update my location' : 'Save my location'}</button>
        ${w.lat ? `<a class="btn" href="${mapURL(w)}" target="_blank" rel="noopener">Open map</a>` : ''}
      </div>
      ${w.lat ? '<p class="muted small">Location saved, so you can find the place again.</p>' : ''}
      <button class="btn primary" type="submit">${editing ? 'Save' : 'Start tasting'}</button>
      ${editing ? '<button class="btn danger" type="button" data-act="deleteWine">Delete wine</button>' : ''}
    </form>
  `, { title: editing ? 'Wine details' : 'Single wine', back: editing ? `#/wine/${wineId}` : '#/mywines' });
}

function mapURL(o) {
  const q = encodeURIComponent(o.place || o.address || 'Wine');
  return o.lat ? `https://maps.apple.com/?ll=${o.lat},${o.lng}&q=${q}` : `https://maps.apple.com/?q=${q}`;
}

// ---------- tasting sheet (one page: Look, Smell, Taste, Verdict)
// A new tasting starts from the event's setup (if one was applied) or the Settings defaults.
function ensureTasting(w, setup) {
  const d = setup || {};
  if (!w.tasting) w.tasting = { methodId: d.methodId || settings.method, levelId: d.levelId || settings.level, values: {}, blic: [], mode: d.mode || settings.mode || 'full', advanced: d.advanced ?? !!settings.advanced };
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
  let fs = fieldsFor(level, sec.sat, w, { ...settings, advanced: advOf(t) }, t);
  if (t.mode === 'quick') fs = fs.filter((f) => QUICK_FIELDS[sec.sat].includes(f.id));
  return fs;
}

// Palate flavours default to the nose until the taster edits them.
const advOf = (t) => t.advanced ?? !!settings.advanced;
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
      <div class="srow-label">${esc(f.label)}</div>
      <div class="seg-bar ${f.scale && opts.length <= 6 ? 'scale' : 'pills'}" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr))">${opts.map((o) => `<button class="${val === o ? 'on' : ''}" data-act="pick" data-f="${f.id}" data-v="${attr(o)}" aria-label="${attr(o)}">${esc(short(o))}</button>`).join('')}</div>
    </div>`;
}

function multiRow(f, t) {
  const arr = t.values[f.id] || [];
  return `<div class="srow" data-field="${f.id}">
      <div class="srow-label">${esc(f.label)} <span class="muted small">· optional${f.plus ? ', Advanced' : ''}</span></div>
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
    const open = ui.open['plus' + key] || (!(ui.plusHidden || {})[key] && plusFields.some((f) => isFilled(f, t)));
    body += open ? `<div class="plus-box"><div class="srow-label">Advanced <span class="muted small">· Beyond Flavour, not part of the WSET SAT</span> <button class="link" data-act="plusClose" data-k="${key}">Hide ▴</button></div>${plusFields.map((f) => renderSheetField(f, t, w, level)).join('')}</div>`
      : `<button class="plus-toggle" data-act="plusOpen" data-k="${key}"><span><b>Advanced</b> <span class="muted small">${plusFields.map((f) => f.label.toLowerCase()).slice(0, 2).join(', ')}…</span></span><span class="link">Show ›</span></button>`;
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
      <div class="seg-bar pills" style="grid-template-columns: repeat(3, minmax(0, 1fr))">${quality.options.map((o) => `<button class="${val === o ? 'on' : ''} ${sugg === o && val !== o ? 'sugg' : ''}" data-act="pick" data-f="quality" data-v="${attr(o)}">${esc(o)}</button>`).join('')}</div></div>`;
  }
  const band = bandFor(t.values.quality, scale);
  const min = scale === 20 ? 0 : 50, max = scale === 20 ? 20 : 100, stepv = scale === 20 ? 0.5 : 1;
  const has = t.score != null && t.score !== '';
  out += `<div class="srow" data-field="score" data-empty="${has ? 0 : 1}">
      <div class="srow-label">Score${band ? ` <span class="muted small">· ${esc(t.values.quality)} = ${band[0]}–${band[1]}</span>` : ''}</div>
      <div class="dial" data-dial data-min="${min}" data-max="${max}" style="--p:${has ? Math.max(0, Math.min(1, (t.score - min) / (max - min))).toFixed(3) : 0}">
        <div class="dial-face"><span class="dial-label">Points</span><input type="number" inputmode="decimal" min="${min}" max="${max}" step="${stepv}" value="${attr(has ? t.score : '')}" data-score placeholder="–" aria-label="Score"><span class="dial-unit">of ${scale}</span></div>
      </div>
      ${t.values.quality ? `<p class="descriptor center">${esc(t.values.quality.charAt(0).toUpperCase() + t.values.quality.slice(1))}</p>` : ''}
      <input type="range" class="score-range" min="${min}" max="${max}" step="${stepv}" value="${attr(has ? t.score : (band ? band[0] : (scale === 20 ? 16 : 88)))}" data-score-range aria-label="Score slider">
    </div>`;
  for (const f of fields.filter((x) => x.id !== 'quality')) out += renderSheetField(f, t, w, level);
  return out;
}

async function viewWine(id) {
  const w = await db.get('wines', id);
  if (!w) return shell('<p class="muted center">Wine not found.</p>', { title: 'Wine', back: '#/' });
  const { event, wines, idx } = await wineCtx(w);
  const t = ensureTasting(w, event.setup);
  const level = getLevel(t.methodId, t.levelId);
  const method = getMethod(t.methodId);

  const progress = SECTIONS.map((s) => ({ s, p: sectionProgress(level, s, w, t) }));
  const strip = `<div class="pstrip">${progress.map(({ s, p }) => {
    const pct = p.total ? Math.round((p.filled / p.total) * 100) : 0;
    return `<button data-act="jump" data-sec="${s.id}" class="${p.done ? 'done' : pct ? 'part' : ''}"><i><b style="width:${pct}%"></b></i><span>${s.title}${p.done ? ' ✓' : ''}</span></button>`;
  }).join('')}</div>`;

  const sections = SECTIONS.map((s) => renderSection(s, level, w, t, event, idx, wines)).join('');
  const extras = await wrapExtras(w, t, level, event, idx, wines);
  const sub = `${method.name} · ${level.name}${advOf(t) ? ' · Advanced' : ''} · ${styleLabel(w)}${event.blind && !w.revealed ? ' · blind' : ''}`;
  const where = event.single
    ? `<div class="wine-sub small">${[w.place ? (w.lat ? `<a href="${mapURL(w)}" target="_blank" rel="noopener">${icon('pin', 14)} ${esc(w.place)}</a>` : `${icon('pin', 14)} ${esc(w.place)}`) : (w.lat ? `<a href="${mapURL(w)}" target="_blank" rel="noopener">${icon('pin', 14)} map</a>` : ''), esc(fmtDate(w.date)), w.bottleId ? `<a href="#/bottle/${w.bottleId}">from my cellar</a>` : ''].filter(Boolean).join(' · ')}</div>` : '';
  const modeToggle = `<div class="mode-toggle" role="group" aria-label="Mode">
      <button class="${t.mode === 'quick' ? 'on' : ''}" data-act="mode" data-v="quick">Quick</button>
      <button class="${t.mode !== 'quick' ? 'on' : ''}" data-act="mode" data-v="full">Full SAT</button></div>
      <button class="setup-btn ${ui.setupOpen === w.id ? 'on' : ''}" data-act="setupToggle" aria-label="Tasting setup">${icon('gear', 20)}</button>`;
  const setup = ui.setupOpen === w.id ? `
    <div class="panel setup-panel">
      <div class="srow-label">Tasting setup <span class="muted small">· this wine</span></div>
      <div class="field-label">${esc(method.name)} level</div>
      <div class="seg-bar" style="grid-template-columns: repeat(${method.levels.length}, minmax(0, 1fr))">${method.levels.map((l) => `<button class="${t.levelId === l.id ? 'on' : ''}" data-act="setupLevel" data-v="${l.id}">${esc(l.short || l.name.replace('Level ', 'L').replace(/ \(.*\)/, ''))}</button>`).join('')}</div>
      <div class="field-label">Mode</div>
      <div class="seg-bar" style="grid-template-columns: repeat(2, minmax(0, 1fr))"><button class="${t.mode === 'quick' ? 'on' : ''}" data-act="mode" data-v="quick">Quick</button><button class="${t.mode !== 'quick' ? 'on' : ''}" data-act="mode" data-v="full">Full SAT</button></div>
      <label class="switch-row"><span><b>Advanced</b><br><span class="muted small">Beyond Flavour extras (acid shape, tannin texture…). Not part of the WSET SAT.</span></span>
        <input type="checkbox" ${advOf(t) ? 'checked' : ''} data-act-change="wineAdvanced"><i></i></label>
      ${event.single ? '' : `<button class="btn" data-act="setupApplyEvent">Use for all wines in this event</button>`}
      <button class="btn" data-act="setupDefault">Make this my default</button>
      <p class="muted tiny">Taps you already made are kept. Changing level only changes which lines you see.</p>
    </div>` : '';
  return shell(`<div class="sheet-head"><div class="wine-sub muted small">${esc(sub)}${event.single ? '' : ` · wine ${idx + 1} of ${wines.length}`}</div>${modeToggle}</div>${setup}${where}${strip}<div class="sheet">${sections}${extras}</div>`,
    { title: displayName(w, event, idx), back: backFor(w), actions: (!event.blind || w.revealed) ? `<a class="icon-btn" href="${editFor(w)}" aria-label="Wine details">${icon('pencil', 20)}</a>` : '' });
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
        <label class="g-add">${icon('camera', 26)}<span class="small">Add</span><input type="file" accept="image/*" multiple hidden data-upload="wine:${w.id}"></label>
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
        <div class="seg-bar pills" style="grid-template-columns: repeat(3, minmax(0, 1fr))">${['right', 'close', 'wrong'].map((r) => `<button class="${t.guessResult === r ? 'on' : ''}" data-act="guessResult" data-v="${r}">${r}</button>`).join('')}</div>
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
    <p class="muted tiny center">Your taps are saved automatically as you go.</p>
    <button class="btn danger" data-act="deleteWine" data-id="${w.id}">Delete this wine</button>`;
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
  for (const w of wines.filter((x) => !x.eventId && x.saved)) {
    if (f !== 'all' && f !== 'my' && (f.startsWith('c:') ? w.colour !== f.slice(2) : true)) continue;
    rows.push({ wine: w, name: wineTitle(w), sub: ['My Wines', w.place].filter(Boolean).join(' · ') });
  }
  if (f === 'my') rows.splice(0, rows.length, ...rows.filter((r) => !r.wine.eventId));
  return shell(`
    <div class="filter-row">
      <select data-act-change="standingsFilter">
        <option value="all">All wines</option>
        <option value="my" ${f === 'my' ? 'selected' : ''}>My Wines (single tastings)</option>
        <optgroup label="Colour">${['white', 'rose', 'red'].map((c) => `<option value="c:${c}" ${f === 'c:' + c ? 'selected' : ''}>${COLOUR_LABEL[c]}</option>`).join('')}</optgroup>
        <optgroup label="Event">${events.map((e) => `<option value="e:${e.id}" ${f === 'e:' + e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>
      </select>
    </div>
    <p class="muted small">20-point scores are compared as ×5.</p>
    ${standingsList(rows, (r) => (r.wine.eventId ? (evById[r.wine.eventId] || {}).scale : (r.wine.scale === 20 ? 20 : 100)))}
  `, { title: 'Standings', tab: 'standings' });
}

// ---------- cellar
function windowStatus(b) {
  const y = thisYear();
  if (b.drinkTo && b.drinkTo < y) return { k: 'past', label: `past its window (${b.drinkTo})` };
  if (b.drinkTo && b.drinkTo <= y + 1) return { k: 'soon', label: `drink by ${b.drinkTo}` };
  if (b.drinkFrom && b.drinkFrom > y) return { k: 'wait', label: `from ${b.drinkFrom}` };
  if (b.drinkFrom || b.drinkTo) return { k: 'ready', label: `ready${b.drinkTo ? ` to ${b.drinkTo}` : ''}` };
  return { k: '', label: '' };
}

async function viewCellar() {
  const bottles = await db.all('bottles');
  const f = ui.cellarFilter;
  const inCellar = bottles.filter((b) => (b.qty || 0) > 0);
  const soon = inCellar.filter((b) => ['soon', 'past'].includes(windowStatus(b).k));
  const list = (f === 'soon' ? soon : f === 'gone' ? bottles.filter((b) => !(b.qty > 0)) : inCellar)
    .sort((a, b) => wineTitle(a).localeCompare(wineTitle(b)));
  const count = inCellar.reduce((n, b) => n + (b.qty || 0), 0);
  const value = inCellar.reduce((n, b) => n + (b.qty || 0) * (num(b.price) || 0), 0);
  const cards = list.map((b) => {
    const ws = windowStatus(b);
    return `<a class="card wine-card wc-link" href="#/bottle/${b.id}">
        ${b.labelId ? `<img class="thumb" data-media="${b.labelId}" alt="">` : `<div class="thumb ph">${icon('bottle', 22)}</div>`}
        <span class="wc-main">
          <span class="wc-name">${esc(wineTitle(b))}</span>
          <span class="muted small"><span class="dot dot-${b.colour || 'none'}"></span>${esc([b.location, ws.label].filter(Boolean).join(' · ') || styleLabel(b))}</span>
        </span>
        <span class="qty ${ws.k}">×${b.qty || 0}</span>
      </a>`;
  }).join('');
  const empty = f === 'in' ? `<div class="empty"><div class="empty-icon">${engraving('bottle')}</div><p><b>Your cellar is empty.</b></p><p class="muted">Add bottles with a label photo. Track how many you have, where they are, what you paid and when to drink them.</p></div>`
    : `<p class="muted center">${f === 'soon' ? 'Nothing needs drinking soon.' : 'No finished bottles yet.'}</p>`;
  return shell(`
    <div class="stats"><div><b>${count}</b><span>bottles</span></div><div><b>${inCellar.length}</b><span>wines</span></div><div><b>${esc(money(value) || '–')}</b><span>value</span></div></div>
    <div class="seg seg-tabs">${[['in', 'In cellar'], ['soon', `Drink soon${soon.length ? ` (${soon.length})` : ''}`], ['gone', 'Finished']].map(([k, l]) => `<button data-act="cellarFilter" data-v="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${list.length ? cards : empty}
    <a class="fab" href="#/cellar/new">+ Add bottles</a>
  `, { title: 'Cellar', tab: 'cellar' });
}

let draftBottle = null;
async function viewBottleForm(id, merchantId) {
  const editing = !!id;
  if (editing) draftBottle = await db.get('bottles', id);
  else if (!draftBottle || draftBottle.saved) draftBottle = { id: uid(), colour: '', type: 'still', qty: 1, purchaseDate: today(), merchantId: merchantId || '' };
  if (!editing && merchantId) draftBottle.merchantId = merchantId;
  const b = draftBottle;
  const label = b.labelId ? await db.get('media', b.labelId) : null;
  const merchants = (await db.all('merchants')).sort((x, y) => x.name.localeCompare(y.name));
  const ai = ui.aiFilled[b.id] || { fields: [] };
  return shell(`
    <form class="form" id="bottleForm">
      ${labelBlock(b, label, 'bottle', false)}
      ${wineDetailFields(b, { price: false })}
      <div class="field-label">Style</div>${styleTiles(b)}
      <div class="row2">
        <label>${editing ? 'Bottles in cellar' : 'Bottles'}<input name="qty" type="number" inputmode="numeric" min="0" value="${attr(b.qty ?? 1)}"></label>
        <label>Price per bottle${settings.currency ? ` (${esc(settings.currency)})` : ''}<input name="price" inputmode="decimal" value="${attr(b.price)}" placeholder="25"></label>
      </div>
      <label>Where in the cellar<input name="location" value="${attr(b.location)}" placeholder="Rack A, shelf 3"></label>
      <label>Bought from
        <select name="merchantId"><option value="">—</option>${merchants.map((m) => `<option value="${m.id}" ${b.merchantId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <a class="link small" href="#/merchant/new" data-act="newMerchantFromBottle">+ New merchant</a>
      <label>Purchase date<input name="purchaseDate" type="date" value="${attr(b.purchaseDate)}"></label>
      <div class="row2">
        <label>Drink from${ai.fields.includes('drinkFrom') ? ' <span class="ai-tag warn">AI estimate</span>' : ''}<input name="drinkFrom" type="number" inputmode="numeric" value="${attr(b.drinkFrom)}" placeholder="${thisYear()}"></label>
        <label>Drink by${ai.fields.includes('drinkTo') ? ' <span class="ai-tag warn">AI estimate</span>' : ''}<input name="drinkTo" type="number" inputmode="numeric" value="${attr(b.drinkTo)}" placeholder="${thisYear() + 5}"></label>
      </div>
      <label>Notes<textarea name="notes" rows="3" placeholder="Gift from…, bought for…, decant first…">${esc(b.notes || '')}</textarea></label>
      <button class="btn primary" type="submit">${editing ? 'Save' : 'Add to cellar'}</button>
      ${editing ? '<button class="btn danger" type="button" data-act="deleteBottle">Delete from cellar</button>' : ''}
    </form>
  `, { title: editing ? 'Edit bottle' : 'Add bottles', back: editing ? `#/bottle/${id}` : (merchantId ? `#/merchant/${merchantId}` : '#/cellar') });
}

function readBottleForm() {
  const form = $app.querySelector('#bottleForm');
  if (!form || !draftBottle) return;
  for (const k of ['producer', 'name', 'vintage', 'abv', 'region', 'country', 'grapes', 'price', 'location', 'merchantId', 'purchaseDate', 'notes']) {
    if (form.elements[k]) draftBottle[k] = form.elements[k].value.trim();
  }
  for (const k of ['qty', 'drinkFrom', 'drinkTo']) {
    if (form.elements[k]) { const v = parseInt(form.elements[k].value, 10); draftBottle[k] = isNaN(v) ? (k === 'qty' ? 0 : null) : v; }
  }
}

async function viewBottle(id) {
  const b = await db.get('bottles', id);
  if (!b) return shell('<p class="muted center">Bottle not found.</p>', { title: 'Cellar', back: '#/cellar' });
  const m = b.merchantId ? await db.get('merchants', b.merchantId) : null;
  const label = b.labelId ? await db.get('media', b.labelId) : null;
  const tastings = (await db.all('wines')).filter((w) => w.bottleId === id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const ws = windowStatus(b);
  const rows = [
    ['Style', styleLabel(b)],
    ['Grapes', b.grapes], ['Region', [b.region, b.country].filter(Boolean).join(', ')], ['ABV', b.abv ? b.abv + '%' : ''],
    ['Where', b.location],
    ['Drinking window', [b.drinkFrom, b.drinkTo].some(Boolean) ? `${b.drinkFrom || '…'} – ${b.drinkTo || '…'}` : ''],
    ['Price', money(num(b.price))], ['Bought', [fmtDate(b.purchaseDate), b.bought ? `${b.bought} bottles` : ''].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v);
  return shell(`
    ${label ? `<div class="label-shot"><img src="${mediaURL(label)}" alt="Label"></div>` : ''}
    <div class="bottle-head">
      <div><div class="ec-name">${esc(wineTitle(b))}</div>${ws.label ? `<span class="pill win-${ws.k}">${esc(ws.label)}</span>` : ''}</div>
      <div class="qty-ctl">
        <button data-act="bottleQty" data-d="-1" aria-label="One less" ${b.qty > 0 ? '' : 'disabled'}>−</button>
        <span><b>${b.qty || 0}</b><br><span class="muted tiny">in cellar</span></span>
        <button data-act="bottleQty" data-d="1" aria-label="One more">+</button>
      </div>
    </div>
    <button class="btn primary big-btn" data-act="openBottle" ${b.qty > 0 ? '' : 'disabled'}>${icon('glass', 18)} Open a bottle and taste it</button>
    <div class="card"><dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      ${m ? `<dt>Merchant</dt><dd><a href="#/merchant/${m.id}">${esc(m.name)}</a></dd>` : ''}</dl>
      ${b.notes ? `<p class="small">${esc(b.notes)}</p>` : ''}</div>
    <div class="field-label">Tastings from this wine</div>
    ${tastings.length ? tastings.map((w) => `<a class="card st-row" href="#/wine/${w.id}"><span class="st-name">${esc(fmtDate(w.date))}${w.place ? `<br><span class="muted small">${esc(w.place)}</span>` : ''}</span><span class="st-score">${w.tasting && w.tasting.score != null && w.tasting.score !== '' ? esc(formatScore(w.tasting.score, w.scale || 100)) : ''}</span></a>`).join('') : '<p class="muted small">None yet. Opening a bottle starts a tasting in My Wines.</p>'}
    ${(b.log || []).length ? `<div class="field-label">History</div><ul class="log">${b.log.map((l, i) => ({ l, i })).reverse().slice(0, 12).map(({ l, i }) => `<li><span class="muted small">${esc(fmtDate(l.date))}</span> ${esc(l.note)}<button class="log-del" data-act="delLog" data-i="${i}" aria-label="Delete entry">✕</button></li>`).join('')}</ul>` : ''}
    <button class="btn danger" data-act="deleteBottle" data-id="${id}">Delete from cellar</button>
  `, { title: 'Bottle', back: '#/cellar', actions: `<a class="icon-btn" href="#/bottle/${id}/edit" aria-label="Edit">${icon('pencil', 20)}</a>` });
}

// ---------- merchants
const MERCHANT_KINDS = ['Wine shop', 'Importer', 'Producer', 'Online', 'Restaurant', 'Other'];

async function merchantStats() {
  const bottles = await db.all('bottles');
  const by = {};
  for (const b of bottles) {
    if (!b.merchantId) continue;
    const s = by[b.merchantId] || (by[b.merchantId] = { n: 0, spent: 0, last: '', bottles: [] });
    const bought = b.bought ?? b.qty ?? 0;
    s.n += bought; s.spent += bought * (num(b.price) || 0); s.bottles.push(b);
    if ((b.purchaseDate || '') > s.last) s.last = b.purchaseDate;
  }
  return by;
}

async function viewMerchants() {
  const ms = (await db.all('merchants')).sort((a, b) => a.name.localeCompare(b.name));
  const st = await merchantStats();
  const cards = ms.map((m) => {
    const s = st[m.id];
    return `<a class="card event-card" href="#/merchant/${m.id}">
        <div class="ec-main"><div class="ec-name">${esc(m.name)}</div><div class="muted small">${esc([m.kind, m.city || m.address].filter(Boolean).join(' · '))}</div></div>
        <div class="ec-meta">${s ? `<span class="pill">${s.n} bottle${s.n === 1 ? '' : 's'}</span>${s.spent ? `<span class="muted small">${esc(money(s.spent))}</span>` : ''}` : '<span class="muted small">no purchases</span>'}</div>
      </a>`;
  }).join('');
  const empty = `<div class="empty"><div class="empty-icon">${engraving('shop')}</div><p><b>No merchants yet.</b></p><p class="muted">Keep the shops, importers and producers you buy from: contacts, what you bought there and what you paid.</p></div>`;
  return shell(`${ms.length ? cards : empty}<a class="fab" href="#/merchant/new">+ New merchant</a>`, { title: 'Merchants', tab: 'merchants' });
}

async function viewMerchantForm(id) {
  const m = id ? await db.get('merchants', id) : { name: '', kind: 'Wine shop' };
  return shell(`
    <form class="form" id="merchantForm" data-id="${attr(id || '')}">
      <label>Name<input name="name" required value="${attr(m.name)}" placeholder="Corner Wine Shop"></label>
      <label>Type<select name="kind">${MERCHANT_KINDS.map((k) => `<option ${m.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Contact person<input name="contact" value="${attr(m.contact)}"></label>
      <div class="row2">
        <label>Phone<input name="phone" type="tel" value="${attr(m.phone)}"></label>
        <label>Email<input name="email" type="email" value="${attr(m.email)}"></label>
      </div>
      <label>Website<input name="website" type="url" inputmode="url" value="${attr(m.website)}" placeholder="https://"></label>
      <label>Address<input name="address" value="${attr(m.address)}"></label>
      <label>City<input name="city" value="${attr(m.city)}"></label>
      <label>Notes<textarea name="notes" rows="4" placeholder="Good for Burgundy, ask for Ayşe, 10% off cases…">${esc(m.notes || '')}</textarea></label>
      <button class="btn primary" type="submit">${id ? 'Save' : 'Add merchant'}</button>
      ${id ? '<button class="btn danger" type="button" data-act="deleteMerchant">Delete merchant</button>' : ''}
    </form>
  `, { title: id ? 'Edit merchant' : 'New merchant', back: id ? `#/merchant/${id}` : (ui.merchantReturn || '#/merchants') });
}

async function viewMerchant(id) {
  const m = await db.get('merchants', id);
  if (!m) return shell('<p class="muted center">Merchant not found.</p>', { title: 'Merchants', back: '#/merchants' });
  const s = (await merchantStats())[id] || { n: 0, spent: 0, bottles: [] };
  const site = m.website && /^https?:\/\//i.test(m.website) ? m.website : (m.website ? 'https://' + m.website : '');
  const links = [
    m.phone ? `<a class="btn" href="tel:${attr(m.phone.replace(/\s/g, ''))}">${icon('phone', 18)} Call</a>` : '',
    m.email ? `<a class="btn" href="mailto:${attr(m.email)}">${icon('mail', 18)} Email</a>` : '',
    site ? `<a class="btn" href="${attr(site)}" target="_blank" rel="noopener">${icon('globe', 18)} Website</a>` : '',
    m.address || m.city ? `<a class="btn" href="${mapURL({ place: [m.name, m.address, m.city].filter(Boolean).join(', ') })}" target="_blank" rel="noopener">${icon('pin', 18)} Map</a>` : '',
  ].filter(Boolean);
  const purchases = s.bottles.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
  return shell(`
    <div class="event-head"><div class="muted">${esc([m.kind, m.contact, m.address, m.city].filter(Boolean).join(' · '))}</div></div>
    ${links.length ? `<div class="link-grid">${links.join('')}</div>` : ''}
    ${m.notes ? `<div class="card small">${esc(m.notes)}</div>` : ''}
    <div class="stats"><div><b>${s.n}</b><span>bottles bought</span></div><div><b>${esc(money(s.spent) || '–')}</b><span>spent</span></div><div><b>${esc(s.last ? fmtDate(s.last) : '–')}</b><span>last purchase</span></div></div>
    <div class="field-label">Purchases</div>
    ${purchases.map((b) => `<a class="card st-row" href="#/bottle/${b.id}"><span class="dot dot-${b.colour || 'none'}"></span><span class="st-name">${esc(wineTitle(b))}<br><span class="muted small">${esc([fmtDate(b.purchaseDate), `${b.bought ?? b.qty ?? 0} × ${money(num(b.price)) || '?'}`].filter(Boolean).join(' · '))}</span></span><span class="muted small">${b.qty || 0} left</span></a>`).join('') || '<p class="muted small">Nothing bought here yet.</p>'}
    <a class="btn primary" href="#/cellar/new/m/${id}">+ Add bottles bought here</a>
    <button class="btn danger" data-act="deleteMerchant" data-id="${id}">Delete merchant</button>
  `, { title: m.name, back: '#/merchants', actions: `<a class="icon-btn" href="#/merchant/${id}/edit" aria-label="Edit merchant">${icon('pencil', 20)}</a>` });
}

// ---------- settings
async function viewSettings() {
  const method = getMethod(settings.method);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  return shell(`
    ${syncSection()}
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
      <label class="switch-row"><span><b>Advanced</b><br><span class="muted small">Off = the pure ${esc(method.name)} as taught. On = an extra <b>Advanced</b> panel in Look and Taste with Beyond Flavour fields (acid shape, tannin location and texture, bitterness, brightness). They are not part of the WSET SAT and need their own training. They also sharpen GUESS. Works with any level.</span></span>
        <input type="checkbox" ${settings.advanced ? 'checked' : ''} data-act-change="advanced"><i></i></label>
      <div class="field-label">Default scoring scale</div>
      <div class="seg">${[100, 20].map((s) => `<label><input type="radio" name="scale" value="${s}" ${settings.scale === s ? 'checked' : ''} data-act-change="scale"><span>${s} points</span></label>`).join('')}</div>
      <div class="field-label">Default tasting mode</div>
      <div class="seg">${[['quick', 'Quick'], ['full', 'Full SAT']].map(([v, l]) => `<label><input type="radio" name="mode" value="${v}" ${settings.mode === v ? 'checked' : ''} data-act-change="defaultMode"><span>${l}</span></label>`).join('')}</div>
      <p class="muted small">Quick shows only the key lines (style, aromas, structure, quality, score). You can switch on each wine.</p>
      <div class="field-label">Tasting note format</div>
      <div class="seg">${['full', 'short', 'social'].map((s) => `<label><input type="radio" name="noteFormat" value="${s}" ${settings.noteFormat === s ? 'checked' : ''} data-act-change="noteFormat"><span>${{ full: 'WSET full', short: 'Short', social: 'Social' }[s]}</span></label>`).join('')}</div>
    </section>
    <section class="set-sec" id="ai">
      <h2>AI label scan</h2>
      <p class="muted small">Reads producer, wine, vintage, region, grapes and ABV from a label photo, using Claude. It needs your own Anthropic API key (create one at console.anthropic.com, under API keys). The key stays on this device only. It is not part of backups and is sent only to Anthropic. Each scan costs about one US cent.</p>
      ${apiKey ? `<p class="small key-ok">${icon('check', 16)} Key saved (…${esc(apiKey.slice(-4))})</p>
        <div class="row2"><button class="btn" data-act="testKey">Test key</button><button class="btn danger" data-act="removeKey">Remove key</button></div>`
        : `<label class="block-label">API key<input id="apiKeyInput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…"></label>
        <button class="btn primary" data-act="saveKey">Save key</button>`}
      <label class="switch-row"><span><b>Read labels automatically</b><br><span class="muted small">Scan as soon as you take a label photo.</span></span>
        <input type="checkbox" ${settings.autoScan ? 'checked' : ''} data-act-change="autoScan"><i></i></label>
    </section>
    <section class="set-sec">
      <h2>Cellar and merchants</h2>
      <label class="block-label">Currency symbol<input value="${attr(settings.currency)}" data-act-change="currency" maxlength="4" placeholder="€"></label>
    </section>
    <section class="set-sec">
      <h2>My lexicon</h2>
      <div class="chips">${(settings.customLexicon || []).map((d) => `<button class="chip" data-act="delLex" data-v="${attr(d)}">${esc(d)} ✕</button>`).join('') || '<span class="muted small">Descriptors you add while tasting appear here.</span>'}</div>
    </section>
    <section class="set-sec">
      <h2>Data</h2>
      <p class="muted small">${sync.state().signedIn
        ? `Everything is kept on this device${persisted ? ' (protected from automatic clean-up)' : ''} and in your account, so it works offline and shows up on your other devices.`
        : `Everything is stored on this device only${persisted ? ' (protected from automatic clean-up)' : ''}.${sync.configured() ? ' Sign in above to share it with your other devices.' : ''}`} Backups hold events, wines, cellar and merchants, but not photos or your API key.</p>
      <div class="row2"><button class="btn" data-act="export">Export backup</button><label class="btn">Import backup<input type="file" accept="application/json,.json" hidden data-import></label></div>
      <button class="btn danger" data-act="wipe">${sync.state().signedIn ? 'Delete all data on all devices' : 'Delete all data'}</button>
    </section>
    <section class="set-sec about">
      <h2>About</h2>
      <p class="muted small">Install: open this page in Safari, tap Share, then <b>Add to Home Screen</b>. It then opens full screen and works offline.</p>
      <p class="muted tiny">The WSET Systematic Approach to Tasting Wine® and Wine-Lexicons are copyright Wine & Spirit Education Trust and are used here for personal study. Publishing this app requires WSET's written permission.</p>
    </section>
  `, { title: 'Settings', back: '#/' });
}

function syncSection() {
  if (!sync.configured()) return '';
  const x = sync.state();
  if (x.signedIn && ui.recovery) return `
    <section class="set-sec sync-sec" id="sync">
      <h2>Your devices</h2>
      <p class="muted small">Signed in as <b>${esc(x.email)}</b>. Choose a new password, then use it to sign in on your other devices.</p>
      <label class="block-label">New password<input id="syncNewPass" type="password" autocomplete="new-password" minlength="6"></label>
      <div class="row2"><button class="btn primary" data-act="setPassword">Save new password</button><button class="btn" data-act="skipPassword">Later</button></div>
    </section>`;
  if (!x.signedIn) return `
    <section class="set-sec sync-sec" id="sync">
      <h2>Your devices</h2>
      <p class="muted small">Sign in on each iPhone, iPad and computer with the same email and password. Events, wines, cellar, merchants, photos and settings then stay the same everywhere. It keeps working without signal and catches up when you are back online. What is already on this device is added to your account, nothing is lost. Your API key stays on each device.</p>
      ${x.message ? `<p class="small sync-warn">${esc(x.message)}</p>` : ''}
      <label class="block-label">Email<input id="syncEmail" type="email" value="${attr(ui.syncEmail || '')}" autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="email"></label>
      <label class="block-label">Password<input id="syncPass" type="password" autocomplete="current-password" minlength="6"></label>
      <div class="row2"><button class="btn primary" data-act="signIn">Sign in</button><button class="btn" data-act="signUp">Create account</button></div>
      <button class="btn link-btn" data-act="forgotPassword">Forgot password?</button>
    </section>`;
  const i = syncInfo(x);
  return `
    <section class="set-sec sync-sec" id="sync">
      <h2>Your devices</h2>
      <div class="sync-card">
        <span class="sync-mark ${i.cls}">${icon('cloud', 22)}<i></i></span>
        <span><b>${esc(x.email)}</b><br><span class="muted small" data-sync-line>${esc(i.label)}</span></span>
      </div>
      <div class="row2"><button class="btn" data-act="syncNow">${icon('sync', 18)} Sync now</button><button class="btn" data-act="signOut">Sign out</button></div>
      <p class="muted small">Signed in on this device. Sign in with the same account on your other devices to see the same events, wines, cellar and photos.</p>
    </section>`;
}

// ---------------------------------------------------------------- router
async function route() {
  if (/(access_token|error_description)=/.test(location.hash) && await emailLink()) return route();
  const h = location.hash.replace(/^#/, '') || '/';
  const p = h.split('/').filter(Boolean);
  const keepScroll = route.lastHash === h;
  const y = window.scrollY;
  let html;
  try {
    if (!p.length) html = await viewHome();
    else if (p[0] === 'events') html = await viewEvents();
    else if (p[0] === 'new') html = viewNewTasting();
    else if (p[0] === 'mywines') html = await viewMyWines();
    else if (p[0] === 'single' && p[1] === 'new') html = await viewSingleForm();
    else if (p[0] === 'single' && p[2] === 'edit') html = await viewSingleForm(p[1]);
    else if (p[0] === 'cellar' && p[1] === 'new') html = await viewBottleForm(null, p[2] === 'm' ? p[3] : null);
    else if (p[0] === 'cellar') { if (p[1] === 'soon') ui.cellarFilter = 'soon'; html = await viewCellar(); }
    else if (p[0] === 'bottle' && p[2] === 'edit') html = await viewBottleForm(p[1]);
    else if (p[0] === 'bottle') html = await viewBottle(p[1]);
    else if (p[0] === 'merchants') html = await viewMerchants();
    else if (p[0] === 'merchant' && p[1] === 'new') html = await viewMerchantForm();
    else if (p[0] === 'merchant' && p[2] === 'edit') html = await viewMerchantForm(p[1]);
    else if (p[0] === 'merchant') html = await viewMerchant(p[1]);
    else if (p[0] === 'standings') html = await viewStandings();
    else if (p[0] === 'settings') html = await viewSettings();
    else if (p[0] === 'event' && p[1] === 'new') html = await viewEventForm();
    else if (p[0] === 'event' && p[2] === 'edit') html = await viewEventForm(p[1]);
    else if (p[0] === 'event' && p[2] === 'add') html = await viewAddWine(p[1]);
    else if (p[0] === 'event' && p[2] === 'wine' && p[4] === 'edit') html = await viewAddWine(p[1], p[3]);
    else if (p[0] === 'event') html = await viewEvent(p[1]);
    else if (p[0] === 'wine') html = await viewWine(p[1]);
    else html = await viewHome();
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
const currentId = (kind) => { const p = location.hash.split('/'); return p[1] === kind ? p[2] : null; };
const onBottleForm = () => !!$app.querySelector('#bottleForm');

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
        const ev = (await wineCtx(w)).event;
        const band = bandFor(el.dataset.v, ev.scale);
        if (band) { const mid = (band[0] + band[1]) / 2; t.score = ev.scale === 20 ? Math.round(mid * 2) / 2 : Math.round(mid); }
      }
    }, false);
    if (set) ui.scrollNext = f;
    rerender();
  },
  async mode(el) { await withWine((w, t) => { t.mode = el.dataset.v; }); },
  async setupToggle() { const id = currentWineId(); ui.setupOpen = ui.setupOpen === id ? null : id; rerender(); },
  async setupLevel(el) { await withWine((w, t) => { t.levelId = el.dataset.v; }); },
  async setupApplyEvent() {
    await flushWine();
    const w = await db.get('wines', currentWineId());
    const t = w.tasting;
    const setup = { methodId: t.methodId, levelId: t.levelId, mode: t.mode, advanced: advOf(t) };
    const ev = await db.get('events', w.eventId);
    if (!ev) return;
    ev.setup = setup; await db.put('events', ev);
    for (const x of await db.byIndex('wines', 'eventId', ev.id)) {
      if (!x.tasting) continue; // not started yet: picks up the event setup when opened
      Object.assign(x.tasting, { levelId: setup.levelId, mode: setup.mode, advanced: setup.advanced });
      await db.put('wines', x);
    }
    toast('All wines in this event use this setup');
    rerender();
  },
  async setupDefault() {
    await flushWine();
    const t = (await db.get('wines', currentWineId())).tasting;
    settings.method = t.methodId; settings.level = t.levelId; settings.mode = t.mode; settings.advanced = advOf(t);
    await saveSettings();
    toast('Saved as your default for new tastings');
  },
  async unfold(el) { ui.unfold[el.dataset.k] = true; rerender(); },
  async fold(el) { ui.unfold[el.dataset.k] = false; rerender(); },
  async plusOpen(el) { ui.open['plus' + el.dataset.k] = true; rerender(); },
  async plusClose(el) { ui.open['plus' + el.dataset.k] = false; ui.plusHidden = { ...(ui.plusHidden || {}), [el.dataset.k]: true }; rerender(); },
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
    if (onBottleForm()) { readBottleForm(); apply(draftBottle); rerender(); return; }
    if ($app.querySelector('#wineForm, #singleForm')) { readWineForm(); apply(draftWine); rerender(); return; }
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
    let back;
    await withWine((w, t) => { t.values.flavours = flavoursOf(t); t.done = true; t.finishedAt = Date.now(); back = backFor(w); }, false);
    toast('Tasting saved');
    go(next ? `#/wine/${next}` : back);
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
    const ws = await db.byIndex('wines', 'eventId', id);
    if (!(await ask(`Delete this event${ws.length ? ` and its ${ws.length} wine${ws.length === 1 ? '' : 's'}` : ''}, with notes and photos? This cannot be undone.`, 'Delete'))) return;
    for (const w of ws) await removeWine(w);
    await removeMediaOf('event:' + id);
    await db.del('events', id);
    ui.editList = null;
    toast('Event deleted');
    go('#/events');
  },
  async deleteWine(el) {
    const w = (el.dataset.id && await db.get('wines', el.dataset.id)) || draftWine;
    if (!w) return;
    if (!(await ask('Delete this wine, its tasting and photos? This cannot be undone.', 'Delete'))) return;
    await removeWine(w);
    if (w.eventId) { // keep the tasting order 1, 2, 3…
      const rest = (await db.byIndex('wines', 'eventId', w.eventId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (let i = 0; i < rest.length; i++) if (rest[i].order !== i) { rest[i].order = i; await db.put('wines', rest[i]); }
    }
    toast('Wine deleted');
    const back = backFor(w);
    if (location.hash === back) rerender(); else go(back);
  },
  async editList() { const id = currentEventId(); ui.editList = ui.editList === id ? null : id; rerender(); },
  async delLabel(el) {
    const isBottle = el.dataset.kind === 'bottle';
    if (isBottle) readBottleForm(); else readWineForm();
    const obj = isBottle ? draftBottle : draftWine;
    if (!obj || !obj.labelId || !(await ask('Remove the label photo?', 'Remove'))) return;
    await db.del('media', obj.labelId);
    obj.labelId = null;
    ui.scanState = null;
    if (await db.get(isBottle ? 'bottles' : 'wines', obj.id)) await db.put(isBottle ? 'bottles' : 'wines', obj);
    rerender();
  },
  async delLog(el) {
    const b = await db.get('bottles', currentId('bottle'));
    b.log.splice(+el.dataset.i, 1);
    await db.put('bottles', b); rerender();
  },
  async delLex(el) { settings.customLexicon = settings.customLexicon.filter((d) => d !== el.dataset.v); await saveSettings(); rerender(); },
  async export() {
    const data = { app: 'tasting', version: 2, exportedAt: new Date().toISOString(), settings, events: await db.all('events'), wines: await db.all('wines'), bottles: await db.all('bottles'), merchants: await db.all('merchants') };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], `tasting-backup-${today()}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { /* fall through */ } }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  },
  async scanLabel(el) { await runScan(el.dataset.kind); },
  async useLocation() {
    readWineForm();
    if (!navigator.geolocation) { toast('Location is not available here'); return; }
    toast('Finding your location…');
    navigator.geolocation.getCurrentPosition((pos) => {
      draftWine.lat = +pos.coords.latitude.toFixed(5); draftWine.lng = +pos.coords.longitude.toFixed(5);
      if (draftWine.saved) db.put('wines', draftWine);
      toast('Location saved'); rerender();
    }, () => toast('Could not get your location. Check location permission for Safari.'), { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  },
  async cellarFilter(el) { ui.cellarFilter = el.dataset.v; rerender(); },
  async bottleQty(el) {
    const b = await db.get('bottles', currentId('bottle'));
    const d = +el.dataset.d;
    b.qty = Math.max(0, (b.qty || 0) + d);
    if (d > 0) b.bought = (b.bought || 0) + d;
    b.log = [...(b.log || []), { date: today(), note: d > 0 ? 'Added a bottle' : 'Removed a bottle' }];
    await db.put('bottles', b); rerender();
  },
  async openBottle() {
    const b = await db.get('bottles', currentId('bottle'));
    if (!b || !(b.qty > 0)) return;
    if (!(await ask(`Open a bottle of ${wineTitle(b)}? ${b.qty - 1} will be left in the cellar.`, 'Open & taste'))) return;
    const w = { id: uid(), eventId: null, single: true, saved: true, createdAt: Date.now(), date: today(), place: '', scale: settings.scale, bottleId: b.id };
    for (const k of ['producer', 'name', 'vintage', 'abv', 'region', 'country', 'grapes', 'colour', 'type', 'sweet']) if (b[k] !== undefined) w[k] = b[k];
    w.price = b.price ? money(num(b.price)) : '';
    if (b.labelId) {
      const lm = await db.get('media', b.labelId);
      if (lm) { const copy = { ...lm, id: uid(), owner: 'label:' + w.id }; await db.put('media', copy); w.labelId = copy.id; }
    }
    await db.put('wines', w);
    b.qty -= 1;
    b.log = [...(b.log || []), { date: today(), note: 'Opened a bottle', wineId: w.id }];
    await db.put('bottles', b);
    toast('Enjoy! Tasting started.');
    go(`#/wine/${w.id}`);
  },
  async deleteBottle(el) {
    const id = el.dataset.id || draftBottle.id;
    if (!(await ask('Delete this wine from your cellar? Tastings you made from it are kept.', 'Delete'))) return;
    const b = await db.get('bottles', id);
    if (b && b.labelId) await db.del('media', b.labelId);
    await db.del('bottles', id);
    toast('Deleted from cellar');
    go('#/cellar');
  },
  async newMerchantFromBottle() { readBottleForm(); ui.merchantReturn = location.hash; go('#/merchant/new'); },
  async deleteMerchant(el) {
    const id = el.dataset.id || $app.querySelector('#merchantForm').dataset.id;
    if (!(await ask('Delete this merchant? Bottles bought there stay in your cellar.', 'Delete'))) return;
    for (const b of (await db.all('bottles')).filter((x) => x.merchantId === id)) { b.merchantId = ''; await db.put('bottles', b); }
    await db.del('merchants', id);
    go('#/merchants');
  },
  async saveKey() {
    const v = ($app.querySelector('#apiKeyInput').value || '').trim();
    if (!v) return;
    try { await testKey(v); } catch (e) { toast(e.message); return; }
    apiKey = v; await db.setKV('apiKey', v); toast('Key saved. Label scan is on.'); rerender();
  },
  async removeKey() {
    if (!(await ask('Remove the API key from this device? Label scan turns off.', 'Remove'))) return;
    apiKey = ''; await db.setKV('apiKey', ''); rerender();
  },
  async testKey() { try { await testKey(apiKey); toast('The key works ✓'); } catch (e) { toast(e.message); } },
  async wipe() {
    if (sync.state().signedIn) {
      if (!(await ask('Delete all events, wines, cellar, merchants and photos on this device AND on all your other devices? This cannot be undone.', 'Delete everywhere'))) return;
      for (const n of ['events', 'wines', 'media', 'bottles', 'merchants']) for (const id of await db.keys(n)) await db.del(n, id);
      settings = { ...DEFAULT_SETTINGS, customLexicon: [] }; await saveSettings();
      sync.syncNow(); go('#/'); rerender(); return;
    }
    if (!(await ask('Delete all events, wines, cellar, merchants, photos and settings on this device?', 'Delete all'))) return;
    await db.clearAll(); settings = { ...DEFAULT_SETTINGS, customLexicon: [] }; apiKey = ''; go('#/'); rerender();
  },
  async signIn() { await account('in'); },
  async forgotPassword() {
    const email = (document.getElementById('syncEmail').value || '').trim();
    if (!email) { toast('Type your email above first.'); return; }
    try { await sync.resetPassword(email); toast('Email sent. Open the link in it and choose a new password, then sign in with it on every device.'); }
    catch (e) { toast(authMessage(e)); }
  },
  async setPassword() {
    const p = document.getElementById('syncNewPass').value || '';
    if (p.length < 6) { toast('Use at least 6 characters.'); return; }
    try { await sync.setPassword(p); ui.recovery = false; toast('New password saved.'); rerender(); }
    catch (e) { toast(authMessage(e)); }
  },
  async skipPassword() { ui.recovery = false; rerender(); },
  async signUp() { await account('up'); },
  async signOut() {
    if (!(await ask('Sign out on this device? Your data stays here and in your account, but this device stops syncing.', 'Sign out'))) return;
    await sync.signOut(); rerender();
  },
  async syncNow() { await sync.syncNow(); const x = sync.state(); toast(x.status === 'idle' ? 'Up to date' : (syncInfo(x) || {}).label || 'Sync'); },
};

async function account(kind) {
  const email = (document.getElementById('syncEmail').value || '').trim();
  const pass = document.getElementById('syncPass').value || '';
  ui.syncEmail = email;
  if (!email || pass.length < 6) { toast('Enter your email and a password of at least 6 characters.'); return; }
  toast(kind === 'up' ? 'Creating your account…' : 'Signing in…');
  try {
    if (kind === 'up') {
      const r = await sync.signUp(email, pass);
      if (r === 'confirm') { toast('Check your email and tap the link, then sign in here.'); return; }
    } else await sync.signIn(email, pass);
    toast('Signed in. Your devices now share data.');
  } catch (e) { toast(authMessage(e)); return; }
  await reloadSettings();
  rerender();
}

function authMessage(e) {
  const m = e.message || '';
  if (/invalid login/i.test(m)) return 'Wrong email or password. If you never confirmed the account, or forgot the password, tap Forgot password.';
  if (/not confirmed/i.test(m)) return 'Your email is not confirmed yet. Open the link in the email from Supabase, or ask to have Confirm email turned off.';
  if (/already registered|already exists/i.test(m)) return 'This email already has an account. Tap Sign in instead.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a few minutes and try again.';
  if (/fetch|network|load failed/i.test(m)) return 'No connection. Try again when online.';
  return m;
}

// Links in Supabase emails (new password, confirm email) open the app with the session in the URL.
async function emailLink() {
  const link = await sync.fromEmailLink();
  if (!link) return false;
  if (link === 'recovery') ui.recovery = true;
  else if (link === 'signin') setTimeout(() => toast('Signed in. Your devices now share data.'), 300);
  else setTimeout(() => toast('That email link did not work: ' + link), 300);
  return true;
}

async function reloadSettings() {
  settings = { ...DEFAULT_SETTINGS, ...(await db.getKV('settings', {})) };
  settings.customLexicon = settings.customLexicon || [];
}

// Another device changed something: refresh the screen, unless the user is typing or filling in a form.
let remoteRedraw = false;
async function onRemoteChange(changed) {
  if (changed.has('settings')) await reloadSettings();
  const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  const inForm = /\/(new|edit|add)(\/|$)/.test(location.hash) || /^#\/wine\//.test(location.hash) && pendingWine;
  if (typing || inForm || document.querySelector('.modal')) { remoteRedraw = true; return; }
  rerender();
}
document.addEventListener('focusout', () => { if (remoteRedraw) setTimeout(() => { if (remoteRedraw && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) { remoteRedraw = false; rerender(); } }, 400); });
window.addEventListener('hashchange', () => { remoteRedraw = false; });

const changeActions = {
  async method(el) { settings.method = el.value; settings.level = getMethod(el.value).defaultLevel; await saveSettings(); rerender(); },
  async level(el) { settings.level = el.value; await saveSettings(); rerender(); },
  async advanced(el) { settings.advanced = el.checked; await saveSettings(); },
  async scale(el) { settings.scale = +el.value; await saveSettings(); },
  async noteFormat(el) { settings.noteFormat = el.value; ui.noteFormat = null; await saveSettings(); },
  async defaultMode(el) { settings.mode = el.value; await saveSettings(); },
  async standingsFilter(el) { ui.standingsFilter = el.value; rerender(); },
  async wineAdvanced(el) { await withWine((w, t) => { t.advanced = el.checked; }); },
  async showTannin(el) { await withWine((w, t) => { t.showTannin = el.checked; }); },
  async autoScan(el) { settings.autoScan = el.checked; await saveSettings(); },
  async currency(el) { settings.currency = el.value.trim(); await saveSettings(); },
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
      const dial = $app.querySelector('[data-dial]');
      if (dial) {
        const lo = +dial.dataset.min, hi = +dial.dataset.max;
        dial.style.setProperty('--p', el.value === '' ? 0 : Math.max(0, Math.min(1, (+el.value - lo) / (hi - lo))).toFixed(3));
      }
    }
    saveWineSoon(w);
    const out = $app.querySelector('#noteOut');
    if (out) {
      const { event } = await wineCtx(w);
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
  } else if (form.id === 'singleForm') {
    readWineForm();
    const w = draftWine;
    const isNew = !w.saved;
    if (isNew) w.createdAt = Date.now();
    w.saved = true;
    await db.put('wines', w);
    go(`#/wine/${w.id}`);
  } else if (form.id === 'bottleForm') {
    readBottleForm();
    const b = draftBottle;
    const isNew = !b.saved;
    if (isNew) { b.createdAt = Date.now(); b.bought = b.qty; b.log = [{ date: b.purchaseDate || today(), note: `Added ${b.qty} bottle${b.qty === 1 ? '' : 's'}` }]; }
    b.saved = true;
    await db.put('bottles', b);
    toast(isNew ? 'Added to your cellar' : 'Saved');
    go(`#/bottle/${b.id}`);
  } else if (form.id === 'merchantForm') {
    const fd = new FormData(form);
    const id = form.dataset.id;
    const m = id ? await db.get('merchants', id) : { id: uid(), createdAt: Date.now() };
    for (const k of ['name', 'kind', 'contact', 'phone', 'email', 'website', 'address', 'city', 'notes']) m[k] = (fd.get(k) || '').trim();
    await db.put('merchants', m);
    const back = ui.merchantReturn;
    ui.merchantReturn = null;
    if (!id && back && draftBottle) { draftBottle.merchantId = m.id; go(back); } else go(`#/merchant/${m.id}`);
  }
});

function readWineForm() {
  const form = $app.querySelector('#wineForm, #singleForm');
  if (!form || !draftWine) return;
  for (const k of ['producer', 'name', 'vintage', 'abv', 'region', 'country', 'grapes', 'price', 'date', 'place']) {
    if (form.elements[k]) draftWine[k] = form.elements[k].value.trim();
  }
  if (form.elements.scale) { const r = form.querySelector('input[name="scale"]:checked'); if (r) draftWine.scale = +r.value; }
}

// Read the label photo of the wine or bottle being edited with AI and fill the form.
async function runScan(kind) {
  const isBottle = kind === 'bottle';
  if (isBottle) readBottleForm(); else readWineForm();
  const obj = isBottle ? draftBottle : draftWine;
  if (!obj || !obj.labelId) return;
  const m = await db.get('media', obj.labelId);
  if (!m) return;
  ui.scanState = { id: obj.id, busy: true };
  rerender();
  try {
    const r = await scanLabel(m.blob, apiKey);
    const filled = [];
    for (const [k, v] of Object.entries(r.fields)) { obj[k] = v; filled.push(k); }
    if (r.colour && (!obj.colour || filled.length)) { obj.colour = r.colour; obj.type = r.type || 'still'; obj.sweet = r.sweet; }
    if (isBottle) {
      if (r.drinkFrom && !obj.drinkFrom) { obj.drinkFrom = r.drinkFrom; filled.push('drinkFrom'); }
      if (r.drinkTo && !obj.drinkTo) { obj.drinkTo = r.drinkTo; filled.push('drinkTo'); }
    }
    ui.aiFilled[obj.id] = { fields: filled, uncertain: r.uncertain.filter((u) => filled.includes(u)) };
    ui.scanState = { id: obj.id, done: true };
    if (!isBottle && obj.saved) await db.put('wines', obj);
    if (isBottle && obj.saved) await db.put('bottles', obj);
    toast(filled.length ? 'Label read ✓' : 'Nothing readable on this label');
  } catch (e) {
    ui.scanState = { id: obj.id, error: e.message };
  }
  rerender();
}

async function removeMediaOf(owner) {
  for (const m of await db.byIndex('media', 'owner', owner)) await db.del('media', m.id);
}
// A wine goes with its label and photos. A cellar bottle it came from is kept.
async function removeWine(w) {
  await removeMediaOf('wine:' + w.id);
  await removeMediaOf('label:' + w.id);
  if (w.labelId) await db.del('media', w.labelId);
  await db.del('wines', w.id);
}

async function handleUpload(el) {
  const files = [...el.files];
  if (!files.length) return;
  const owner = el.dataset.upload;
  if (owner === 'label' || owner === 'blabel') {
    const isBottle = owner === 'blabel';
    if (isBottle) readBottleForm(); else readWineForm();
    const obj = isBottle ? draftBottle : draftWine;
    const m = await addMedia('label:' + obj.id, 'image', files[0]);
    if (obj.labelId) await db.del('media', obj.labelId);
    obj.labelId = m.id;
    ui.scanState = null;
    if (await db.get(isBottle ? 'bottles' : 'wines', obj.id)) await db.put(isBottle ? 'bottles' : 'wines', obj);
    if (apiKey && settings.autoScan) { await runScan(isBottle ? 'bottle' : 'wine'); return; }
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
    const bottles = data.bottles || [], merchants = data.merchants || [];
    if (!(await ask(`Import ${data.events.length} events, ${data.wines.length} wines, ${bottles.length} cellar wines and ${merchants.length} merchants? Items with the same id are replaced.`, 'Import'))) return;
    for (const ev of data.events) await db.put('events', ev);
    for (const w of data.wines) await db.put('wines', w);
    for (const b of bottles) await db.put('bottles', b);
    for (const m of merchants) await db.put('merchants', m);
    toast('Imported');
    rerender();
  } catch (err) { toast('Import failed: ' + err.message); }
}

// ---------------------------------------------------------------- boot
async function boot() {
  settings = { ...DEFAULT_SETTINGS, ...(await db.getKV('settings', {})) };
  settings.customLexicon = settings.customLexicon || [];
  if ('structurePlus' in settings) { delete settings.structurePlus; await saveSettings(); } // replaced by 'advanced' (off by default)
  apiKey = (await db.getKV('apiKey', '')) || '';
  window.addEventListener('hashchange', route);
  sync.subscribe(paintSync);
  await sync.init(onRemoteChange);
  await emailLink();
  await route();
  requestPersistence();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      // Look for a new version whenever the app comes back to the front (iOS keeps it suspended).
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      // A new version took over: reload to use it, but never in the middle of typing or a form.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloadPending) return;
        reloadPending = true;
        const busy = () => (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) || /\/(new|edit|add)(\/|$)/.test(location.hash) || document.querySelector('.modal');
        const reload = async () => { await flushWine(); location.reload(); };
        if (!busy()) reload(); else window.addEventListener('hashchange', () => { if (!busy()) reload(); });
      });
    } catch (e) { /* not available in this context */ }
  }
}
let reloadPending = false;
boot();
