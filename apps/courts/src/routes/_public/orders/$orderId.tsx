import { DocumentActions } from '@/features/documents/document-actions'
import { Createpanel } from '@/components/create-panel'
import { Tag } from '@/components/status-tag'
import { caseOptions, useCase } from '@/features/cases'
import { OrderForm, OrderSheet, OrderPaper, useOrderPreview, orderKindLabel, orderOptions, useDiscardOrder, useIssueOrder, useOrder } from '@/features/orders'
import { purposeLabel } from '@/features/sittings'
import { messageOf } from '@/lib/api'
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

/** One order. A draft previews saved facts through the issue renderer and can be edited,
 * issued or discarded. An issued order is the sheet itself, ready to print, with
 * a check that what is stored is still what was issued. */
function RouteComponent() {
  const { orderId } = Route.useParams()
  const { data: order } = useOrder(orderId)
  const { data: detail } = useCase(order?.caseId ?? '')
  const preview = useOrderPreview(orderId, order?.status === 'draft')
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
              {preview.data?.content && <DocumentActions title={`Draft - ${order.title}`} />}
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
                onClick={() => {
                  if (!window.confirm('Issue this order? Its wording will be frozen and a reference assigned. You cannot edit or discard it afterwards.')) return
                  issue.mutate(order.id, {
                    onSuccess: () => t.success('Order issued'),
                    onError: (error) => t.error('The order cannot be issued yet', { description: messageOf(error) }),
                  })
                }}
                disabled={issue.isPending || !preview.data || preview.isFetching || preview.data.blockers.length > 0}
              >
                Issue order
              </Button>
            </>
          ) : (
            <>
              {order.intact === false ? <Tag tone="urgent">Changed since issue</Tag> : <Tag tone="done">Issued, unchanged</Tag>}
<DocumentActions title={order.reference ?? order.title} />
            </>
          )}
        </div>
      </header>

      {draft ? (
        <div className="flex flex-col gap-6">
          <section className="page-section print:hidden" aria-label="Draft review">
            <h2>Review the saved draft</h2>
            <p className="text-muted-foreground">Working template, not the Judiciary&rsquo;s prescribed form. Review the wording before issuing. Editing and saving refreshes this preview.</p>
            {preview.isPending && <p role="status">Preparing the document…</p>}
            {preview.isError && (
              <div role="alert">
                <p>Could not prepare the preview. {messageOf(preview.error)}</p>
                <Button variant="secondary" size="sm" onClick={() => void preview.refetch()}>Try again</Button>
              </div>
            )}
            {!!preview.data?.blockers.length && (
              <div role="status">
                <h3 className="font-medium">Before this can be issued</h3>
                <ul className="list-disc pl-5">{preview.data.blockers.map((message) => <li key={message}>{message}</li>)}</ul>
              </div>
            )}
          </section>
          {preview.data && (preview.data.content ? <OrderPaper content={preview.data.content} draft /> : (
            <section className="paper mx-auto w-full max-w-[210mm] p-8 text-center" aria-label="Incomplete draft">
              <p className="text-xs font-semibold tracking-widest uppercase">Draft · Not issued</p>
              <h2 className="mt-6">{order.title}</h2>
              <p>{order.courtNumber} · {order.caseTitle}</p>
              <p className="mt-8 text-muted-foreground">Complete the facts to prepare the wording.</p>
            </section>
          ))}
          {!!given.length && (
            <details className="page-section print:hidden">
              <summary className="cursor-pointer font-medium">Saved facts</summary>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {given.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="whitespace-pre-wrap">{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
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
