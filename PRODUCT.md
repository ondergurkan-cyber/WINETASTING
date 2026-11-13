# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable PWA used on iPhone and iPad (Safari, "Add to Home Screen"). Mobile web, so `web`, but it should feel at home next to native iOS apps.

## Stack

Existing codebase: plain HTML, CSS and JavaScript, no build step, IndexedDB for storage, hosted on GitHub Pages.

## Users

Wine enthusiasts and wine students who taste seriously: people preparing for or holding WSET qualifications, tasting groups that meet for themed or blind events, and people who keep a cellar. They use the app with a glass in one hand, at a table, a class, a restaurant or a tasting event, often in dim or warm light.

## Product Purpose

A personal wine assistant. The tasting module (first and most developed) records tastings with the WSET Systematic Approach to Tasting at Level 2, Level 3 or Diploma (Level 4), alone or in events. Success means a tasting note that is quick to enter at the table, faithful to the official SAT, and useful later for learning, comparing and remembering.

## Positioning

Built around the official WSET SAT fields per level rather than a generic star rating, with blind-tasting events, standings and a guess helper. Other methods (for example Beyond Flavour) plug in later.

## Operating Context

- Events: name, date, place, blind mode, wines in tasting order, standings, notes and media.
- Single tastings ("My Wines") outside events, grouped by date, with place and optional location.
- AI label scan from a photo (user's own API key, stored on device).
- Cellar (bottles owned, drinking windows) and Merchants (where wines are bought).

## Capabilities and Constraints

- Each WSET level shows only its official SAT fields. Beyond Flavour extras sit behind an "Advanced" switch, off by default.
- Everything the user enters (events, wines, tastings, bottles, merchants) must be deletable with a visible delete control.
- Nothing in a tasting is pre-filled.
- Mode names: "Quick" and "Full SAT".
- Data lives on the device; sync between devices is not built yet.
- The WSET SAT is copyrighted: fine for personal use, needs permission if published.
- App name is not decided yet ("Tasting" is a working title).

## Brand Commitments

- Visual direction chosen by the owner on 2026-11-13: elegant retro-vintage quality. References and rules live in DESIGN.md.
- No third-party brand names, logos or assets from the reference images may appear in the product.

## Evidence on Hand

- Official SAT PDFs for L2, L3 and L4 in the project library.
- Tasting books (Beyond Flavour and others) in the project library.
- No testimonials, ratings or user numbers exist; do not invent them.

## Product Principles

1. Fast at the table: one-handed, few taps, nothing pre-filled.
2. Faithful to the method: the official SAT fields for the chosen level, extras only on request.
3. The user owns their data: everything is editable and deletable.
4. A cellar book, not a dashboard: notes are kept and revisited like an archive.

## Accessibility & Inclusion

- Text meets WCAG 2.2 AA contrast (4.5:1 body, 3:1 large text and UI boundaries) in both light and dark mode.
- Respect iOS Dynamic Type sizes where possible, `prefers-reduced-motion`, and `prefers-color-scheme`.
- Touch targets at least 44 by 44 pt.
