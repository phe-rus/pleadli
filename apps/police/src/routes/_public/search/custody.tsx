import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import {
  custodyBasisLabel,
  custodyCompliance,
  custodyPersonName,
  custodyRecordsOptions,
  CustodyRecordForm,
  custodyStatusLabel,
  useCustodyRecords,
  type CustodyRecord,
} from '@/features/custody'
import { RecordList } from '@/features/paper/record-list'
import { personProfileOptions, PersonIdentity } from '@/features/people'
import { PersonAvatar } from '@/components/person-avatar'
import { useQuery } from '@tanstack/react-query'
import { PaperWindow, RecordPaper } from '@/features/paper/record-paper'
import { format, formatDistanceToNowStrict } from '@/lib/date'
import { CellsIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { cn } from '@pleadli/ui/lib/utils'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

type View = 'cells' | 'all'

export const Route = createFileRoute('/_public/search/custody')({
  validateSearch: (search: Record<string, unknown>): { open?: string; view?: View } => ({
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
    ...(search.view === 'all' ? { view: 'all' as const } : {}),
  }),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...custodyRecordsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The person's own headshot beside their name in the cells list. */
function CellsFace({ personId, name }: { personId: string; name: string }) {
  const { data: profile } = useQuery(personProfileOptions(personId))
  return <PersonAvatar name={name} headshotAttachmentId={profile?.person.headshotAttachmentId} size="sm" />
}

/** Past this many hours before the limit a person is marked as due. */
const NEAR_HOURS = 6

function remaining(hours: number) {
  const abs = Math.abs(hours)
  if (abs < 1) return m["custody.minutes"]({ count: Math.max(1, Math.round(abs * 60)) })
  if (abs < 48) return Math.round(abs) === 1 ? m["custody.hour_one"]() : m["custody.hours"]({ count: Math.round(abs) })
  const days = Math.floor(abs / 24)
  const rest = Math.round(abs - days * 24)
  const dayText = days === 1 ? m["custody.day_one"]() : m["custody.days"]({ count: days })
  return rest > 0 ? m["custody.and_hours"]({ days: dayText, hours: rest }) : dayText
}

/** The custody record as the cells book keeps it, with the time limit worked
 * out from the arrest (never typed). */
function CustodyPaper({ record }: { record: CustodyRecord }) {
  const name = custodyPersonName(record)
  const limit = custodyCompliance(record)
  const inCells = record.status === 'in_custody'
  return (
    <RecordPaper
      entityType="custody_record"
      entityId={record.id}
      reference={record.caseReference}
      title={m["custody_page.paper_title"]()}
      details={[
        { label: m["custody_page.person"](), value: name },
        { label: m["custody_page.arrested"](), value: format(record.arrestedAt, 'PPp') },
        ...(record.location ? [{ label: m["custody_page.where"](), value: record.location }] : []),
        ...(record.caseReference ? [{ label: m["nav.cases"](), value: record.caseReference, copy: record.caseReference }] : []),
        { label: m["col.status"](), value: custodyStatusLabel(record.status) },
      ]}
      events={[
        { at: record.arrestedAt, label: m["custody_page.arrested"]() },
        ...(record.transferredAt ? [{ at: record.transferredAt, label: m["custody_page.transferred"]() }] : []),
        ...(record.releasedAt ? [{ at: record.releasedAt, label: custodyStatusLabel(record.status) }] : []),
      ]}
      edit={(done) => <CustodyRecordForm key={record.id} record={record} onSuccess={done} />}
    >
      <PersonIdentity personId={record.personId} />
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["custody_page.arrested"]()}>{format(record.arrestedAt, 'PPPPp')}</PaperField>
        {record.location && <PaperField label={m["custody_page.where"]()}>{record.location}</PaperField>}
        {record.caseReference && <PaperField label={m["nav.cases"]()}>{record.caseReference}</PaperField>}
        {record.crossJurisdictionTransfer && <PaperField label={m["custody_page.transferred"]()}>{record.transferredAt ? format(record.transferredAt, 'PPp') : m["custody_page.not_yet"]()}</PaperField>}
        <PaperField label={m["custody_page.limit"]()}>{`${format(limit.deadline, 'PPPPp')} (${custodyBasisLabel(limit.basis)})`}</PaperField>
        <PaperField label={m["col.status"]()}>{custodyStatusLabel(record.status)}</PaperField>
        {record.releasedAt && <PaperField label={m["custody_page.left_cells"]()}>{format(record.releasedAt, 'PPp')}</PaperField>}
      </section>
      {inCells && (
        <p>
          <strong>{limit.isOverdue ? m["custody.past_by"]({ time: remaining(limit.hoursRemaining) }) : m["custody.left"]({ time: remaining(limit.hoursRemaining) })}</strong>
        </p>
      )}
      {record.notes && <p className="whitespace-pre-wrap">{record.notes}</p>}
      <section className="mt-12 flex flex-wrap justify-between gap-8">
        <SignatureLine caption={m["custody_page.booking_officer"]()} />
        <SignatureLine caption={m["custody_page.cells_officer"]()} />
      </section>
    </RecordPaper>
  )
}

/**
 * Who is in the cells, soonest limit first, and every custody record before.
 * The limit is worked out from the arrest each time the page is drawn; a
 * person turns red only when near it or past it.
 */
function RouteComponent() {
  const { open, view = 'cells' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: records } = useCustodyRecords('')
  const setOpen = (id: string | null) => void navigate({ to: '/search/custody', search: { ...(view === 'all' ? { view } : {}), ...(id ? { open: id } : {}) }, replace: true })

  const inCells = records
    .filter((r) => r.status === 'in_custody')
    .map((record) => ({ record, limit: custodyCompliance(record) }))
    .sort((a, b) => a.limit.deadline - b.limit.deadline)
  const due = inCells.filter(({ limit }) => limit.isOverdue || limit.hoursRemaining <= NEAR_HOURS).length
  const current = view === 'cells' && open ? records.find((r) => r.id === open) : undefined

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.in_custody"]()}</h1>
          <p>
            {inCells.length === 1 ? m["custody_page.in_cells_one"]() : m["custody_page.in_cells_n"]({ count: inCells.length })}
            {due > 0 ? ` · ${m["custody_page.due"]({ count: due })}` : ''}
          </p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["custody_page.view"]()}
            value={view}
            onChange={(v) => void navigate({ to: '/search/custody', search: v === 'all' ? { view: v } : {}, replace: true })}
            items={[
              { value: 'cells', label: m["custody_page.in_the_cells"]() },
              { value: 'all', label: m["custody_page.all_records"]() },
            ]}
          />
          <PanelButton label={m["custody_page.new"]()} title={m["custody_page.new"]()} description={m["custody_page.new_desc"]()} variant="default">
            {({ close, setDirty }) => <CustodyRecordForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      {view === 'cells' ? (
        inCells.length === 0 ? (
          <EmptyNote icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} />}>{m["custody.nobody"]()}</EmptyNote>
        ) : (
          <Group>
            {inCells.map(({ record, limit }) => {
              const past = limit.isOverdue
              const near = !past && limit.hoursRemaining <= NEAR_HOURS
              return (
                <GroupRow
                  key={record.id}
                  icon={<CellsFace personId={record.personId} name={custodyPersonName(record)} />}
                  label={custodyPersonName(record)}
                  detail={[m["custody.arrested_summary"]({ when: formatDistanceToNowStrict(record.arrestedAt, { addSuffix: true }) }), record.location, record.caseReference].filter(Boolean).join(' · ')}
                  value={
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', past ? 'bg-destructive text-white' : near ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>
                      {past ? m["custody.past_by"]({ time: remaining(limit.hoursRemaining) }) : m["custody.left"]({ time: remaining(limit.hoursRemaining) })}
                    </span>
                  }
                  chevron
                  onClick={() => setOpen(record.id)}
                />
              )
            })}
          </Group>
        )
      ) : (
        <RecordList
          items={records}
          date={(r) => r.arrestedAt}
          label={(r) => custodyPersonName(r)}
          detail={(r) => [format(r.arrestedAt, 'd MMM, HH:mm'), custodyStatusLabel(r.status), r.caseReference].filter(Boolean).join(' · ')}
          searchText={(r) => [custodyPersonName(r), r.location ?? '', r.caseReference ?? '', custodyStatusLabel(r.status)].join(' ')}
          paper={(r) => <CustodyPaper record={r} />}
          windowTitle={(r) => custodyPersonName(r)}
          empty={m["custody_page.empty"]()}
          emptyIcon={<HugeiconsIcon icon={CellsIcon} />}
          searchPlaceholder={m["custody_page.search"]()}
          opened={open ?? null}
          onOpened={setOpen}
        />
      )}

      {current && (
        <PaperWindow open onOpenChange={(o) => !o && setOpen(null)} title={custodyPersonName(current)}>
          <CustodyPaper record={current} />
        </PaperWindow>
      )}
    </article>
  )
}
