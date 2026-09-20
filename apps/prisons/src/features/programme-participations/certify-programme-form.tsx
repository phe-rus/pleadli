import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { t } from '@pleadli/ui/goey-toaster'
import { useCertifyProgrammeParticipation } from './queries'
import { certifyProgrammeParticipationSchema, type ProgrammeParticipation } from './schema'
import { m } from '@/paraglide/messages'

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
        t.success(m.programme_participations_programme_participation_certified())
        formApi.reset()
        onSuccess?.(result)
      } catch {
        t.error(m.programme_participations_could_not_record_certification(), { description: m.programme_participations_please_try_again() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="panel-body"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="completedAt">
        {(f) => (
          <Field>
            <FieldLabel>{m.programme_participations_completed_assessed_at()}</FieldLabel>
            <Input type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
          </Field>
        )}
      </form.AppField>

      <form.AppField name="certificateReference">
        {(f) => <f.input label={m.programme_participations_certificate_reference_optional()} placeholder={m.programme_participations_e_g_uvtab_national_certificate_level()} />}
      </form.AppField>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m.programme_participations_mark_completed_certified()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
