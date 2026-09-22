import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { useInstallation } from '@/features/session'
import { AlarmClockIcon, Building06Icon, CellsIcon, File02Icon, Share08Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { useOverview, usePendingRequests, useStations } from './queries'

const openLink = 'text-primary'

/** What a Command sees first: how many stations are reporting, the totals they
 * reported, and what needs attention: connections waiting, stations gone quiet,
 * stations with someone past the custody limit. Every figure is what a station
 * itself sent; nothing here is a record. */
export function CommandOverview() {
  const { data: installation } = useInstallation()
  const { data: overview } = useOverview()
  const { data: stations = [] } = useStations()
  const { data: requests = [] } = usePendingRequests()

  const pastLimit = stations.filter((s) => s.state === 'reporting' && (s.figures?.pastLimit ?? 0) > 0)
  const silent = stations.filter((s) => s.state === 'silent')
  const attention = requests.length + pastLimit.length + silent.length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{installation?.name ?? 'Command'}</h1>
          <p>What the stations under this command last reported. Figures and rosters only: no case, person or custody record ever reaches this command.</p>
        </div>
      </header>

      <section aria-label="Figures" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label="Stations reporting" icon={Building06Icon} tint="primary" value={overview?.reporting ?? 0} caption={`${overview?.stations ?? 0} registered, ${overview?.silent ?? 0} silent, ${overview?.requested ?? 0} waiting`} />
        <StatTile label="In custody" icon={CellsIcon} tint="amber" value={overview?.inCustody ?? 0} caption="Across the stations reporting now" />
        <StatTile
          label="Near or past the limit"
          icon={AlarmClockIcon}
          tint={(overview?.nearLimit ?? 0) + (overview?.pastLimit ?? 0) > 0 ? 'rose' : 'emerald'}
          value={(overview?.nearLimit ?? 0) + (overview?.pastLimit ?? 0)}
          caption={`${overview?.pastLimit ?? 0} past it, ${overview?.nearLimit ?? 0} within hours of it`}
        />
        <StatTile label="Open cases" icon={File02Icon} tint="primary" value={overview?.openCases ?? 0} caption="Reported by stations" />
        <StatTile label="Referrals without an outcome" icon={Share08Icon} tint="amber" value={overview?.referralsPending ?? 0} caption="Reported by stations" />
        <StatTile label="Officers" icon={UserGroupIcon} tint="emerald" value={overview?.officers ?? 0} caption="On the rosters reported" />
      </section>

      <section aria-labelledby="attention" className="page-section">
        <div className="section-head">
          <h2 id="attention">Needs attention</h2>
          {attention > 0 && <Tag tone="open">{attention === 1 ? '1 item' : `${attention} items`}</Tag>}
        </div>
        {attention === 0 ? (
          <EmptyNote>{stations.length === 0 ? 'No station is registered yet. Register one under Stations.' : 'Nothing needs attention. Every connected station is reporting and no one is past the custody limit.'}</EmptyNote>
        ) : (
          <RowList>
            {requests.length > 0 && (
              <Row
                marker="open"
                title={requests.length === 1 ? 'A station is waiting to be approved' : `${requests.length} stations are waiting to be approved`}
                summary="Check who asked before approving."
                trailing={<Link to="/stations" className={openLink}>Stations</Link>}
              />
            )}
            {pastLimit.map((station) => (
              <Row
                key={station.id}
                marker="urgent"
                title={station.name}
                summary={`${station.figures?.pastLimit} in custody past the limit, reported ${station.reportedAt ? formatDistanceToNowStrict(station.reportedAt, { addSuffix: true }) : ''}. Call the station.`}
                trailing={
                  <>
                    <Tag tone="urgent">Past the limit</Tag>
                    <Link to="/stations" className={openLink}>Stations</Link>
                  </>
                }
              />
            ))}
            {silent.map((station) => (
              <Row
                key={station.id}
                marker="open"
                title={station.name}
                summary={`No report for ${station.lastReportAt ? formatDistanceToNowStrict(station.lastReportAt) : 'a while'}. The figures below for this station are not current, so they are left out of the totals.`}
                trailing={
                  <>
                    <Tag tone="urgent">Silent</Tag>
                    <Link to="/stations" className={openLink}>Stations</Link>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </section>
    </article>
  )
}
