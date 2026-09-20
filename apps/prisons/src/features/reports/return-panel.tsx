import { useHqConfig, usePermissions } from '@/features/session'
import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { m } from '@/paraglide/messages'
import { useAttestReturn, useReturnChecks, useSubmitReturn } from './queries'
import type { GeneratedReport, ReturnCheck } from './schema'

const outcomeVariant = { pass: 'secondary', fail: 'destructive', note: 'outline' } as const

function outcomeText(outcome: ReturnCheck['outcome']) {
  return outcome === 'pass' ? m.returns_check_pass() : outcome === 'fail' ? m.returns_check_fail() : m.returns_check_note()
}

function failure(error: unknown) {
  return error instanceof ApiError ? error.message : m.facilities_please_try_again()
}

/**
 * Where a monthly return stands, and what the officer can do next: check it,
 * attest it (the officer in charge, once, for good), then submit it to Head
 * Office. Shown above the sheet and never printed; the printed sheet carries
 * the attestation itself. Head Office sees only the attestation, because the
 * return it reads is the one a facility sent.
 */
export function ReturnPanel({ report }: { report: GeneratedReport }) {
  const { data: hqConfig } = useHqConfig()
  const { can } = usePermissions()
  const attested = report.attestedAt !== null
  const headOffice = hqConfig?.isHeadOffice ?? false
  const { data: checks } = useReturnChecks(report.id, !attested && !headOffice)
  const attest = useAttestReturn()
  const submit = useSubmitReturn()
  const [confirming, setConfirming] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const canAttest = can('report.attest')

  const doAttest = () =>
    attest.mutate(report.id, {
      onSuccess: () => {
        setConfirming(false)
        setAgreed(false)
        t.success(m.returns_attested_toast())
      },
      onError: (error) => t.error(m.returns_could_not_attest(), { description: failure(error) }),
    })

  const doSubmit = () =>
    submit.mutate(report.id, {
      onSuccess: (sent) => (sent.submission === 'acknowledged' ? t.success(m.returns_received_toast()) : t.info(m.returns_queued_toast())),
      onError: (error) => t.error(m.returns_could_not_submit(), { description: failure(error) }),
    })

  return (
    <section className="page-section mx-auto w-full max-w-[210mm] print:hidden">
      <div className="section-head">
        <h2>{m.returns_attestation()}</h2>
        {!attested ? (
          <Badge variant="outline">{m.returns_not_attested()}</Badge>
        ) : report.submission === 'acknowledged' ? (
          <Badge>{m.returns_acknowledged()}</Badge>
        ) : report.submission === 'queued' ? (
          <Badge variant="secondary">{m.returns_queued()}</Badge>
        ) : (
          <Badge variant="secondary">{m.returns_attested()}</Badge>
        )}
      </div>

      {attested && (
        <p>
          {m.returns_attested_by({
            name: report.attestedByName ?? '',
            badge: report.attestedByBadge ?? '',
            date: format(report.attestedAt as number, 'd MMM yyyy, HH:mm'),
          })}
        </p>
      )}
      {report.submission === 'acknowledged' && report.acknowledgedAt !== null && (
        <p>{m.returns_received_on({ date: format(report.acknowledgedAt, 'd MMM yyyy, HH:mm') })}</p>
      )}
      {report.submission === 'queued' && (
        <p>
          {m.returns_waiting_to_send()}
          {report.submissionError ? ` ${report.submissionError}` : ''}
        </p>
      )}

      {!attested && !headOffice && checks && (
        <div className="flex flex-col gap-2">
          <h3>{m.returns_checks()}</h3>
          <ul className="flex flex-col gap-2">
            {checks.checks.map((check) => (
              <li key={check.id} className="flex flex-wrap items-start gap-2">
                <Badge variant={outcomeVariant[check.outcome]}>{outcomeText(check.outcome)}</Badge>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p>{check.label}</p>
                  {check.detail && <p className="text-muted-foreground">{check.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!attested && !headOffice && (
        <div className="flex flex-col gap-2">
          <div>
            <Button disabled={!canAttest || !checks?.passed} onClick={() => setConfirming(true)}>
              {m.returns_attest()}
            </Button>
          </div>
          {!canAttest && <p>{m.returns_only_the_oic()}</p>}
          {canAttest && checks && !checks.passed && <p>{m.returns_fix_then_generate_again()}</p>}
        </div>
      )}

      {attested && !report.submission && !headOffice && (
        <div className="flex flex-col gap-2">
          <div>
            <Button disabled={!canAttest || submit.isPending} onClick={doSubmit}>
              {submit.isPending ? m.returns_sending() : m.returns_submit()}
            </Button>
          </div>
          <p>{m.returns_submit_about()}</p>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.returns_attest_title({ reference: report.reference })}</DialogTitle>
            <DialogDescription>{m.returns_attest_final()}</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3">
            <Checkbox checked={agreed} onCheckedChange={(value) => setAgreed(value === true)} />
            <span>{checks?.statement}</span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {m.returns_cancel()}
            </Button>
            <Button disabled={!agreed || attest.isPending} onClick={doAttest}>
              {attest.isPending ? m.returns_attesting() : m.returns_attest()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** The attestation as it prints: who affirmed what and when, or, on a return
 * not yet attested, a plain statement that it is not, with a line to sign. */
export function AttestationBlock({ report }: { report: GeneratedReport }) {
  if (report.attestedAt === null) {
    return (
      <section className="flex flex-col gap-2 border-t border-black/60 pt-3">
        <p>{m.returns_print_not_attested()}</p>
        <div className="mt-8 w-72 border-b border-black" />
        <p>{m.returns_print_signature()}</p>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-1 border-t border-black/60 pt-3">
      <p>{report.attestationStatement}</p>
      <p>
        {m.returns_attested_by({
          name: report.attestedByName ?? '',
          badge: report.attestedByBadge ?? '',
          date: format(report.attestedAt, 'd MMM yyyy, HH:mm'),
        })}
      </p>
    </section>
  )
}
