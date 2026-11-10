// Tasting note generator. Built only from what was tapped, never invented.

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function joinList(arr) {
  const a = arr.filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

const SECONDARY_SOURCE = { yeast: 'from lees', mlf: 'from malolactic', oak: 'from oak' };

// descriptors: [{c: clusterId, d: text}] ; lexicon: cluster list
function describe(descriptors, lexicon, max = 4) {
  if (!descriptors || !descriptors.length) return '';
  const layerOf = (c) => (lexicon.find((x) => x.id === c) || { layer: 'primary' }).layer;
  const prim = descriptors.filter((x) => layerOf(x.c) === 'primary' || x.c === 'custom').map((x) => x.d).slice(0, max);
  const parts = [];
  if (prim.length) parts.push(joinList(prim));
  const bySrc = {};
  descriptors.filter((x) => layerOf(x.c) === 'secondary').forEach((x) => { (bySrc[x.c] = bySrc[x.c] || []).push(x.d); });
  for (const [c, ds] of Object.entries(bySrc)) parts.push(`${joinList(ds.slice(0, 3))} ${SECONDARY_SOURCE[c] || ''}`.trim());
  const tert = descriptors.filter((x) => layerOf(x.c) === 'tertiary').map((x) => x.d).slice(0, 3);
  if (tert.length) parts.push(`hints of ${joinList(tert)}`);
  if (parts.length <= 1) return parts[0] || '';
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

function shortDescr(descriptors, n = 4) {
  return (descriptors || []).map((x) => x.d).slice(0, n).join(', ');
}

const v = (t, k) => (t.values || {})[k];

export function wineTitle(wine) {
  return [wine.vintage, wine.producer, wine.name].filter(Boolean).join(' ') || 'Unnamed wine';
}

export function formatScore(score, scale) {
  if (score === undefined || score === null || score === '') return '';
  return scale === 20 ? `${score}/20` : `${score}/100`;
}

export function generateNote(format, wine, tasting, level, event, opts = {}) {
  const t = tasting || { values: {} };
  const lex = level.lexicon;
  const isRed = wine.colour === 'red' || t.showTannin;
  const score = opts.includeScore !== false ? formatScore(t.score, event ? event.scale : 100) : '';
  const tannin = isRed && v(t, 'tannin') ? `${v(t, 'tannin')}${(v(t, 'tanninNature') || []).length ? ' ' + joinList(v(t, 'tanninNature')) : ''} tannins` : '';

  if (format === 'short') {
    const bits = [];
    const app = [v(t, 'intensityA'), v(t, 'colour')].filter(Boolean).join(' ');
    if (app) bits.push(cap(app) + '.');
    const ar = shortDescr([...(v(t, 'aromas') || []), ...(v(t, 'flavours') || []).filter((f) => !(v(t, 'aromas') || []).some((a) => a.d === f.d))], 5);
    if (ar) bits.push(cap(ar) + '.');
    const st = [v(t, 'sweetness'), v(t, 'acidity') && `${v(t, 'acidity')} acid`, tannin && tannin.replace(' tannins', ' tannin'), v(t, 'body') && `${v(t, 'body')} body`, v(t, 'finish') && `${v(t, 'finish')} finish`].filter(Boolean);
    if (st.length) bits.push(cap(st.join(', ')) + '.');
    const concl = [v(t, 'quality') && cap(v(t, 'quality'))];
    if (v(t, 'readiness')) concl.push(/potential|too young/.test(v(t, 'readiness')) ? 'will age' : 'drink now');
    if (v(t, 'ageing')) concl.push(v(t, 'ageing').startsWith('suitable') ? 'will age' : 'drink now');
    const c = concl.filter(Boolean).join(', ');
    if (c) bits.push(c + '.');
    if (score) bits.push(score);
    return bits.join(' ');
  }

  if (format === 'social') {
    const head = [wine.vintage, wine.producer, wine.name].filter(Boolean).join(' ');
    const where = [wine.region, wine.country].filter(Boolean).join(', ');
    const line1 = [head, where].filter(Boolean).join(', ');
    const ar = shortDescr(v(t, 'flavours') && v(t, 'flavours').length ? v(t, 'flavours') : v(t, 'aromas'), 3);
    const st = [tannin, v(t, 'finish') && `a ${v(t, 'finish')} finish`].filter(Boolean);
    let s = line1 ? `${line1} 🍷 ` : '🍷 ';
    if (ar) s += cap(ar);
    if (st.length) s += (ar ? '; ' : '') + joinList(st);
    s += '.';
    if (v(t, 'quality')) s += ` ${cap(v(t, 'quality'))}.`;
    if (score) s += ` ${score}`;
    return s.trim();
  }

  // WSET full
  const out = [];
  const app = [v(t, 'clarity') && v(t, 'clarity').replace(' (faulty?)', ''), [v(t, 'intensityA'), v(t, 'colour')].filter(Boolean).join(' ')].filter(Boolean);
  let appS = app.join(', ');
  if ((v(t, 'otherA') || []).length) appS += `${appS ? ', with ' : 'With '}${joinList(v(t, 'otherA'))}`;
  if ((v(t, 'sp_brightness'))) appS += `${appS ? ', ' : ''}${v(t, 'sp_brightness')}`;
  if (appS) out.push(cap(appS) + '.');

  const cond = v(t, 'condition') ? v(t, 'condition').replace(' (faulty?)', '') : '';
  let noseS = cond ? `${cap(cond)} nose` : 'Nose';
  if (v(t, 'intensityN')) noseS += ` of ${v(t, 'intensityN')} intensity`;
  if (v(t, 'development')) noseS += `, ${v(t, 'development')}`;
  const ar = describe(v(t, 'aromas'), lex);
  if (ar) noseS += `, with ${ar}`;
  if (cond || v(t, 'intensityN') || ar) out.push(noseS + '.');

  const struct = [];
  if (v(t, 'acidity')) struct.push(`${v(t, 'acidity')} acidity${v(t, 'sp_acidshape') ? ` (${v(t, 'sp_acidshape')})` : ''}`);
  if (tannin) struct.push(tannin + (v(t, 'sp_tantex') ? ` (${v(t, 'sp_tantex')})` : ''));
  if (v(t, 'alcohol')) struct.push(`${v(t, 'alcohol')} alcohol`);
  if (v(t, 'body')) struct.push(`a ${v(t, 'body')} body`);
  if (v(t, 'mousse') && wine.type === 'sparkling') struct.push(`a ${v(t, 'mousse')} mousse`);
  let palS = v(t, 'sweetness') ? cap(v(t, 'sweetness')) : '';
  if (struct.length) palS += (palS ? ', with ' : 'With ') + joinList(struct);
  if ((v(t, 'otherP') || []).length) palS += `${palS ? '; ' : ''}${joinList(v(t, 'otherP'))} texture`;
  if (palS) out.push(palS + '.');

  const fl = describe(v(t, 'flavours'), lex);
  let flS = '';
  if (v(t, 'intensityP') || fl) flS = `${cap(v(t, 'intensityP') || '')} flavours${fl ? ` of ${fl}` : ''}`.trim();
  if (v(t, 'finish')) flS += `${flS ? ', with a ' : 'A '}${v(t, 'finish')} finish`;
  if (flS) out.push(cap(flS) + '.');

  if (v(t, 'quality')) {
    let q = cap(v(t, 'quality'));
    const blic = (t.blic || []);
    if (blic.length) q += `: ${joinList(blic.map((b) => ({ B: 'balanced', L: 'long', I: 'intense', C: 'complex' }[b])))}`;
    if (v(t, 'qualityWhy')) q += `. ${cap(v(t, 'qualityWhy'))}`;
    out.push(q + '.');
  }
  if (v(t, 'readiness')) out.push(cap(v(t, 'readiness')) + '.');
  if (v(t, 'ageing')) out.push(cap(v(t, 'ageing')) + (v(t, 'ageingWhy') ? `: ${v(t, 'ageingWhy')}` : '') + '.');
  if (score) out.push(score);
  return out.join(' ').replace(/\s+\./g, '.').replace(/\.\./g, '.');
}
