import { Createpanel } from '@/components/create-panel'
import { CourtOutcomeForm, productionMethodLabel } from '@/features/court-productions'
import { instrumentKindLabel, instrumentStatusLabels } from '@/features/custody/schema'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import type { DiaryEntry, PendingInstrumentRow, SentenceRow, ThresholdRow, UnsentencedRow } from './schema'
import { m } from '@/paraglide/messages'

const DAY_MS = 86_400_000

function IdBadge({ prisonerId }: { prisonerId: string }) {
  return (
    <Link to="/prisoners/$prisonerId" params={{ prisonerId }} className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block')}>
      {prisonerId}
    </Link>
  )
}

const dateOrDash = (ms: number | null) => (ms == null ? '·' : format(ms, 'd MMM yyyy'))

export function DiaryTable({ diary }: { diary: readonly DiaryEntry[] }) {
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const now = Date.now()

  const columns: DataTableColumnDef<DiaryEntry>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: m.legal_prisoner_id(), cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: m.legal_name() },
      { accessorKey: 'courtReference', header: m.legal_court(), cell: ({ row }) => row.original.courtReference ?? '·' },
      { accessorKey: 'productionDate', header: m.legal_date_and_time(), cell: ({ row }) => format(row.original.productionDate, 'EEE d MMM yyyy p') },
      { accessorKey: 'purpose', header: m.legal_purpose(), cell: ({ row }) => row.original.purpose ?? '·' },
      { accessorKey: 'productionMethod', header: m.legal_method(), cell: ({ row }) => productionMethodLabel(row.original.productionMethod) },
      {
        id: 'when',
        header: m.legal_when(),
        cell: ({ row }) => {
          const diff = row.original.productionDate - now
          if (diff < 0) return <Badge variant="destructive">{m.legal_outcome_not_recorded()}</Badge>
          const days = Math.floor(diff / DAY_MS)
          return <Badge variant="outline">{days === 0 ? m.legal_today() : `In ${days} day${days === 1 ? '' : 's'}`}</Badge>
        },
      },
      {
        id: 'action',
        header: '',
        cell: ({ row }) => (
          <Button size="xs" variant="secondary" onClick={() => setOutcomeFor(row.original.id)}>
            {m.legal_record_outcome()}
          </Button>
        ),
      },
    ],
    [now],
  )

  return (
    <>
      <DataTable
        aria-label={m.legal_court_diary()}
        data={diary as DiaryEntry[]}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage={m.legal_no_court_productions_are_scheduled_book()}
        searchPlaceholder={m.legal_search_the_diary()}
      />
      <Createpanel
        open={outcomeFor != null}
        onOpenChange={(open) => !open && setOutcomeFor(null)}
        isDirty={dirty}
        headings={{ title: m.legal_record_the_court_outcome(), description: m.legal_what_the_court_decided_at_this() }}
      >
        {outcomeFor && <CourtOutcomeForm productionId={outcomeFor} onSuccess={() => setOutcomeFor(null)} onDirtyChange={setDirty} />}
      </Createpanel>
    </>
  )
}

export function ThresholdTable({ rows }: { rows: readonly ThresholdRow[] }) {
  const columns: DataTableColumnDef<ThresholdRow>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: m.legal_prisoner_id(), cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: m.legal_name() },
      { accessorKey: 'admittedAt', header: m.legal_admitted(), cell: ({ row }) => dateOrDash(row.original.admittedAt) },
      { accessorKey: 'daysHeld', header: m.legal_days_held() },
      { accessorKey: 'thresholdDays', header: m.legal_threshold(), cell: ({ row }) => `${row.original.thresholdDays} days${row.original.highCourtOnly ? ' (High Court)' : ''}` },
      { accessorKey: 'mandatoryBailOn', header: m.legal_reached_on(), cell: ({ row }) => dateOrDash(row.original.mandatoryBailOn) },
      {
        accessorKey: 'daysRemaining',
        header: m.legal_remaining(),
        cell: ({ row }) => {
          const d = row.original.daysRemaining
          return d < 0 ? <Badge variant="destructive">{m.legal_days_past({ value: -d })}</Badge> : <Badge variant="outline">{m.legal_days({ d })}</Badge>
        },
      },
      { accessorKey: 'lastProducedAt', header: m.legal_last_appeared(), cell: ({ row }) => (row.original.lastProducedAt ? dateOrDash(row.original.lastProducedAt) : m.legal_never()) },
      {
        accessorKey: 'nextProductionAt',
        header: m.legal_next_court(),
        cell: ({ row }) => (row.original.nextProductionAt ? dateOrDash(row.original.nextProductionAt) : <Badge variant="destructive">{m.legal_none_booked()}</Badge>),
      },
    ],
    [],
  )
  return (
    <DataTable
      aria-label={m.legal_remand_thresholds()}
      data={rows as ThresholdRow[]}
      columns={columns}
      getRowId={(row) => row.prisonerId}
      emptyMessage={m.legal_no_one_is_on_remand()}
      searchPlaceholder={m.legal_search_remand()}
    />
  )
}

