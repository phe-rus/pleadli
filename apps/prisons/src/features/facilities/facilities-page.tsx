import { Createpanel } from '@/components/create-panel'
import { RegisterFacilityForm } from './register-facility-form'
import {
  useConnectionRequests,
  useDecideConnectionRequest,
  useFacilities,
  useGeneratePairingCode,
  useResendVerificationCode,
  useRevokeFacility,
  useVerifyFacility,
} from './queries'
import { facilityStatusLabel, type ConnectionRequest, type Facility } from './schema'
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
import { format } from 'date-fns/format'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

/**
 * Head Office's view of the prison estate. A facility is added to the roster
 * here (or registers itself with a pairing code), then connects by picking
 * itself from the roster. A connection request waits on this page for a Head
 * Office officer to approve or reject it, with the requester's name and badge
 * number. An activation code lets a facility connect without waiting.
 */
export function FacilitiesPage() {
  const { data: facilities } = useFacilities()
  const { can } = usePermissions()
  const manage = can('hq.network.manage')
  const [registerOpen, setRegisterOpen] = useState(false)

  const all = facilities ?? []
  const active = all.filter((f) => f.status === 'active').length
  const pending = all.filter((f) => f.status === 'pending_verification').length
  const revoked = all.filter((f) => f.status === 'revoked').length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_facilities_facilities()}</h1>
          <p className="md:max-w-lg">{m.route_facilities_every_prison_facility_on_this_head()}</p>
        </div>
        {manage && (
          <div className="page-actions">
            <Createpanel
              open={registerOpen}
              onOpenChange={setRegisterOpen}
              trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={AddCircleIcon} />
                  {m.route_facilities_register_a_facility()}
                </Button>
              }
              headings={{
                title: m.route_facilities_register_a_facility(),
                description: m.route_facilities_add_a_facility_to_the_roster(),
              }}
            >
              <RegisterFacilityForm onSuccess={() => setRegisterOpen(false)} />
            </Createpanel>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-6 md:max-w-4xl">
        {manage && <ConnectionRequestsSection />}

        <section className="page-section flex flex-col gap-3">
          {all.length === 0 ? (
            <Card className="border-dashed p-0">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={NetworkIcon} size={20} />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">{m.route_facilities_no_facilities_yet()}</h3>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {m.route_facilities_register_a_facility_above_or_generate()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                  {m.route_facilities_active({ active })}</span>
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={Clock01Icon} size={14} />
                  {m.route_facilities_not_yet_connected({ pending })}</span>
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={PauseIcon} size={14} />
                  {m.route_facilities_revoked({ revoked })}</span>
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
    <section className="page-section flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{m.route_facilities_connection_requests()}</h2>
        {waiting.length > 0 && <Badge>{m.route_facilities_waiting({ length: waiting.length })}</Badge>}
      </div>

      {waiting.length === 0 ? (
        <p className="text-xs text-muted-foreground">{m.route_facilities_no_facility_is_waiting_to_connect()}</p>
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
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{m.route_facilities_recently_decided()}</span>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {decided.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-x-2">
                <Badge variant={request.status === 'approved' ? 'default' : 'secondary'}>{request.status === 'superseded' ? m.route_facilities_replaced() : request.status === 'approved' ? m.route_facilities_approved() : m.route_facilities_rejected()}</Badge>
                <span className="text-foreground">{request.facilityName}</span>
                <span>
                  {m.route_facilities_requested_by({ requestedByName: request.requestedByName, requestedByBadge: request.requestedByBadge })}</span>
                {request.decidedAt && (
                  <span>
                    · {request.decidedByName ? `${request.decidedByName}${request.decidedByBadge ? ` (${request.decidedByBadge})` : ''}` : m.route_facilities_decided()},{' '}
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
        onSuccess: () => t.success(decision === 'approve' ? m.route_facilities_connected({ facilityName: request.facilityName }) : m.route_facilities_request_rejected()),
        onError: () => t.error(m.route_facilities_could_not_record_the_decision()),
      },
    )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-medium">
          {request.facilityName} <span className="font-normal text-muted-foreground">({request.facilityNumber})</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {m.route_facilities_requested_by_2()} <span className="text-foreground">{request.requestedByName}</span>{m.route_facilities_badge_from({ requestedByBadge: request.requestedByBadge, createdAt: format(request.createdAt, 'PPp') })}{' '}{request.requestedFrom || m.route_facilities_unknown()}
        </p>
        {request.replacesExisting && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {m.route_facilities_this_facility_is_already_connected_appro()}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="xs" variant="ghost" disabled={decide.isPending} onClick={() => act('reject')}>
          {m.route_facilities_reject()}
        </Button>
        <Button size="xs" disabled={decide.isPending} onClick={() => act('approve')}>
          {m.route_facilities_approve_2()}
        </Button>
      </div>
    </div>
  )
}

function CodeChip({ code, expiresAt }: { code: string; expiresAt: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{m.route_facilities_activation_code()}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code)
          t.success(m.route_facilities_activation_code_copied())
        }}
        className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
      >
        {code}
        <HugeiconsIcon icon={Copy01Icon} size={12} />
      </button>
      {expiresAt && <span className="text-xs text-muted-foreground">{m.route_facilities_expires({ expiresAt: format(expiresAt, 'PPp') })}</span>}
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
            {facility.connectedBy ? m.route_facilities_connected_by({ connectedBy: facility.connectedBy }) : m.route_facilities_no_connection_request_approved_yet()}
            {' · '}
            {m.route_facilities_account_s_reported({ officerCount: facility.officerCount })}{' · '}
            {facility.lastSyncedAt ? m.route_facilities_last_synced({ lastSyncedAt: format(facility.lastSyncedAt, 'PPp') }) : m.route_facilities_never_synced()}
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
                  onSuccess: () => t.success(m.route_facilities_new_activation_code_issued()),
                  onError: () => t.error(m.route_facilities_could_not_issue_an_activation_code()),
                })
              }
            >
              <HugeiconsIcon icon={Key01Icon} size={12} /> {liveCode ? m.route_facilities_new_code() : m.route_facilities_issue_activation_code()}
            </Button>
          )}
          {manage && facility.status !== 'pending_verification' && facility.status !== 'revoked' && (
            <Button
              size="xs"
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() =>
                revoke.mutate(facility.id, {
                  onSuccess: () => t.success(m.route_facilities_revoked_2({ name: facility.name })),
                  onError: () => t.error(m.route_facilities_could_not_revoke_this_facility()),
                })
              }
            >
              <HugeiconsIcon icon={PauseIcon} size={12} /> {m.route_facilities_revoke()}
            </Button>
          )}
          <Badge variant={statusVariant}>{facilityStatusLabel(facility.status)}</Badge>
        </div>
      </div>

      {manage && liveCode && facility.verificationCodePlaintext && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
          <CodeChip code={facility.verificationCodePlaintext} expiresAt={facility.verificationExpiresAt} />
          <p className="text-xs text-muted-foreground">
            {m.route_facilities_give_this_to_the_facility_entering()}
          </p>
          {facility.status === 'pending_verification' && (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                verifyFacility.mutate(
                  { facilityId: facility.id, code: codeInput.trim() },
                  {
                    onSuccess: () => t.success(m.route_facilities_verified({ name: facility.name })),
                    onError: () => t.error(m.route_facilities_that_code_is_invalid_or_has()),
                  },
                )
              }}
            >
              <input
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder={m.route_facilities_enter_code_to_mark_verified()}
                autoComplete="off"
                className="h-7 w-48 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <Button size="xs" variant="secondary" type="submit" disabled={verifyFacility.isPending || codeInput.trim().length === 0}>
                {m.route_facilities_verify()}
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
    <section className="page-section flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={RefreshCcwIcon} size={12} />
        {open ? m.route_facilities_hide_pairing_code() : m.route_facilities_a_facility_not_on_the_roster()}
      </button>
      {open && (
        <Card className="p-0 md:max-w-xl">
          <CardContent className="flex flex-col gap-3 py-4">
            <p className="text-xs text-muted-foreground">
              {m.route_facilities_a_one_time_code_valid_for()}
            </p>
            {generate.data ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">{m.route_facilities_send_this_to_the_facility_expires({ expiresAt: format(generate.data.expiresAt, 'PPp') })}</span>
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
                      t.success(m.route_facilities_pairing_code_copied())
                    }}
                  >
                    <HugeiconsIcon icon={Copy01Icon} size={12} /> {m.route_facilities_copy()}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={generate.reset} disabled={generate.isPending}>
                    {m.route_facilities_generate_another()}
                  </Button>
                </div>
              </div>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  generate.mutate(email.trim(), { onError: () => t.error(m.route_facilities_could_not_generate_a_pairing_code()) })
                }}
              >
                <label className="flex min-w-52 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-medium">{m.route_facilities_verification_officer_s_email()}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={m.route_facilities_officer_ups_go_ug()}
                    autoComplete="email"
                    className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
                <Button type="submit" disabled={generate.isPending || email.trim().length === 0}>
                  {m.route_facilities_generate_code()}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
