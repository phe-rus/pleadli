# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pleadli is a **monorepo** for Uganda's justice system platform — a family of purpose-built applications for Police, DPP, Courts, Lawyers, and Prisons. The platform has two surfaces:

- **Pleadli Cloud** (`www/`) — TanStack Start web app on Cloudflare Workers + D1. Multi-tenant admin platform with BetterAuth (email+password), organization management, and institution templates.
- **Pleadli Police** (`apps/police/`) — Tauri v2 desktop app for individual police officers. Offline-first, local SQLite, no sign-in required. Uses TanStack Router.

Shared component libraries live in `packages/`:
- `packages/ui` (`@pleadli/ui`) — 20-component design system (Button, Card, Input, Dialog, Sidebar/Dashboard, etc.) with oklch color palette and light/dark themes.
- `packages/forms-tables` (`@pleadli/forms-tables`) — DataTable with sorting, filtering, pagination, row selection, bulk actions.

## Monorepo structure

```
pleadli/                          # Root (Turborepo + Bun workspaces)
├── apps/
│   └── police/                   # Tauri v2 desktop app ("Pleadli Police")
├── packages/
│   ├── ui/                       # @pleadli/ui — shared component library
│   └── forms-tables/             # @pleadli/forms-tables — shared data table primitives
├── www/                          # TanStack Start web app (Cloudflare Workers + D1)
├── screenshots/                  # Design screenshots
├── turbo.json                    # Turborepo task definitions
└── package.json                  # Workspace root
```

## Commands

**Root level (from monorepo root):**
- `bun run dev` — start the Turborepo dev pipeline
- `bun run build` — build all packages

**www (Cloud):**
- `bun run dev` — Vite dev server on port 3000
- `bun run build` — production build
- `bun run deploy` — build + wrangler deploy
- `bun run check` — TypeScript typecheck
- `bun run db:gen` — generate Drizzle migrations
- `bun run db:local` — apply migrations to local D1
- `bun run db:remote` — apply migrations to remote D1
- `bun run auth:gen` — regenerate auth schema from BetterAuth config

**apps/police (Desktop):**
- `bun run dev` — Vite dev server (port 3001)
- `bun run tauri dev` — run desktop app (Tauri + Vite)
- `bun run build` — TypeScript + Vite build
- `bun run tauri build` — produce native app bundle

## Architecture

### www (Cloud)

TanStack Start on Cloudflare Workers + D1. Uses BetterAuth for auth with the built-in `organization` plugin for multi-tenant org management.

- **Auth**: BetterAuth with email+password, admin plugin, organization plugin (teams enabled for org units)
- **Database**: Drizzle ORM on D1 (SQLite). Schema at `www/src/db/auth-schema.ts`
- **Routing**: TanStack Router with file-based routes. Route groups: `_public`, `_authentication`, `_protected/admin`
- **Server functions**: TanStack Start `createServerFn` with middleware (AdminMiddleware, SessionMiddleware)

### apps/police (Desktop)

Tauri v2 + React 19 + TypeScript + Vite. Offline-first, local SQLite via `@tauri-apps/plugin-sql`.

- **Product**: Pleadli Police is a police operations and investigation platform — *not* a digital register, case-entry CRUD app, or notebook. Its canonical product definition is `docs/police/PRODUCT.md`.
- **IMPORTANT**: Every Pleadli Police feature, UX, architecture, navigation, or data-model decision MUST be consistent with `docs/police/PRODUCT.md` before it is implemented. The sidebar is a starting navigation, not the product definition.
- **Routing**: TanStack Router (file-based, auto code splitting)
- **Database**: Local SQLite via Tauri plugin-sql
- **Shared UI**: Consumes `@pleadli/ui` and `@pleadli/forms-tables` from workspace packages

## Key conventions

- Package manager is **bun** — use `bun install`/`bun run`, not npm/yarn
- The `@pleadli/ui` package provides the design system — import components from `@pleadli/ui/button`, `@pleadli/ui/card`, etc.
- BetterAuth custom plugin endpoints live at `/pleadli/*` path prefix
- Institution types: `police`, `dpp`, `courts`, `prisons`, `lawyers`
- The `institutionType` field on organizations is stored via BetterAuth's `additionalFields` on the organization plugin
