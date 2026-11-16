import { Createpanel } from '@/components/create-panel'
import { FacilityProfileForm } from '@/features/facility'
import { useObligationActions, useToday } from '@/features/obligations'
import { useObligationAlerts } from '@/hooks/use-obligation-alerts'
import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'
import { AttentionSection } from './attention-section'
import { CustodySection } from './custody-section'
import { DocumentsSection } from './documents-section'
import { RecentSection } from './recent-section'
import { TodayHeader } from './today-header'
import { CannotWait, CourtToday, InAndOut, splitDay } from './day-sections'

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
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const openProfile = useCallback(() => setProfileOpen(true), [])
  useObligationAlerts()
  // Today reads as the prison's day: what cannot wait, court, who comes and goes, then the rest.
  const day = useMemo(() => splitDay(today.obligations, today.now), [today.obligations, today.now])
  const { action, drawers } = useObligationActions()

  return (
    <article className="page">
      <TodayHeader
        today={today}
        actions={
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            {m.today_receive_someone()}
          </Link>
        }
      />

      <CannotWait obligations={day.cannotWait} now={today.now} action={action} />
      <CourtToday obligations={day.court} now={today.now} action={action} />
      <InAndOut obligations={day.inOut} now={today.now} action={action} />
      <AttentionSection today={{ ...today, obligations: day.rest }} onSetupProfile={openProfile} />
      <CustodySection today={today} />
      <RecentSection today={today} />
      <DocumentsSection today={today} />
      {drawers}

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
