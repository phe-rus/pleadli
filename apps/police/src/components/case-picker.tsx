import { Createpanel } from '@/components/create-panel'
import { casesOptions, CaseForm } from '@/features/cases'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@pleadli/ui/combobox'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

export type CasePickerProps = {
  value: string | null
  onValueChange: (caseId: string | null) => void
  placeholder?: string
}

/** Search-and-pick a case, mirroring `PersonPicker`. */
export function CasePicker({ value, onValueChange, placeholder = 'Search for a case…' }: CasePickerProps) {
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const { data: cases } = useQuery(casesOptions(query))

  return (
    <div className="flex items-center gap-2">
      <Combobox value={value} onValueChange={onValueChange} inputValue={query} onInputValueChange={setQuery}>
        <ComboboxInput className="md:max-w-sm rounded!" placeholder={placeholder} showClear>
          <ComboboxContent>
            <ComboboxList>
              {(cases ?? []).map((c) => (
                <ComboboxItem key={c.id} value={c.id}>
                  {c.reference} · {c.summary}
                </ComboboxItem>
              ))}
              <ComboboxEmpty>No matching cases</ComboboxEmpty>
            </ComboboxList>
          </ComboboxContent>
        </ComboboxInput>
      </Combobox>

      <Createpanel
        open={addOpen}
        onOpenChange={setAddOpen}
        trigger={
          <Button type="button" size="icon-sm" variant="secondary" aria-label="Add new case">
            <HugeiconsIcon icon={AddCircleIcon} />
          </Button>
        }
        headings={{ title: 'Add case', description: "Record a case that isn't already known to the system." }}
      >
        <CaseForm
          onSuccess={(kase) => {
            onValueChange(kase.id)
            setAddOpen(false)
          }}
        />
      </Createpanel>
    </div>
  )
}
