# Scope: Pleadli Prisons (apps/prisons)

The Tauri desktop app for Uganda's prisons service: admission and prisoner custody, releases, transfers, court production and remand, health and welfare, visits, property, rehabilitation, and complaints. Same offline first Rust/sqlx + no SQL over IPC architecture as Police and DPP. Canonical product model in `docs/prisons/PRODUCT.md`.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default).

This workspace is fully caught up with its own product doc: everything `docs/prisons/PRODUCT.md` calls for building is built, and everything it explicitly says not to build (disciplinary records, headcounts, staff duty and roster, general incidents, facility hierarchy, general appointments and attendance) is correctly absent. There is no planned next slice right now. `docs/prisons/PRODUCT.md` §10 records two open product questions worth resolving before they matter: how `admission_instrument_type` should represent "convicted, document pending," and how reliable national ID based cross episode search really is. These are decisions, not missing code, so they aren't scope rows. Raise them with `/architect` directly if and when they become load bearing.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Prisoners (admission/custody/status) | Existing | existing |
| 2 | Releases | Existing | existing |
| 3 | Transfers | Existing | existing |
| 4 | Court Productions | Existing | existing |
| 5 | Remand (s.118 list) | Existing | existing |
| 6 | Health & Welfare | Existing | existing |
| 7 | Visits | Existing | existing |
| 8 | Property & Effects | Existing | existing |
| 9 | Rehabilitation & Work | Existing | existing |
| 10 | Communication & Requests | Existing | existing |
| 11 | Documents / Attachments | Existing | existing |
| 12 | Reports | Existing | existing |
| 13 | Search | Existing | existing |
| 14 | Overview | Existing | existing |

## Existing

### 1. Prisoners (admission/custody/status) · existing
Full CRUD plus admission fields; the core workspace everything else attaches to. code in `apps/prisons/src/features/prisoners/`, `apps/prisons/src-tauri/src/domain/prisoners.rs`

### 2. Releases · existing
Wired into the prisoner workspace. code in `apps/prisons/src/features/releases/`, `apps/prisons/src-tauri/src/domain/releases.rs`

### 3. Transfers · existing
Wired into the prisoner workspace. code in `apps/prisons/src/features/transfers/`, `apps/prisons/src-tauri/src/domain/transfers.rs`

### 4. Court Productions · existing
Includes a physical/virtual production method field and select. code in `apps/prisons/src/features/court-productions/`, `apps/prisons/src-tauri/src/domain/court_productions.rs`

### 5. Remand (s.118 list) · existing
Own dedicated route, sharing nav with Court Production. code in `apps/prisons/src/routes/_public/remand/`

### 6. Health & Welfare · existing
Referral/return event pairs, wired into the prisoner workspace. code in `apps/prisons/src/features/health-events/`, `apps/prisons/src-tauri/src/domain/health_events.rs`

### 7. Visits · existing
All 6 visit categories, including a split personal doctor / voluntary visitor / special authorization set. code in `apps/prisons/src/features/visits/`, `apps/prisons/src-tauri/src/domain/visits.rs`

### 8. Property & Effects · existing
Admission time record plus a returned marker. code in `apps/prisons/src/features/property-records/`, `apps/prisons/src-tauri/src/domain/property_records.rs`

### 9. Rehabilitation & Work · existing
Includes programme completion and certificate reference fields. code in `apps/prisons/src/features/programme-participations/`, `apps/prisons/src-tauri/src/domain/programmes.rs`

### 10. Communication & Requests · existing
Complaint log with category, description, outcome, and resolved_at, nullable prisoner reference for anonymity. code in `apps/prisons/src/features/requests/`, `apps/prisons/src-tauri/src/domain/requests.rs`

### 11. Documents / Attachments · existing
Generic attachment/vault mechanism used across the domains above. code in `apps/prisons/src/features/attachments/`, `apps/prisons/src-tauri/src/domain/attachments.rs`

### 12. Reports · existing
code in `apps/prisons/src/features/reports/`, `apps/prisons/src-tauri/src/domain/reports.rs`

### 13. Search · existing
code in `apps/prisons/src/features/search/`, `apps/prisons/src-tauri/src/domain/search.rs`

### 14. Overview · existing
code in `apps/prisons/src/routes/_public/index.tsx`

## Legend
See `docs/scope/index.md` for the shared legend.
