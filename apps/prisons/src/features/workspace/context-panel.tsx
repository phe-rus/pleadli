import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDataTransferHorizontalIcon,
  ArrowRight01Icon,
  Car01Icon,
  CourtHouseIcon,
  File02Icon,
  HandshakeIcon,
  HeartPulseIcon,
  Home01Icon,
  Message01Icon,
  PatientIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { Link, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { format } from 'date-fns/format'
import { useMemo } from 'react'
import { prisonerFileOptions } from '@/features/custody'
import { prisonerOptions } from '@/features/prisoners'
import { prisonerFullName } from '@/features/prisoners/schema'
import { courtOutcomeLabel, courtProductionsForPrisonerOptions } from '@/features/court-productions'
import { transfersForPrisonerOptions } from '@/features/transfers'
import { visitsForPrisonerOptions } from '@/features/visits'
import { requestsForPrisonerOptions } from '@/features/requests'
import { healthEventsForPrisonerOptions } from '@/features/health-events'
import { propertyRecordsForPrisonerOptions } from '@/features/property-records'
import { releasesForPrisonerOptions } from '@/features/releases'
import { attachmentsOptions } from '@/features/attachments'
import { buildTimeline } from '@/features/prisoners/profile/timeline'
import { useWorkspace } from './tabs-store'

type Related = {
  icon: typeof CourtHouseIcon
  label: string
  count: number
  detail?: string
  open: () => void
}

/** A row in the related-records list of a record's context, grouped by the
 * facet that owns the records (legal / care / property / history — the four
 * tabs of the prisoner file). Opens the record at that facet. */
function RelatedRow({ icon, label, count, detail, open }: Related) {
  if (count === 0) return null
  return (
    <button type="button" onClick={open} className="group/row flex items-center gap-2 rounded-md px-1 py-0.5 text-sm text-left hover:bg-secondary">
      <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>}
      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary tabular-nums">{count}</span>
    </button>
  )
}

/** The context of a single open record, read entirely from the query cache
 * (the record's own route loads it); this column never fetches on its own. */
function PrisonerContext({ prisonerId }: { prisonerId: string }) {
  const navigate = useNavigate()
  const { data: prisoner } = useQuery({ ...prisonerOptions(prisonerId), enabled: true })
  const { data: file } = useQuery({ ...prisonerFileOptions(prisonerId), enabled: true })
  const { data: productions } = useQuery({ ...courtProductionsForPrisonerOptions(prisonerId) })
  const { data: transfers } = useQuery({ ...transfersForPrisonerOptions(prisonerId) })
  const { data: visits } = useQuery({ ...visitsForPrisonerOptions(prisonerId) })
  const { data: requests } = useQuery({ ...requestsForPrisonerOptions(prisonerId) })
  const { data: healthEvents } = useQuery({ ...healthEventsForPrisonerOptions(prisonerId) })
  const { data: property } = useQuery({ ...propertyRecordsForPrisonerOptions(prisonerId) })
  const { data: releases } = useQuery({ ...releasesForPrisonerOptions(prisonerId) })
  const { data: documents } = useQuery({ ...attachmentsOptions('prisoner', prisonerId) })

  const openFacet = (tab: 'legal' | 'care' | 'property' | 'history') =>
    void navigate({ to: '/prisoners/$prisonerId', params: { prisonerId }, search: { tab }, replace: true })

  const overdue = file ? file.obligations.filter((o) => o.dueAt != null && o.dueAt < Date.now()).length : 0

  const activity = useMemo(() => {
    if (!file || !productions || !transfers || !visits || !healthEvents || !releases) return []
    return buildTimeline({ stays: file.stays, productions, visits, healthEvents, transfers, releases }).slice(0, 6)
  }, [file, productions, transfers, visits, healthEvents, releases])

  const activeProduction = (productions ?? []).find((p) => p.state !== 'cancelled' && p.outcome == null)
  const productionDetail = activeProduction
    ? [activeProduction.courtReference, courtOutcomeLabel(activeProduction.outcome == null ? 'scheduled' : activeProduction.outcome)].filter(Boolean).join(' · ')
    : undefined

  return (
    <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
      <div className="flex flex-col gap-0.5 border-b border-border/30 pb-2">
        <span className="truncate text-sm font-medium">{prisoner ? prisonerFullName(prisoner) : 'Prisoner file'}</span>
        <span className="font-mono text-xs text-muted-foreground">{prisoner?.prisonerNumber ?? prisonerId}</span>
      </div>

      <section className="flex flex-col gap-0.5">
        <h3 className="px-1 pb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">Related records</h3>
        <RelatedRow icon={CourtHouseIcon} label="Court productions" count={productions?.length ?? 0} detail={productionDetail} open={() => openFacet('legal')} />
        <RelatedRow icon={ArrowDataTransferHorizontalIcon} label="Transfers" count={transfers?.length ?? 0} open={() => openFacet('legal')} />
        <RelatedRow icon={HandshakeIcon} label="Visits" count={visits?.length ?? 0} open={() => openFacet('care')} />
        <RelatedRow icon={Message01Icon} label="Requests" count={requests?.length ?? 0} open={() => openFacet('care')} />
        <RelatedRow icon={HeartPulseIcon} label="Health events" count={healthEvents?.length ?? 0} open={() => openFacet('care')} />
        <RelatedRow icon={Car01Icon} label="Property" count={property?.length ?? 0} open={() => openFacet('property')} />
        <RelatedRow icon={PatientIcon} label="Releases" count={releases?.length ?? 0} open={() => openFacet('history')} />
        <RelatedRow icon={File02Icon} label="Documents" count={documents?.length ?? 0} open={() => openFacet('property')} />
      </section>

      <section className="flex flex-col gap-0.5">
        <h3 className="px-1 pb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">Open for this person</h3>
        {file && file.obligations.length > 0 ? (
          <button type="button" onClick={() => openFacet('legal')} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm text-left hover:bg-secondary">
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {overdue > 0 ? `${file.obligations.length} open, ${overdue} overdue` : `${file.obligations.length} open`}
            </span>
          </button>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">Nothing is owed right now.</p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="px-1 pb-0.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">Recent activity</h3>
        {activity.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-2 px-1 py-0.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{format(entry.at, 'd MMM')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/prisoners" className="flex items-center gap-1 px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        <HugeiconsIcon icon={Home01Icon} className="size-3.5" />
        Back to population
      </Link>
    </div>
  )
}

/** The right-hand context column, present only while a record is open. The
 * sidebars mirror each other: left explores, right reports on the selected
 * record. Area views hold no context, so the panel slides away to the edge
 * of the window when there is no record to report on. */
export function ContextPanel({ prisonerId }: { prisonerId: string | null }) {
  const { contextOpen, setContextOpen } = useWorkspace()
  if (!contextOpen || !prisonerId) return null
  return (
    <motion.aside
      key="context-panel"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="hidden shrink-0 flex-col overflow-hidden border-l border-border/20 bg-background md:flex"
      aria-label="Context panel"
    >
      <div className="flex h-full w-60 min-w-60 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/20 px-2">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Context</span>
          <button
            type="button"
            aria-label="Close context panel"
            title="Close context panel"
            onClick={() => setContextOpen(false)}
            className="flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <HugeiconsIcon icon={XIcon} className="size-3.5" />
          </button>
        </div>
        <PrisonerContext prisonerId={prisonerId} />
      </div>
    </motion.aside>
  )
}