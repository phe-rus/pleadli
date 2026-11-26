---
name: Pleadli
description: A calm, paper-minded workspace shared by five justice-system apps, one neutral base and one accent per institution.
colors:
  page-grey: "oklch(0.982 0.003 255)"
  sheet-white: "oklch(1 0 0)"
  ink: "oklch(0.21 0.015 260)"
  ink-soft: "oklch(0.25 0.015 260)"
  ink-muted: "oklch(0.5 0.018 258)"
  wash: "oklch(0.955 0.006 255)"
  hairline: "oklch(0.915 0.006 255)"
  field-edge: "oklch(0.88 0.008 255)"
  seal-red: "oklch(0.577 0.215 27.3)"
  accent-police: "oklch(0.511 0.096 186.391)"
  accent-dpp-courts: "oklch(0.852 0.199 91.936)"
  accent-lawyers: "oklch(0.379 0.146 265.522)"
  night-page: "oklch(0.17 0.008 260)"
  night-sheet: "oklch(0.215 0.01 260)"
  night-ink: "oklch(0.96 0.004 255)"
typography:
  page-title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: "2.125rem"
    letterSpacing: "-0.022em"
  section-title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: "1.5rem"
    letterSpacing: "-0.01em"
  group-title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 550
    lineHeight: 1.625
  caption:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.1rem"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  unit: "4px"
  card: "16px"
  card-sm: "12px"
  control-px: "14px"
components:
  button-primary:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-destructive:
    textColor: "{colors.seal-red}"
    rounded: "{rounded.md}"
    height: "36px"
  card:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  data-table-head:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink-muted}"
    height: "40px"
---

# Design System: Pleadli

## Overview

**Creative North Star: "The Clerk's Desk"**

Pleadli looks like a well-kept desk in a registry office: a quiet cool-grey surface, with the work laid on it as white sheets. Cards, tables, panels and forms are the sheets; the page around them recedes. The papers a user produces (charge sheets, orders, binders) are the hero, so the chrome is deliberately plain, exact and unhurried.

The five apps (Police, DPP, Courts, Lawyers, Prisons) share this base completely. What differs is one accent per institution, used sparingly on primary actions, focus and the active nav item. Density is a setting, not a style: the library ships a compact scale and the workspace look relaxes it to comfortable defaults. The feel is Apple-level orderliness (large tight page titles, small quiet group titles, one primary action per view) applied to institutional work.

**Key Characteristics:**
- Cool-grey page, white lifted sheets, crisp neutral ink
- One accent per institution, never two on one screen
- Inter throughout; papers switch to serif on their own sheet
- 12px sheet radius, soft layered shadows, hairline borders
- Full-height attached sidebar, with a rounded window frame and glass capsules in the toolbar
- Light and dark themes with identical structure

## Colors

A near-neutral cool palette (hue 255 to 260, chroma under 0.02) where the only saturated colour is the institution's accent and the seal-red of destructive actions. Values come from `packages/ui/src/styles/workspace.css`, which is the live look. The warm cream and amber palette in `globals.css` is the library base that workspace.css overrides; treat it as legacy.

### Primary (per institution)
- **Registry Teal** (oklch(0.511 0.096 186.391)): Police primary, focus ring and active nav.
- **Court Amber** (oklch(0.852 0.199 91.936)): DPP and Courts primary. Takes dark ink for text, never white.
- **Counsel Indigo** (oklch(0.379 0.146 265.522)): Lawyers primary.
- **Prison Maroon** (oklch(0.43 0.115 18)): Prisons primary, a calm maroon kept apart from the urgent red of destructive actions.

### Secondary
- **Seal Red** (oklch(0.577 0.215 27.3)): destructive actions and invalid fields only, shown as a tinted fill, not a solid block.

