// WSET Systematic Approach to Tasting (SAT), Levels 2, 3 and 4 (Diploma).
// Transcribed from the WSET SAT cards and Wine-Lexicons in the project library
// for personal study use. WSET SAT content is copyright Wine & Spirit Education
// Trust; publishing the app needs WSET's written permission.
//
// A "method definition" describes sections, fields, options, which wine styles
// a field applies to, and the lexicon. The tasting screen is drawn from it, so a
// new method is mostly a new file like this one.

const S3 = ['low', 'medium', 'high'];
const S5 = ['low', 'medium(-)', 'medium', 'medium(+)', 'high'];
const INT3 = ['light', 'medium', 'pronounced'];
const INT5 = ['light', 'medium(-)', 'medium', 'medium(+)', 'pronounced'];
const BODY3 = ['light', 'medium', 'full'];
const BODY5 = ['light', 'medium(-)', 'medium', 'medium(+)', 'full'];
const FIN3 = ['short', 'medium', 'long'];
const FIN5 = ['short', 'medium(-)', 'medium', 'medium(+)', 'long'];
const SWEET4 = ['dry', 'off-dry', 'medium', 'sweet'];
const SWEET6 = ['dry', 'off-dry', 'medium-dry', 'medium-sweet', 'sweet', 'luscious'];
const QUALITY = ['faulty', 'poor', 'acceptable', 'good', 'very good', 'outstanding'];

const colourOptions = (rose) => ({
  white: ['lemon-green', 'lemon', 'gold', 'amber', 'brown'],
  rose: rose,
  red: ['purple', 'ruby', 'garnet', 'tawny', 'brown'],
});

// ---------- Lexicons ----------
// layer: primary | secondary | tertiary. colours: which wine colours the cluster
// is shown first for (others collapse under "More clusters").
const W = ['white'], R = ['red'], WR = ['white', 'rose'], RR = ['red', 'rose'], ALL = ['white', 'rose', 'red'];

const LEX_L2 = [
  { id: 'floral', name: 'Floral', layer: 'primary', colours: ALL, d: ['blossom', 'rose', 'violet'] },
  { id: 'green', name: 'Green fruit', layer: 'primary', colours: WR, d: ['apple', 'pear', 'gooseberry', 'grape'] },
  { id: 'citrus', name: 'Citrus fruit', layer: 'primary', colours: WR, d: ['grapefruit', 'lemon', 'lime', 'orange'] },
  { id: 'stone', name: 'Stone fruit', layer: 'primary', colours: WR, d: ['peach', 'apricot', 'nectarine'] },
  { id: 'tropical', name: 'Tropical fruit', layer: 'primary', colours: W, d: ['banana', 'lychee', 'mango', 'melon', 'passion fruit', 'pineapple'] },
  { id: 'red', name: 'Red fruit', layer: 'primary', colours: RR, d: ['redcurrant', 'cranberry', 'raspberry', 'strawberry', 'red cherry', 'red plum'] },
  { id: 'black', name: 'Black fruit', layer: 'primary', colours: R, d: ['blackcurrant', 'blackberry', 'blueberry', 'black cherry', 'black plum'] },
  { id: 'herbaceous', name: 'Herbaceous', layer: 'primary', colours: ALL, d: ['green bell pepper', 'grass', 'tomato leaf', 'asparagus'] },
  { id: 'herbal', name: 'Herbal', layer: 'primary', colours: ALL, d: ['eucalyptus', 'mint', 'fennel', 'dill', 'dried herbs'] },
  { id: 'spice', name: 'Spice', layer: 'primary', colours: R, d: ['black pepper', 'white pepper', 'liquorice'] },
  { id: 'ripeness', name: 'Fruit ripeness', layer: 'primary', colours: ALL, d: ['unripe fruit', 'ripe fruit', 'dried fruit', 'cooked fruit'] },
  { id: 'other', name: 'Other', layer: 'primary', colours: ALL, d: ['wet stones', 'candy'] },
  { id: 'yeast', name: 'Yeast (lees, autolysis, flor)', layer: 'secondary', colours: ALL, d: ['biscuit', 'pastry', 'bread', 'toasted bread', 'bread dough', 'cheese', 'yogurt'] },
  { id: 'mlf', name: 'Malolactic conversion', layer: 'secondary', colours: ALL, d: ['butter', 'cheese', 'cream'] },
  { id: 'oak', name: 'Oak', layer: 'secondary', colours: ALL, d: ['vanilla', 'cloves', 'coconut', 'cedar', 'charred wood', 'smoke', 'chocolate', 'coffee'] },
  { id: 't_red', name: 'Red wine (tertiary)', layer: 'tertiary', colours: R, d: ['dried fruit', 'leather', 'earth', 'mushroom', 'meat', 'tobacco', 'wet leaves', 'forest floor', 'caramel'] },
  { id: 't_white', name: 'White wine (tertiary)', layer: 'tertiary', colours: WR, d: ['dried fruit', 'orange marmalade', 'petrol', 'cinnamon', 'ginger', 'nutmeg', 'almond', 'hazelnut', 'honey', 'caramel'] },
  { id: 'oxid', name: 'Deliberately oxidised', layer: 'tertiary', colours: ALL, d: ['almond', 'hazelnut', 'walnut', 'chocolate', 'coffee', 'caramel'] },
];

