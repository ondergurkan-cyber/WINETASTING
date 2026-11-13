// Sync across devices through Supabase (auth + one records table + a private photo bucket).
// The device database stays the source the app reads from, so everything works offline.
// Every local change lands in the outbox (db.js); this module sends it when online and pulls
// what other devices changed. Newest change wins, per record. See supabase/setup.sql.

import { db, outbox, SYNCED, onLocalChange } from './db.js';
import { SYNC_URL, SYNC_KEY } from './config.js';

const URL_ = (SYNC_URL || '').replace(/\/+$/, '');
const KEY = SYNC_KEY || '';
const PAGE = 500;
const OVERLAP_MS = 10000; // re-read a little of the past on each pull; applying twice is harmless

let session = null;       // { access_token, refresh_token, expires_at, user: { id, email } }
let running = null;
let again = false;
let timer = null;
let remoteHook = () => {};
const listeners = new Set();
const st = { status: 'off', lastSync: 0, pending: 0, message: '', progress: '' };

export const configured = () => !!(URL_ && KEY);
export const state = () => ({ ...st, email: session && session.user ? session.user.email : '', signedIn: !!session });
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function set(patch) { Object.assign(st, patch); listeners.forEach((fn) => { try { fn(state()); } catch (e) { /* ignore */ } }); }

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ---------------------------------------------------------------- http
async function call(path, { method = 'GET', body, headers = {}, auth = true, raw = false } = {}) {
  const h = { apikey: KEY, ...headers };
  if (auth) h.Authorization = 'Bearer ' + (await token());
  if (body !== undefined && !(body instanceof Blob) && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(URL_ + path, { method, headers: h, body: body === undefined || body instanceof Blob ? body : JSON.stringify(body) });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.error_description || j.msg || j.message || j.error || msg; } catch (e) { /* not json */ }
    throw new HttpError(res.status, msg);
  }
  if (raw) return res;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function keep(s) {
  if (!s || !s.access_token) return null;
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user.id, email: s.user.email } };
}

async function token() {
  if (!session) throw new HttpError(401, 'Not signed in');
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  let s;
  try {
    s = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false });
  } catch (e) {
    if (e.status >= 400 && e.status < 500) { await dropSession('Please sign in again.'); }
    throw e;
  }
  session = keep(s);
  await db.setKVRemote('sync:session', session);
  return session.access_token;
}

async function dropSession(message = '') {
  session = null;
  await db.setKVRemote('sync:session', null);
  set({ status: 'signedout', message });
}

// ---------------------------------------------------------------- account
export async function signIn(email, password) {
  const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
  await startSession(s);
}

// Returns 'confirm' when the server wants the email address confirmed first.
export async function signUp(email, password) {
  const s = await call('/auth/v1/signup', { method: 'POST', body: { email, password }, auth: false });
  if (!s || !s.access_token) return 'confirm';
  await startSession(s);
  return 'ok';
}

async function startSession(s) {
  session = keep(s);
  await db.setKVRemote('sync:session', session);
  set({ status: 'idle', message: '' });
  await syncNow();
}

