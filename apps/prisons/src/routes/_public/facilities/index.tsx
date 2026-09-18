import {
  facilitiesOptions,
  facilityStatusLabel,
  useFacilities,
  useGeneratePairingCode,
  useResendVerificationCode,
  useRevokeFacility,
  useVerifyFacility,
  type Facility,
} from '@/features/facilities'
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  Key01Icon,
  NetworkIcon,
  PauseIcon,
  RefreshCcwIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/facilities/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...facilitiesOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Head Office management of the prison estate it has paired with (spec:
 * docs/specs/prisons/0001-head-office-peer-sync-network/0002-peer-
 * registration-and-pairing.md, child 3's HQ management surface). A code
 * generated here is handed to a facility out of band; the facility pastes
 * it during its own first-launch flow and registers itself. This page is
 * where Head Office reviews what came in, confirms it (the code shows in
 * plaintext as a deliberate manual stand-in for the real emailed code until
 * email sending — see `domain/facilities.rs`'s own doc comment), resends an
 * expired code, or revokes a facility at any time.
 */
function RouteComponent() {
  const { data: facilities } = useFacilities()
  const all = facilities ?? []
  const pending = all.filter((f) => f.status === 'pending_verification')
  const active = all.filter((f) => f.status === 'active')
  const revoked = all.filter((f) => f.status === 'revoked')

  return (
    <article className="container flex flex-col gap-6 pt-6 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Facilities</h1>
        <p className="md:max-w-lg">Every prison facility paired with this Head Office, and its verification status.</p>
      </section>

      <PairingCodeSection />

      <section className="flex flex-col gap-4">
        {all.length === 0 ? (
          <Card className="border-dashed p-0">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={NetworkIcon} size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">No facilities paired yet</h3>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Generate a pairing code above and share it with a facility — it appears here the moment it registers.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                {active.length} active
              </span>
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} size={14} />
                {pending.length} pending verification
              </span>
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={PauseIcon} size={14} />
                {revoked.length} revoked
              </span>
            </div>

            <Card className="p-0">
              <CardContent className="p-0 divide-y divide-border/60">
                {all.map((facility) => (
                  <FacilityRow key={facility.id} facility={facility} />
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </article>
  )
}

/** AC-1: generate a single-use, 24-hour pairing code for a new facility,
 * addressed to the Head Office officer who'll receive that facility's
 * verification code. Nothing is emailed from here — the code is returned
 * to hand over however these two officers already communicate. */
function PairingCodeSection() {
  const [email, setEmail] = useState('')
  const generate = useGeneratePairingCode()

  return (
    <Card className="p-0">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={Key01Icon} size={16} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-sm font-medium">Pair a new facility</h2>
            <p className="text-xs text-muted-foreground">
              Generates a one-time code valid for 24 hours. Share it with the facility; it registers itself and no one has to
              type a hostname.
            </p>
          </div>
        </div>

        {generate.data ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Send this to the facility. Expires {format(generate.data.expiresAt, 'PPp')}.
            </span>
            <input
              readOnly
              value={generate.data.pairingCode}
              onFocus={(event) => event.currentTarget.select()}
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-xs outline-none"
            />
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                onClick={() => {
                  navigator.clipboard?.writeText(generate.data.pairingCode)
                  t.success('Pairing code copied')
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} size={12} /> Copy
              </Button>
              <Button size="xs" variant="ghost" onClick={generate.reset} disabled={generate.isPending}>
                Generate another
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              generate.mutate(email.trim(), { onError: () => t.error('Could not generate a pairing code') })
            }}
          >
            <label className="flex min-w-52 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium">Verification officer's email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="officer@ups.go.ug"
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <Button type="submit" disabled={generate.isPending || email.trim().length === 0}>
              Generate code
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function FacilityRow({ facility }: { facility: Facility }) {
  const statusVariant = facility.status === 'active' ? 'default' : facility.status === 'revoked' ? 'destructive' : 'secondary'
  const [codeInput, setCodeInput] = useState('')
  const verifyFacility = useVerifyFacility()
  const resendCode = useResendVerificationCode()
  const revoke = useRevokeFacility()

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{facility.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {facility.region} · {facility.facilityNumber} · {facility.headOfficerName}
            {facility.lastSyncedAt ? ` · Last synced ${format(facility.lastSyncedAt, 'PPp')}` : ' · Never synced'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {facility.status !== 'pending_verification' && (
            <Button
              size="xs"
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() =>
                revoke.mutate(facility.id, {
                  onSuccess: () => t.success(`${facility.name} revoked`),
                  onError: () => t.error('Could not revoke this facility'),
                })
              }
            >
              <HugeiconsIcon icon={PauseIcon} size={12} /> Revoke
            </Button>
          )}
          <Badge variant={statusVariant}>{facilityStatusLabel(facility.status)}</Badge>
        </div>
      </div>

      {facility.status === 'pending_verification' && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
          {facility.verificationCodePlaintext && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Verification code (no email configured yet — share this with the facility directly):
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(facility.verificationCodePlaintext ?? '')
                  t.success('Verification code copied')
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
              >
                {facility.verificationCodePlaintext}
                <HugeiconsIcon icon={Copy01Icon} size={12} />
              </button>
              <Button
                size="xs"
                variant="ghost"
                disabled={resendCode.isPending}
                onClick={() =>
                  resendCode.mutate(facility.id, {
                    onSuccess: () => t.success('New verification code issued'),
                    onError: () => t.error('Could not resend a verification code'),
                  })
                }
              >
                <HugeiconsIcon icon={RefreshCcwIcon} size={12} /> Resend
              </Button>
            </div>
          )}

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              verifyFacility.mutate(
                { facilityId: facility.id, code: codeInput.trim() },
                {
                  onSuccess: () => t.success(`${facility.name} verified`),
                  onError: () => t.error('That code is invalid or has expired'),
                },
              )
            }}
          >
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Enter code to verify"
              className="h-7 w-36 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <Button size="xs" type="submit" disabled={verifyFacility.isPending || codeInput.trim().length === 0}>
              Verify
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
