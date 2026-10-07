import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { PaperWindow, RecordPaper } from '@/features/paper/record-paper'
import { diaryCitation } from '@/features/registers'
import {
  stationDiaryCategoryLabel,
  stationDiaryOptions,
  stationDiaryRelatedPersonName,
  StationDiaryEntryForm,
  useStationDiaryEntries,
  type StationDiaryEntry,
} from '@/features/station-diary'
import { useDeepLinkRecord } from '@/hooks/use-deep-link-record'
import { format } from '@/lib/date'
import { Notebook01Icon, PrinterIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { RichTextPreview, richTextToPlainText } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/sd-log/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationDiaryOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

const dayKey = (ms: number) => format(ms, 'yyyy-MM-dd')

function dayTitle(ms: number) {
  const today = dayKey(Date.now())
  const yesterday = dayKey(Date.now() - 86_400_000)
  const key = dayKey(ms)
  if (key === today) return `${m["nav.today"]()} · ${format(ms, 'EEEE d MMMM')}`
  if (key === yesterday) return `${m["sd_page.yesterday"]()} · ${format(ms, 'EEEE d MMMM')}`
  return format(ms, 'EEEE d MMMM yyyy')
}

/** One entry as the station diary prints it. */
function EntryPaper({ entry }: { entry: StationDiaryEntry }) {
  const number = diaryCitation(entry)
  const person = stationDiaryRelatedPersonName(entry)
  return (
    <RecordPaper
      entityType="station_diary_entry"
      entityId={entry.id}
      reference={number}
      title={m["sd_page.entry_title"]()}
      details={[
        ...(number ? [{ label: m["sd_page.number"](), value: number, copy: number }] : []),
        { label: m["sd_page.time"](), value: format(entry.createdAt, 'PPp') },
        { label: m["col.category"](), value: stationDiaryCategoryLabel(entry.category) },
        ...(person ? [{ label: m["col.related_person"](), value: person }] : []),
      ]}
      events={[{ at: entry.createdAt, label: m["sd_page.entry_title"]() }]}
      edit={(done) => <StationDiaryEntryForm key={entry.id} entry={entry} onSuccess={done} />}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        {number && <PaperField label={m["sd_page.number"]()}>{number}</PaperField>}
        <PaperField label={m["sd_page.time"]()}>{format(entry.createdAt, 'PPp')}</PaperField>
        <PaperField label={m["col.category"]()}>{stationDiaryCategoryLabel(entry.category)}</PaperField>
        {person && <PaperField label={m["col.related_person"]()}>{person}</PaperField>}
      </section>
      <RichTextPreview value={entry.content} className="[&_p]:mb-3" />
      <section className="mt-12 flex justify-end">
        <SignatureLine caption={m["sd_page.officer_signs"]()} />
      </section>
    </RecordPaper>
  )
}

/** A day of the station diary as the book's own page: every entry of that
 * day in order, numbered, to print and file. */
function DayPaper({ day, entries }: { day: number; entries: StationDiaryEntry[] }) {
  const ordered = [...entries].sort((a, b) => a.createdAt - b.createdAt)
  return (
    <RecordPaper
      entityType="station_diary_day"
      entityId={dayKey(day)}
      title={m["sd_page.day_title"]({ date: format(day, 'EEEE d MMMM yyyy') })}
      details={[
        { label: m["sd_page.date"](), value: format(day, 'PPPP') },
        { label: m["sd_page.entries"](), value: String(entries.length) },
      ]}
    >
      <table>
        <thead>
          <tr>
            <th>{m["sd_page.number"]()}</th>
            <th>{m["sd_page.time"]()}</th>
            <th>{m["col.category"]()}</th>
            <th>{m["sd_page.particulars"]()}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((entry) => (
            <tr key={entry.id}>
              <td className="whitespace-nowrap">{diaryCitation(entry) ?? ''}</td>
              <td className="whitespace-nowrap">{format(entry.createdAt, 'HH:mm')}</td>
              <td>{stationDiaryCategoryLabel(entry.category)}</td>
              <td>
                {richTextToPlainText(entry.content)}
                {stationDiaryRelatedPersonName(entry) ? ` (${stationDiaryRelatedPersonName(entry)})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="mt-12 flex justify-end">
        <SignatureLine caption={m["sd_page.officer_in_charge"]()} />
      </section>
    </RecordPaper>
  )
}

/**
 * The station diary as the book it is: day by day, newest first, each entry
 * numbered. An entry opens as its paper; a day prints as the book's page.
 * Writing a new entry is the one action.
 */
function RouteComponent() {
  const { open: openId } = Route.useSearch()
  const { data: entries } = useStationDiaryEntries('')
  const [viewing, setViewing] = useState<StationDiaryEntry | null>(null)
  const [printDay, setPrintDay] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  useDeepLinkRecord(entries, openId, setViewing)

  const days = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const shown = entries.filter(
      (e) => !needle || [richTextToPlainText(e.content), stationDiaryCategoryLabel(e.category), stationDiaryRelatedPersonName(e) ?? '', diaryCitation(e) ?? ''].some((t) => t.toLowerCase().includes(needle)),
    )
    const byDay = new Map<string, StationDiaryEntry[]>()
    for (const e of [...shown].sort((a, b) => b.createdAt - a.createdAt)) {
      const key = dayKey(e.createdAt)
      byDay.set(key, [...(byDay.get(key) ?? []), e])
    }
    return [...byDay.values()]
  }, [entries, query])

  const dayEntries = printDay === null ? [] : entries.filter((e) => dayKey(e.createdAt) === dayKey(printDay))

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.station_diary"]()}</h1>
          <p>{entries.length === 1 ? m["sd_page.count_one"]() : m["sd_page.count"]({ count: entries.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["sd_page.new_entry"]()} title={m["overview.new_sd_title"]()} description={m["sd_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <StationDiaryEntryForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      {entries.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Notebook01Icon} />}>{m["sd_page.empty"]()}</EmptyNote>
      ) : (
        <>
          <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={m["sd_page.search"]()}
              aria-label={m["sd_page.search"]()}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {days.length === 0 && <EmptyNote>{m["files.no_match"]({ query })}</EmptyNote>}
          {days.map((list) => (
            <Group
              key={dayKey(list[0].createdAt)}
              title={dayTitle(list[0].createdAt)}
              action={
                <Button size="xs" variant="ghost" onClick={() => setPrintDay(list[0].createdAt)}>
                  <HugeiconsIcon icon={PrinterIcon} />
                  {m["sd_page.print_day"]()}
                </Button>
              }
            >
              {list.map((entry) => {
                const text = richTextToPlainText(entry.content).trim()
                return (
                  <GroupRow
                    key={entry.id}
                    label={text || stationDiaryCategoryLabel(entry.category)}
                    detail={[diaryCitation(entry), format(entry.createdAt, 'HH:mm'), stationDiaryCategoryLabel(entry.category), stationDiaryRelatedPersonName(entry)].filter(Boolean).join(' · ')}
                    chevron
                    onClick={() => setViewing(entry)}
                  />
                )
              })}
            </Group>
          ))}
        </>
      )}

      {viewing && (
        <PaperWindow open onOpenChange={(open) => !open && setViewing(null)} title={diaryCitation(viewing) ?? m["sd_page.entry_title"]()}>
          <EntryPaper entry={entries.find((e) => e.id === viewing.id) ?? viewing} />
        </PaperWindow>
      )}
      {printDay !== null && (
        <PaperWindow open onOpenChange={(open) => !open && setPrintDay(null)} title={m["sd_page.day_title"]({ date: format(printDay, 'd MMMM yyyy') })}>
          <DayPaper day={printDay} entries={dayEntries} />
        </PaperWindow>
      )}
    </article>
  )
}