const LEX_L3 = [
  { id: 'floral', name: 'Floral', layer: 'primary', colours: ALL, d: ['acacia', 'honeysuckle', 'chamomile', 'elderflower', 'geranium', 'blossom', 'rose', 'violet'] },
  { id: 'green', name: 'Green fruit', layer: 'primary', colours: WR, d: ['apple', 'gooseberry', 'pear', 'pear drop', 'quince', 'grape'] },
  { id: 'citrus', name: 'Citrus fruit', layer: 'primary', colours: WR, d: ['grapefruit', 'lemon', 'lime', 'orange peel', 'lemon peel'] },
  { id: 'stone', name: 'Stone fruit', layer: 'primary', colours: WR, d: ['peach', 'apricot', 'nectarine'] },
  { id: 'tropical', name: 'Tropical fruit', layer: 'primary', colours: W, d: ['banana', 'lychee', 'mango', 'melon', 'passion fruit', 'pineapple'] },
  { id: 'red', name: 'Red fruit', layer: 'primary', colours: RR, d: ['redcurrant', 'cranberry', 'raspberry', 'strawberry', 'red cherry', 'red plum'] },
  { id: 'black', name: 'Black fruit', layer: 'primary', colours: R, d: ['blackcurrant', 'blackberry', 'bramble', 'blueberry', 'black cherry', 'black plum'] },
  { id: 'dried', name: 'Dried/cooked fruit', layer: 'primary', colours: R, d: ['fig', 'prune', 'raisin', 'sultana', 'kirsch', 'jamminess', 'baked/stewed fruits', 'preserved fruits'] },
  { id: 'herbaceous', name: 'Herbaceous', layer: 'primary', colours: ALL, d: ['green bell pepper', 'grass', 'tomato leaf', 'asparagus', 'blackcurrant leaf'] },
  { id: 'herbal', name: 'Herbal', layer: 'primary', colours: ALL, d: ['eucalyptus', 'mint', 'medicinal', 'lavender', 'fennel', 'dill'] },
  { id: 'spice', name: 'Pungent spice', layer: 'primary', colours: R, d: ['black pepper', 'white pepper', 'liquorice'] },
  { id: 'other', name: 'Other', layer: 'primary', colours: ALL, d: ['flint', 'wet stones', 'wet wool'] },
  { id: 'yeast', name: 'Yeast (lees, autolysis)', layer: 'secondary', colours: ALL, d: ['biscuit', 'bread', 'toast', 'pastry', 'brioche', 'bread dough', 'cheese'] },
  { id: 'mlf', name: 'Malolactic conversion', layer: 'secondary', colours: ALL, d: ['butter', 'cheese', 'cream'] },
  { id: 'oak', name: 'Oak', layer: 'secondary', colours: ALL, d: ['vanilla', 'cloves', 'nutmeg', 'coconut', 'butterscotch', 'toast', 'cedar', 'charred wood', 'smoke', 'chocolate', 'coffee', 'resinous'] },
  { id: 'oxid', name: 'Deliberate oxidation', layer: 'tertiary', colours: ALL, d: ['almond', 'marzipan', 'hazelnut', 'walnut', 'chocolate', 'coffee', 'toffee', 'caramel'] },
  { id: 'fdev_w', name: 'Fruit development (white)', layer: 'tertiary', colours: WR, d: ['dried apricot', 'marmalade', 'dried apple', 'dried banana'] },
  { id: 'fdev_r', name: 'Fruit development (red)', layer: 'tertiary', colours: R, d: ['fig', 'prune', 'tar', 'dried blackberry', 'dried cranberry', 'cooked blackberry', 'cooked red plum'] },
  { id: 'age_w', name: 'Bottle age (white)', layer: 'tertiary', colours: WR, d: ['petrol', 'kerosene', 'cinnamon', 'ginger', 'nutmeg', 'toast', 'nutty', 'mushroom', 'hay', 'honey'] },
  { id: 'age_r', name: 'Bottle age (red)', layer: 'tertiary', colours: R, d: ['leather', 'forest floor', 'earth', 'mushroom', 'game', 'tobacco', 'vegetal', 'wet leaves', 'savoury', 'meaty', 'farmyard'] },
];

