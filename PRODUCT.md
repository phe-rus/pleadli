# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pleadli is a family of five purpose-built desktop apps for Uganda's justice system, each used by a different institution's staff, plus one public website.

- **Police**: officers handling operations and investigations (custody, vehicles, shift logs, handovers). A civilian-facing mobile surface is planned.
- **DPP**: prosecutors reviewing police material, deciding charges, preparing indictments and binders.
- **Courts**: judges, magistrates and registrars running sittings, orders, rulings and cause lists.
- **Lawyers**: advocates and firms running a practice (briefs, filings, fees, registers, compliance).
- **Prisons**: prison officers at facilities and at HQ (reception, custody, visits, property, requests and complaints).

Work happens in stations, chambers, courtrooms, offices and prisons, often with weak or no connectivity. Kenya and DRC variants exist, so en, sw and fr are supported.

## Product Purpose

Give each institution its own tool for its own work, the way Microsoft 365 offers separate apps under one roof. They are not stages of one pipeline. Success is a record that is correct, printable, verifiable and safe offline, and that an officer, prosecutor, judge or advocate trusts in front of others.

## Positioning

Offline-first, encrypted local data, and files and papers first: any file in, previewed, then printed, PDF, Word, Excel or sent out, with a verify link on the paper. Pleadli Orchestra handles licence and record backups. It is justice infrastructure, never a generic SaaS or a digital register.

## Operating Context

- Each app is a **Tauri v2** desktop shell around a React 19 + TypeScript + Vite UI, with local SQLite (SQLCipher-encrypted) and a local `/api/**` router. Police and civilian mobile versions are also Tauri; the design language stays web, not native iOS/Android.
- **Pleadli Cloud** (`www/`) is the only plain web surface: TanStack Start on Cloudflare Workers + D1, with BetterAuth, organisation admin, public product pages, and the Orchestra API endpoints (licence, verify, backups).
- Shared libraries: `@pleadli/ui` (design system, oklch palette, light and dark), `@pleadli/forms-tables`, `@pleadli/paper`, `@pleadli/rich-text`.
- Real artefacts of the work: charge sheets, indictments, case files with file reference codes, binders, cause lists, orders, rulings, receipts and seals. Documents are the centre of each app.

## Capabilities and Constraints

- Each app owns its vocabulary. Share the look, never the words; Lawyers must read like a law office.
- Translations are full (en, sw, fr), never scaffolds. German, Chinese and European packs are removed.
- Each app defaults to its Ugandan crest as its logo; the Pleadli mark appears only for other-country installs.
- No em-dashes in copy or UI text.
- Police work must be consistent with `docs/police/PRODUCT.md`.
- Mobile scope and the Police civilian surface are planned, not yet built.

## Brand Commitments

Name: Pleadli. Identity is institutional and Ugandan first. Sidebars are full-height and attached, not floating. Admin visual language follows the saved "Afair" reference screenshots.

## Evidence on Hand

Per-app docs under `docs/` (police, dpp, courts, lawyers, prisons, platform), Apple-pass and review notes, and screenshots in `screenshots/`. No customer testimonials, usage figures or pricing exist; do not invent them.

## Product Principles

1. Design from the real work of each institution, with real conventions and no dead ends.
2. Documents and files come first; fewer fields, better papers.
3. Offline and encrypted by default; sync and backup are deliberate, never assumed.
4. Calm, dense, Apple-level organisation: one primary action, clear placement, smooth behaviour.
5. Ask before load-bearing choices; honest status over polish.

## Accessibility & Inclusion

Three languages (en, sw, fr) in full. Officers work on varied hardware and screens, so legibility, density controls and keyboard use matter.
