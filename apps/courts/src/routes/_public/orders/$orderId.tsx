import { Createpanel } from '@/components/create-panel'
import { Tag } from '@/components/status-tag'
import { caseOptions, useCase } from '@/features/cases'
import { OrderForm, OrderSheet, orderKindLabel, orderOptions, useDiscardOrder, useIssueOrder, useOrder } from '@/features/orders'
import { purposeLabel } from '@/features/sittings'
import { messageOf } from '@/lib/api'
import { PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/orders/$orderId')({
  loader: async ({ context, params }) => {
    const order = await context.queryClient.query({ ...orderOptions(params.orderId), staleTime: 'static' })
    if (!order) throw notFound()
    await context.queryClient.query({ ...caseOptions(order.caseId), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** One order. A draft shows the facts it will be made from and can be edited,
 * issued or discarded. An issued order is the sheet itself, ready to print, with
 * a check that what is stored is still what was issued. */
function RouteComponent() {
  const { orderId } = Route.useParams()
  const { data: order } = useOrder(orderId)
  const { data: detail } = useCase(order?.caseId ?? '')
  const issue = useIssueOrder()
  const discard = useDiscardOrder()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  if (!order) return null

  const draft = order.status === 'draft'
  const accused = detail.parties.filter((p) => p.role === 'accused').map((p) => p.name)
  const f = order.fields

  const facts: [string, string | null][] = [
    ['Accused', f.accused ?? null],
    ['Held at', f.prison ?? null],
    ['Remanded until', f.remandUntil ? format(f.remandUntil, 'PP') : null],
    ['Adjourned to', f.nextDate ? format(f.nextDate, 'PP') : null],
    ['For', f.nextDate && f.nextPurpose ? purposeLabel(f.nextPurpose) : null],
    ['Reason', f.reason ?? null],
    ['Text', f.body ?? null],
  ]
  const given = facts.filter(([, value]) => value)

  return (
    <article className="page">
      <header className="page-header print:hidden">
        <div>
          <h1>{order.reference ?? order.title}</h1>
          <p>
            {orderKindLabel(order.kind)} in{' '}
            <Link to="/cases/$caseId" params={{ caseId: order.caseId }} className="text-foreground">
              {order.courtNumber}, {order.caseTitle}
            </Link>
            .
          </p>
        </div>
        <div className="page-actions">
          {draft ? (
            <>
              <Tag tone="open">Draft</Tag>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!window.confirm('Discard this draft?')) return
                  discard.mutate(order.id, {
                    onSuccess: () => {
                      t.success('Draft discarded')
                      void navigate({ to: '/orders' })
                    },
                    onError: (error) => t.error('Could not discard the draft', { description: messageOf(error) }),
                  })
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => issue.mutate(order.id, { onSuccess: () => t.success('Order issued'), onError: (error) => t.error('The order cannot be issued yet', { description: messageOf(error) }) })}
                disabled={issue.isPending}
              >
                Issue order
              </Button>
            </>
          ) : (
            <>
              {order.intact === false ? <Tag tone="urgent">Changed since issue</Tag> : <Tag tone="done">Issued, unchanged</Tag>}
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <HugeiconsIcon icon={PrinterIcon} />
                Print
              </Button>
            </>
          )}
        </div>
      </header>

      {draft ? (
        <section className="page-section">
          <h2>Facts this order will be made from</h2>
          {given.length === 0 ? (
            <p className="text-muted-foreground">Nothing has been filled in yet. Edit the draft to add the facts.</p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {given.map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-muted-foreground">The wording is written when the order is issued, and needs your name and court set in Settings. The wording is a working template, not the Judiciary&rsquo;s prescribed form.</p>
        </section>
      ) : (
        <>
          <OrderSheet order={order} />
          <section className="page-section print:hidden">
            <h2>Record</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Issued</dt>
                <dd>{order.issuedAt ? format(order.issuedAt, 'PPp') : '·'} by {order.issuedBy ?? '·'}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">SHA-256 of the wording as issued</dt>
                <dd className="break-all">{order.contentSha256}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <Createpanel
        open={editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(false)
            setDirty(false)
          }
        }}
        isDirty={dirty}
        headings={{ title: 'Edit the draft', description: 'A draft can change freely until it is issued.' }}
      >
        <OrderForm
          caseId={order.caseId}
          existing={order}
          accused={accused}
          onDirtyChange={setDirty}
          onSuccess={() => {
            setEditing(false)
            setDirty(false)
          }}
        />
      </Createpanel>
    </article>
  )
}
