import { AreaField, SelectField, SwitchField, TextField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { fromDateInput, fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useRecordInstrument } from './queries'
import { instrumentKindLabel, instrumentKinds, type Instrument } from './schema'
import { m } from '@/paraglide/messages'

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
      t.success(m.custody_instrument_recorded())
      onSuccess?.()
    } catch (error) {
      t.error(m.custody_could_not_record_the_instrument(), { description: error instanceof ApiError ? error.message : m.custody_please_try_again() })
    }
  }

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {pending.length > 0 && (
        <SelectField
          label={m.custody_fulfils_an_awaited_document()}
          value={resolves}
          onChange={change((id: string) => {
            setResolves(id)
            const match = pending.find((p) => p.id === id)
            if (match) setKind(match.kind)
          })}
          options={[{ value: '', label: m.custody_none_this_is_a_new_instrument() }, ...pending.map((p) => ({ value: p.id, label: m.custody_awaited_kind({ kind: instrumentKindLabel(p.kind) }) }))]}
          placeholder={m.custody_choose()}
        />
      )}
      <SelectField
        label={m.custody_instrument()}
        value={kind}
        onChange={change(setKind)}
        options={instrumentKinds}
        placeholder={m.custody_choose_the_instrument()}
      />
      <TextField label={m.custody_issuing_court_or_authority()} value={authority} onChange={change(setAuthority)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label={m.custody_reference_or_number()} value={reference} onChange={change(setReference)} />
        <TextField label={m.custody_issued_on()} type="date" value={issuedOn} onChange={change(setIssuedOn)} />
      </div>
      <TextField label={m.custody_received_at()} type="datetime-local" value={receivedAt} onChange={change(setReceivedAt)} />
      <SwitchField
        label={m.custody_seal_or_signature_verified()}
        description={m.custody_if_it_cannot_be_verified_the()}
        checked={authenticated}
        onChange={change(setAuthenticated)}
      />
      <AreaField label={m.custody_verification_note_optional()} value={note} onChange={change(setNote)} />
      <DrawerFooter>
        <Button type="submit" disabled={!kind || record.isPending}>
          {m.custody_record_instrument()}
        </Button>
      </DrawerFooter>
    </form>
  )
}
