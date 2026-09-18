import { AreaField, SwitchField, TextField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { fromDateInput, toDateInput } from '@/lib/datetime'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useSetSentence } from './queries'
import type { Instrument, Sentence } from './schema'
import { SelectField } from '@/components/form-fields'
import { instrumentKindLabel } from './schema'

type SentenceFormProps = {
  prisonerId: string
  current: Sentence | null
  instruments: readonly Instrument[]
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Records the sentence from the warrant. The dates the facility acts on
 * (entitlement, parole window, s.88 review) are computed from it, so a
 * correction needs a reason and supersedes the earlier entry.
 */
export function SentenceForm({ prisonerId, current, instruments, onSuccess, onDirtyChange }: SentenceFormProps) {
  const setSentence = useSetSentence()
  const [isLife, setIsLife] = useState(current?.isLife ?? false)
  const [years, setYears] = useState(String(current?.termYears ?? 0))
  const [months, setMonths] = useState(String(current?.termMonths ?? 0))
  const [days, setDays] = useState(String(current?.termDays ?? 0))
  const [startsOn, setStartsOn] = useState(toDateInput(current?.startsOn ?? Date.now()))
  const [forfeited, setForfeited] = useState(String(current?.remissionForfeitedDays ?? 0))
  const [instrumentId, setInstrumentId] = useState(current?.instrumentId ?? '')
  const [reason, setReason] = useState('')

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    onDirtyChange?.(true)
    setter(value)
  }

  const submit = async () => {
    const start = fromDateInput(startsOn)
    if (start == null) {
      t.error('Enter the date the sentence starts')
      return
    }
    try {
      await setSentence.mutateAsync({
        prisonerId,
        instrumentId: instrumentId || null,
        termYears: Number(years) || 0,
        termMonths: Number(months) || 0,
        termDays: Number(days) || 0,
        isLife,
        startsOn: start,
        remissionForfeitedDays: Number(forfeited) || 0,
        reason,
      })
      t.success('Sentence recorded')
      onSuccess?.()
    } catch (error) {
      t.error('Could not record the sentence', { description: error instanceof ApiError ? error.message : 'Please try again.' })
    }
  }

  const usable = instruments.filter((i) => i.status !== 'superseded')

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <SwitchField label="Life sentence" checked={isLife} onChange={change(setIsLife)} />
      {!isLife && (
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Years" type="number" value={years} onChange={change(setYears)} />
          <TextField label="Months" type="number" value={months} onChange={change(setMonths)} />
          <TextField label="Days" type="number" value={days} onChange={change(setDays)} />
        </div>
      )}
      <TextField
        label="Sentence starts on"
        type="date"
        value={startsOn}
        onChange={change(setStartsOn)}
        description="Check the warrant: the date the sentence runs from, which may be earlier than admission."
      />
      {current && (
        <TextField
          label="Remission forfeited (days)"
          type="number"
          value={forfeited}
          onChange={change(setForfeited)}
          description="Days of remission lost to a disciplinary finding (s.85)."
        />
      )}
      {usable.length > 0 && (
        <SelectField
          label="Warrant it comes from"
          value={instrumentId}
          onChange={change(setInstrumentId)}
          options={[{ value: '', label: 'Not linked' }, ...usable.map((i) => ({ value: i.id, label: `${instrumentKindLabel(i.kind)}${i.reference ? ` ${i.reference}` : ''}` }))]}
          placeholder="Choose"
        />
      )}
      {current && <AreaField label="Reason for the change" value={reason} onChange={change(setReason)} description="Required. The earlier entry is kept, marked superseded." />}
      <DrawerFooter>
        <Button type="submit" disabled={setSentence.isPending}>
          Record sentence
        </Button>
      </DrawerFooter>
    </form>
  )
}
