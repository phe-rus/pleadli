import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { installationOptions } from '@/features/installation'
import { ugx } from '@/features/money/data'
import { certificateText, kindLabel, registerIds, registerLabel, registerOptions, RegisterEntryForm, VoidEntryForm, type RegisterEntry, type RegisterId } from '@/features/registers'
import * as m from '@/paraglide/messages'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

type Search = { register?: RegisterId; year?: number; entry?: string; add?: true }

export const Route = createFileRoute('/_public/registers/')({
  validateSearch: (s: Record<string, unknown>): Search => {
    const year = Number(s.year)
    return {
      ...(s.register === 'notarial' ? { register: 'notarial' as const } : {}),
      ...(Number.isInteger(year) && year > 1990 ? { year } : {}),
      ...(typeof s.entry === 'string' ? { entry: s.entry } : {}),
      ...(s.add === true || s.add === 'true' ? { add: true as const } : {}),
    }
  },
  component: RouteComponent,
})

const badge = 'inline-block rounded-md bg-primary/15 px-3 py-1 text-xs'
const thisYear = new Date().getFullYear()

/** The commissioner for oaths' and notary's registers: one line for every
 * oath taken or act done, as it happens, numbered by the year. Nothing is
 * rubbed out; a wrong line is struck through with the reason. */
