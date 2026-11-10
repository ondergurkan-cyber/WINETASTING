// Rule-based guess engine (v0). Runs offline on the device.
// Funnel: style gate → structure → aroma markers → winemaking → Structure+.

import { PROFILES } from './profiles.js';

// Map SAT words to a common 1–5 scale (sweetness 1–6), across L2/L3/L4.
const NUM = {
  low: 1, 'medium(-)': 2, medium: 3, 'medium(+)': 4, high: 5,
  light: 1, full: 5, pronounced: 5, short: 1, long: 5,
};
const SWEET = { dry: 1, 'off-dry': 2, 'medium-dry': 3, medium: 3.5, 'medium-sweet': 4, sweet: 5, luscious: 6 };

const num = (val) => (val in NUM ? NUM[val] : undefined);

function dist(x, [lo, hi]) {
  if (x === undefined) return 0;
  if (x < lo) return lo - x;
  if (x > hi) return x - hi;
  return 0;
}

const FIELD_WEIGHTS = { acid: 1.6, tannin: 1.6, body: 0.9, alcohol: 1.1, sweet: 1.8 };
const FIELD_LABELS = { acid: 'acidity', tannin: 'tannin', body: 'body', alcohol: 'alcohol', sweet: 'sweetness' };

export function guess(wine, tasting) {
  const v = (tasting && tasting.values) || {};
  const obs = {
    acid: num(v.acidity),
    tannin: num(v.tannin),
    body: num(v.body),
    alcohol: num(v.alcohol),
    sweet: v.sweetness ? SWEET[v.sweetness] : undefined,
  };
  const descr = [...(v.aromas || []), ...(v.flavours || [])];
  const words = new Set(descr.map((d) => d.d.toLowerCase()));
  const clusters = new Set(descr.map((d) => d.c));
  const hasOak = clusters.has('oak');
  const colour = wine.colour || 'red';
  const type = wine.type || 'still';
  const filled = Object.values(obs).filter((x) => x !== undefined).length + Math.min(words.size, 4);

  const scored = [];
  for (const p of PROFILES) {
    if (p.colour !== colour || !p.types.includes(type)) continue; // hard gate
    let penalty = 0;
    const why = [];
    const against = [];
    for (const k of Object.keys(FIELD_WEIGHTS)) {
      if (!p[k] || obs[k] === undefined) continue;
      const d = dist(obs[k], p[k]);
      penalty += d * d * FIELD_WEIGHTS[k];
      if (d === 0) why.push(FIELD_LABELS[k]);
      else if (d >= 1) against.push(`${FIELD_LABELS[k]} is ${obs[k] > p[k][1] ? 'higher' : 'lower'} than typical`);
    }
    // Aroma markers
    const hits = p.markers.filter((m) => words.has(m));
    penalty -= Math.min(hits.length, 5) * 0.9;
    // Oak
    if (hasOak && p.oak === 0) { penalty += 1.2; against.push('oak is unusual here'); }
    if (!hasOak && p.oak === 2 && words.size >= 3) penalty += 0.4;
    if (hasOak && p.oak === 2) why.push('oak');
    // Structure+
    if (v.sp_acidshape && p.acidShape) {
      if (p.acidShape.includes(v.sp_acidshape)) { penalty -= 1; why.push(`${v.sp_acidshape} acid shape`); }
      else penalty += 0.4;
    }
    if (Array.isArray(v.sp_tanloc) && v.sp_tanloc.length && p.tanLoc) {
      if (v.sp_tanloc.some((l) => p.tanLoc.includes(l))) { penalty -= 1; why.push(`tannin on the ${v.sp_tanloc.join(' / ')}`); }
      else penalty += 0.4;
    }
    if (v.sp_tantex && p.tanTex) {
      if (p.tanTex.includes(v.sp_tantex)) { penalty -= 0.6; why.push(`${v.sp_tantex} tannin`); }
    }
    // Age hints
    const tert = new Set(descr.filter((d) => /^(t_|age_|fdev_)/.test(d.c)).map((d) => d.d)).size;
    let ageHint = '';
    if (['garnet', 'tawny', 'amber', 'gold'].includes(v.colour) || tert >= 2 || v.development === 'fully developed') ageHint = 'with some bottle age';
    else if (['purple', 'lemon-green'].includes(v.colour) || v.development === 'youthful') ageHint = 'young';

    scored.push({ profile: p, penalty, hits, why, against, ageHint });
  }
  if (!scored.length) return { results: [], filled };

  // Softmax over negative penalty → relative likelihoods summing to 100.
  const T = 2.2;
  const max = Math.max(...scored.map((s) => -s.penalty / T));
  const exps = scored.map((s) => Math.exp(-s.penalty / T - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  scored.forEach((s, i) => { s.pct = Math.round((exps[i] / sum) * 100); });
  scored.sort((a, b) => b.pct - a.pct || a.penalty - b.penalty);
  return { results: scored.slice(0, 5), filled };
}

export function explain(r) {
  const parts = [];
  if (r.why.length) parts.push(`Fits on ${r.why.slice(0, 4).join(', ')}`);
  if (r.hits.length) parts.push(`markers: ${r.hits.slice(0, 4).join(', ')}`);
  let s = parts.join('; ');
  if (r.against.length) s += `${s ? '. ' : ''}Against: ${r.against.slice(0, 2).join('; ')}`;
  return s || 'Weak match: add more structure and aromas.';
}
