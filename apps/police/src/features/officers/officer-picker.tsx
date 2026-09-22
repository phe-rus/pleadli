import { Field, FieldLabel } from '@pleadli/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useOfficers } from './queries'
import { officerDisplay } from './schema'

const NOT_ON_BOOKS = ''

/** Choose an officer from the station's books, or say the person is not on
 * them. Only officers who are still at the station are offered, plus the one
 * already chosen if they have since left, so an old record still shows who it
 * was. */
export function OfficerPicker({
  value,
  onValueChange,
  label = 'Officer',
  notOnBooksLabel = 'Someone not on the station books',
}: {
  value: string | null
  onValueChange: (officerId: string | null) => void
  label?: string
  notOnBooksLabel?: string
}) {
  const { data: officers } = useOfficers()
  const offered = officers.filter((o) => o.active || o.id === value)

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={[{ value: NOT_ON_BOOKS, label: notOnBooksLabel }, ...offered.map((o) => ({ value: o.id, label: officerDisplay(o) }))]}
        value={value ?? NOT_ON_BOOKS}
        onValueChange={(next) => onValueChange(next ? String(next) : null)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={notOnBooksLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NOT_ON_BOOKS}>{notOnBooksLabel}</SelectItem>
            {offered.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {officerDisplay(o)}
                {o.post ? `, ${o.post}` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