function RouteComponent() {
  const search = Route.useSearch()
  const register = search.register ?? 'oaths'
  const year = search.year ?? thisYear
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const { data: page } = useQuery(registerOptions(register, year))
  const { data: installation } = useQuery(installationOptions())
  const entries = page?.entries ?? []
  const chosen = entries.find((e) => e.id === search.entry)
  const place = installation?.region ?? ''
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - i)).map((y) => ({ value: y, label: y }))
  const go = (next: Partial<Search>) => void navigate({ search: { register: search.register, year: search.year, ...next } })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['registers'] })

  const columns: DataTableColumnDef<RegisterEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <button type="button" className={badge} onClick={() => go({ entry: row.original.id })}>
            {row.original.id}
          </button>
        ),
      },
      { accessorKey: 'number', header: m["registers.col.number"](), cell: ({ row }) => <span className={row.original.voidedAt ? 'line-through' : undefined}>{row.original.number}</span> },
      { accessorKey: 'onDay', header: m["registers.col.day"](), cell: ({ row }) => format(row.original.onDay, 'PP') },
      { accessorKey: 'kind', header: m["registers.col.kind"](), cell: ({ row }) => kindLabel(row.original.kind) },
      { accessorKey: 'personName', header: register === 'oaths' ? m["registers.col.deponent"]() : m["registers.col.person"]() },
      { accessorKey: 'personIdDocument', header: m["registers.col.id_document"](), cell: ({ row }) => row.original.personIdDocument ?? '·' },
      { accessorKey: 'documentTitle', header: m["registers.col.document"]() },
      { accessorKey: 'pages', header: m["registers.col.pages"](), cell: ({ row }) => row.original.pages ?? '·' },
      { accessorKey: 'place', header: m["registers.col.place"](), cell: ({ row }) => row.original.place ?? '·' },
      { accessorKey: 'interpreter', header: m["registers.col.interpreter"](), cell: ({ row }) => row.original.interpreter ?? '·' },
      { accessorKey: 'fee', header: m["registers.col.fee"](), cell: ({ row }) => (row.original.fee != null ? ugx(row.original.fee) : '·') },
      { accessorKey: 'commissionerName', header: register === 'oaths' ? m["registers.col.commissioner"]() : m["registers.col.notary"]() },
      {
        id: 'state',
        header: m["registers.col.state"](),
        accessorFn: (row) => (row.voidedAt ? 'void' : 'entered'),
        cell: ({ row }) => (row.original.voidedAt ? <Tag tone="stopped">{m["registers.struck_out"]()}</Tag> : <Tag tone="done">{m["registers.entered"]()}</Tag>),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [register, search.year, search.register],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["registers.title"]()}</h1>
          <p>{m["registers.lead"]()}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28">
            <Select items={years} value={String(year)} onValueChange={(v) => v && go({ year: Number(v) })}>
              <SelectTrigger className="w-full" aria-label={m["stats.year"]()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {years.map((y) => (
                    <SelectItem key={y.value} value={y.value}>
                      {y.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => go({ add: true })} disabled={Boolean(page?.refusal)}>
            {m["registers.add"]()}
          </Button>
        </div>
      </header>

      <Tabs value={register} onValueChange={(v) => go({ register: v === 'notarial' ? 'notarial' : undefined })}>
        <TabsList>
          {registerIds.map((id) => (
            <TabsTrigger key={id} value={id}>
              {registerLabel(id)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {page?.refusal && (
        <div role="status" className="not-typeset flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300">
          <span>{page.refusal}</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/settings/$section" params={{ section: 'you' }} />}>
            {m["registers.open_settings"]()}
          </Button>
        </div>
      )}

      <section aria-labelledby="entries" className="page-section">
        <h2 id="entries">{m["registers.year_heading"]({ register: registerLabel(register), year })}</h2>
        {entries.length === 0 ? (
          <EmptyNote>{m["registers.empty"]()}</EmptyNote>
        ) : (
          <DataTable aria-label={registerLabel(register)} data={entries} columns={columns} getRowId={(row) => row.id} emptyMessage={m["registers.empty"]()} searchPlaceholder={m["registers.search"]()} />
        )}
        <p className="text-muted-foreground">{m["registers.law_note"]()}</p>
      </section>

      <Createpanel open={Boolean(search.add)} onOpenChange={(open) => !open && go({ add: undefined })} headings={{ title: m["registers.add_title"]({ register: registerLabel(register) }), description: m["registers.add_description"]() }}>
        {search.add && (
          <RegisterEntryForm
            register={register}
            place={place}
            onDone={async (entry) => {
              await refresh()
              t.success(m["registers.entered_toast"]({ number: entry.number }))
              go({ add: undefined, entry: entry.id })
            }}
          />
        )}
      </Createpanel>

      <Createpanel open={Boolean(chosen)} onOpenChange={(open) => !open && go({ entry: undefined })} headings={{ title: chosen?.number ?? '', description: chosen ? `${kindLabel(chosen.kind)} · ${chosen.personName}` : '' }}>
        {chosen && <EntryDetail entry={chosen} place={place} onChanged={refresh} />}
      </Createpanel>
    </article>
  )
}

function EntryDetail({ entry, place, onChanged }: { entry: RegisterEntry; place: string; onChanged: () => void }) {
  const text = certificateText(entry, place || '____')
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">{m["registers.col.day"]()}</dt>
        <dd>{format(entry.onDay, 'PPP')}</dd>
        <dt className="text-muted-foreground">{m["registers.col.document"]()}</dt>
        <dd>{entry.documentTitle}</dd>
        {entry.pages != null && (
          <>
            <dt className="text-muted-foreground">{m["registers.col.pages"]()}</dt>
            <dd>{entry.pages}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{m["registers.col.place"]()}</dt>
        <dd>{entry.place ?? place}</dd>
        {entry.interpreter && (
          <>
            <dt className="text-muted-foreground">{m["registers.col.interpreter"]()}</dt>
            <dd>{entry.interpreter}</dd>
          </>
        )}
        {entry.fee != null && (
          <>
            <dt className="text-muted-foreground">{m["registers.col.fee"]()}</dt>
            <dd>{ugx(entry.fee)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{entry.register === 'oaths' ? m["registers.col.commissioner"]() : m["registers.col.notary"]()}</dt>
        <dd>{entry.commissionerName}</dd>
        {entry.personIdDocument && (
          <>
            <dt className="text-muted-foreground">{m["registers.col.id_document"]()}</dt>
            <dd>{entry.personIdDocument}</dd>
          </>
        )}
        {entry.personAddress && (
          <>
            <dt className="text-muted-foreground">{m["registers.field.address"]()}</dt>
            <dd>{entry.personAddress}</dd>
          </>
        )}
        {entry.matterTitle && (
          <>
            <dt className="text-muted-foreground">{m["registers.field.matter"]()}</dt>
            <dd>{entry.matterTitle}</dd>
          </>
        )}
        {entry.notes && (
          <>
            <dt className="text-muted-foreground">{m["registers.field.notes"]()}</dt>
            <dd>{entry.notes}</dd>
          </>
        )}
      </dl>

      {entry.voidedAt ? (
        <p role="status" className="not-typeset rounded-md border border-border bg-muted/40 p-3 text-muted-foreground">
          {m["registers.voided_on"]({ day: format(entry.voidedAt, 'PPP'), reason: entry.voidedReason ?? '' })}
        </p>
      ) : (
        <>
          <section aria-labelledby="wording" className="flex flex-col gap-2">
            <h3 id="wording">{entry.register === 'oaths' ? m["registers.jurat"]() : m["registers.certificate"]()}</h3>
            <p className="text-muted-foreground">{m["registers.wording_note"]()}</p>
            <pre className="not-typeset whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 font-serif text-sm leading-relaxed">{text}</pre>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text)
                    t.success(m["registers.copied"]())
                  } catch {
                    t.error(m["common.try_again"]())
                  }
                }}
              >
                {m["registers.copy"]()}
              </Button>
            </div>
          </section>
          <section aria-labelledby="strike" className="flex flex-col gap-2 border-t border-border/60 pt-4">
            <h3 id="strike">{m["registers.void_title"]()}</h3>
            <VoidEntryForm entry={entry} onDone={onChanged} />
          </section>
        </>
      )}
    </div>
  )
}
