import { facilitiesOptions, facilityStatusLabel, useFacilities, useVerifyFacility, type Facility } from '@/features/facilities'
import { CheckmarkCircle02Icon, Clock01Icon, Copy01Icon, NetworkIcon, PauseIcon } from '@hugeicons/core-free-icons'
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
 * registration-and-pairing.md). Registration itself is self-service on the
 * facility side (its own first-launch onboarding); this page is where Head
 * Office reviews what came in and confirms it. Verification here shows the
 * code in plaintext, a deliberate manual stand-in for the real emailed
 * code until email sending is wired up — see `domain/facilities.rs`'s own
 * doc comment.
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
        <p className="md:max-w-lg">Every prison facility that has registered with this Head Office, and its verification status.</p>
      </section>

      <section className="flex flex-col gap-4">
        {all.length === 0 ? (
          <Card className="border-dashed p-0">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={NetworkIcon} size={20} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">No facilities registered yet</h3>
                <p className="max-w-sm text-xs text-muted-foreground">
                  A facility appears here the moment it completes its own first-launch registration.
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

function FacilityRow({ facility }: { facility: Facility }) {
  const statusVariant = facility.status === 'active' ? 'default' : facility.status === 'revoked' ? 'destructive' : 'secondary'
  const [codeInput, setCodeInput] = useState('')
  const verifyFacility = useVerifyFacility()

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
        <Badge variant={statusVariant}>{facilityStatusLabel(facility.status)}</Badge>
      </div>

      {facility.status === 'pending_verification' && facility.verificationCodePlaintext && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
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

          <form
            className="ml-auto flex items-center gap-2"
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
