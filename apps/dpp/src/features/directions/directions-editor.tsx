import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Textarea } from '@pleadli/ui/textarea'
import { directionKinds, type DirectionDraft, type DirectionKind } from './schema'
import * as m from '@/paraglide/messages'

export type PersonOption = { id: string; name: string }

/** The directions a return carries: what Police are to do, one item at a time,
 * each with a kind. At least one is needed before a return can be recorded. */
export function DirectionsEditor({
  value,
  onChange,
  people,
}: {
  value: DirectionDraft[]
  onChange: (next: DirectionDraft[]) => void
  people: PersonOption[]
}) {
  const update = (index: number, patch: Partial<DirectionDraft>) => onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)))

  return (
    <Field>
      <FieldLabel>{m["direction.editor.label"]()}</FieldLabel>
      <FieldDescription>{m["direction.editor.description"]()}</FieldDescription>
      <div className="flex flex-col gap-3">
        {value.map((direction, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={m["direction.editor.kind_aria"]({ number: index + 1 })}
                className="h-8 rounded-md border border-input bg-input/20 px-2"
                value={direction.kind}
                onChange={(e) => update(index, { kind: e.target.value as DirectionKind })}
              >
                {directionKinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              {direction.kind === 'statement' && (
                <select
                  aria-label={m["direction.editor.statement_from_aria"]()}
                  className="h-8 rounded-md border border-input bg-input/20 px-2"
                  value={direction.personId ?? ''}
                  onChange={(e) => update(index, { personId: e.target.value || null })}
                >
                  <option value="">{m["direction.editor.from_unnamed"]()}</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => onChange(value.filter((_, i) => i !== index))}>
                {m["common.remove"]()}
              </Button>
            </div>
            <Textarea
              aria-label={m["direction.editor.instruction_aria"]({ number: index + 1 })}
              value={direction.instruction}
              onChange={(e) => update(index, { instruction: e.target.value })}
              placeholder={directionKinds.find((k) => k.id === direction.kind)?.hint}
            />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onChange([...value, { kind: 'evidence', instruction: '', personId: null }])}>
          {m["direction.editor.add"]()}
        </Button>
      </div>
    </Field>
  )
}