export async function signOut() {
  try { await call('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* offline is fine */ }
  session = null;
  for (const k of ['sync:session', 'sync:cursor', 'sync:seededFor']) await db.setKVRemote(k, null);
  set({ status: 'signedout', lastSync: 0, message: '', progress: '' });
}

// ---------------------------------------------------------------- engine
export async function init(onRemoteChange) {
  remoteHook = onRemoteChange || remoteHook;
  if (!configured()) { set({ status: 'off' }); return; }
  session = (await db.getKV('sync:session', null)) || null;
  st.lastSync = (await db.getKV('sync:lastSync', 0)) || 0;
  set({ status: session ? 'idle' : 'signedout', pending: await outbox.count() });
  onLocalChange(() => { outbox.count().then((n) => set({ pending: n })); schedule(2000); });
  window.addEventListener('online', () => schedule(500));
  window.addEventListener('offline', () => set({ status: session ? 'offline' : st.status }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 30000);
  if (session) schedule(0);
}

function schedule(ms) {
  if (!session) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

export async function syncNow() {
  if (!session || !configured()) return;
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      set({ status: 'syncing', message: '' });
      try {
        await seed();
        await push();
        const changed = await pull();
        st.lastSync = Date.now();
        await db.setKVRemote('sync:lastSync', st.lastSync);
        set({ status: 'idle', pending: await outbox.count(), progress: '' });
        if (changed.size) remoteHook(changed);
      } catch (e) {
        const offline = !navigator.onLine || e instanceof TypeError;
        if (!session) break;
        set({ status: offline ? 'offline' : 'error', message: offline ? '' : e.message, pending: await outbox.count(), progress: '' });
        break;
      }
    } while (again && session);
  })();
  try { await running; } finally { running = null; }
}

// First sign-in on a device: queue everything already on it, so nothing is lost.
// Ids are unique per item, so merging devices never creates duplicates.
async function seed() {
  const uid = session.user.id;
  if ((await db.getKV('sync:seededFor', null)) === uid) return;
  for (const name of SYNCED) {
    for (const r of await db.all(name)) {
      if (!(await outbox.get(name + '/' + r.id))) await outbox.add(name, r.id, false, r.updatedAt || r.createdAt || 1);
    }
  }
  const s = await db.getKV('settings', null);
  if (s && !(await outbox.get('kv/settings'))) await outbox.add('kv', 'settings', false, s.updatedAt || 1);
  await db.setKVRemote('sync:cursor', null);
  await db.setKVRemote('sync:seededFor', uid);
}

const mediaPath = (id) => `${session.user.id}/${id}`;

async function push() {
  const entries = (await outbox.all()).sort((a, b) => a.at - b.at);
  if (!entries.length) return;
  const uid = session.user.id;
  const rows = [], sent = [];
  const photos = entries.filter((e) => e.store === 'media' && !e.deleted).length;
  let photoN = 0;
  for (const e of entries) {
    let row = { user_id: uid, store: e.store, id: e.id, deleted: !!e.deleted, data: null, updated_at: Math.round(e.at) };
    if (!e.deleted) {
      if (e.store === 'kv') {
        const v = await db.getKV(e.id, null);
        if (!v) { await outbox.remove(e.key); continue; }
        row.data = v; row.updated_at = Math.round(v.updatedAt || e.at);
      } else {
        const r = await db.get(e.store, e.id);
        if (!r) { await outbox.remove(e.key); continue; }
        if (e.store === 'media') {
          photoN++;
          set({ progress: `Sending photos ${photoN} of ${photos}` });
          const { blob, ...meta } = r;
          if (blob) {
            try {
              await call(`/storage/v1/object/media/${mediaPath(r.id)}`, { method: 'POST', body: blob, headers: { 'Content-Type': r.type || blob.type || 'application/octet-stream', 'x-upsert': 'true' } });
            } catch (err) {
              if (err.status === 413 || err.status === 400) { await outbox.remove(e.key); continue; } // too large for the free plan: stays on this device
              throw err;
            }
          }
          row.data = { ...meta, remote: true };
        } else row.data = r;
        row.updated_at = Math.round(r.updatedAt || e.at);
      }
    } else if (e.store === 'media') {
      try { await call(`/storage/v1/object/media/${mediaPath(e.id)}`, { method: 'DELETE' }); } catch (err) { if (!(err instanceof HttpError)) throw err; }
    }
    rows.push(row); sent.push(e);
    if (rows.length >= 100) await upsert(rows.splice(0), sent.splice(0));
  }
  if (rows.length) await upsert(rows, sent);
}

async function upsert(rows, sent) {
  await call('/rest/v1/records?on_conflict=user_id,store,id', { method: 'POST', body: rows, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  for (const e of sent) {
    const cur = await outbox.get(e.key);
    if (cur && cur.at === e.at && cur.deleted === e.deleted) await outbox.remove(e.key); // changed again meanwhile? keep it
  }
  set({ pending: await outbox.count() });
}

async function pull() {
  const changed = new Set();
  const cursor = await db.getKV('sync:cursor', null);
  let since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
  for (;;) {
    const q = `/rest/v1/records?select=store,id,data,deleted,updated_at,server_updated_at&server_updated_at=gt.${encodeURIComponent(since)}&order=server_updated_at.asc,id.asc&limit=${PAGE}`;
    const rows = await call(q);
    for (const row of rows) {
      const ok = await apply(row, changed);
      if (!ok) return changed; // a photo did not download: try again next time, from here
      since = row.server_updated_at;
      await db.setKVRemote('sync:cursor', since);
    }
    if (rows.length < PAGE) break;
  }
  return changed;
}

async function apply(row, changed) {
  const key = row.store + '/' + row.id;
  const pending = await outbox.get(key);
  if (row.store === 'kv') {
    if (row.id !== 'settings') return true;
    const local = await db.getKV('settings', null);
    const localAt = pending ? pending.at : (local && local.updatedAt) || 0;
    if (row.updated_at <= localAt || row.deleted || !row.data) return true;
    await db.setKVRemote('settings', { ...row.data, updatedAt: row.updated_at });
  } else {
    if (!SYNCED.includes(row.store)) return true;
    const local = await db.get(row.store, row.id);
    const localAt = pending ? pending.at : (local && local.updatedAt) || 0;
    if (row.updated_at <= localAt) return true; // this device has the same or a newer version
    if (row.deleted) {
      if (local) await db.delRemote(row.store, row.id);
    } else if (row.store === 'media') {
      let blob;
      try {
        set({ progress: 'Receiving photos' });
        const res = await call(`/storage/v1/object/authenticated/media/${mediaPath(row.id)}`, { raw: true });
        blob = await res.blob();
      } catch (e) {
        if (e.status === 404 || e.status === 400) return true; // the file is gone; skip it
        return false;
      }
      const { remote, ...meta } = row.data;
      await db.putRemote('media', { ...meta, blob, updatedAt: row.updated_at });
    } else {
      await db.putRemote(row.store, { ...row.data, updatedAt: row.updated_at });
    }
  }
  if (pending) await outbox.remove(key);
  changed.add(row.store === 'kv' ? 'settings' : row.store);
  return true;
}
