// AI label reading with Claude's vision model, called straight from the browser.
// The API key is the user's own, stored only on this device (IndexedDB kv 'apiKey'),
// and never included in backups.

import { compressImage } from './db.js';

const API = 'https://api.anthropic.com/v1/messages';
export const SCAN_MODEL = 'claude-opus-5-5';

const FIELDS = ['producer', 'name', 'vintage', 'region', 'country', 'grapes', 'abv'];

const SCHEMA = {
  type: 'object',
  properties: {
    producer: { type: 'string', description: 'Winery, domaine, château or producer name' },
    name: { type: 'string', description: 'Wine or cuvée name, including classification such as 1er Cru, Riserva, Spätlese' },
    vintage: { type: 'string', description: 'Four-digit vintage year, or NV for non-vintage, or empty' },
    region: { type: 'string', description: 'Appellation or region, most specific first, e.g. "Puligny-Montrachet, Burgundy"' },
    country: { type: 'string' },
    grapes: { type: 'string', description: 'Grape varieties, comma separated. Only if printed on the label or certain from the appellation rules' },
    abv: { type: 'string', description: 'Alcohol percentage as a number, e.g. "13.5", or empty' },
    colour: { type: 'string', enum: ['white', 'rose', 'red', ''] },
    type: { type: 'string', enum: ['still', 'sparkling', 'fortified', ''] },
    sweet: { type: 'boolean', description: 'True only for clearly sweet styles (Sauternes, Tokaji Aszú, Auslese and sweeter, ice wine)' },
    drink_from: { type: 'integer', description: 'Estimated first year of the drinking window, 0 if unknown' },
    drink_to: { type: 'integer', description: 'Estimated last year of the drinking window, 0 if unknown' },
    uncertain: { type: 'array', items: { type: 'string' }, description: 'Names of the fields above you are not sure about' },
  },
  required: ['producer', 'name', 'vintage', 'region', 'country', 'grapes', 'abv', 'colour', 'type', 'sweet', 'drink_from', 'drink_to', 'uncertain'],
  additionalProperties: false,
};

const PROMPT = `This is a photo of a wine label. Read it and fill in the fields.
Use only what the label shows, plus what follows with certainty from the appellation (for example Chablis is Chardonnay, Barolo is Nebbiolo).
Leave a field as an empty string when you cannot read or infer it. Do not guess producers or vintages.
Estimate the drinking window from the style, appellation and vintage; use 0 when there is no sensible estimate.
List in "uncertain" every field you filled but are not sure about.`;

function headers(key, beta) {
  const h = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (beta) h['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  return h;
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

async function errorText(res) {
  try { const j = await res.json(); return (j.error && j.error.message) || res.statusText; } catch (e) { return res.statusText; }
}

// Returns { fields: {producer, name, ...}, colour, type, sweet, drinkFrom, drinkTo, uncertain: [] }
export async function scanLabel(blob, key) {
  if (!key) throw new Error('Add your Anthropic API key in Settings first.');
  const img = await compressImage(blob, 1200, 0.85);
  const data = await blobToBase64(img);
  const body = {
    model: SCAN_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data } },
        { type: 'text', text: PROMPT },
      ],
    }],
  };
  // Server-side fallback lets a declined request be retried on another model.
  let res = await fetch(API, { method: 'POST', headers: headers(key, true), body: JSON.stringify({ ...body, fallbacks: 'default' }) });
  if (res.status === 400) {
    const msg = await errorText(res.clone());
    if (/fallback|beta/i.test(msg)) res = await fetch(API, { method: 'POST', headers: headers(key, false), body: JSON.stringify(body) });
  }
  if (res.status === 401) throw new Error('The API key was rejected. Check it in Settings.');
  if (res.status === 429) throw new Error('Too many requests right now. Try again in a minute.');
  if (!res.ok) throw new Error(`Label scan failed: ${await errorText(res)}`);
  const msg = await res.json();
  if (msg.stop_reason === 'refusal') throw new Error('The label could not be read. Please type the details.');
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch (e) { throw new Error('The scan returned an unreadable answer. Try another photo.'); }
  const fields = {};
  for (const k of FIELDS) if (typeof out[k] === 'string' && out[k].trim()) fields[k] = out[k].trim();
  return {
    fields,
    colour: out.colour || '',
    type: out.type || '',
    sweet: !!out.sweet,
    drinkFrom: out.drink_from > 1900 ? out.drink_from : null,
    drinkTo: out.drink_to > 1900 ? out.drink_to : null,
    uncertain: Array.isArray(out.uncertain) ? out.uncertain : [],
  };
}

// Cheap check that a key works: list one model (no tokens used).
export async function testKey(key) {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: headers(key, false) });
  if (res.status === 401) throw new Error('The key was rejected.');
  if (!res.ok) throw new Error(await errorText(res));
  return true;
}
