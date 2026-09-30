# Verify: app lock · spec 0001 · updated 2026-09-22
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open Settings, the App lock card shows "Off" → AC-9
- [ ] Set a PIN (6+ characters) and confirm it, click Turn on → a recovery code dialog appears; the Done button stays disabled until "I have saved this recovery code" is checked → AC-1, AC-8
- [ ] Restart the app → the lock screen appears immediately, before any matter or client is visible → AC-2
- [ ] Enter a wrong PIN three times → the fourth attempt shows a "Wait Ns" cooldown and the Unlock button disables → AC-6
- [ ] Enter the correct PIN → the app unlocks and the real matters render → AC-2
- [ ] Leave the app idle (no mouse or keyboard activity) for five minutes → it relocks itself without any action → AC-3
- [ ] Switch to another window for ten or more seconds, then return → the lock screen is showing → AC-4
- [ ] From the lock screen, click "Forgot your PIN?", enter the recovery code from setup and a new PIN → a freshly issued recovery code is shown once, then "Continue to unlock" leads back to the PIN screen → AC-8
- [ ] With the lock on, in Settings click "Lock now" → the app relocks immediately, no waiting → AC-1
- [ ] In Settings, enter the current PIN and click "Turn off" → the card shows "Off" again, and restarting the app no longer shows a lock screen → AC-7
- [ ] After turning the lock off, Settings shows no reminder or nag elsewhere in the app → AC-9

## Commands
- [ ] `curl -X POST http://127.0.0.1:47924/api/lock/setup -d '{"pin":"correct horse battery"}'` → 200, a `recoveryCode` field in the body → AC-1, AC-8
- [ ] `curl -X POST http://127.0.0.1:47924/api/lock/lock` then `curl http://127.0.0.1:47924/api/clients` → the second call returns 423 with `{"code":"LOCKED"}` → AC-5
- [ ] `curl -X POST http://127.0.0.1:47924/api/lock/unlock -d '{"pin":"wrong"}'` four times in a row → the later attempts return `{"code":"COOLDOWN"}` with a wait time in the message → AC-6
- [ ] Stop the app, restart the headless server against the same data directory, repeat the cooldown attempt → the cooldown is still in effect → AC-6
- [ ] `cd apps/lawyers/src-tauri && cargo test` → all pass, including `domain::lock::tests::*` and `api::tests::a_locked_app_refuses_ordinary_routes_but_not_lock_routes_or_system_status` → AC-1 through AC-8
- [ ] `cd apps/lawyers && bun run check` → clean

## Acceptance-criteria coverage
- AC-1 … the Settings setup/skip steps, and the `/lock/setup` command
- AC-2 … the restart-shows-lock-screen step, and the `/lock/unlock` command
- AC-3 … the five minute idle step
- AC-4 … the ten second focus loss step
- AC-5 … the direct curl-while-locked step
- AC-6 … the repeated wrong PIN steps, both UI and command, including the restart-persists-cooldown check
- AC-7 … the turn off step
- AC-8 … the recovery flow steps, UI and command
- AC-9 … the honest on/off state and no-reminder-elsewhere steps
- AC-10 … not independently observable by a manual or command step (it is about what never appears: a plaintext secret in a log, an error, or a `Debug` output); covered by the hand written `Debug` implementations already in `domain/lock.rs`, confirm by code review rather than a run time check