export function SentenceTable({ rows, unsentenced }: { rows: readonly SentenceRow[]; unsentenced: readonly UnsentencedRow[] }) {
  const columns: DataTableColumnDef<SentenceRow>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: m.legal_prisoner_id(), cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: m.legal_name() },
      { accessorKey: 'termText', header: m.legal_sentence() },
      { accessorKey: 'startsOn', header: m.legal_runs_from(), cell: ({ row }) => dateOrDash(row.original.startsOn) },
      { accessorKey: 'sentenceEndsOn', header: m.legal_term_ends(), cell: ({ row }) => (row.original.isLife ? m.legal_life() : dateOrDash(row.original.sentenceEndsOn)) },
      { accessorKey: 'releaseDueOn', header: m.legal_release_due(), cell: ({ row }) => (row.original.isLife ? '·' : dateOrDash(row.original.releaseDueOn)) },
      { accessorKey: 'paroleWindowOpensOn', header: m.legal_parole_window(), cell: ({ row }) => dateOrDash(row.original.paroleWindowOpensOn) },
      { accessorKey: 'reviewable', header: 's.88 review', cell: ({ row }) => (row.original.reviewable ? <Badge variant="outline">{m.legal_applies()}</Badge> : '·') },
    ],
    [],
  )
  return (
    <div className="flex flex-col gap-4">
      {unsentenced.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <span className="text-sm font-medium">{m.legal_convicted_with_no_sentence_recorded({ length: unsentenced.length })}</span>
          <div className="flex flex-wrap gap-2">
            {unsentenced.map((u) => (
              <Link
                key={u.prisonerId}
                to="/prisoners/$prisonerId"
                params={{ prisonerId: u.prisonerId }}
                className={buttonVariants({ size: 'xs', variant: 'secondary' })}
              >
                {u.prisonerName}
              </Link>
            ))}
          </div>
        </div>
      )}
      <DataTable
        aria-label={m.legal_sentences()}
        data={rows as SentenceRow[]}
        columns={columns}
        getRowId={(row) => row.prisonerId}
        emptyMessage={m.legal_no_sentences_are_recorded()}
        searchPlaceholder={m.legal_search_sentences()}
      />
    </div>
  )
}

export function PendingInstrumentTable({ rows }: { rows: readonly PendingInstrumentRow[] }) {
  const columns: DataTableColumnDef<PendingInstrumentRow>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: m.legal_prisoner_id(), cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: m.legal_name() },
      { accessorKey: 'kind', header: m.legal_document(), cell: ({ row }) => instrumentKindLabel(row.original.kind) },
      { accessorKey: 'status', header: m.legal_state(), cell: ({ row }) => <Badge variant="destructive">{instrumentStatusLabels[row.original.status] ?? row.original.status}</Badge> },
      { accessorKey: 'since', header: m.legal_waiting_since(), cell: ({ row }) => dateOrDash(row.original.since) },
      {
        id: 'age',
        header: m.legal_days_waiting(),
        cell: ({ row }) => Math.max(0, Math.floor((Date.now() - row.original.since) / DAY_MS)),
      },
    ],
    [],
  )
  return (
    <DataTable
      aria-label={m.legal_instruments_pending()}
      data={rows as PendingInstrumentRow[]}
      columns={columns}
      getRowId={(row) => `${row.prisonerId}-${row.kind}-${row.since}`}
      emptyMessage={m.legal_no_legal_documents_are_awaited()}
      searchPlaceholder={m.legal_search_pending_documents()}
    />
  )
}
