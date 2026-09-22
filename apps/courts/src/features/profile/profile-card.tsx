import { messageOf } from '@/lib/api'
import { SettingsCard } from '@/components/settings-card'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useProfile, useSaveProfile } from './queries'
import { saveProfileSchema } from './schema'
import { courtLevels } from '../cases/schema'

/** Who sits here. The name is who the audit trail records and who signs each
 * order; the court is what an order is headed with. No sign-in: this is one
 * judicial officer's installation. */
export function ProfileCard() {
  const { data: profile } = useProfile()
  const save = useSaveProfile()

  const form = useAppForm({
    defaultValues: {
      name: profile?.name ?? '',
      title: profile?.title ?? '',
      courtName: profile?.courtName ?? '',
      courtLevel: profile?.courtLevel ?? 'magistrate',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = saveProfileSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync({ name: value.name, title: value.title.trim() || null, courtName: value.courtName.trim() || null, courtLevel: value.courtLevel })
        t.success('Saved')
        formApi.reset(value)
      } catch (error) {
        t.error('Could not save', { description: messageOf(error) })
      }
    },
  })

  return (
    <SettingsCard
      title="Judicial officer and court"
      description="Orders are signed with your name and headed with the court. The audit trail records your name against what you do."
      hint={profile ? 'Changes apply to orders issued from now on. An order already issued keeps its wording.' : 'Set these before you issue your first order.'}
      action={
        <form.Subscribe selector={(state) => [state.isSubmitting, state.isDirty] as const}>
          {([submitting, dirty]) => (
            <Button type="submit" size="sm" disabled={submitting || !dirty}>
              Save
            </Button>
          )}
        </form.Subscribe>
      }
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="name">{(f) => <f.input label="Your name" placeholder="Hon. A. Nabirye" />}</form.AppField>
      <form.AppField name="title">{(f) => <f.input label="Title (optional)" placeholder="Magistrate Grade I" />}</form.AppField>
      <form.AppField name="courtName">{(f) => <f.input label="Court" placeholder="Buganda Road Chief Magistrate's Court" />}</form.AppField>
      <form.AppField name="courtLevel">{(f) => <f.select label="Court level" options={courtLevels.map((l) => ({ value: l.id, label: l.label }))} />}</form.AppField>
    </SettingsCard>
  )
}
