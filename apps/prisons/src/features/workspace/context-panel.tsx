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
} from '@hugeicons/core-free-icons'
import { Link, useNavigate } from '@tanstack/react-router'
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
import { documentKindLabel, useIssuedDocument } from '@/features/documents'
import { m } from '@/paraglide/messages'

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

/** One printable document for this person, with the number it was issued
 * under once it has been printed. Opens as a tab. */
function DocumentRow({ kind, recordId, label }: { kind: 'reception_record' | 'discharge_certificate' | 'transfer_dossier'; recordId: string; label?: string }) {
  const navigate = useNavigate()
  const { data: issued } = useIssuedDocument(kind, recordId)
  return (
    <button
      type="button"
      onClick={() => void navigate({ to: '/documents/$kind/$id', params: { kind, id: recordId } })}
      className="group/row flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-secondary"
    >
      <HugeiconsIcon icon={File02Icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label ?? documentKindLabel[kind]}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{issued ? issued.number : m.workspace_not_printed()}</span>
    </button>
  )
}

/** The context of a single open record, shown in the right pillar's Record
 * view. Its queries only run while it is showing. */
export function PrisonerContext({ prisonerId }: { prisonerId: string }) {
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
        <span className="truncate text-sm font-medium">{prisoner ? prisonerFullName(prisoner) : m.workspace_prisoner_file()}</span>
        <span className="font-mono text-xs text-muted-foreground">{prisoner?.prisonerNumber ?? prisonerId}</span>
      </div>

      <section className="flex flex-col gap-0.5">
        <h6 className="px-1 pb-0.5">{m.workspace_related_records()}</h6>
        <RelatedRow icon={CourtHouseIcon} label={m.workspace_court_productions()} count={productions?.length ?? 0} detail={productionDetail} open={() => openFacet('legal')} />
        <RelatedRow icon={ArrowDataTransferHorizontalIcon} label={m.workspace_transfers()} count={transfers?.length ?? 0} open={() => openFacet('legal')} />
        <RelatedRow icon={HandshakeIcon} label={m.workspace_visits()} count={visits?.length ?? 0} open={() => openFacet('care')} />
        <RelatedRow icon={Message01Icon} label={m.workspace_requests()} count={requests?.length ?? 0} open={() => openFacet('care')} />
        <RelatedRow icon={HeartPulseIcon} label={m.workspace_health_events()} count={healthEvents?.length ?? 0} open={() => openFacet('care')} />
        <RelatedRow icon={Car01Icon} label={m.workspace_property()} count={property?.length ?? 0} open={() => openFacet('property')} />
        <RelatedRow icon={PatientIcon} label={m.workspace_releases()} count={releases?.length ?? 0} open={() => openFacet('history')} />
        <RelatedRow icon={File02Icon} label={m.workspace_documents()} count={documents?.length ?? 0} open={() => openFacet('property')} />
      </section>

      <section className="flex flex-col gap-0.5">
        <h6 className="px-1 pb-0.5">{m.workspace_documents()}</h6>
        <DocumentRow kind="reception_record" recordId={prisonerId} />
        {(releases?.length ?? 0) > 0 && <DocumentRow kind="discharge_certificate" recordId={prisonerId} />}
        {(transfers ?? []).map((transfer) => (
          <DocumentRow key={transfer.id} kind="transfer_dossier" recordId={transfer.id} label={transfer.otherPrisonName ? m.workspace_transfer_dossier_to({ prison: transfer.otherPrisonName }) : m.workspace_transfer_dossier()} />
        ))}
      </section>

      <section className="flex flex-col gap-0.5">
        <h6 className="px-1 pb-0.5">{m.workspace_open_for_this_person()}</h6>
        {file && file.obligations.length > 0 ? (
          <button type="button" onClick={() => openFacet('legal')} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm text-left hover:bg-secondary">
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {overdue > 0 ? m.workspace_open_overdue({ length: file.obligations.length, overdue }) : m.workspace_open({ length: file.obligations.length })}
            </span>
          </button>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">{m.workspace_nothing_is_owed_right_now()}</p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h6 className="px-1 pb-0.5">{m.workspace_recent_activity()}</h6>
        {activity.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">{m.workspace_nothing_recorded_yet()}</p>
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
        {m.workspace_back_to_population()}
      </Link>
    </div>
  )
}
