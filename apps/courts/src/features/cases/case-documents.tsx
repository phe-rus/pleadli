import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { orderKindLabel, type OrderSummary } from '@/features/orders'
import { rulingKindLabel, type RulingSummary } from '@/features/rulings'
import { purposeLabel, sittingStatusLabels, type Sitting } from '@/features/sittings'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

const paperLink = 'flex min-h-40 flex-col gap-3 rounded-2xl border bg-background p-5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary'

/** The case already owns these papers. Keep their actual status and identity
 * visible here, with the full document one click away. */
export function CaseDocuments({ orders, rulings, sittings }: { orders: OrderSummary[]; rulings: RulingSummary[]; sittings: Sitting[] }) {
  const records = sittings.filter((sitting) => sitting.status !== 'cancelled')
  const count = orders.length + rulings.length + records.length
  return (
    <section className="page-section" aria-labelledby="case-documents">
      <div className="section-head">
        <div>
          <h2 id="case-documents">Case documents</h2>
          <p className="text-sm text-muted-foreground">Orders, decisions and sitting records belonging to this case.</p>
        </div>
        <Tag tone="neutral">{count}</Tag>
      </div>
      {count === 0 ? (
        <EmptyNote>No papers yet. Choose Draft an order or Draft a decision to begin.</EmptyNote>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <Link key={order.id} to="/orders/$orderId" params={{ orderId: order.id }} className={paperLink}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{orderKindLabel(order.kind)}</span>
                <Tag tone={order.status === 'issued' ? 'done' : 'open'}>{order.status === 'issued' ? 'Issued' : 'Draft'}</Tag>
              </div>
              <span className="font-medium">{order.title}</span>
              <span className="mt-auto text-xs text-muted-foreground">{order.reference ?? 'No reference assigned'} · {format(order.updatedAt, 'PP')}</span>
              <span className="text-xs text-primary">{order.status === 'draft' ? 'Review draft' : 'Read document'} →</span>
            </Link>
          ))}
          {rulings.map((ruling) => (
            <Link key={ruling.id} to="/rulings/$rulingId" params={{ rulingId: ruling.id }} className={paperLink}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{rulingKindLabel(ruling.kind)}</span>
                <Tag tone={ruling.status === 'delivered' ? 'done' : ruling.reservedOn ? 'urgent' : 'open'}>
                  {ruling.status === 'delivered' ? 'Delivered' : ruling.reservedOn ? 'Reserved' : 'Draft'}
                </Tag>
              </div>
              <span className="font-medium">{ruling.title}</span>
              <span className="mt-auto text-xs text-muted-foreground">{ruling.reference ?? 'No reference assigned'} · {format(ruling.updatedAt, 'PP')}</span>
              <span className="text-xs text-primary">{ruling.status === 'draft' ? 'Continue writing' : 'Read document'} →</span>
            </Link>
          ))}
          {records.map((sitting) => (
            <Link key={sitting.id} to="/sittings/$sittingId" params={{ sittingId: sitting.id }} className={paperLink}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Sitting record</span>
                <Tag tone="neutral">{sittingStatusLabels[sitting.status] ?? sitting.status}</Tag>
              </div>
              <span className="font-medium">{purposeLabel(sitting.purpose)} · {format(sitting.scheduledAt, 'PP')}</span>
              <span className="mt-auto text-xs text-muted-foreground">Notes and appearances</span>
              <span className="text-xs text-primary">Open sitting →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
