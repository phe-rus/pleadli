import { Createpanel } from '@/components/create-panel'
import { FacilityProfileForm } from '@/features/facility'
import { useToday } from '@/features/obligations'
import { isObligationAlertsEnabled, setObligationAlertsEnabled, useObligationAlerts } from '@/hooks/use-obligation-alerts'
import { buttonVariants } from '@pleadli/ui/button'
import { Switch } from '@pleadli/ui/switch'
import { Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { m } from '@/paraglide/messages'
import { AttentionSection } from './attention-section'
import { CustodySection } from './custody-section'
import { DocumentsSection } from './documents-section'
import { OperationsSection } from './operations-section'
import { OverviewChart } from './overview-chart'
import { RecentSection } from './recent-section'
import { TodayHeader } from './today-header'

/**
 * The facility's working home (docs/prisons/product/08 1.3), read top to
 * bottom as the questions an officer arrives with: where am I, what needs
 * action, what is happening today, who is held, what changed, what paper is
 * owed, and the one chart of what has been coming in and going out. Reports
 * is documents only and has no statistics. Everything
 * on the page comes from the one Today payload the node serves, plus the
 * inbox and the reports list for the two kinds of attention that live there.
 */
export function TodayView() {
  const { data: today } = useToday()
  const [alerts, setAlerts] = useState(isObligationAlertsEnabled)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const openProfile = useCallback(() => setProfileOpen(true), [])
  useObligationAlerts()

  return (
    <article className="page [--page-max:72rem]">
      <TodayHeader
        today={today}
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {m.today_desktop_alerts()}
              <Switch
                checked={alerts}
                onCheckedChange={(checked) => {
                  setObligationAlertsEnabled(checked)
                  setAlerts(checked)
                }}
              />
            </label>
            <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
              {m.today_receive_someone()}
            </Link>
          </>
        }
      />

      <AttentionSection today={today} onSetupProfile={openProfile} />
      <OperationsSection today={today} />
      <CustodySection today={today} />
      <OverviewChart />
      <RecentSection today={today} />
      <DocumentsSection today={today} />

      <Createpanel
        open={profileOpen}
        onOpenChange={setProfileOpen}
        isDirty={profileDirty}
        headings={{ title: m.today_facility_profile(), description: m.today_this_facility_s_name_and_approved() }}
      >
        <FacilityProfileForm profile={today.facility} onSuccess={() => setProfileOpen(false)} onDirtyChange={setProfileDirty} />
      </Createpanel>
    </article>
  )
}
