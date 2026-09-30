import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { peopleSearchOptions, personFullName, PersonForm } from '@/features/people'
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

export type PersonPickerProps = {
  value: string | null
  onValueChange: (personId: string | null) => void
  placeholder?: string
}

export function PersonPicker({ value, onValueChange, placeholder = m["pickers.person_placeholder"]() }: PersonPickerProps) {
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const { data: people } = useQuery(peopleSearchOptions(query))

  return (
    <div className="flex items-center gap-2">
      <Combobox value={value} onValueChange={onValueChange} inputValue={query} onInputValueChange={setQuery}>
        <ComboboxInput className="md:max-w-sm rounded!" placeholder={placeholder} showClear>
          <ComboboxContent>
            <ComboboxList>
              {(people ?? []).map((person) => (
                <ComboboxItem key={person.id} value={person.id}>
                  {personFullName(person)}
                </ComboboxItem>
              ))}
              <ComboboxEmpty>{m["pickers.person_empty"]()}</ComboboxEmpty>
            </ComboboxList>
          </ComboboxContent>
        </ComboboxInput>
      </Combobox>

      <Createpanel
        open={addOpen}
        onOpenChange={setAddOpen}
        trigger={
          <Button type="button" size="icon-sm" variant="secondary" aria-label={m["pickers.person_add_aria"]()}>
            <HugeiconsIcon icon={AddCircleIcon} />
          </Button>
        }
        headings={{
          title: m["pickers.person_add_title"](),
          description: m["pickers.person_add_description"](),
        }}
      >
        <PersonForm
          onSuccess={(person) => {
            onValueChange(person.id)
            setAddOpen(false)
          }}
        />
      </Createpanel>
    </div>
  )
}
