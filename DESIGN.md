---
name: VinoKit
description: An elegant retro-vintage wine tasting book for iPhone and iPad
colors:
  paper: "#F4ECDF"
  card: "#FBF6EE"
  card-sunk: "#EDE2D1"
  ink: "#2B1D17"
  ink-muted: "#5E4B3F"
  hairline: "#DCCDB6"
  control-edge: "#857056"
  bordeaux: "#6E1F2E"
  bordeaux-deep: "#561623"
  bordeaux-tint: "#F1DEDC"
  copper: "#B5652B"
  copper-ink: "#8E4A1B"
  mustard: "#D9A441"
  sage: "#4F6B3A"
  danger: "#A3261E"
  wine-white: "#E6CF7A"
  wine-rose: "#E7A1A0"
  wine-red: "#6E1F2E"
  paper-dark: "#1A1311"
  card-dark: "#251C18"
  card-sunk-dark: "#120D0B"
  ink-dark: "#F1E6D6"
  ink-muted-dark: "#BFAE9A"
  hairline-dark: "#3D2F28"
  control-edge-dark: "#86705E"
  bordeaux-dark: "#D9798A"
  copper-dark: "#D99058"
  sage-dark: "#9DB57F"
  danger-dark: "#E5786C"
typography:
  display:
    fontFamily: "Libre Caslon Display, Georgia, 'Times New Roman', serif"
    fontSize: "2.5rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontFeature: "'lnum' 1"
  headline:
    fontFamily: "Libre Caslon Display, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.15
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  descriptor:
    fontFamily: "Libre Caslon Text, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Josefin Sans, 'Avenir Next', 'Futura', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.14em"
  numeral:
    fontFamily: "Libre Caslon Display, Georgia, serif"
    fontSize: "3.5rem"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'lnum' 1, 'tnum' 1"
  dateline:
    fontFamily: "Courier Prime, 'Courier New', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
components:
  button-primary:
    backgroundColor: "{colors.bordeaux}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.bordeaux-deep}"
    textColor: "{colors.card}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "13px 22px"
    height: "48px"
  button-icon:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "44px"
  title-pill:
    backgroundColor: "{colors.card-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  chip-selected:
    backgroundColor: "{colors.bordeaux}"
    textColor: "{colors.card}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  instrument-card:
    backgroundColor: "{colors.card-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "48px"
  tab-bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
---

<!-- SEED: direction set with the owner on 2026-11-13 from reference images, before the app is restyled. Tokens are binding targets; re-run /impeccable document after the restyle to capture what was actually built. -->

# Design System: Tasting

## Overview

**Creative North Star: "The Cellar Almanac"**

The app should feel like a well-kept cellar book printed on warm paper, with a few brass instruments on the desk beside it. Tasting is an act of measurement and memory, so the interface borrows from both: analog gauges and engraved scales for measuring (acidity, tannin, body, finish, quality), and the quiet typography of an old almanac or gazette for remembering (dates, volumes, italic descriptions). Elegant before playful, restrained before loud.

The primary reference is a vintage weather app: paper-cream screens, softly inset cards, analog dials with copper needles, engraved illustrations, small widely spaced capital labels and a single italic line of description under a big number. The supporting references add editorial serif headlines and archive cards (newspaper app), a warm terracotta accent, sepia photos and a timeline (family-recipe app), coloured spine stripes on cards and filled filter pills (almanac app), tactile cream controls with fine tick marks (skeuomorphic control kit), and a bold display face with script or dot accents (two radio landing pages). A sixties login set contributes only one thing: the hard offset shadow, used as a rare accent.

This is an Operate surface. People use it at the table with a glass in hand, so the vintage character lives in precise details (type, texture, instruments, rules), never in clutter that slows down entering a note.

**Key Characteristics:**
- Warm paper backgrounds, never pure white or pure black.
- Bordeaux is the one voice; copper is the instrument metal; mustard is a rare spark.
- Serif display plus spaced-caps labels plus italic descriptors, over a system body face.
- Analog instruments for scales and scores.
- Engraved, single-colour illustrations instead of emoji or glossy icons.
- Archive language for history: volumes, datelines, spine stripes, a timeline.

## Colors

A warm, low-chroma paper palette with one deep wine accent and a metallic copper for instruments.

