# Code craft

**Priority:** first among implementation stages ([[../PLAN]] stage 1).  
**App:** `apps/prisons/`

Professional code here means: an officer’s job is easy to find, a route file is a door not a room, and we do not add a library TanStack already is.

## TanStack, and nothing beside it

| Job | Use | Do not add |
|---|---|---|
| Routes, loaders, typed links, search params | `@tanstack/react-router` (already) | React Router, extra layout frameworks |
| Server state, loaders + cache | `@tanstack/react-query` (already) | SWR, Zustand-for-server |
| Forms | `@tanstack/react-form` (already) | Formik, react-hook-form |
| Tables | `@pleadli/forms-tables` (TanStack Table underneath) | Another grid |
| AI (stage 8) | `@tanstack/ai` + persistence + BYOK | Vercel AI SDK, LangChain in the UI |
| Cloud www only | TanStack Start, already on `www/` | Start inside the Tauri app |

**Local truth stays Rust + sqlx SQLite on the node.** TanStack DB is a client collection layer. This app already has an authoritative node. Do not put a second database in the renderer.

Query talks to `/api/**`. Router owns the URL. Form owns input. AI, when it exists, calls the same API as tools ([[AI]], deep detail in `ai/README`).

## What a route file may contain

A file under `src/routes/` is a **path**. It may contain:

1. `export const Route = createFileRoute(...)` with `loader`, `validateSearch`, `beforeLoad` as needed.
2. One `RouteComponent` (name it `RootComponent` only on `__root.tsx`).
3. Imports.

It may not contain: tables, forms, helper components, CSV builders, step machines, extra `function` declarations, or feature-level types.

`beforeLoad` on `_public/route.tsx` stays: that is route policy, not page UI.

Good:

```tsx
export const Route = createFileRoute('/_public/legal/')({
  loader: async ({ context }) => { /* prefetch */ },
  component: RouteComponent,
})

function RouteComponent() {
  return <LegalWorkspace />
}
```

`LegalWorkspace` lives in `src/features/legal/`.

Today this is already true for reception, movements, and search. It is false for home, facilities, officers, reports, settings, transfer, and arrival.

## Where the rest lives

```
src/
  routes/            doors only
  features/
    <area>/
      index.ts       public exports
      schema.ts      zod
      data.ts        api calls
      queries.ts     query options and mutations
      <area>-workspace.tsx   page body
      ui/            pieces used only here
  components/        chrome used in more than one area
    procedure/       ProcedureShell
    command-menu.tsx
  hooks/             rare; prefer queries.ts
  lib/               api client, datetime, exchange files
  data/              navigationItems (route table, not UI)
```

### Nesting (not a flat `features/` dump)

Group by **work**, which already matches the IA in [[product/08-application-structure]]:

| Folder | Owns |
|---|---|
| `today/` | Facility home, HQ estate home |
| `population/` | Roster. Prisoner file may stay `custody/file/` or `population/file/` |
| `legal/` | Diary, thresholds, s.118, instruments list |
| `movements/` | Boards plus transfer / arrival / receive procedures |
| `reception/` | Reception procedure |
| `release/` | Discharge procedure |
| `care/` | Visits, requests, health, programmes as one area |
| `returns/` | Reports today, attested returns later |
| `network/` | Facilities, pairing, sync status |
| `facility/` | Profile, officers, settings, node, numbering |
| `search/` | Search |
| `session/` | Sign-in, permissions |

Do not keep `programme-participations` as a top-level peer of `today` once care exists. Re-export from `care/programmes` so old imports can move in one PR.

Rust mirrors work where it is cheap (`domain/legal.rs` already exists). Do not rename migrations.

## Components

- `src/components/` is **shared chrome**: shell, gates, procedure, command menu, photo capture, charts used in more than one feature.
- Feature-only widgets stay next to that feature (`features/visits/visit-board.tsx`).
- Name files after the thing: `create-panel.tsx` exports `CreatePanel`, not `Createpanel`.
- No `icon: any`. Use the Hugeicons type the design system already has.

## Smoothness without complexity

- One motion language: the existing `ProcedureShell` and onboarding springs. Reuse them. Do not add a second animation library (Framer Motion is enough).
- Prefer CSS transitions on color and opacity for lists. Reserve layout animation for panels and procedures.
- Interruptible. An officer can click away.
- The task graph is: **know → act → proof**. Extra steps are a bug.

## Naming

- Paths stay English and stable (`/legal`, `/procedures/reception`). Locale does not rewrite paths ([[LOCALIZATION]]).
- Domain language in code: `prisoner`, `stay`, `instrument`, `obligation`. Not `inmate` unless quoting a source.
- Comments cite the product map or the Act when they encode a rule. They do not narrate the file.

## Tests

Keep tests next to the node (`src-tauri`) for permissions, audit, backup. Frontend e2e stays the data-layer script until Stage 1 settles file names.

## Definition of clean (PR checklist)

- Route file: Route + RouteComponent only.
- New UI: feature folder or `components/`, never invented in the route.
- No new package if Query, Router, Form, or AI already covers it.
- No `window.confirm` for dirty forms.
- No secrets in the renderer.
- Behaviour unchanged unless the PR is a later stage.