### Neutral
- **Page Grey** (oklch(0.982 0.003 255)): the desk. App background and sidebar.
- **Sheet White** (oklch(1 0 0)): cards, tables, inputs, popovers, drawers.
- **Ink** (oklch(0.21 0.015 260)): primary text.
- **Ink Muted** (oklch(0.5 0.018 258)): descriptions, group titles, table heads.
- **Wash** (oklch(0.955 0.006 255)): secondary buttons, muted fills, accent hover.
- **Hairline** (oklch(0.915 0.006 255)): borders and dividers.
- **Field Edge** (oklch(0.88 0.008 255)): input borders.
- **Night Page / Night Sheet / Night Ink** (oklch(0.17 0.008 260) / oklch(0.215 0.01 260) / oklch(0.96 0.004 255)): the dark theme equivalents; borders become white at 9% alpha.

### Named Rules
**The One Accent Rule.** A screen carries its institution's accent on the primary action, focus ring and active nav, and nowhere else. Charts are the only place extra hues appear.

**The Sheet Rule.** What the user works on sits on Sheet White over Page Grey. Never put a white card on white, and never tint the page to make a card stand out.

## Typography

**Display, Body and Label Font:** Inter Variable (with Inter, system-ui, sans-serif)
**Mono:** system monospace stack, for codes and references
**Paper Font:** serif, scoped to `.paper`, so documents follow the sheet and not the app

**Character:** One humanist sans at a few precise sizes. Authority comes from weight and spacing, not from a second typeface.

### Hierarchy
- **Page title** (700, 1.75rem, 2.125rem, -0.022em): once per page, large and tight.
- **Section title** (650, 1.0625rem, 1.5rem, -0.01em): a step above body.
- **Group title** (600, 0.8125rem, 1.25rem): small and quiet above a group, in Ink Muted.
- **Body** (400, 0.875rem, 1.625): all content and controls.
- **Label** (550, 0.875rem): buttons and field labels.
- **Caption** (400, 0.75rem, 1.1rem): footers, hints, meta.

Content markup carries no inline size or weight; type is set once through semantic tags and `typeset`. Long reading text caps at 65 to 75ch.

### Named Rules
**The Semantic Type Rule.** Sizes and weights come from tags and slots (`h1`, `data-slot="group-title"`), never from classes on content. Only toolbar and chrome may set their own.

**The Numerals Rule.** Tables and codes use tabular numerals; file reference codes read in mono.

## Layout

A 4px base unit. The shell is a full-height attached sidebar (16rem, collapsible with a 320ms ease) beside a centre column, inside a single rounded window frame (12px) inset 6px. Settings is a 14rem nav beside a section column from the md breakpoint (stacked below it). Side panels share one geometry. Pages use a centred container with 1.5rem gutters, widening to 2rem and a 1440px cap on large screens.

Density is driven by variables: `--ui-text`, `--table-text`, `--control-h`, `--control-h-sm`, `--control-h-lg`, `--control-px`. The library default is compact (28px controls, 12px text); the workspace look sets 36px controls and 14px text. An app may override these on its own `:root`.

Mobile (Tauri mobile for Police and civilians) keeps the same tokens and collapses the sidebar to the sheet; layout never depends on hover.

## Elevation & Depth

Hybrid: tonal layering first, soft shadow second. Page Grey to Sheet White carries most of the depth; shadows are small, cool-tinted (oklch 0.3 0.02 260) and layered in two parts.

### Shadow Vocabulary
- **Resting sheet** (`0 1px 2px oklch(0.3 0.02 260 / 0.05), 0 1px 3px oklch(0.3 0.02 260 / 0.06)`): cards, table frames.
- **Field** (`0 1px 2px oklch(0.3 0.02 260 / 0.05)`): inputs, selects.
- **Raised** (`0 2px 4px … / 0.04, 0 4px 12px … / 0.07`): menus and popovers.
- **Floating** (`0 4px 8px … / 0.04, 0 12px 32px … / 0.1`): dialogs, language selector.
- **Glass** (blur 20px, saturate 1.5, 1px inset edge): toolbar capsules and the floating language surface only.

### Named Rules
**The Attached Sidebar Rule.** The sidebar is full height and attached on its own grey. It never floats; floating glass is reserved for toolbar capsules.

