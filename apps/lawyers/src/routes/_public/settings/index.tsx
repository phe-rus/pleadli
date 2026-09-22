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
          <p>Who practises here, and the state of the record.</p>
        </div>
      </header>

      <div className="flex w-full flex-col gap-6 md:max-w-md">
        <ProfileCard />
        <IntegrityCard />
        <SettingsCard
          title="Not built yet"
          description="This version covers clients, matters, the diary, tasks with the state-funded scheme's duties, notes, time, documents you draft and file, and your side of a plea negotiation. These are still to come."
        >
          <div role="list" className="flex flex-col gap-2">
            {[
              'Receiving hearing notices, orders and judgments from the court',
              'Sending filings to the court and the prosecution',
              'Sharing the plea agreement with the DPP and the court',
              'Public holidays in the working-day counts',
              'Invoices and fee schedules',
              'Attachments and scanned documents',
              'App lock, backups and restore',
            ].map((item) => (
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
