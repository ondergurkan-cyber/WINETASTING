// Tiny IndexedDB wrapper. Everything is stored on the device, offline.
// Stores: events, wines, media (photo/video blobs), kv (settings), bottles (cellar), merchants.

const DB_NAME = 'tasting-app';
const DB_VERSION = 2;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('wines')) {
        const s = db.createObjectStore('wines', { keyPath: 'id' });
        s.createIndex('eventId', 'eventId');
      }
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('owner', 'owner');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('bottles')) db.createObjectStore('bottles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('merchants')) db.createObjectStore('merchants', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const db = {
  async get(name, id) { return wrap((await store(name)).get(id)); },
  async all(name) { return wrap((await store(name)).getAll()); },
  async put(name, obj) { obj.updatedAt = Date.now(); await wrap((await store(name, 'readwrite')).put(obj)); return obj; },
  async del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); },
  async byIndex(name, index, value) { return wrap((await store(name)).index(index).getAll(value)); },
  async getKV(key, fallback) { const v = await wrap((await store('kv')).get(key)); return v === undefined ? fallback : v; },
  async setKV(key, value) { return wrap((await store('kv', 'readwrite')).put(value, key)); },
  async clearAll() {
    for (const n of ['events', 'wines', 'media', 'kv', 'bottles', 'merchants']) await wrap((await store(n, 'readwrite')).clear());
  },
};

// Ask the browser not to evict our data (helps on iOS when installed to Home Screen).
export async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
  return false;
}

// Downscale photos so the database stays small. Videos are stored as-is.
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', quality));
  } catch (e) {
    return file;
  }
}

export async function addMedia(owner, kind, file) {
  const blob = kind === 'video' ? file : await compressImage(file);
  const m = { id: uid(), owner, kind, blob, type: blob.type || file.type, createdAt: Date.now() };
  await db.put('media', m);
  return m;
}
