import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useCertifyProgrammeParticipation } from './queries'
import { certifyProgrammeParticipationSchema, type ProgrammeParticipation } from './schema'

export type CertifyProgrammeFormProps = {
  participation: ProgrammeParticipation
  onSuccess?: (participation: ProgrammeParticipation) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Records completion via a real, discrete, dated external assessment
 * (UVTAB trade-testing, docs/prisons/RESEARCH.md §11.9-11.10) — not a
 * general attendance/scheduling feature, which stays unbuilt.
 */
export function CertifyProgrammeForm({ participation, onSuccess, onDirtyChange }: CertifyProgrammeFormProps) {
  const certify = useCertifyProgrammeParticipation(participation.prisonerId)

  const form = useAppForm({
    defaultValues: {
      completedAt: toDatetimeLocal(Date.now()),
      certificateReference: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = certifyProgrammeParticipationSchema.safeParse({
          ...value,
          completedAt: new Date(value.completedAt).getTime(),
        })
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const input = { ...value, completedAt: new Date(value.completedAt).getTime() }
        const result = await certify.mutateAsync({ id: participation.id, input })
        t.success('Programme participation certified')
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error('Could not record certification', { description: 'Please try again.' })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="completedAt">
        {(f) => (
          <Field>
            <FieldLabel>Completed / assessed at</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="certificateReference">
        {(f) => <f.input label="Certificate reference (optional)" placeholder="e.g. UVTAB National Certificate Level 3" />}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label="Mark completed & certified" />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
