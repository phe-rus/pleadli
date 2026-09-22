import { SettingsCard } from '@/components/settings-card'
import { messageOf } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useProfile, useSaveProfile } from './queries'
import { saveProfileSchema } from './schema'

/** Who practises here. The name is who the audit trail records and who signs what
 * is filed; the firm heads a filed document. No sign-in: this is one advocate's
 * installation. */
export function ProfileCard() {
  const { data: profile } = useProfile()
  const save = useSaveProfile()

  const form = useAppForm({
    defaultValues: { name: profile?.name ?? '', firm: profile?.firm ?? '', phone: profile?.phone ?? '', email: profile?.email ?? '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = saveProfileSchema.safeParse(value)
        return parsed.success ? undefined : parsed.error.issues[0]?.message
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save.mutateAsync({ name: value.name, firm: value.firm.trim() || null, phone: value.phone.trim() || null, email: value.email.trim() || null })
        t.success('Saved')
        formApi.reset(value)
      } catch (error) {
        t.error('Could not save', { description: messageOf(error) })
      }
    },
  })

  return (
    <SettingsCard
      title="Advocate and firm"
      description="What you file is signed with your name and headed with your firm. The audit trail records your name against what you do."
      hint={profile ? 'Changes apply to what you file from now on. A document already filed keeps its wording.' : 'Set your name before you file your first document.'}
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
      <form.AppField name="name">{(f) => <f.input label="Your name" placeholder="A. Nabirye, Advocate" />}</form.AppField>
      <form.AppField name="firm">{(f) => <f.input label="Firm (optional)" placeholder="Nabirye & Co. Advocates" />}</form.AppField>
      <form.AppField name="phone">{(f) => <f.input label="Phone (optional)" />}</form.AppField>
      <form.AppField name="email">{(f) => <f.input label="Email (optional)" />}</form.AppField>
    </SettingsCard>
  )
}
