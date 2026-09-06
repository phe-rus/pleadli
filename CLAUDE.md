# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository is an **unmodified `create-tauri-app` scaffold** (Tauri v2 + React 19 + TypeScript + Vite). Every file is template boilerplate: `src/App.tsx` renders the default Tauri/Vite/React "greet" demo, and `src-tauri/src/lib.rs` exposes only the template's `greet` command. There is no git repository initialized yet, and no application-specific code has been written.

`tauri.conf.json` sets `productName: "pleadli"` and `identifier: "pleadli.com"`, so this scaffold is intended to become the "pleadli" desktop app, but that work hasn't started.

## Commands

- `bun run dev` — start the Vite dev server alone (port 1420, fixed via `strictPort`)
- `bun run tauri dev` — run the actual desktop app (Tauri shell + Vite dev server together); this is what `tauri.conf.json`'s `beforeDevCommand` invokes
- `bun run build` — `tsc` typecheck followed by `vite build` (frontend only)
- `bun run tauri build` — produce the native app bundle (runs the frontend build first, then compiles the Rust/Tauri shell)
- `bun run preview` — preview the built frontend without Tauri

There is no lint or test setup configured yet (no eslint/vitest/etc. in `package.json`).

## Architecture

Two halves, glued by Tauri's IPC bridge:

- **Frontend** (`src/`): a plain Vite + React 19 + TypeScript SPA. Entry point `src/main.tsx` mounts `src/App.tsx`. Calls into Rust via `@tauri-apps/api/core`'s `invoke()`.
- **Native shell** (`src-tauri/`): the Rust/Tauri side. `src/lib.rs` defines `#[tauri::command]` functions and the `tauri::Builder` (plugins, invoke handler); `src/main.rs` just calls `pleadli_lib::run()`. New native capabilities are added as `#[tauri::command]` functions in `lib.rs`, registered in `generate_handler![...]`, and called from the frontend via `invoke("command_name", { args })`.
- `src-tauri/capabilities/default.json` controls which Tauri APIs/plugins the frontend webview is permitted to call — a new plugin or broadened permission needs an entry here, not just a Cargo/npm dependency.
- `src-tauri/tauri.conf.json` wires the two halves together for both dev (`beforeDevCommand`, `devUrl`) and build (`beforeBuildCommand`, `frontendDist`).

Package manager is **bun** (`bun.lock` present); use `bun install`/`bun run`, not npm/yarn.
