# Scope: Pleadli Cloud (www)

The multi tenant admin platform for the whole Pleadli family: BetterAuth sign in, organization (institution) management, institution templates, an admin dashboard, and the public marketing/docs site. TanStack Start on Cloudflare Workers + D1.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default, since this platform provisions and administers institutions across the whole justice system product family).

`www/AGENTS.md` is currently just an auto generated tool listing with no authored conventions, see `_root/scope.md` feature 4. Run `/audit` before deep work here if you want real captured context first.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Auth (email + password) | Existing | existing |
| 2 | Organization management | Existing | existing |
| 3 | Admin dashboard & users | Existing | existing |
| 4 | Public marketing site | Existing | existing |
| 5 | Docs site (`/docs/applications` etc) | Existing | existing |
| 6 | Institution templates (backend) | Existing | existing |
| 7 | Institution template editor UI | Next slice | in-progress |

## Existing

### 1. Auth (email + password) · existing
BetterAuth with `drizzleAdapter`, `admin` + `bearer` plugins, first signup becomes admin. Login, create account, forgot account routes; `/api/auth/$` catch all. code in `www/src/auth/`, `www/src/routes/_authentication/`

### 2. Organization management · existing
Full server function surface for organizations, org units, entitlements, and memberships, all `AdminMiddleware` gated. code in `www/src/functions/org.func.ts`, `www/src/db/auth-schema.ts`

### 3. Admin dashboard & users · existing
Overview stats (org/template/user counts, org by type breakdown), user list with ban/unban/impersonate/set role/remove/revoke sessions. code in `www/src/routes/_protected/admin/index.tsx`, `users.tsx`, `www/src/functions/admin.func.ts`

### 4. Public marketing site · existing
Home page with trust points, stats, problem statements, scaling model; `/about`. code in `www/src/routes/_public/`, `www/src/data/home.ts`

### 5. Docs site (`/docs/applications` etc) · existing
`/docs` index, how it works, and an applications page listing all five institution apps with status badges. Note: the applications page currently calls Courts and Lawyers "Designed, not yet built." Per `docs/scope/index.md`, neither has a `PRODUCT.md` yet, so the copy overstates their real status, worth a small correction whenever this page is next touched. code in `www/src/routes/_public/docs/`

### 6. Institution templates (backend) · existing
Server functions (`listTemplates`/`updateTemplate`/`deleteTemplate`) and the DB table are wired to the `@pleadli/templates` custom BetterAuth plugin. code in `www/src/functions/template.func.ts`

## Next slice

### 7. Institution template editor UI · in-progress
The admin drawer for editing a template only exposes `institutionType`/`name`/`description`. `defaultUnits`, `defaultEntitlements`, and `formSchema` (the case form builder) have real backend support but no editor UI, so they're stuck at hardcoded defaults for every institution.
**Done when:** an admin can edit a template's default units, default entitlements, and case form schema from the UI, and a newly created organization actually gets seeded from those edited values.
- [ ] Design it (spec): `/architect institution template editor UI`

## Deferred
Real candidate gaps for a platform like this, not yet confirmed as requirements, surfaced by the recon pass, not decided in scope:
- **New organization onboarding flow**: creating an org via the admin drawer has no guided setup or seeding from a template step in the UI · needs a decision
- **Billing / institutional licensing**: no Stripe/subscription/invoice code anywhere in `www` · needs a decision · GA
- **Audit logging**: no admin action trail (who changed what, when) · needs a decision · GA
- **SSO for institutions**: email + password only today, no OAuth/SAML for institutional identity providers · needs a decision
- **MFA / 2FA**: BetterAuth's `twoFactor` plugin isn't enabled · needs a decision
- **Per institution settings/branding**: only a logo field exists on the organization table today · needs a decision
- **Email verification / password reset delivery**: the `forgot-account` route exists, but actual email delivery integration wasn't confirmed as wired up · needs a decision

## Legend
See `docs/scope/index.md` for the shared legend.