const LEX_L4 = [
  { id: 'floral', name: 'Floral', layer: 'primary', colours: ALL, d: ['blossom', 'elderflower', 'honeysuckle', 'jasmine', 'rose', 'violet'] },
  { id: 'green', name: 'Green fruit', layer: 'primary', colours: WR, d: ['apple', 'pear', 'gooseberry', 'grape'] },
  { id: 'citrus', name: 'Citrus fruit', layer: 'primary', colours: WR, d: ['grapefruit', 'lemon', 'lime', 'orange'] },
  { id: 'stone', name: 'Stone fruit', layer: 'primary', colours: WR, d: ['peach', 'apricot', 'nectarine'] },
  { id: 'tropical', name: 'Tropical fruit', layer: 'primary', colours: W, d: ['banana', 'lychee', 'mango', 'melon', 'passion fruit', 'pineapple'] },
  { id: 'red', name: 'Red fruit', layer: 'primary', colours: RR, d: ['redcurrant', 'cranberry', 'raspberry', 'strawberry', 'red cherry', 'red plum'] },
  { id: 'black', name: 'Black fruit', layer: 'primary', colours: R, d: ['blackcurrant', 'blackberry', 'blueberry', 'black cherry', 'black plum'] },
  { id: 'herbaceous', name: 'Herbaceous', layer: 'primary', colours: ALL, d: ['green bell pepper', 'grass', 'tomato leaf', 'asparagus'] },
  { id: 'herbal', name: 'Herbal', layer: 'primary', colours: ALL, d: ['eucalyptus', 'mint', 'fennel', 'dill', 'thyme', 'oregano'] },
  { id: 'spice', name: 'Spice', layer: 'primary', colours: R, d: ['black pepper', 'white pepper', 'liquorice', 'cinnamon'] },
  { id: 'ripeness', name: 'Fruit ripeness', layer: 'primary', colours: ALL, d: ['unripe fruit', 'ripe fruit', 'dried fruit', 'cooked fruit'] },
  { id: 'other', name: 'Other', layer: 'primary', colours: ALL, d: ['simple', 'wet stones', 'candy'] },
  { id: 'yeast', name: 'Yeast (lees, autolysis, flor)', layer: 'secondary', colours: ALL, d: ['biscuit', 'bread', 'toasted bread', 'pastry', 'brioche', 'bread dough', 'cheese', 'yogurt', 'acetaldehyde'] },
  { id: 'mlf', name: 'Malolactic conversion', layer: 'secondary', colours: ALL, d: ['butter', 'cheese', 'cream'] },
  { id: 'oak', name: 'Oak', layer: 'secondary', colours: ALL, d: ['vanilla', 'cloves', 'coconut', 'cedar', 'charred wood', 'smoke', 'chocolate', 'coffee'] },
  { id: 't_red', name: 'Red wine (tertiary)', layer: 'tertiary', colours: R, d: ['prune', 'raisin', 'fig', 'cooked plum', 'cooked cherry', 'leather', 'earth', 'mushroom', 'meat', 'tobacco', 'wet leaves', 'forest floor', 'caramel'] },
  { id: 't_white', name: 'White wine (tertiary)', layer: 'tertiary', colours: WR, d: ['dried apricot', 'raisin', 'orange marmalade', 'petrol', 'cinnamon', 'ginger', 'nutmeg', 'almond', 'hazelnut', 'honey', 'caramel'] },
  { id: 'oxid', name: 'Deliberately oxidised', layer: 'tertiary', colours: ALL, d: ['almond', 'hazelnut', 'walnut', 'chocolate', 'coffee', 'caramel'] },
];