**The Visible Focus Rule.** Every row, tab and footer control in the shell takes a 2px focus-visible ring; nothing interactive is focusable without one.

## Shapes

Soft but not playful. Sheets use 12px, controls 10px, small chips 8px, panels and popovers 16px. Capsules and the language trigger are full pills. Borders are 1px hairlines or a 10% foreground ring; there are no thick outlines except the 2px focus ring.

## Components

### Buttons
- **Shape:** 10px radius, 36px high by default (28px compact), 32px small, 40px large.
- **Primary:** institution accent fill, label weight 550. Hover dims to 80%.
- **Secondary:** Wash fill, Ink text.
- **Outline / Ghost:** hairline border or no border, Wash on hover.
- **Destructive:** a tinted Seal Red fill (10%) with red text, never solid red.
- **Focus:** 2px ring in the accent at 30%; pressed state shifts down 1px.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Sheet White, 1px ring at 10% foreground plus the resting shadow.
- **Internal Padding:** 16px, or 12px in the small size.

### Inputs / Fields
- **Style:** Sheet White fill, Field Edge border, 10px radius, 36px high, subtle Field shadow.
- **Focus:** border and 2px accent ring at 30%.
- **Error:** Seal Red border with a 20% ring. **Disabled:** 50% opacity.

### Data Table
Sits in a framed Sheet White container (12px, hairline, resting shadow). Header row is 40px on a muted wash with Ink Muted 500 text; rows have 10px vertical padding and 70% hairline dividers. Numerals are tabular.

### Navigation
Full-height Page Grey sidebar with folding groups (11px, 600, Ink Muted group titles; fold arrow only on hover). Rows are 30px high, 13px text, 8px radius. The row in view is a soft accent tint (accent at 12%) with the icon in the accent and Ink text at weight 500; other rows are sidebar ink with a 5% foreground wash on hover. A trailing count is quiet tabular Ink Muted and turns into a solid red pill with white text only when something is overdue. DPP rows read Overview, Incoming, Case files, Office diary, Office registry. The footer (person, language, settings, sign out) sits under a 1px hairline at 50% and its controls carry the same 2px focus ring at 50% of the ring colour as the rows. The toolbar groups related controls in one glass capsule.

### Record tabs (signature)
A record's parts sit in a tab row under a 40% hairline: 36px high, 13px text, Ink Muted until selected, then Ink at weight 500 with a 2px accent underline inset 8px each side. A count rides on the tab as a Wash pill (11px, tabular). The DPP file page reads Document detail, The file, People, History, Related documents (counted). Every tab takes the 2px focus ring.

### Settings
Two columns from the md breakpoint: a 14rem nav of grouped links with a "Find a setting" search field at the top, and the section beside it. The current section is a solid accent pill with accent-foreground text and icon. Who does what is a hairline-ruled grid (60% hairline row dividers, no frame): capability and hint on the left, one checkbox column per role, column heads in 12px Ink Muted.

### Lists with several owners
Case files rows carry focus rings, and when a file owes more than one thing the row names the first and adds a quiet 12px "and N more" line beneath it.

### Paper (signature)
Documents render as serif sheets inside `.paper`, with headings following the paper's face. They print, export and carry a verify link, and the surrounding UI never imitates them.

## Do's and Don'ts

### Do:
- **Do** lay content on Sheet White over Page Grey, with the 12px radius and resting shadow.
- **Do** use the institution's accent once per view: primary action, focus, active nav.
- **Do** keep one primary action per view and put the rest in a + menu or a segmented control.
- **Do** build every list as a DataTable with a comprehensive set of fields.
- **Do** set type through semantic tags and slots.
- **Do** design for light and dark with the same structure.

### Don't:
- **Don't** float the sidebar or add glass outside toolbar capsules.
- **Don't** use a second accent colour or gradient text on a screen.
- **Don't** put inline text size or weight on content markup.
- **Don't** use em-dashes in copy.
- **Don't** make it look like a generic SaaS dashboard: no hero metrics, no decorative gradients, no emoji badges.
- **Don't** use the legacy cream and amber palette from `globals.css`.
