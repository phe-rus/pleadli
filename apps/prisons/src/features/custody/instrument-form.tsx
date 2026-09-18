import { AreaField, SelectField, SwitchField, TextField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { fromDateInput, fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useRecordInstrument } from './queries'
import { instrumentKindLabel, instrumentKinds, type Instrument } from './schema'

type InstrumentFormProps = {
  prisonerId: string
  /** Awaited instruments this one may fulfil. */
  pending: readonly Instrument[]
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Records a legal instrument that has arrived (W1, s.58): what it is, who
 * issued it, whether its seal or signature was verified. If it is the
 * document that was awaited, the awaited entry is closed by it.
 */
export function InstrumentForm({ prisonerId, pending, onSuccess, onDirtyChange }: InstrumentFormProps) {
  const record = useRecordInstrument()
  const [kind, setKind] = useState(pending[0]?.kind ?? '')
  const [resolves, setResolves] = useState(pending[0]?.id ?? '')
  const [authority, setAuthority] = useState('')
  const [reference, setReference] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [receivedAt, setReceivedAt] = useState(toDatetimeLocal(Date.now()))
  const [authenticated, setAuthenticated] = useState(false)
  const [note, setNote] = useState('')

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    onDirtyChange?.(true)
    setter(value)
  }

  const submit = async () => {
    try {
      await record.mutateAsync({
        prisonerId,
        kind,
        issuingAuthority: authority,
        reference,
        issuedOn: fromDateInput(issuedOn),
        receivedAt: fromDatetimeLocal(receivedAt),
        authenticated,
        verificationNote: note,
        resolvesInstrumentId: resolves || null,
      })
      t.success('Instrument recorded')
      onSuccess?.()
    } catch (error) {
      t.error('Could not record the instrument', { description: error instanceof ApiError ? error.message : 'Please try again.' })
    }
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {pending.length > 0 && (
        <SelectField
          label="Fulfils an awaited document"
          value={resolves}
          onChange={change((id: string) => {
            setResolves(id)
            const match = pending.find((p) => p.id === id)
            if (match) setKind(match.kind)
          })}
          options={[{ value: '', label: 'None, this is a new instrument' }, ...pending.map((p) => ({ value: p.id, label: `Awaited: ${instrumentKindLabel(p.kind)}` }))]}
          placeholder="Choose"
        />
      )}
      <SelectField
        label="Instrument"
        value={kind}
        onChange={change(setKind)}
        options={instrumentKinds}
        placeholder="Choose the instrument"
      />
      <TextField label="Issuing court or authority" value={authority} onChange={change(setAuthority)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Reference or number" value={reference} onChange={change(setReference)} />
        <TextField label="Issued on" type="date" value={issuedOn} onChange={change(setIssuedOn)} />
      </div>
      <TextField label="Received at" type="datetime-local" value={receivedAt} onChange={change(setReceivedAt)} />
      <SwitchField
        label="Seal or signature verified"
        description="If it cannot be verified, the instrument is kept as awaiting rectification (s.58(4))."
        checked={authenticated}
        onChange={change(setAuthenticated)}
      />
      <AreaField label="Verification note (optional)" value={note} onChange={change(setNote)} />
      <DrawerFooter>
        <Button type="submit" disabled={!kind || record.isPending}>
          Record instrument
        </Button>
      </DrawerFooter>
    </form>
  )
}
