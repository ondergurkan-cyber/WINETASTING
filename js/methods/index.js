import { WSET } from './wset.js';

// Registered tasting methods. Entries with `comingSoon` show greyed out in Settings.
export const METHODS = [
  WSET,
  { id: 'beyond', name: 'Beyond Flavour (structure grid)', comingSoon: true, levels: [] },
  { id: 'cms', name: 'Court of Master Sommeliers deductive grid', comingSoon: true, levels: [] },
];

export function getMethod(id) {
  return METHODS.find((m) => m.id === id && !m.comingSoon) || WSET;
}

export function getLevel(methodId, levelId) {
  const m = getMethod(methodId);
  return m.levels.find((l) => l.id === levelId) || m.levels.find((l) => l.id === m.defaultLevel) || m.levels[0];
}

// Fields of a section that apply to a wine, given its style and settings.
export function fieldsFor(level, sectionId, wine, settings, tasting) {
  const sec = level.sections.find((s) => s.id === sectionId);
  if (!sec) return [];
  let fields = [...sec.fields];
  if (settings.structurePlus && level.structurePlus[sectionId]) {
    // Insert Structure+ fields before the lexicon field (or at end).
    const extra = level.structurePlus[sectionId];
    const idx = fields.findIndex((f) => f.type === 'lexicon');
    if (sectionId === 'palate') {
      const tIdx = fields.findIndex((f) => f.id === 'alcohol');
      fields.splice(tIdx, 0, ...extra);
    } else if (idx >= 0) fields.splice(idx, 0, ...extra);
    else fields.push(...extra);
  }
  const colour = wine.colour || 'red';
  const type = wine.type || 'still';
  return fields.filter((f) => {
    if (f.types && !f.types.includes(type)) return false;
    if (f.colours && !f.colours.includes(colour)) {
      // Tannin can be switched on for orange/skin-contact whites and rosés.
      if (f.toggleable && tasting && tasting.showTannin) return true;
      return false;
    }
    return true;
  });
}
