import { useReportDirty } from '@/hooks/use-report-dirty'
import { useProsecutorProfile } from '@/features/prosecutor-profile'
import { RichTextInput } from '@pleadli/rich-text'
import { useEffect } from 'react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useCreateDecision } from './queries'
import { createDecisionSchema, decisionTypeDelegable, decisionTypes, type Decision } from './schema'

export type DecisionFormProps = {
  prosecutionFileId: string
  onSuccess?: (decision: Decision) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records a formal prosecutorial decision as an auditable event
 * (docs/dpp/PRODUCT.md §Decisions & Reviews) — this is the actual
 * substance of the "Charging Review" workspace, not a status dropdown.
 */
export function DecisionForm({ prosecutionFileId, onSuccess, onDirtyChange }: DecisionFormProps) {
  const createDecision = useCreateDecision()
  const { data: prosecutorProfile } = useProsecutorProfile()

  const form = useAppForm({
    defaultValues: {
      decisionType: '',
      decidedBy: '',
      decidedAt: toDatetimeLocal(Date.now()),
      reasons: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createDecisionSchema.safeParse({
          ...value,
          prosecutionFileId,
          decidedAt: new Date(value.decidedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, prosecutionFileId, decidedAt: new Date(value.decidedAt).getTime() }
        const result = await createDecision.mutateAsync(input)
        t.success('Decision recorded')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record decision', { description: 'Please try again.' })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  // Prefills from the prosecutor's own profile (spec: docs/specs/_root/
  // 0001-officer-identity-sign-in) rather than requiring it retyped every
  // time; still a plain editable field, not locked to the profile.
  useEffect(() => {
    if (prosecutorProfile?.name && !form.getFieldValue('decidedBy')) {
      form.setFieldValue('decidedBy', prosecutorProfile.name)
    }
  }, [prosecutorProfile, form])

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="decisionType">
        {(f) => (
          <Field>
            <FieldLabel>Decision</FieldLabel>
            <Select items={decisionTypes} value={f.state.value} onValueChange={(value) => f.handleChange(value ?? f.state.value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {decisionTypes.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {f.state.value && !decisionTypeDelegable(f.state.value) && (
              <FieldDescription>
                <Badge variant="secondary" className="mr-1.5">
                  DPP only
                </Badge>
                Not delegable under Ugandan law: exercised by the Director of Public Prosecutions personally.
              </FieldDescription>
            )}
          </Field>
        )}
      </form.AppField>

      <div className="grid grid-cols-2 gap-3">
        <form.AppField name="decidedBy">{(f) => <f.input label="Decided by (optional)" placeholder="Name" />}</form.AppField>
        <form.AppField name="decidedAt">
          {(f) => (
            <Field>
              <FieldLabel>Decided at</FieldLabel>
              <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            </Field>
          )}
        </form.AppField>
      </div>

      <form.AppField name="reasons">
        {(f) => (
          <Field>
            <FieldLabel>Reasons (optional)</FieldLabel>
            <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Reasons…" />
            <FieldDescription>
              Privileged between ODPP and the investigating agency, never disclosed to unauthorised persons.
            </FieldDescription>
          </Field>
        )}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Record decision" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