// ---------- Structure+ (Beyond Flavour, optional) ----------
// Shown only when Settings > Structure+ is on. Not part of the WSET SAT.
const STRUCTURE_PLUS = {
  appearance: [
    { id: 'sp_brightness', label: 'Brightness', type: 'single', options: ['dull', 'bright', 'brilliant'], plus: true },
    { id: 'sp_staining', label: 'Rim / staining', type: 'single', options: ['none', 'light', 'heavy'], colours: ['red'], plus: true },
  ],
  palate: [
    { id: 'sp_acidshape', label: 'Acid shape', type: 'single', options: ['vertical', 'linear', 'crescendo', 'spherical', 'rollercoaster', 'broad'], plus: true,
      help: 'How the acidity moves: a straight line (linear), sharp and narrow (vertical), building (crescendo), round (spherical), up and down (rollercoaster).' },
    { id: 'sp_acidtype', label: 'Acid feel', type: 'single', options: ['crisp/malic', 'juicy/citric', 'soft/lactic', 'tart/sharp'], plus: true },
    { id: 'sp_tanloc', label: 'Tannin location', type: 'multi', options: ['front gums', 'rear gums', 'tongue', 'cheeks', 'everywhere'], colours: ['red'], plus: true },
    { id: 'sp_tantex', label: 'Tannin texture', type: 'single', options: ['powdery/fine', 'velvety', 'silky', 'sandy', 'grainy', 'chalky', 'coarse/rustic'], colours: ['red'], plus: true },
    { id: 'sp_bitter', label: 'Phenolic bitterness', type: 'single', options: ['none', 'low', 'medium', 'high'], plus: true },
  ],
};

// ---------- Level builders ----------
function appearance(level) {
  const rose = level === 'l3' ? ['pink', 'salmon', 'orange'] : ['pink', 'pink-orange', 'orange'];
  const f = [
    { id: 'clarity', label: 'Clarity', type: 'single', options: ['clear', 'hazy (faulty?)'] },
    { id: 'intensityA', label: 'Intensity', type: 'single', options: ['pale', 'medium', 'deep'] },
    { id: 'colour', label: 'Colour', type: 'single', byColour: colourOptions(rose) },
  ];
  if (level !== 'l2') f.push({ id: 'otherA', label: 'Other observations', type: 'multi', options: ['legs/tears', 'deposit', 'pétillance', 'bubbles'] });
  return { id: 'appearance', title: 'Appearance', fields: f };
}