### Primary
- **Bordeaux** (#6E1F2E): the primary action, the selected state, the active tab, the map pin, the thermometer fill. Also the red-wine swatch. Cream text on it reads at 10.3:1.
- **Bordeaux Deep** (#561623): pressed state of primary buttons and the stamp under the offset shadow.
- **Bordeaux Tint** (#F1DEDC): the background of a selected row or a soft highlighted badge, with ink or bordeaux text.

### Secondary
- **Copper** (#B5652B): needles, dial rings, progress arcs, slider fills, the active segment of a scale. Graphic use only: at 3.4 to 4.0:1 it passes for UI parts but not for small text.
- **Copper Ink** (#8E4A1B): copper when it has to be text, such as a "MODERATE" badge or an eyebrow label (5.2:1 or better on every light surface).

### Tertiary
- **Mustard** (#D9A441): a tiny spark: the score star, a streak flame, a dot after the logo. Never text on paper. Ink on mustard reads at 7.2:1 if it is ever a fill.
- **Sage** (#4F6B3A): success and "right" on reveal, and the green spine stripe.

### Neutral
- **Paper** (#F4ECDF): the page background.
- **Card** (#FBF6EE): raised cards, sheets, the tab bar, inputs.
- **Card Sunk** (#EDE2D1): inset instrument wells, title pills, "Did you know?" boxes.
- **Ink** (#2B1D17): all primary text (13.9:1 on paper).
- **Ink Muted** (#5E4B3F): secondary text, labels and captions (7.0:1 on paper). This replaces the old grey `#7b6d70`, which failed contrast.
- **Hairline** (#DCCDB6): dividers and card outlines only, never the edge of something you must find to tap.
- **Control Edge** (#857056): borders of inputs, toggles, unselected chips and dial ticks (4.0:1 on paper, so it passes the 3:1 UI rule).
- **Danger** (#A3261E): delete and errors (6.3:1 on paper).

### Wine swatches
- **White** (#E6CF7A), **Rosé** (#E7A1A0), **Red** (#6E1F2E). Used as spine stripes, glass icons and dots. They never carry text alone.

### Dark mode: "The Cellar at Night"
Dark mode is a candle-lit cellar, not a grey UI. Every light token has a dark partner, and the hue family stays the same.
- **Paper** #1A1311, **Card** #251C18, **Card Sunk** #120D0B, **Hairline** #3D2F28, **Control Edge** #86705E.
- **Ink** #F1E6D6 (14.9:1), **Ink Muted** #BFAE9A (8.5:1).
- **Bordeaux** lifts to #D9798A so it still reads as text and as a fill (6.2:1 on paper-dark). On a dark bordeaux fill, use paper-dark text (#1A1311, 6.2:1), not cream.
- **Copper** lifts to #D99058, **Sage** to #9DB57F, **Danger** to #E5786C.
- Wine swatches stay the same hue, and the red swatch gets a 1px #D9798A ring so it does not vanish.
- Shadows turn off. Depth comes from the card and sunk tones plus a 1px hairline.

### Named Rules
**The One Voice Rule.** Bordeaux covers no more than about 10% of a screen: the main action, the selection, the pin. If two things on a screen are both bordeaux, one of them is wrong.

**The Copper Is Metal Rule.** Copper is for needles, rings, arcs and fills, the brass on the desk. Text that wants to be copper uses Copper Ink.

**The No Pure Extremes Rule.** Never use #FFFFFF or #000000 anywhere, including dark mode. Paper and ink are always warm.

**The Contrast Floor Rule.** Body text is 4.5:1 or better, large text and control boundaries 3:1 or better, in light and dark. Muted text uses Ink Muted, never a lighter grey "because it looks softer".

## Typography

**Display Font:** Libre Caslon Display (with Georgia, serif)
**Descriptor Font:** Libre Caslon Text, italic (with Georgia, serif)
**Label Font:** Josefin Sans (with Avenir Next, Futura, sans-serif)
**Body Font:** the system face (-apple-system, SF Pro Text)
**Dateline Font:** Courier Prime (with Courier New, monospace)

**Character:** a wine-label Caslon for names and numbers, a 1920s geometric sans for small engraved-looking labels, and the native iOS face for everything you read or type at speed. The italic Caslon is the voice of the taster.

All web fonts are free (SIL Open Font License) and must be self-hosted in the app so it keeps working offline. Load only the weights listed here. Every face must ship both its **latin** and **latin-ext** subsets (split by `unicode-range`), so Turkish (ç ğ ı İ ö ş ü) and other European names render in the same face instead of falling back to Georgia. Any future font must cover Latin Extended-A.

### Hierarchy
- **Display** (400, 2.5rem, 1.05): screen titles on the big screens (Home, an event name, a wine's name on its sheet). One per screen.
- **Headline** (400, 1.75rem, 1.15): section titles such as "Standings" or "The Cellar".
- **Numeral** (400, 3.5rem, 1, lining and tabular figures): the score, the quality level number, the bottle count. Always with a small spaced-caps unit or label under it ("POINTS", "OF 100").
- **Title** (600, 1.0625rem, 1.3): card titles, wine names in lists, button text.
- **Body** (400, 1rem, 1.45): notes, forms, explanations. Max line length about 65ch on iPad.
- **Descriptor** (italic, 1.0625rem, 1.4): the one line of character under a number or a name: *"Elegant, ripe, long finish"*, *"Outstanding"*, a quoted memory in My Wines. One or two lines at most.
- **Label** (600, 0.75rem, 0.14em letter-spacing, uppercase): field names (ACIDITY, TANNIN), card eyebrows (BLIND EVENT, VOL. III), tab names, chip text.
- **Dateline** (400, 0.75rem, 0.04em): dates, vintages and catalogue lines on archive cards ("OCT 14, 2026 · No. 3").

### Named Rules
**The Three Voices Rule.** A screen speaks in at most three type voices: the serif (names, numbers), the spaced caps (labels), and the body face. Italic and dateline are seasoning, used once or twice.

**The Readable Caps Rule.** Spaced caps never go below 11px (0.6875rem), never run longer than about four words, and are never used for sentences or anything the user types.

**The Dynamic Type Rule.** Sizes are in rem so they scale with the user's text size. Layouts must survive 130% text without clipping.

## Layout

A single, calm column on iPhone (16px side gutters, 24px between sections). On iPad, a centred column of at most 760px for forms and sheets, and a two-column card grid for lists such as wines, the cellar and archives.

Spacing follows a 4px base: 4, 8, 12, 16, 24, 32, 48, 64. Cards use 16px inside. Instrument wells sit 12px inside their card. Sections are separated by space and a hairline, not by heavy boxes.

Instruments come in pairs or alone: two small dials side by side (like humidity and wind), or one hero dial centred with a big numeral, never a dense dashboard.

Respect the safe areas (`env(safe-area-inset-*)`) at the top and above the tab bar.

## Elevation & Depth

Mostly flat paper with soft, warm lift. Depth comes first from tone (paper, then card, then the sunk well), then from a 1px hairline, and only lastly from a shadow.

### Shadow Vocabulary
- **Paper lift** (`box-shadow: 0 1px 0 rgba(43,29,23,0.04), 0 6px 16px -8px rgba(43,29,23,0.18)`): resting cards.
- **Inset well** (`box-shadow: inset 0 1px 2px rgba(43,29,23,0.10)`): instrument wells, the title pill, input fields.
- **Dial bezel** (`box-shadow: inset 0 0 0 6px #B5652B33, 0 8px 24px -12px rgba(43,29,23,0.35)`): the one hero dial.
- **Stamp** (`box-shadow: 3px 3px 0 #561623`): the offset hard shadow from the retro references. Only on the single primary action of a screen (for example "Save tasting" or "Reveal"), and it compresses to 1px 1px when pressed.

### Named Rules
**The One Stamp Rule.** At most one element per screen gets the hard offset shadow. It is a seal, not a style.

**The Dark Is Flat Rule.** In dark mode all shadows are off. Use the card and sunk tones and the hairline instead.

## Shapes

Soft, rounded paper. Cards have 16px corners, sheets and large panels 24px, inputs and small tiles 10px, badges 6px. Buttons, chips, the title pill and icon buttons are full pills or circles.

Instruments are circles: dials with fine tick marks every step, a heavier tick every five, a copper needle with a small round hub. Scales (low to high) are drawn as a horizontal rule with tick marks and a round knob, like the control kit and the UV index bar.

Dividers can be a solid hairline or a short dashed rule (2px dash, 4px gap) for archive cards and timelines.

Archive cards (events, My Wines, cellar bottles) may carry a 6px colour stripe on their left or bottom edge, like a book spine, using the wine swatch of that wine or the event's dominant colour.

## Components

### Buttons
- **Shape:** full pill (999px), 48px tall, at least 44px wide.
- **Primary:** bordeaux fill, card-coloured title text. Pressed goes to Bordeaux Deep. May take the Stamp shadow if it is the screen's single main action.
- **Secondary:** card fill, ink text, 1px Control Edge border.
- **Icon:** a 44px circle, card fill with a 1px hairline, ink icon. Used for back, search, share and settings, like the round buttons in the weather and recipe references.
- **Destructive:** text or outline in Danger. It is always visible (never hidden in an edit form) and asks for confirmation.
- **Focus:** a 2px bordeaux outline with a 2px offset in light mode, the lifted bordeaux in dark mode. Never remove it.

### Title pill
The screen title in a sunk pill at the top centre ("Atmospheric Data" in the reference), flanked by circular icon buttons. On big screens Display type replaces it.

### Chips and filters
- **Style:** pill, card fill, Control Edge border, spaced-caps label text.
- **Selected:** bordeaux fill with card text, no border. Use for aroma quick picks, colour filters and Quick or Full SAT.

### Cards
- **Corner Style:** 16px.
- **Background:** card on paper, with paper lift.
- **Instrument card:** card-sunk with the inset well. Holds a spaced-caps label at the top, a dial or scale in the middle, and a muted caption at the bottom ("OPTIMAL RANGE", "NW BREEZE" in the reference; for us, for example, "MEDIUM+").
- **Archive card:** a card with a spine stripe, a Title, a dashed rule and a Dateline. A dashed empty card with a plus is the "add" tile.

### Inputs
- **Style:** card fill, 1px Control Edge border, 10px corners, inset well, 48px tall, body text. Placeholder text uses Ink Muted.
- **Focus:** the border turns bordeaux and a 3px Bordeaux Tint ring appears.
- **Error:** Danger border plus a Danger message under the field, never colour alone.

### Navigation
- **Tab bar:** card fill with a top hairline, a line icon over a spaced-caps label. Inactive items use Ink Muted, the active one is bordeaux with a filled icon. No floating bubbles.
- **Top bar:** paper, with a circular back button, the title pill, and one circular action.

### Signature: Tasting instruments
The SAT scales (sweetness, acidity, tannin, alcohol, body, flavour intensity, finish) are drawn as engraved scales: a rule with one tick per SAT step, the step names in spaced caps under it, and a cream knob that snaps to a step. The chosen step fills copper from the left. Nothing is pre-selected, so the knob starts parked off-scale and muted.

The **score** uses the hero dial: a copper-ringed gauge, a big Numeral in the middle, a spaced-caps unit under it, and the chosen **quality** level as the italic Descriptor below the dial ("Very good"). Choices that are not an ordered scale (quality level with its six named steps, condition, development, readiness, BLIC) stay as pills.

### Signature: Engraved illustration
Empty states, the label-scan screen and event covers use single-colour engraved line art (grapes, a glass, a bottle, a vine leaf, a cellar arch, a corkscrew) in ink or copper on paper, with a faint paper texture. These must be original drawings or properly licensed public-domain engravings.

### Signature: Timeline
My Wines and a bottle's history use a vertical dashed rule with circular nodes, a Dateline in Copper Ink ("OCTOBER 2026") and a Title, like the family-stories timeline reference.

## Do's and Don'ts

### Do:
- **Do** keep every screen on warm Paper (#F4ECDF) or Paper Dark (#1A1311).
- **Do** give every scale, score and level an instrument (dial, ticked rule or arc) rather than a bare number or a stock slider.
- **Do** pair every big number with a spaced-caps unit and, where it adds meaning, one italic descriptor.
- **Do** use Ink Muted (#5E4B3F, or #BFAE9A in dark) for all secondary text.
- **Do** test every screen in both light and dark mode and at 130% text size.
- **Do** honour `prefers-reduced-motion`: needles and knobs jump to their value instead of swinging.
- **Do** keep delete controls visible on every item the user created.
- **Do** keep touch targets at 44 by 44 pt or larger.

### Don't:
- **Don't** use pure white, pure black or cool greys.
- **Don't** use more than one bordeaux element of emphasis per area, or more than one Stamp shadow per screen.
- **Don't** set body text, form fields or anything longer than four words in spaced caps or in the display serif.
- **Don't** use emoji as icons; use line icons or engravings.
- **Don't** add the loud parts of the references: big chevron stripes, neon pink, heavy black borders on everything, or busy collage layouts.
- **Don't** copy names, logos, photos or illustrations from the reference images.
- **Don't** let decoration slow down entering a note at the table: a vintage detail that costs a tap is cut.
- **Don't** convey state by colour alone (selected, error, right or wrong on reveal); add a label, an icon or a fill change.
