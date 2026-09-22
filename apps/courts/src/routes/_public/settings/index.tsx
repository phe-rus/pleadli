import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { IntegrityCard } from '@/features/audit'
import { ProfileCard } from '@/features/profile'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/')({
  component: RouteComponent,
})

/** One column of cards. What can be set is set here; what is not built yet is
 * said so, so nothing looks like a working feature that is not. */
function RouteComponent() {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Who sits here, and the state of the record.</p>
        </div>
      </header>

      <div className="flex w-full flex-col gap-6 md:max-w-md">
        <ProfileCard />
        <IntegrityCard />
        <SettingsCard
          title="Not built yet"
          description="This version covers the register, the cause list, sittings and their signed records, adjournments, exhibits, orders, rulings and judgments, audio recording with a typed transcript, returns, and an offline library you fill yourself. These are still to come."
        >
          <div role="list" className="flex flex-col gap-2">
            {['A transcription engine (none is installed: passages are typed against the recording by a person)', 'The Laws.Africa statute texts bundled and checked against source', 'Backups and restoring from one', 'App lock', 'Receiving cases from DPP and sending notices back', 'Prisons production and warrants'].map((item) => (
              <div key={item} role="listitem" className="flex items-center justify-between gap-3">
                <p>{item}</p>
                <Tag tone="planned">Planned</Tag>
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>
    </article>
  )
}