function nose(level) {
  const f = [
    { id: 'condition', label: 'Condition', type: 'single', options: ['clean', 'unclean (faulty?)'] },
    { id: 'intensityN', label: 'Intensity', type: 'single', options: level === 'l2' ? INT3 : INT5, scale: true },
    { id: 'aromas', label: 'Aroma characteristics', type: 'lexicon' },
  ];
  if (level === 'l3') f.push({ id: 'development', label: 'Development', type: 'single', options: ['youthful', 'developing', 'fully developed', 'tired/past its best'] });
  return { id: 'nose', title: 'Nose', fields: f };
}

function palate(level) {
  const five = level !== 'l2';
  const f = [
    { id: 'sweetness', label: 'Sweetness', type: 'single', options: five ? SWEET6 : SWEET4, scale: true },
    { id: 'acidity', label: 'Acidity', type: 'single', options: five ? S5 : S3, scale: true },
    { id: 'tannin', label: level === 'l4' ? 'Tannin level' : 'Tannin', type: 'single', options: five ? S5 : S3, colours: ['red'], toggleable: true, scale: true },
  ];
  if (level === 'l4') f.push({ id: 'tanninNature', label: 'Tannin nature', type: 'multi', options: ['ripe', 'soft', 'smooth', 'unripe', 'green', 'coarse', 'stalky', 'chalky', 'fine-grained'], colours: ['red'], toggleable: true });
  f.push({ id: 'alcohol', label: 'Alcohol', type: 'single', options: S3, scale: true });
  f.push({ id: 'body', label: 'Body', type: 'single', options: five ? BODY5 : BODY3, scale: true });
  if (level === 'l3') f.push({ id: 'mousse', label: 'Mousse', type: 'single', options: ['delicate', 'creamy', 'aggressive'], types: ['sparkling'] });
  f.push({ id: 'intensityP', label: 'Flavour intensity', type: 'single', options: five ? INT5 : INT3, scale: true });
  f.push({ id: 'flavours', label: 'Flavour characteristics', type: 'lexicon', copyFrom: 'aromas' });
  if (level === 'l4') f.push({ id: 'otherP', label: 'Other observations', type: 'multi', options: ['oily', 'creamy', 'austere', 'luscious', 'pétillance'] });
  f.push({ id: 'finish', label: 'Finish', type: 'single', options: five ? FIN5 : FIN3, scale: true });
  return { id: 'palate', title: 'Palate', fields: f };
}

function conclusions(level) {
  const f = [{ id: 'quality', label: level === 'l4' ? 'Quality assessment' : 'Quality level', type: 'single', options: QUALITY, blic: level !== 'l2' }];
  if (level === 'l4') f.push({ id: 'qualityWhy', label: 'Why (quality)', type: 'text', placeholder: 'Balance, length, intensity, complexity…' });
  if (level === 'l3') f.push({ id: 'readiness', label: 'Readiness for drinking / potential for ageing', type: 'single', options: ['too young', 'can drink now, but has potential for ageing', 'drink now: not suitable for ageing or further ageing', 'too old'] });
  if (level === 'l4') {
    f.push({ id: 'ageing', label: 'Bottle ageing', type: 'single', options: ['suitable for bottle ageing', 'not suitable for bottle ageing'] });
    f.push({ id: 'ageingWhy', label: 'Why (ageing)', type: 'text', placeholder: 'Fruit concentration, acidity, tannin…' });
  }
  return { id: 'conclusions', title: 'Conclusions', fields: f };
}

function buildLevel(level, name, lexicon) {
  return {
    id: level,
    name,
    sections: [appearance(level), nose(level), palate(level), conclusions(level)],
    lexicon,
    structurePlus: STRUCTURE_PLUS,
  };
}

export const WSET = {
  id: 'wset',
  name: 'WSET SAT',
  description: 'Wine & Spirit Education Trust Systematic Approach to Tasting',
  defaultLevel: 'l3',
  levels: [
    buildLevel('l2', 'Level 2', LEX_L2),
    buildLevel('l3', 'Level 3', LEX_L3),
    buildLevel('l4', 'Diploma (Level 4)', LEX_L4),
  ],
};
