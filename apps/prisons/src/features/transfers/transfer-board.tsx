import { openExchangeFile, saveExchangeFile } from '@/lib/exchange-files'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState, type ReactNode } from 'react'
import { getDossierFile } from './data'
import { transferErrorText } from './errors'
import { useCancelTransfer, useImportReceipt, useTransfers } from './queries'
import { transferStateLabel, type Transfer } from './schema'
import { m } from '@/paraglide/messages'

type Section = { id: string; title: string; hint: string; rows: Transfer[] }

function sectionsFrom(transfers: Transfer[]): Section[] {
  const recent = transfers
    .filter((t) => t.state === 'confirmed' || t.state === 'cancelled')
    .sort((a, b) => (b.confirmedAt ?? b.transferredAt) - (a.confirmedAt ?? a.transferredAt))
    .slice(0, 10)
  return [
    {
      id: 'arrived',
      title: m.transfers_arrived_awaiting_confirmation(),
      hint: m.transfers_a_dossier_has_been_imported_verify(),
      rows: transfers.filter((t) => t.direction === 'in' && t.state === 'arrived'),
    },
    {
      id: 'in_transit',
      title: m.transfers_in_transit(),
      hint: m.transfers_still_in_the_custody_of_the(),
      rows: transfers.filter((t) => t.direction === 'out' && t.state === 'in_transit'),
    },
    {
      id: 'preparing',
      title: m.transfers_preparing(),
      hint: m.transfers_order_recorded_checklist_and_dispatch_st(),
      rows: transfers.filter((t) => t.direction === 'out' && t.state === 'preparing'),
    },
    { id: 'recent', title: m.transfers_recently_completed(), hint: m.transfers_the_last_ten_confirmed_or_cancelled(), rows: recent },
  ]
}

/** The transfer board (docs/prisons/product-map/08 1.5): one card per person,
 * grouped by where the movement is, with only the actions that state allows. */
export function TransferBoard() {
  const { data: transfers } = useTransfers()
  const [cancelling, setCancelling] = useState<Transfer | null>(null)

  const sections = sectionsFrom(transfers)
  const empty = sections.every((s) => s.rows.length === 0)

  return (
    <div className="flex flex-col gap-6">
      {empty && <p className="text-sm text-muted-foreground">{m.transfers_no_transfers_yet_start_one_from()}</p>}
      {sections
        .filter((s) => s.rows.length > 0)
        .map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-medium">
                {section.title} <span className="text-sm font-normal text-muted-foreground">({section.rows.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {section.rows.map((row) => (
                <TransferCard key={row.id} transfer={row} onCancel={() => setCancelling(row)} />
              ))}
            </div>
          </section>
        ))}
      <CancelDialog transfer={cancelling} onClose={() => setCancelling(null)} />
    </div>
  )
}

function TransferCard({ transfer, onCancel }: { transfer: Transfer; onCancel: () => void }) {
  const importReceipt = useImportReceipt()
  const [busy, setBusy] = useState(false)
  const out = transfer.direction === 'out'

  const reExport = async () => {
    setBusy(true)
    try {
      const file = await getDossierFile(transfer.id)
      const path = await saveExchangeFile(file)
      if (path) t.success(m.transfers_sealed_dossier_saved(), { description: path })
    } catch (error) {
      t.error(m.transfers_could_not_export_the_dossier(), { description: transferErrorText(error, m.transfers_please_try_again()) })
    } finally {
      setBusy(false)
    }
  }

  const importFromReceiver = async () => {
    setBusy(true)
    try {
      const file = await openExchangeFile('pleadli-receipt')
      if (!file) return
      await importReceipt.mutateAsync({ contentBase64: file.contentBase64 })
      t.success(m.transfers_receipt_accepted(), { description: m.transfers_the_transfer_is_confirmed_and_this() })
    } catch (error) {
      t.error(m.transfers_could_not_use_that_receipt(), { description: transferErrorText(error, m.transfers_please_try_again()) })
    } finally {
      setBusy(false)
    }
  }

  const name = transfer.personName ?? m.transfers_unnamed()
  const when = transfer.dispatchedAt ?? transfer.arrivedAt ?? transfer.plannedAt ?? transfer.transferredAt

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            {transfer.prisonerId ? (
              <Link to="/prisoners/$prisonerId" params={{ prisonerId: transfer.prisonerId }} className="truncate text-sm font-medium hover:underline">
                {name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">{name}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {out ? m.transfers_to() : m.transfers_from()} {transfer.otherPrisonName ?? m.transfers_another_prison()}
            </span>
          </div>
          <Badge variant={transfer.state === 'arrived' ? 'destructive' : 'outline'} className="shrink-0">
            {transferStateLabel(transfer.direction, transfer.state)}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <Item label={out ? m.transfers_order() : m.transfers_order_under()}>{transfer.orderReference ?? transfer.orderingAuthority ?? m.transfers_not_recorded()}</Item>
          <Item label={transfer.state === 'preparing' ? m.transfers_planned() : out ? m.transfers_departed() : m.transfers_arrived()}>{format(when, 'PPp')}</Item>
          {transfer.escort && <Item label={m.transfers_escort()}>{transfer.escort}</Item>}
          {transfer.confirmedAt && <Item label={m.transfers_confirmed()}>{format(transfer.confirmedAt, 'PPp')}</Item>}
        </dl>
        {transfer.notes && <p className="whitespace-pre-line text-xs text-muted-foreground">{transfer.notes}</p>}

        <div className="flex flex-wrap gap-2">
          {out && transfer.state === 'preparing' && transfer.prisonerId && (
            <>
              <Link to="/procedures/transfer/$prisonerId" params={{ prisonerId: transfer.prisonerId }} className={buttonVariants({ size: 'sm' })}>
                {m.transfers_continue_preparing()}
              </Link>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                {m.transfers_cancel_transfer()}
              </Button>
            </>
          )}
          {out && transfer.state === 'in_transit' && (
            <>
              <Button size="sm" onClick={importFromReceiver} disabled={busy}>
                {m.transfers_import_receipt()}
              </Button>
              <Button size="sm" variant="secondary" onClick={reExport} disabled={busy}>
                {m.transfers_export_sealed_dossier_again()}
              </Button>
            </>
          )}
          {!out && transfer.state === 'arrived' && (
            <Link to="/procedures/arrival/$transferId" params={{ transferId: transfer.id }} className={buttonVariants({ size: 'sm' })}>
              {m.transfers_open_arrival()}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col')}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

function CancelDialog({ transfer, onClose }: { transfer: Transfer | null; onClose: () => void }) {
  const cancel = useCancelTransfer()
  const [reason, setReason] = useState('')

  const submit = async () => {
    if (!transfer) return
    try {
      await cancel.mutateAsync({ id: transfer.id, reason })
      t.success(m.transfers_transfer_cancelled())
      setReason('')
      onClose()
    } catch (error) {
      t.error(m.transfers_could_not_cancel(), { description: transferErrorText(error, m.transfers_please_try_again()) })
    }
  }

  return (
    <Dialog open={transfer !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.transfers_cancel_this_transfer()}</DialogTitle>
          <DialogDescription>{m.transfers_only_a_transfer_still_being_prepared()}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{m.transfers_reason()}</FieldLabel>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m.transfers_why_is_it_not_going_ahead()} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {m.transfers_keep_it()}
          </Button>
          <Button onClick={submit} disabled={!reason.trim() || cancel.isPending}>
            {m.transfers_cancel_transfer()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
