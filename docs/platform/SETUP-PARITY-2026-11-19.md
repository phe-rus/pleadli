# Setup parity: where the five apps stand (2026-11-19)

| | DPP | Lawyers | Courts | Police | Prisons |
|---|---|---|---|---|---|
| Setup screens | shared `@pleadli/setup` flow | shared | shared | own wizard (`features/session/onboarding.tsx`) | own wizard (`features/onboarding/*`) |
| Protection choices | none / PIN (6 digits) / password + authenticator | same | same | badge only / password | password / PIN (4 to ?) / badge only |
| Second factor (TOTP) | yes | yes | yes | no | no |
| Session lifetime | lock on sign-out | same | same | idle timeout | idle + absolute lifetime |
| Roles | administrator + app roles | advocate roles | administrator / judicial officer / registrar | officer ranks and roles | permission matrix (`Need::Perm`) |
| Backend gate | 428 SETUP_REQUIRED, 423 LOCKED | same | same | session cookie in the shell | bearer token |

## What is different on purpose
Police and Prisons are not single-office desktops. Police runs a station with many officers and a remote-access page; Prisons runs a facility with a head-office role, workstations and a fine-grained permission matrix tied to custody actions. Their sign-in is part of who may authorise a release or admit a prisoner.

## What a move onto the shared flow would change
1. Police: add the PIN and authenticator levels, keep badge-only as the "none" equivalent. Needs `installation`, `staff`, `active_session` style tables or a mapping onto the officers table, and the 428/423 gate in front of `/api`.
2. Prisons: map password/PIN/badge-only onto none/PIN/full, keep the permission matrix, replace the bearer-token start with the shared sign-in screen, and keep the head-office and workstation steps as `extraSteps`.
3. Both need real-window runs of first setup, sign-in, lock, and every existing test touching sign-in (Police 9, Prisons 150).

## Decision needed from the owner
Whether Police and Prisons should adopt the PIN / password + authenticator vocabulary (a change to how officers sign in), or keep their own models and only share the look. Nothing was changed in code for this.
