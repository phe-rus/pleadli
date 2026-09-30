import * as m from '@/paraglide/messages'
import { EmptyNote } from '@/components/planned'
import { Row, RowList } from '@/components/operational-row'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { useInstallation } from '@/features/session'
import { AlarmClockIcon, Building06Icon, CellsIcon, File02Icon, Share08Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from '@/lib/date'
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
          <h1>{installation?.name ?? m["command.fallback_name"]()}</h1>
          <p>{m["command.overview_lead"]()}</p>
        </div>
      </header>

      <section aria-label={m["command.figures"]()} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label={m["command.stations_reporting"]()} icon={Building06Icon} tint="primary" value={overview?.reporting ?? 0} caption={m["command.stations_reporting_caption"]({ registered: overview?.stations ?? 0, silent: overview?.silent ?? 0, waiting: overview?.requested ?? 0 })} />
        <StatTile label={m["common.in_custody"]()} icon={CellsIcon} tint="amber" value={overview?.inCustody ?? 0} caption={m["command.custody_caption"]()} />
        <StatTile
          label={m["command.near_or_past"]()}
          icon={AlarmClockIcon}
          tint={(overview?.nearLimit ?? 0) + (overview?.pastLimit ?? 0) > 0 ? 'rose' : 'emerald'}
          value={(overview?.nearLimit ?? 0) + (overview?.pastLimit ?? 0)}
          caption={m["command.near_or_past_caption"]({ past: overview?.pastLimit ?? 0, near: overview?.nearLimit ?? 0 })}
        />
        <StatTile label={m["common.open_cases"]()} icon={File02Icon} tint="primary" value={overview?.openCases ?? 0} caption={m["command.reported_by_stations"]()} />
        <StatTile label={m["command.referrals_pending"]()} icon={Share08Icon} tint="amber" value={overview?.referralsPending ?? 0} caption={m["command.reported_by_stations"]()} />
        <StatTile label={m["common.officers"]()} icon={UserGroupIcon} tint="emerald" value={overview?.officers ?? 0} caption={m["command.officers_caption"]()} />
      </section>

      <section aria-labelledby="attention" className="page-section">
        <div className="section-head">
          <h2 id="attention">{m["common.needs_attention"]()}</h2>
          {attention > 0 && <Tag tone="open">{attention === 1 ? m["common.item_one"]() : m["common.item_count"]({ count: attention })}</Tag>}
        </div>
        {attention === 0 ? (
          <EmptyNote>{stations.length === 0 ? m["command.empty_no_stations"]() : m["command.empty_all_good"]()}</EmptyNote>
        ) : (
          <RowList>
            {requests.length > 0 && (
              <Row
                marker="open"
                title={requests.length === 1 ? m["command.one_waiting"]() : m["command.many_waiting"]({ count: requests.length })}
                summary={m["command.check_who_asked"]()}
                trailing={<Link to="/stations" className={openLink}>{m["common.stations"]()}</Link>}
              />
            )}
            {pastLimit.map((station) => (
              <Row
                key={station.id}
                marker="urgent"
                title={station.name}
                summary={m["command.past_limit_summary"]({ count: station.figures?.pastLimit ?? 0, when: station.reportedAt ? formatDistanceToNowStrict(station.reportedAt, { addSuffix: true }) : '' })}
                trailing={
                  <>
                    <Tag tone="urgent">{m["common.past_the_limit"]()}</Tag>
                    <Link to="/stations" className={openLink}>{m["common.stations"]()}</Link>
                  </>
                }
              />
            ))}
            {silent.map((station) => (
              <Row
                key={station.id}
                marker="open"
                title={station.name}
                summary={m["command.silent_summary"]({ duration: station.lastReportAt ? formatDistanceToNowStrict(station.lastReportAt) : m["command.a_while"]() })}
                trailing={
                  <>
                    <Tag tone="urgent">{m["command.silent"]()}</Tag>
                    <Link to="/stations" className={openLink}>{m["common.stations"]()}</Link>
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
