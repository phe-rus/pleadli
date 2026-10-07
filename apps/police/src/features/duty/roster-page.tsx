import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { Createpanel } from '@/components/create-panel'
import { EmptyNote } from '@/components/planned'
import { PaperWindow, RecordPaper } from '@/features/paper/record-paper'
import { RecordList } from '@/features/paper/record-list'
import { checkInMethodLabel, CheckInDialog, HandoverForm, useCheckIns, useShiftHandovers, type OfficerCheckIn, type ShiftHandover } from '@/features/shift-log'
import { format } from '@/lib/date'
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, MoreHorizontalIcon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { DutyAssignmentForm } from './duty-assignment-form'
import { useDutyAssignments } from './queries'
import type { DutyAssignment } from './schema'

type View = 'now' | 'week' | 'book'
const DAY = 86_400_000
const dayKey = (ms: number) => format(ms, 'yyyy-MM-dd')
const span = (from: string, to: string) => m["roster_page.span"]({ from, to })

/** Midnight on the Monday of the week holding `ms`, the way a roster week runs. */
function mondayOf(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

function shiftLine(a: DutyAssignment) {
  const sameDay = dayKey(a.shiftStart) === dayKey(a.shiftEnd)
  return sameDay ? span(format(a.shiftStart, 'HH:mm'), format(a.shiftEnd, 'HH:mm')) : span(format(a.shiftStart, 'EEE HH:mm'), format(a.shiftEnd, 'EEE HH:mm'))
}

/** One officer's duty as the detail slip the duty officer signs. */
function DutyPaper({ assignment }: { assignment: DutyAssignment }) {
  return (
    <RecordPaper
      entityType="duty_assignment"
      entityId={assignment.id}
      title={m["roster_page.detail_title"]()}
      details={[
        { label: m["col.officer"](), value: assignment.officerName },
        ...(assignment.officerRank ? [{ label: m["col.rank"](), value: assignment.officerRank }] : []),
        ...(assignment.unit ? [{ label: m["roster_page.duty"](), value: assignment.unit }] : []),
        { label: m["roster_page.from"](), value: format(assignment.shiftStart, 'PPp') },
        { label: m["roster_page.to"](), value: format(assignment.shiftEnd, 'PPp') },
      ]}
      events={[{ at: assignment.createdAt, label: m["roster_page.rostered"]() }]}
      edit={(done) => <DutyAssignmentForm key={assignment.id} assignment={assignment} onSuccess={done} />}
    >
      <h2>{assignment.officerName}</h2>
      <section className="mb-5 flex flex-col gap-0.5">
        {assignment.officerRank && <PaperField label={m["col.rank"]()}>{assignment.officerRank}</PaperField>}
        {assignment.unit && <PaperField label={m["roster_page.duty"]()}>{assignment.unit}</PaperField>}
        <PaperField label={m["roster_page.from"]()}>{format(assignment.shiftStart, 'PPPP HH:mm')}</PaperField>
        <PaperField label={m["roster_page.to"]()}>{format(assignment.shiftEnd, 'PPPP HH:mm')}</PaperField>
      </section>
      {assignment.notes && <p className="whitespace-pre-wrap">{assignment.notes}</p>}
      <section className="mt-12 flex justify-between gap-8">
        <SignatureLine caption={m["roster_page.officer_signs"]()} />
        <SignatureLine caption={m["roster_page.duty_officer"]()} />
      </section>
    </RecordPaper>
  )
}

/** A day of the roster as the sheet pinned on the station notice board. */
function RosterDayPaper({ day, shifts }: { day: number; shifts: DutyAssignment[] }) {
  return (
    <RecordPaper
      entityType="duty_roster_day"
      entityId={dayKey(day)}
      title={m["roster_page.day_title"]({ date: format(day, 'EEEE d MMMM yyyy') })}
      details={[
        { label: m["sd_page.date"](), value: format(day, 'PPPP') },
        { label: m["roster_page.officers"](), value: String(new Set(shifts.map((s) => s.officerId ?? s.officerName)).size) },
      ]}
    >
      <table>
        <thead>
          <tr>
            <th>{m["col.officer"]()}</th>
            <th>{m["col.rank"]()}</th>
            <th>{m["roster_page.duty"]()}</th>
            <th>{m["roster_page.hours"]()}</th>
            <th>{m["roster_page.booked_on"]()}</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td>{s.officerName}</td>
              <td>{s.officerRank ?? ''}</td>
              <td>{s.unit ?? ''}</td>
              <td className="whitespace-nowrap">{shiftLine(s)}</td>
              <td className="w-24" />
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

/** The handover as the outgoing duty officer writes it in the book. */
function HandoverPaper({ handover }: { handover: ShiftHandover }) {
  return (
    <RecordPaper
      entityType="shift_handover"
      entityId={handover.id}
      title={m["roster_page.handover_title"]()}
      details={[
        { label: m["roster_page.time"](), value: format(handover.handedOverAt, 'PPp') },
        ...(handover.outgoingOfficerName ? [{ label: m["roster_page.handed_over_by"](), value: handover.outgoingOfficerName }] : []),
        { label: m["roster_page.taken_over_by"](), value: handover.incomingOfficerName },
        ...(handover.unit ? [{ label: m["roster_page.duty"](), value: handover.unit }] : []),
      ]}
      events={[{ at: handover.handedOverAt, label: m["roster_page.handover_title"]() }]}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["roster_page.time"]()}>{format(handover.handedOverAt, 'PPPP HH:mm')}</PaperField>
        {handover.outgoingOfficerName && <PaperField label={m["roster_page.handed_over_by"]()}>{handover.outgoingOfficerName}</PaperField>}
        <PaperField label={m["roster_page.taken_over_by"]()}>{handover.incomingOfficerName}</PaperField>
        {handover.unit && <PaperField label={m["roster_page.duty"]()}>{handover.unit}</PaperField>}
      </section>
      {handover.notes && <p className="whitespace-pre-wrap">{handover.notes}</p>}
      <section className="mt-12 flex justify-between gap-8">
        <SignatureLine caption={m["roster_page.handed_over_by"]()} />
        <SignatureLine caption={m["roster_page.taken_over_by"]()} />
      </section>
    </RecordPaper>
  )
}

function BookedOnPaper({ checkIn }: { checkIn: OfficerCheckIn }) {
  return (
    <RecordPaper
      entityType="officer_check_in"
      entityId={checkIn.id}
      title={m["roster_page.booked_on_title"]()}
      details={[
        { label: m["col.officer"](), value: checkIn.officerName },
        { label: m["roster_page.time"](), value: format(checkIn.checkedInAt, 'PPp') },
        { label: m["roster_page.how"](), value: checkInMethodLabel(checkIn.method) },
      ]}
    >
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["col.officer"]()}>{checkIn.officerName}</PaperField>
        <PaperField label={m["roster_page.time"]()}>{format(checkIn.checkedInAt, 'PPPP HH:mm')}</PaperField>
        <PaperField label={m["roster_page.how"]()}>{checkInMethodLabel(checkIn.method)}</PaperField>
      </section>
    </RecordPaper>
  )
}

type BookEntry = { id: string; at: number; kind: 'on'; item: OfficerCheckIn } | { id: string; at: number; kind: 'handover'; item: ShiftHandover }

/**
 * The duty roster as a duty officer reads it: who is on duty now and whether
 * they have booked on, the week day by day (each day prints as the notice
 * board sheet), and the book of bookings-on and handovers. Putting an officer
 * on duty is the one action; booking on and handing over sit behind "···".
 */
export function RosterPage() {
  const search = useSearch({ strict: false }) as { open?: string; view?: View }
  const navigate = useNavigate()
  const view: View = search.view ?? 'now'
  const go = (next: { view?: View; open?: string | null }) =>
    void navigate({
      to: '/roster',
      search: { ...(next.view ?? view) !== 'now' ? { view: next.view ?? view } : {}, ...(next.open ? { open: next.open } : {}) },
      replace: true,
    } as never)

  const { data: assignments } = useDutyAssignments('')
  const { data: checkIns } = useCheckIns('')
  const { data: handovers } = useShiftHandovers('')
  const [week, setWeek] = useState(() => mondayOf(Date.now()))
  const [printDay, setPrintDay] = useState<number | null>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [handoverOpen, setHandoverOpen] = useState(false)

  const now = Date.now()
  const onDuty = assignments.filter((a) => a.shiftStart <= now && a.shiftEnd > now).sort((a, b) => a.shiftEnd - b.shiftEnd)
  const comingOn = assignments.filter((a) => a.shiftStart > now && a.shiftStart <= now + DAY).sort((a, b) => a.shiftStart - b.shiftStart)
  const lastHandover = [...handovers].sort((a, b) => b.handedOverAt - a.handedOverAt)[0]

  /** When an officer booked on for the shift they are on: the first booking
   * from an hour before the shift starts. */
  const bookedOn = (a: DutyAssignment) =>
    checkIns
      .filter((c) => c.officerId === a.officerId && c.checkedInAt >= a.shiftStart - 3_600_000 && c.checkedInAt < a.shiftEnd)
      .sort((x, y) => x.checkedInAt - y.checkedInAt)[0]

  const days = useMemo(() => {
    const out: { day: number; shifts: DutyAssignment[] }[] = []
    for (let i = 0; i < 7; i++) {
      const start = new Date(week)
      start.setDate(start.getDate() + i)
      const from = start.getTime()
      const to = from + DAY
      const shifts = assignments.filter((a) => a.shiftStart < to && a.shiftEnd > from).sort((a, b) => a.shiftStart - b.shiftStart)
      if (shifts.length) out.push({ day: from, shifts })
    }
    return out
  }, [assignments, week])

  const book: BookEntry[] = useMemo(
    () => [
      ...checkIns.map((c) => ({ id: c.id, at: c.checkedInAt, kind: 'on' as const, item: c })),
      ...handovers.map((h) => ({ id: h.id, at: h.handedOverAt, kind: 'handover' as const, item: h })),
    ],
    [checkIns, handovers],
  )

  const opened = search.open ? assignments.find((a) => a.id === search.open) : undefined
  const thisWeek = week === mondayOf(now)
  const weekEnd = week + 6 * DAY

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.duty_roster"]()}</h1>
          <p>{onDuty.length === 0 ? m["roster_page.no_one_now"]() : m["roster_page.on_duty_count"]({ count: onDuty.length })}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["custody_page.view"]()}
            value={view}
            onChange={(next) => go({ view: next, open: null })}
            items={[
              { value: 'now', label: m["roster_page.now"]() },
              { value: 'week', label: m["roster_page.week"]() },
              { value: 'book', label: m["roster_page.book"]() },
            ]}
          />
          <PanelButton label={m["roster_page.put_on_duty"]()} title={m["roster_page.put_on_duty"]()} description={m["roster.add_desc"]()} variant="default">
            {({ close }) => <DutyAssignmentForm onSuccess={close} />}
          </PanelButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="secondary" aria-label={m["files.more"]()} title={m["files.more"]()}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setCheckInOpen(true)}>{m["roster_page.book_on"]()}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHandoverOpen(true)}>{m["roster_page.hand_over"]()}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {view === 'now' &&
        (onDuty.length === 0 && comingOn.length === 0 && !lastHandover ? (
          <EmptyNote icon={<HugeiconsIcon icon={Calendar03Icon} />}>{m["roster_page.empty"]()}</EmptyNote>
        ) : (
          <>
            {onDuty.length > 0 && (
              <Group title={m["roster_page.on_duty_now"]()}>
                {onDuty.map((a) => {
                  const on = bookedOn(a)
                  return (
                    <GroupRow
                      key={a.id}
                      label={a.officerName}
                      detail={[a.officerRank, a.unit, m["roster_page.until"]({ time: format(a.shiftEnd, 'HH:mm') })].filter(Boolean).join(' · ')}
                      value={on ? m["roster_page.booked_on_at"]({ time: format(on.checkedInAt, 'HH:mm') }) : <span className="text-orange-600 dark:text-orange-400">{m["roster_page.not_booked_on"]()}</span>}
                      chevron
                      onClick={() => go({ open: a.id })}
                    />
                  )
                })}
              </Group>
            )}
            {comingOn.length > 0 && (
              <Group title={m["roster_page.coming_on"]()}>
                {comingOn.map((a) => (
                  <GroupRow
                    key={a.id}
                    label={a.officerName}
                    detail={[a.officerRank, a.unit].filter(Boolean).join(' · ')}
                    value={dayKey(a.shiftStart) === dayKey(now) ? format(a.shiftStart, 'HH:mm') : `${m["roster_page.tomorrow"]()} ${format(a.shiftStart, 'HH:mm')}`}
                    chevron
                    onClick={() => go({ open: a.id })}
                  />
                ))}
              </Group>
            )}
            {lastHandover && (
              <Group title={m["roster_page.last_handover"]()}>
                <GroupRow
                  label={m["roster_page.taken_over"]({ name: lastHandover.incomingOfficerName })}
                  detail={[lastHandover.outgoingOfficerName ? m["roster_page.from_name"]({ name: lastHandover.outgoingOfficerName }) : null, lastHandover.unit, format(lastHandover.handedOverAt, 'EEE d MMM HH:mm')].filter(Boolean).join(' · ')}
                  chevron
                  onClick={() => go({ view: 'book', open: lastHandover.id })}
                />
              </Group>
            )}
          </>
        ))}

      {view === 'week' && (
        <>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label={m["roster_page.previous_week"]()} title={m["roster_page.previous_week"]()} onClick={() => setWeek(mondayOf(week - DAY))}>
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </Button>
            <h2 className="min-w-0 truncate">
              {span(format(week, 'd MMM'), format(weekEnd, 'd MMM yyyy'))}
            </h2>
            <Button size="icon-sm" variant="ghost" aria-label={m["roster_page.next_week"]()} title={m["roster_page.next_week"]()} onClick={() => setWeek(mondayOf(week + 7 * DAY))}>
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
            {!thisWeek && (
              <Button size="sm" variant="secondary" className="ml-2" onClick={() => setWeek(mondayOf(now))}>
                {m["roster_page.this_week"]()}
              </Button>
            )}
          </div>
          {days.length === 0 && <EmptyNote icon={<HugeiconsIcon icon={Calendar03Icon} />}>{m["roster_page.week_empty"]()}</EmptyNote>}
          {days.map(({ day, shifts }) => (
            <Group
              key={day}
              title={dayKey(day) === dayKey(now) ? `${m["nav.today"]()} · ${format(day, 'EEEE d MMMM')}` : format(day, 'EEEE d MMMM')}
              action={
                <Button size="xs" variant="ghost" onClick={() => setPrintDay(day)}>
                  <HugeiconsIcon icon={PrinterIcon} />
                  {m["roster_page.print_day"]()}
                </Button>
              }
            >
              {shifts.map((a) => (
                <GroupRow key={a.id} label={a.officerName} detail={[a.officerRank, a.unit].filter(Boolean).join(' · ')} value={shiftLine(a)} chevron onClick={() => go({ open: a.id })} />
              ))}
            </Group>
          ))}
        </>
      )}

      {view === 'book' && (
        <RecordList
          items={book}
          groupBy="day"
          date={(e) => e.at}
          label={(e) => (e.kind === 'on' ? m["roster_page.booked_on_name"]({ name: e.item.officerName }) : m["roster_page.taken_over"]({ name: e.item.incomingOfficerName }))}
          detail={(e) =>
            e.kind === 'on'
              ? [format(e.at, 'HH:mm'), checkInMethodLabel(e.item.method)].join(' · ')
              : [format(e.at, 'HH:mm'), e.item.outgoingOfficerName ? m["roster_page.from_name"]({ name: e.item.outgoingOfficerName }) : null, e.item.unit].filter(Boolean).join(' · ')
          }
          searchText={(e) => (e.kind === 'on' ? e.item.officerName : [e.item.incomingOfficerName, e.item.outgoingOfficerName ?? '', e.item.unit ?? '', e.item.notes ?? ''].join(' '))}
          paper={(e) => (e.kind === 'on' ? <BookedOnPaper checkIn={e.item} /> : <HandoverPaper handover={e.item} />)}
          windowTitle={(e) => (e.kind === 'on' ? m["roster_page.booked_on_title"]() : m["roster_page.handover_title"]())}
          empty={m["roster_page.book_empty"]()}
          emptyIcon={<HugeiconsIcon icon={Calendar03Icon} />}
          searchPlaceholder={m["roster_page.book_search"]()}
          opened={search.open ?? null}
          onOpened={(id) => go({ open: id })}
        />
      )}

      {view !== 'book' && opened && (
        <PaperWindow open onOpenChange={(open) => !open && go({ open: null })} title={opened.officerName}>
          <DutyPaper assignment={opened} />
        </PaperWindow>
      )}
      {printDay !== null && (
        <PaperWindow open onOpenChange={(open) => !open && setPrintDay(null)} title={m["roster_page.day_title"]({ date: format(printDay, 'd MMMM yyyy') })}>
          <RosterDayPaper day={printDay} shifts={days.find((d) => d.day === printDay)?.shifts ?? []} />
        </PaperWindow>
      )}

      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} />
      <Createpanel open={handoverOpen} onOpenChange={setHandoverOpen} headings={{ title: m["roster_page.hand_over"](), description: m["roster.handover_desc"]() }}>
        <HandoverForm onSuccess={() => setHandoverOpen(false)} />
      </Createpanel>
    </article>
  )
}
