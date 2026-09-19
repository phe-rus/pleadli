import { Createpanel } from '@/components/create-panel'
import {
  RegisterFacilityForm,
  facilitiesOptions,
  facilityStatusLabel,
  useConnectionRequests,
  useDecideConnectionRequest,
  useFacilities,
  useGeneratePairingCode,
  useResendVerificationCode,
  useRevokeFacility,
  useVerifyFacility,
  type ConnectionRequest,
  type Facility,
} from '@/features/facilities'
import { usePermissions } from '@/features/session'
import {
  AddCircleIcon,
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
 * Head Office's view of the prison estate. A facility is added to the roster
 * here (or registers itself with a pairing code), then connects by picking
 * itself from the roster. A connection request waits on this page for a Head
 * Office officer to approve or reject it, with the requester's name and badge
 * number. An activation code lets a facility connect without waiting.
 */
function RouteComponent() {
  const { data: facilities } = useFacilities()
  const { can } = usePermissions()
  const manage = can('hq.network.manage')
  const [registerOpen, setRegisterOpen] = useState(false)

  const all = facilities ?? []
  const active = all.filter((f) => f.status === 'active').length
  const pending = all.filter((f) => f.status === 'pending_verification').length
  const revoked = all.filter((f) => f.status === 'revoked').length

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex flex-wrap items-end justify-between gap-3 md:max-w-4xl">
        <div className="flex flex-col gap-1">
          <h1>Facilities</h1>
          <p className="md:max-w-lg">Every prison facility on this Head Office's roster, and whether it is connected.</p>
        </div>
        {manage && (
          <Createpanel
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                Register a facility
              </Button>
            }
            headings={{
              title: 'Register a facility',
              description: 'Add a facility to the roster. It then finds itself by number and connects, or uses the activation code.',
            }}
          >
            <RegisterFacilityForm onSuccess={() => setRegisterOpen(false)} />
          </Createpanel>
        )}
      </section>

      <div className="flex flex-col gap-6 md:max-w-4xl">
        {manage && <ConnectionRequestsSection />}

        <section className="flex flex-col gap-3">
          {all.length === 0 ? (
            <Card className="border-dashed p-0">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={NetworkIcon} size={20} />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">No facilities yet</h3>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Register a facility above, or generate a pairing code below. A facility appears here the moment it exists.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                  {active} active
                </span>
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={Clock01Icon} size={14} />
                  {pending} not yet connected
                </span>
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={PauseIcon} size={14} />
                  {revoked} revoked
                </span>
              </div>
              <Card className="p-0">
                <CardContent className="divide-y divide-border/60 p-0">
                  {all.map((facility) => (
                    <FacilityRow key={facility.id} facility={facility} manage={manage} />
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </section>

        {manage && <PairingCodeSection />}
      </div>
    </article>
  )
}

function ConnectionRequestsSection() {
  const { data: requests } = useConnectionRequests()
  const waiting = (requests ?? []).filter((r) => r.status === 'pending')
  const decided = (requests ?? []).filter((r) => r.status !== 'pending').slice(0, 5)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Connection requests</h2>
        {waiting.length > 0 && <Badge>{waiting.length} waiting</Badge>}
      </div>

      {waiting.length === 0 ? (
        <p className="text-xs text-muted-foreground">No facility is waiting to connect.</p>
      ) : (
        <Card className="p-0">
          <CardContent className="divide-y divide-border/60 p-0">
            {waiting.map((request) => (
              <RequestRow key={request.id} request={request} />
            ))}
          </CardContent>
        </Card>
      )}

      {decided.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recently decided</span>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {decided.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-x-2">
                <Badge variant={request.status === 'approved' ? 'default' : 'secondary'}>{request.status === 'superseded' ? 'Replaced' : request.status === 'approved' ? 'Approved' : 'Rejected'}</Badge>
                <span className="text-foreground">{request.facilityName}</span>
                <span>
                  requested by {request.requestedByName} ({request.requestedByBadge})
                </span>
                {request.decidedAt && (
                  <span>
                    · {request.decidedByName ? `${request.decidedByName}${request.decidedByBadge ? ` (${request.decidedByBadge})` : ''}` : 'decided'},{' '}
                    {format(request.decidedAt, 'PPp')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function RequestRow({ request }: { request: ConnectionRequest }) {
  const decide = useDecideConnectionRequest()

  const act = (decision: 'approve' | 'reject') =>
    decide.mutate(
      { id: request.id, decision },
      {
        onSuccess: () => t.success(decision === 'approve' ? `${request.facilityName} connected` : 'Request rejected'),
        onError: () => t.error('Could not record the decision'),
      },
    )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-medium">
          {request.facilityName} <span className="font-normal text-muted-foreground">({request.facilityNumber})</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Requested by <span className="text-foreground">{request.requestedByName}</span>, badge {request.requestedByBadge} ·{' '}
          {format(request.createdAt, 'PPp')} · from {request.requestedFrom || 'unknown'}
        </p>
        {request.replacesExisting && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This facility is already connected. Approving replaces the current connection, which stops syncing.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="xs" variant="ghost" disabled={decide.isPending} onClick={() => act('reject')}>
          Reject
        </Button>
        <Button size="xs" disabled={decide.isPending} onClick={() => act('approve')}>
          Approve
        </Button>
      </div>
    </div>
  )
}

function CodeChip({ code, expiresAt }: { code: string; expiresAt: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Activation code</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code)
          t.success('Activation code copied')
        }}
        className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
      >
        {code}
        <HugeiconsIcon icon={Copy01Icon} size={12} />
      </button>
      {expiresAt && <span className="text-xs text-muted-foreground">expires {format(expiresAt, 'PPp')}</span>}
    </div>
  )
}

function FacilityRow({ facility, manage }: { facility: Facility; manage: boolean }) {
  const statusVariant = facility.status === 'active' ? 'default' : facility.status === 'revoked' ? 'destructive' : 'secondary'
  const [codeInput, setCodeInput] = useState('')
  const verifyFacility = useVerifyFacility()
  const issueCode = useResendVerificationCode()
  const revoke = useRevokeFacility()
  const liveCode = facility.verificationCodePlaintext && (facility.verificationExpiresAt ?? 0) > Date.now()

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {facility.name} <span className="font-normal text-muted-foreground">({facility.facilityNumber})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {facility.region} · {facility.location} · {facility.headOfficerName}
          </p>
          <p className="text-xs text-muted-foreground">
            {facility.connectedBy ? `Connected by ${facility.connectedBy}` : 'No connection request approved yet'}
            {' · '}
            {facility.officerCount} account(s) reported
            {' · '}
            {facility.lastSyncedAt ? `last synced ${format(facility.lastSyncedAt, 'PPp')}` : 'never synced'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {manage && facility.status !== 'revoked' && (
            <Button
              size="xs"
              variant="ghost"
              disabled={issueCode.isPending}
              onClick={() =>
                issueCode.mutate(facility.id, {
                  onSuccess: () => t.success('New activation code issued'),
                  onError: () => t.error('Could not issue an activation code'),
                })
              }
            >
              <HugeiconsIcon icon={Key01Icon} size={12} /> {liveCode ? 'New code' : 'Issue activation code'}
            </Button>
          )}
          {manage && facility.status !== 'pending_verification' && facility.status !== 'revoked' && (
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

      {manage && liveCode && facility.verificationCodePlaintext && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
          <CodeChip code={facility.verificationCodePlaintext} expiresAt={facility.verificationExpiresAt} />
          <p className="text-xs text-muted-foreground">
            Give this to the facility. Entering it when connecting links the installation at once, without waiting for approval. It works
            once.
          </p>
          {facility.status === 'pending_verification' && (
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
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder="Enter code to mark verified"
                autoComplete="off"
                className="h-7 w-48 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <Button size="xs" variant="secondary" type="submit" disabled={verifyFacility.isPending || codeInput.trim().length === 0}>
                Verify
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

/** The older route in: a one-time code a facility pastes to register itself
 * when Head Office has not put it on the roster. */
function PairingCodeSection() {
  const [email, setEmail] = useState('')
  const [open, setOpen] = useState(false)
  const generate = useGeneratePairingCode()

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={RefreshCcwIcon} size={12} />
        {open ? 'Hide pairing code' : 'A facility not on the roster? Generate a pairing code'}
      </button>
      {open && (
        <Card className="p-0 md:max-w-xl">
          <CardContent className="flex flex-col gap-3 py-4">
            <p className="text-xs text-muted-foreground">
              A one-time code valid for 24 hours. The facility pastes it, types its own details and registers itself. Nothing is emailed from here.
            </p>
            {generate.data ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Send this to the facility. Expires {format(generate.data.expiresAt, 'PPp')}.</span>
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
                    autoComplete="email"
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
      )}
    </section>
  )
}
