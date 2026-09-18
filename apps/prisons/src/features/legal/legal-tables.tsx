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
      { accessorKey: 'prisonerId', header: 'Prisoner ID', cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: 'Name' },
      { accessorKey: 'courtReference', header: 'Court', cell: ({ row }) => row.original.courtReference ?? '·' },
      { accessorKey: 'productionDate', header: 'Date and time', cell: ({ row }) => format(row.original.productionDate, 'EEE d MMM yyyy p') },
      { accessorKey: 'purpose', header: 'Purpose', cell: ({ row }) => row.original.purpose ?? '·' },
      { accessorKey: 'productionMethod', header: 'Method', cell: ({ row }) => productionMethodLabel(row.original.productionMethod) },
      {
        id: 'when',
        header: 'When',
        cell: ({ row }) => {
          const diff = row.original.productionDate - now
          if (diff < 0) return <Badge variant="destructive">Outcome not recorded</Badge>
          const days = Math.floor(diff / DAY_MS)
          return <Badge variant="outline">{days === 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`}</Badge>
        },
      },
      {
        id: 'action',
        header: '',
        cell: ({ row }) => (
          <Button size="xs" variant="secondary" onClick={() => setOutcomeFor(row.original.id)}>
            Record outcome
          </Button>
        ),
      },
    ],
    [now],
  )

  return (
    <>
      <DataTable
        aria-label="Court diary"
        data={diary as DiaryEntry[]}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No court productions are scheduled. Book one from the prisoner file or Add record."
        searchPlaceholder="Search the diary…"
      />
      <Createpanel
        open={outcomeFor != null}
        onOpenChange={(open) => !open && setOutcomeFor(null)}
        isDirty={dirty}
        headings={{ title: 'Record the court outcome', description: 'What the court decided at this production.' }}
      >
        {outcomeFor && <CourtOutcomeForm productionId={outcomeFor} onSuccess={() => setOutcomeFor(null)} onDirtyChange={setDirty} />}
      </Createpanel>
    </>
  )
}

export function ThresholdTable({ rows }: { rows: readonly ThresholdRow[] }) {
  const columns: DataTableColumnDef<ThresholdRow>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: 'Prisoner ID', cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: 'Name' },
      { accessorKey: 'admittedAt', header: 'Admitted', cell: ({ row }) => dateOrDash(row.original.admittedAt) },
      { accessorKey: 'daysHeld', header: 'Days held' },
      { accessorKey: 'thresholdDays', header: 'Threshold', cell: ({ row }) => `${row.original.thresholdDays} days${row.original.highCourtOnly ? ' (High Court)' : ''}` },
      { accessorKey: 'mandatoryBailOn', header: 'Reached on', cell: ({ row }) => dateOrDash(row.original.mandatoryBailOn) },
      {
        accessorKey: 'daysRemaining',
        header: 'Remaining',
        cell: ({ row }) => {
          const d = row.original.daysRemaining
          return d < 0 ? <Badge variant="destructive">{-d} days past</Badge> : <Badge variant="outline">{d} days</Badge>
        },
      },
      { accessorKey: 'lastProducedAt', header: 'Last appeared', cell: ({ row }) => (row.original.lastProducedAt ? dateOrDash(row.original.lastProducedAt) : 'Never') },
      {
        accessorKey: 'nextProductionAt',
        header: 'Next court',
        cell: ({ row }) => (row.original.nextProductionAt ? dateOrDash(row.original.nextProductionAt) : <Badge variant="destructive">None booked</Badge>),
      },
    ],
    [],
  )
  return (
    <DataTable
      aria-label="Remand thresholds"
      data={rows as ThresholdRow[]}
      columns={columns}
      getRowId={(row) => row.prisonerId}
      emptyMessage="No one is on remand."
      searchPlaceholder="Search remand…"
    />
  )
}

export function SentenceTable({ rows, unsentenced }: { rows: readonly SentenceRow[]; unsentenced: readonly UnsentencedRow[] }) {
  const columns: DataTableColumnDef<SentenceRow>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: 'Prisoner ID', cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: 'Name' },
      { accessorKey: 'termText', header: 'Sentence' },
      { accessorKey: 'startsOn', header: 'Runs from', cell: ({ row }) => dateOrDash(row.original.startsOn) },
      { accessorKey: 'sentenceEndsOn', header: 'Term ends', cell: ({ row }) => (row.original.isLife ? 'Life' : dateOrDash(row.original.sentenceEndsOn)) },
      { accessorKey: 'releaseDueOn', header: 'Release due', cell: ({ row }) => (row.original.isLife ? '·' : dateOrDash(row.original.releaseDueOn)) },
      { accessorKey: 'paroleWindowOpensOn', header: 'Parole window', cell: ({ row }) => dateOrDash(row.original.paroleWindowOpensOn) },
      { accessorKey: 'reviewable', header: 's.88 review', cell: ({ row }) => (row.original.reviewable ? <Badge variant="outline">Applies</Badge> : '·') },
    ],
    [],
  )
  return (
    <div className="flex flex-col gap-4">
      {unsentenced.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <span className="text-sm font-medium">{unsentenced.length} convicted with no sentence recorded</span>
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
        aria-label="Sentences"
        data={rows as SentenceRow[]}
        columns={columns}
        getRowId={(row) => row.prisonerId}
        emptyMessage="No sentences are recorded."
        searchPlaceholder="Search sentences…"
      />
    </div>
  )
}

export function PendingInstrumentTable({ rows }: { rows: readonly PendingInstrumentRow[] }) {
  const columns: DataTableColumnDef<PendingInstrumentRow>[] = useMemo(
    () => [
      { accessorKey: 'prisonerId', header: 'Prisoner ID', cell: ({ row }) => <IdBadge prisonerId={row.original.prisonerId} /> },
      { accessorKey: 'prisonerName', header: 'Name' },
      { accessorKey: 'kind', header: 'Document', cell: ({ row }) => instrumentKindLabel(row.original.kind) },
      { accessorKey: 'status', header: 'State', cell: ({ row }) => <Badge variant="destructive">{instrumentStatusLabels[row.original.status] ?? row.original.status}</Badge> },
      { accessorKey: 'since', header: 'Waiting since', cell: ({ row }) => dateOrDash(row.original.since) },
      {
        id: 'age',
        header: 'Days waiting',
        cell: ({ row }) => Math.max(0, Math.floor((Date.now() - row.original.since) / DAY_MS)),
      },
    ],
    [],
  )
  return (
    <DataTable
      aria-label="Instruments pending"
      data={rows as PendingInstrumentRow[]}
      columns={columns}
      getRowId={(row) => `${row.prisonerId}-${row.kind}-${row.since}`}
      emptyMessage="No legal documents are awaited."
      searchPlaceholder="Search pending documents…"
    />
  )
}
