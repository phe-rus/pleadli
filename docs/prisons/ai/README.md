# Intelligence

AI is a **later seam** ([[../PLAN]] stage 8). The app must be able to take it without a rewrite. It must not require it to operate a prison.

P6 still holds: work before record. A model may help find, draft, or check. It may not authorise discharge, verify a warrant, or attest a return.

## Why TanStack AI

The renderer already uses Router, Query, and Form. TanStack AI is the same family:

- `chat()` + typed `toolDefinition()` / `.server()`
- Runtime context (session, actor, node db access **through domain functions**)
- Persistence (`@tanstack/ai-persistence`) on our SQLite, not a vendor store
- **BYOK** (`defineByokProvider`, `getByokKey`): officer pastes their own provider key, or later a Pleadli account token
- Adapters per provider. We do not vendor-lock the UI to one SDK

Do not add the Vercel AI SDK, LangChain, or a Python sidecar.

The node is Rust. Tools that mutate custody run in Rust as today. The AI loop can live in the Tauri/debug HTTP `/api/**` layer (TypeScript) **or** call Rust. Recommendation: TypeScript `chat()` in the node API process that already serves `/api/**`, tools as thin HTTP-equivalent calls into existing domain functions, so permissions and audit stay one path.

If the desktop has no Node AI runtime you want to trust, keep `chat()` behind `/api/system/ai/**` on the same Axum router via a small embedded worker, or delay until that host is designed in `/architect intelligence seam`. Do not put provider keys in the webview.

## Ways to turn it on (product)

1. **Off** (default). No keys, no threads, no tools.
2. **Own key (BYOK).** OIC pastes a provider key into the node. Stored with other secrets (Stage 1 safety: not plaintext).
3. **Pleadli account / subscription.** Later. Token from Cloud, same tool surface. Cross-border DPPA rules apply; this is an adoption gate, not a toggle for a pilot.

Auto-subscription is Cloud’s problem. The node only stores “use account” vs “use key” vs “off”.

## What the model is allowed to do

Tools wrap **existing** capabilities:

- Search (the same search the palette uses)
- Read a prisoner file the actor may already read
- List Today obligations
- Draft a request outcome note or a VJ extract *for an officer to accept*
- Explain why discharge is blocked (gates already computed)

## What it is never allowed to do

- Write custody, release, or transfer without the same gates as the UI
- Bypass `P12` (node authorisation)
- Send the whole vault to a provider “for context”
- Run when the actor is `facility_admin` with no record permission
- Hide prompts or completions from audit

Every tool call is an attributed audit row: actor, tool name, ids touched, not the full prompt if policy forbids storing prisoner text off-box.

## Persistence

Threads live on the node. `loadThread` / `saveThread` against SQLite. Backup already encrypts the database once Stage 1 safety is done. HQ does not sync threads in v1.

## UI

When enabled: palette action “Ask” and a quiet pane on Today or the file. Same Obsidian feel: a note beside the work, not a chatbot home screen.

## Data protection

Uganda DPPA: purpose limitation, security, cross-border (s.19). A cloud model is a transfer. BYOK to a foreign API is still a transfer. The OIC enables it knowingly. Default off is the only honest pilot default.

Mandela r6: the file stays attributable. A model suggestion is not an official entry until an officer accepts it.

## Stage gate

Do not start this until [[ARCHITECTURE]] (code) is done (so tools have one API) and [[LOCALIZATION]] (languages) at least has English catalogs (so the pane is not a third string system).
