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

type Section = { id: string; title: string; hint: string; rows: Transfer[] }

function sectionsFrom(transfers: Transfer[]): Section[] {
  const recent = transfers
    .filter((t) => t.state === 'confirmed' || t.state === 'cancelled')
    .sort((a, b) => (b.confirmedAt ?? b.transferredAt) - (a.confirmedAt ?? a.transferredAt))
    .slice(0, 10)
  return [
    {
      id: 'arrived',
      title: 'Arrived, awaiting confirmation',
      hint: 'A dossier has been imported. Verify identity and property, then confirm to the sender.',
      rows: transfers.filter((t) => t.direction === 'in' && t.state === 'arrived'),
    },
    {
      id: 'in_transit',
      title: 'In transit',
      hint: 'Still in the custody of the prison officer (s.73(5)). The stay closes when the receiver confirms.',
      rows: transfers.filter((t) => t.direction === 'out' && t.state === 'in_transit'),
    },
    {
      id: 'preparing',
      title: 'Preparing',
      hint: 'Order recorded, checklist and dispatch still to do.',
      rows: transfers.filter((t) => t.direction === 'out' && t.state === 'preparing'),
    },
    { id: 'recent', title: 'Recently completed', hint: 'The last ten confirmed or cancelled.', rows: recent },
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
      {empty && <p className="text-sm text-muted-foreground">No transfers yet. Start one from a prisoner's file, or receive one that arrived by file.</p>}
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
      if (path) t.success('Sealed dossier saved', { description: path })
    } catch (error) {
      t.error('Could not export the dossier', { description: transferErrorText(error, 'Please try again.') })
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
      t.success('Receipt accepted', { description: 'The transfer is confirmed and this stay is closed.' })
    } catch (error) {
      t.error('Could not use that receipt', { description: transferErrorText(error, 'Please try again.') })
    } finally {
      setBusy(false)
    }
  }

  const name = transfer.personName ?? 'Unnamed'
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
              {out ? 'To' : 'From'} {transfer.otherPrisonName ?? 'another prison'}
            </span>
          </div>
          <Badge variant={transfer.state === 'arrived' ? 'destructive' : 'outline'} className="shrink-0">
            {transferStateLabel(transfer.direction, transfer.state)}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <Item label={out ? 'Order' : 'Order under'}>{transfer.orderReference ?? transfer.orderingAuthority ?? 'Not recorded'}</Item>
          <Item label={transfer.state === 'preparing' ? 'Planned' : out ? 'Departed' : 'Arrived'}>{format(when, 'PPp')}</Item>
          {transfer.escort && <Item label="Escort">{transfer.escort}</Item>}
          {transfer.confirmedAt && <Item label="Confirmed">{format(transfer.confirmedAt, 'PPp')}</Item>}
        </dl>
        {transfer.notes && <p className="whitespace-pre-line text-xs text-muted-foreground">{transfer.notes}</p>}

        <div className="flex flex-wrap gap-2">
          {out && transfer.state === 'preparing' && transfer.prisonerId && (
            <>
              <Link to="/procedures/transfer/$prisonerId" params={{ prisonerId: transfer.prisonerId }} className={buttonVariants({ size: 'sm' })}>
                Continue preparing
              </Link>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel transfer
              </Button>
            </>
          )}
          {out && transfer.state === 'in_transit' && (
            <>
              <Button size="sm" onClick={importFromReceiver} disabled={busy}>
                Import receipt
              </Button>
              <Button size="sm" variant="secondary" onClick={reExport} disabled={busy}>
                Export sealed dossier again
              </Button>
            </>
          )}
          {!out && transfer.state === 'arrived' && (
            <Link to="/procedures/arrival/$transferId" params={{ transferId: transfer.id }} className={buttonVariants({ size: 'sm' })}>
              Open arrival
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
      t.success('Transfer cancelled')
      setReason('')
      onClose()
    } catch (error) {
      t.error('Could not cancel', { description: transferErrorText(error, 'Please try again.') })
    }
  }

  return (
    <Dialog open={transfer !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this transfer?</DialogTitle>
          <DialogDescription>Only a transfer still being prepared can be cancelled. The reason is kept in the audit trail.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Reason</FieldLabel>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it not going ahead?" autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button onClick={submit} disabled={!reason.trim() || cancel.isPending}>
            Cancel transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
