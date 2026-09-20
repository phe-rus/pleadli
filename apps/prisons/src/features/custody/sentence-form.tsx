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
import { m } from '@/paraglide/messages'

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
      t.error(m.custody_enter_the_date_the_sentence_starts())
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
      t.success(m.custody_sentence_recorded())
      onSuccess?.()
    } catch (error) {
      t.error(m.custody_could_not_record_the_sentence(), { description: error instanceof ApiError ? error.message : m.custody_please_try_again() })
    }
  }

  const usable = instruments.filter((i) => i.status !== 'superseded')

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <SwitchField label={m.custody_life_sentence()} checked={isLife} onChange={change(setIsLife)} />
      {!isLife && (
        <div className="grid grid-cols-3 gap-3">
          <TextField label={m.custody_years()} type="number" value={years} onChange={change(setYears)} />
          <TextField label={m.custody_months()} type="number" value={months} onChange={change(setMonths)} />
          <TextField label={m.custody_days()} type="number" value={days} onChange={change(setDays)} />
        </div>
      )}
      <TextField
        label={m.custody_sentence_starts_on()}
        type="date"
        value={startsOn}
        onChange={change(setStartsOn)}
        description={m.custody_check_the_warrant_the_date_the()}
      />
      {current && (
        <TextField
          label={m.custody_remission_forfeited_days()}
          type="number"
          value={forfeited}
          onChange={change(setForfeited)}
          description={m.custody_days_of_remission_lost_to_a()}
        />
      )}
      {usable.length > 0 && (
        <SelectField
          label={m.custody_warrant_it_comes_from()}
          value={instrumentId}
          onChange={change(setInstrumentId)}
          options={[{ value: '', label: m.custody_not_linked() }, ...usable.map((i) => ({ value: i.id, label: `${instrumentKindLabel(i.kind)}${i.reference ? ` ${i.reference}` : ''}` }))]}
          placeholder={m.custody_choose()}
        />
      )}
      {current && <AreaField label={m.custody_reason_for_the_change()} value={reason} onChange={change(setReason)} description={m.custody_required_the_earlier_entry_is_kept()} />}
      <DrawerFooter>
        <Button type="submit" disabled={setSentence.isPending}>
          {m.custody_record_sentence()}
        </Button>
      </DrawerFooter>
    </form>
  )
}
