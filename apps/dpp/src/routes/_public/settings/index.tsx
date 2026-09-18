import { prosecutorProfileOptions, useProsecutorProfile, useSaveProsecutorProfile } from '@/features/prosecutor-profile'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prosecutorProfileOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** DPP is a single prosecutor installation by deliberate product decision
 * (docs/dpp/PRODUCT.md), so this is a plain, editable profile, not a
 * login or a roster (spec: docs/specs/_root/0001-officer-identity-
 * sign-in). Name and rank appear on generated documents, e.g. the
 * printable Charge Sheet's sanctioning signature line. */
function RouteComponent() {
  const { data: profile } = useProsecutorProfile()
  const saveProfile = useSaveProsecutorProfile()

  const form = useAppForm({
    defaultValues: { name: profile?.name ?? '', rank: profile?.rank ?? '' },
    onSubmit: async ({ value }) => {
      try {
        await saveProfile.mutateAsync({ name: value.name, rank: value.rank.trim() ? value.rank : null })
        t.success('Profile saved')
      } catch {
        t.error('Could not save profile', { description: 'Please try again.' })
      }
    },
  })

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Settings</h1>
        <p className="md:max-w-lg">Your name and rank, used for attribution on generated documents.</p>
      </section>

      <form
        className="flex max-w-sm flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">{(f) => <f.input label="Full name" />}</form.AppField>
        <form.AppField name="rank">{(f) => <f.input label="Rank (optional)" placeholder="e.g. Senior State Attorney" />}</form.AppField>
        <form.AppForm>
          <form.submit label="Save" />
        </form.AppForm>
      </form>
    </article>
  )
}
