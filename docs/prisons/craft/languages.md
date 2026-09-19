# Languages

**Library:** `@inlang/paraglide-js` (compiler-first, Vite plugin, TanStack Router is already tested with it).  
**Locales:** `en` default, then `sw`, `de`, `zh`, `fr`.  
**Surface:** officer-facing chrome, procedures, empty states, settings.  
**Not in v1 catalogs:** full statute text, UPS monthly return layouts, proper names.

English is the working language of UPS paperwork. Swahili covers East Africa when this craft is reused. German, Chinese, and French are for the product family and for officers who need them. They are **not** a German, Chinese, or Francophone prison product. Jurisdiction packs (clocks, instruments, returns) stay a different layer.

## Why Paraglide, not i18next

- Messages compile to typed functions. Missing keys fail the build.
- Tree-shaken. Five locales should not ship five full dictionaries to a step that uses twelve strings.
- Vite-native, same as this app.
- TanStack Start on `www/` can use the same catalogs later. The desktop app does **not** become Start.

Do not add `react-i18next`.

## How locale works on a node

This is Tauri, not a public website. **Do not prefix routes** (`/sw/legal`). Paths stay canonical (`/legal`) so permissions, deep links, and print stay stable.

Store locale in node settings (with appearance). On change, `setLocale(locale, { reload: false })` plus a React subscription so the shell re-renders. `document.documentElement.lang` updates.

If Paraglide’s cookie/url strategies fight the desktop shell, use the cookie or custom strategy pointed at that setting. Pick this in `/architect languages` before coding; the recommendation is **settings-backed, no URL rewrite**.

## Catalog layout

```
apps/prisons/project.inlang/settings.json
apps/prisons/messages/en.json
apps/prisons/messages/sw.json
apps/prisons/messages/de.json
apps/prisons/messages/zh.json
apps/prisons/messages/fr.json
```

Keys named by area, not by screen soup:

`today.held_now`, `procedure.reception.title`, `legal.tab.diary`, `file.flag.documents_pending`

Use ICU plurals for counts. Use Paraglide datetime/number formatters instead of hard-coded `date-fns` locale when the string is officer-facing. Keep `date-fns` for input parsing until that is replaced deliberately.

## What translators may change

Labels, buttons, empty states, help one-liners.

## What they may not silently change

- Prisoner category values stored in SQLite (`convicted`, `unconvicted`, `civil`). Translate **display** only.
- Permission names.
- API paths.
- Act section numbers in stored records. Display can add a local gloss.

## Uganda first

Ship complete `en`. Other locales may lag; missing keys must fall back to English, never to a raw key. Swahili is the second complete catalog when East Africa is in view.

s.58(5) disclosure to the prisoner (rules of their category) is a **generated document** problem, not a chrome string. Vernacular for that document is [[../product-map/06-research-backlog]] R-33, after field work.

## Stage

[[../PLAN]] stage 4. After route/feature moves so we are not translating strings that will be deleted.
