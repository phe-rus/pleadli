import { PanelButton } from '@/components/add-panel'
import { Tag } from '@/components/status-tag'
import { savePack } from '@/features/filings'
import { installationOptions } from '@/features/installation'
import {
  EntryForm,
  FeeNoteForm,
  feeNoteOptions,
  feeNotePdf,
  FeeNoteTag,
  IssueForm,
  ReasonForm,
  ugx,
  useCancelFeeNote,
  useDeleteFeeNote,
  useKeepsBooks,
} from '@/features/money'
import { messageOf } from '@/lib/api'
import { formatDay } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

export const Route = createFileRoute('/_public/money/$feeNoteId')({
  component: RouteComponent,
})

/** One fee note: its lines and what has been paid on it. A draft is edited,
 * issued or deleted; an issued note is paid (from the client account or
 * straight to the practice), printed, or cancelled while nothing is paid. */
function RouteComponent() {
  const { feeNoteId } = Route.useParams()
  const navigate = useNavigate()
  const keeps = useKeepsBooks()
  const { data: note } = useQuery(feeNoteOptions(feeNoteId))
  const { data: install } = useQuery(installationOptions())
  const remove = useDeleteFeeNote()
  const cancel = useCancelFeeNote()
  const [issuing, setIssuing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  if (!note) return null
  const outstanding = note.status === 'issued' ? note.total - note.paid : 0

  const print = async () => {
    try {
      const bytes = await feeNotePdf(
        note,
        { name: install?.officeName ?? '', address: install?.address ?? null, phone: install?.phone ?? null, email: install?.email ?? null },
        {
          heading: m["money.fee_note"](),
          to: m["money.pdf.to"](),
          matter: m["money.col.matter"](),
          number: m["money.col.number"](),
          issued: m["money.col.issued"](),
          due: m["money.col.due"](),
          description: m["money.description"](),
          amount: m["money.pdf.amount"](),
          total: m["money.col.total"](),
          paid: m["money.col.paid"](),
          outstanding: m["money.col.outstanding"](),
          notTax: m["money.not_tax_invoice"](),
          minutes: (count) => m["money.minutes"]({ count }),
        },
        ugx,
        formatDay,
      )
      if (await savePack(bytes, `${note.number ?? 'fee-note'} ${note.clientName}.pdf`)) t.success(m["money.pdf.saved"]())
    } catch (error) {
      t.error(m["money.pdf.failed"](), { description: messageOf(error) })
    }
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{note.number ?? m["money.draft_fee_note"]()}</h1>
          <p>
            {note.clientName} ·{' '}
            <Link to="/matters/$matterId" params={{ matterId: note.matterId }} className="text-foreground">
              {note.courtNumber ?? note.matterTitle}
            </Link>
          </p>
        </div>
        <div className="page-actions">
          <FeeNoteTag note={note} />
          {keeps && note.status === 'draft' && (
            <>
              <PanelButton label={m["paper.edit"]()} title={m["money.edit_draft"]()} description={m["money.fee_note_description"]()} variant="secondary" icon={false}>
                {({ close }) => <FeeNoteForm matterId={note.matterId} existing={note} onDone={close} />}
              </PanelButton>
              <Button size="sm" onClick={() => setIssuing(true)}>
                {m["money.issue"]()}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(note.id, { onSuccess: () => void navigate({ to: '/matters/$matterId', params: { matterId: note.matterId } }), onError: (error) => t.error(m["money.delete_failed"](), { description: messageOf(error) }) })}
              >
                {m["money.delete_draft"]()}
              </Button>
            </>
          )}
          {note.status === 'issued' && (
            <>
              {keeps && outstanding > 0 && (
                <PanelButton label={m["money.record_payment"]()} title={m["money.record_payment"]()} description={m["money.owed_on"]({ amount: ugx(outstanding) })} variant="default" icon={false}>
                  {({ close }) => <EntryForm clientId={note.clientId} matterId={note.matterId} kinds={['to_office', 'fee_received']} feeNoteId={note.id} onDone={close} />}
                </PanelButton>
              )}
              <Button size="sm" variant="secondary" onClick={() => void print()}>
                {m["money.pdf.print"]()}
              </Button>
              {keeps && note.paid === 0 && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelling(true)}>
                  {m["money.cancel_note"]()}
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {issuing && <IssueForm note={note} onDone={() => setIssuing(false)} />}
      {cancelling && (
        <ReasonForm
          title={m["money.cancel_title"]()}
          lead={m["money.cancel_lead"]()}
          action={m["money.cancel_note"]()}
          pending={cancel.isPending}
          onSubmit={(reason, fail) => cancel.mutate({ id: note.id, reason }, { onSuccess: () => setCancelling(false), onError: (error) => fail(messageOf(error)) })}
          onDone={() => setCancelling(false)}
        />
      )}

      <section aria-labelledby="lines" className="page-section">
        <h2 id="lines">{m["money.lines"]()}</h2>
        <table className="w-full">
          <tbody>
            {note.lines.map((l) => (
              <tr key={l.id} className="border-b border-border/60">
                <td className="py-2 pr-4">
                  {l.description}
                  {l.kind === 'time' && l.minutes && l.rate ? (
                    <span className="text-muted-foreground"> · {m["money.minutes"]({ count: l.minutes })} @ {ugx(l.rate)}</span>
                  ) : l.kind === 'disbursement' ? (
                    <span className="text-muted-foreground"> · {m["money.line.disbursement"]()}</span>
                  ) : null}
                </td>
                <td className="py-2 text-right whitespace-nowrap">{ugx(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="py-2 pr-4 text-left">{m["money.col.total"]()}</th>
              <th className="py-2 text-right whitespace-nowrap">{ugx(note.total)}</th>
            </tr>
            {note.paid > 0 && (
              <>
                <tr>
                  <td className="py-1 pr-4">{m["money.col.paid"]()}</td>
                  <td className="py-1 text-right whitespace-nowrap">{ugx(note.paid)}</td>
                </tr>
                <tr>
                  <th className="py-1 pr-4 text-left">{m["money.col.outstanding"]()}</th>
                  <th className="py-1 text-right whitespace-nowrap">{ugx(outstanding)}</th>
                </tr>
              </>
            )}
          </tfoot>
        </table>
        {note.note && <p>{note.note}</p>}
        <p className="text-muted-foreground">
          {note.issuedOn ? m["money.issued_by"]({ day: formatDay(note.issuedOn), name: note.issuedBy ?? '' }) : m["money.draft_lead"]()}
          {note.dueOn ? ` ${m["money.due_by"]({ day: formatDay(note.dueOn) })}` : ''}
        </p>
        {note.status === 'cancelled' && <Tag tone="neutral">{m["money.cancelled_because"]({ reason: note.cancelledReason ?? '' })}</Tag>}
        <p className="text-muted-foreground">{m["money.not_tax_invoice"]()}</p>
      </section>
    </article>
  )
}
