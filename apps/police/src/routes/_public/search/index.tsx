import * as mock from '@/data/search'
import {
  DataTable,
  selectColumn
} from '@pleadli/forms-tables'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@pleadli/ui/combobox'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/search/')({
  component: RouteComponent,
})

function RouteComponent() {
  const [q, setQ] = useState<string | null>(null)

  const query = q ?? ''
  const groups = mock.searchSuggestions
    .filter((s) => s.label.toLowerCase().includes(query.toLowerCase()))
    .reduce((acc, s) => {
      const arr = acc.get(s.group) ?? []
      arr.push(s)
      acc.set(s.group, arr)
      return acc
    }, new Map<string, Array<(typeof mock.searchSuggestions)[number]>>())

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <DataTable
        aria-label='Search results'
        customSearchbar={() => {
          return (
            <section className="flex flex-col w-full">
              <h1>Search everything</h1>
              <Combobox value={q} onValueChange={setQ}>
                <ComboboxInput
                  className='md:max-w-lg rounded!'
                  placeholder="Search everything…"
                  showClear
                >
                  <ComboboxContent>
                    <ComboboxList>
                      {[...groups.entries()].map(([group, items]) => (
                        <ComboboxGroup key={group}>
                          <ComboboxLabel>{group}</ComboboxLabel>
                          {items.map((s) => (
                            <ComboboxItem key={s.id} value={s.label}>
                              {s.detail ? `${s.label} — ${s.detail}` : s.label}
                            </ComboboxItem>
                          ))}
                        </ComboboxGroup>
                      ))}
                      <ComboboxEmpty>No matches in the record yet</ComboboxEmpty>
                    </ComboboxList>
                  </ComboboxContent>
                </ComboboxInput>
              </Combobox>
            </section>
          )
        }}
        data={[mock.searchSuggestions]}
        columns={[
          selectColumn(),
        ]}
        getRowId={() => ''}
      />
    </article>
  )
}