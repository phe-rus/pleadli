import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { PersonAvatar } from '@/components/person-avatar'
import { useDutyAssignments } from '@/features/duty/queries'
import { PaperWindow, RecordPaper } from '@/features/paper/record-paper'
import { format } from '@/lib/date'
import { MoreHorizontalIcon, PoliceBadgeIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { OfficerForm } from './officer-form'
import { useOfficers } from './queries'
import { isDetective, rankSeniority, rankTitle } from './ranks'
import { officerRoleLabel, type Officer } from './schema'

type View = 'here' | 'left'

/** Officers in nominal roll order: by seniority of rank, then by name. */
function byRoll(a: Officer, b: Officer) {
  return rankSeniority(a.rank) - rankSeniority(b.rank) || a.name.localeCompare(b.name)
}

/** One officer as the station's record of them: rank, number, post, what
 * they may do in this app, and their duty this week. */
function OfficerPaper({ officer }: { officer: Officer }) {
  const { data: assignments } = useDutyAssignments('')
  const from = Date.now() - 86_400_000
  const duty = assignments
    .filter((a) => a.officerId === officer.id && a.shiftEnd > from && a.shiftStart < from + 8 * 86_400_000)
    .sort((a, b) => a.shiftStart - b.shiftStart)
  return (
    <RecordPaper
      entityType="officer"
      entityId={officer.id}
      reference={officer.badgeNumber}
      title={m["officers_page.paper_title"]()}
      details={[
        { label: m["col.name"](), value: officer.name },
        ...(officer.rank ? [{ label: m["col.rank"](), value: officer.rank }] : []),
        ...(officer.badgeNumber ? [{ label: m["officers.badge_number"](), value: officer.badgeNumber, copy: officer.badgeNumber }] : []),
        ...(officer.post ? [{ label: m["officers.post"](), value: officer.post }] : []),
        { label: m["officers_page.in_this_app"](), value: officerRoleLabel(officer.role) },
      ]}
      events={[{ at: officer.createdAt, label: m["officers_page.joined_books"]() }]}
      edit={(done) => <OfficerForm key={officer.id} officer={officer} onSuccess={done} />}
    >
      <h2>{officer.name}</h2>
      <section className="mb-5 flex flex-col gap-0.5">
        {officer.rank && <PaperField label={m["col.rank"]()}>{officer.rank}</PaperField>}
        {officer.badgeNumber && <PaperField label={m["officers.badge_number"]()}>{officer.badgeNumber}</PaperField>}
        {officer.post && <PaperField label={m["officers.post"]()}>{officer.post}</PaperField>}
        <PaperField label={m["col.status"]()}>{officer.active ? m["officers_page.at_station"]() : m["officers_page.left"]()}</PaperField>
        <PaperField label={m["officers_page.in_this_app"]()}>{officerRoleLabel(officer.role)}</PaperField>
        <PaperField label={m["officers_page.phone_sign_in"]()}>{officer.hasSignIn ? m["common.yes"]() : m["common.no"]()}</PaperField>
      </section>
      {duty.length > 0 && (
        <>
          <h3>{m["officers_page.duty_coming"]()}</h3>
          <table>
            <tbody>
              {duty.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{format(a.shiftStart, 'EEEE d MMMM')}</td>
                  <td className="whitespace-nowrap">{m["roster_page.span"]({ from: format(a.shiftStart, 'HH:mm'), to: format(a.shiftEnd, 'HH:mm') })}</td>
                  <td>{a.unit ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {officer.notes && <p className="mt-5 whitespace-pre-wrap">{officer.notes}</p>}
    </RecordPaper>
  )
}

/** The nominal roll: everyone at the station by seniority, numbered, with a
 * column to sign, as it goes to the district on a muster. */
function NominalRollPaper({ officers }: { officers: Officer[] }) {
  const today = format(Date.now(), 'yyyy-MM-dd')
  return (
    <RecordPaper
      entityType="nominal_roll"
      entityId={today}
      title={m["officers_page.roll_title"]()}
      details={[
        { label: m["sd_page.date"](), value: format(Date.now(), 'PPPP') },
        { label: m["roster_page.officers"](), value: String(officers.length) },
      ]}
    >
      <table>
        <thead>
          <tr>
            <th>{m["officers_page.no"]()}</th>
            <th>{m["officers.badge_number"]()}</th>
            <th>{m["col.rank"]()}</th>
            <th>{m["col.name"]()}</th>
            <th>{m["officers.post"]()}</th>
            <th className="w-28">{m["officers_page.signature"]()}</th>
          </tr>
        </thead>
        <tbody>
          {officers.map((o, i) => (
            <tr key={o.id}>
              <td>{i + 1}</td>
              <td className="whitespace-nowrap">{o.badgeNumber ?? ''}</td>
              <td className="whitespace-nowrap">{o.rank ?? ''}</td>
              <td>{o.name}</td>
              <td>{o.post ?? ''}</td>
              <td />
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
 * The station's officers as its nominal roll: by rank, most senior first,
 * each with their face, post and number, and who is on duty now. An officer
 * opens as their record; the roll prints from "···".
 */
export function OfficersPage() {
  const search = useSearch({ strict: false }) as { open?: string }
  const navigate = useNavigate()
  const setOpen = (id: string | null) => void navigate({ to: '/station/officers', search: id ? { open: id } : {}, replace: true } as never)
  const { data: officers } = useOfficers()
  const { data: assignments } = useDutyAssignments('')
  const [view, setView] = useState<View>('here')
  const [query, setQuery] = useState('')
  const [printRoll, setPrintRoll] = useState(false)

  const here = useMemo(() => officers.filter((o) => o.active).sort(byRoll), [officers])
  const left = officers.length - here.length
  const now = Date.now()
  const onDutyUntil = (o: Officer) => assignments.find((a) => a.officerId === o.id && a.shiftStart <= now && a.shiftEnd > now)?.shiftEnd

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const shown = officers
      .filter((o) => (view === 'here' ? o.active : !o.active))
      .filter((o) => !needle || [o.name, o.rank ?? '', o.post ?? '', o.badgeNumber ?? ''].some((t) => t.toLowerCase().includes(needle)))
      .sort(byRoll)
    const map = new Map<string, Officer[]>()
    for (const o of shown) {
      const title = rankTitle(o.rank) || m["officers_page.no_rank"]()
      map.set(title, [...(map.get(title) ?? []), o])
    }
    return [...map.entries()]
  }, [officers, view, query])

  const current = search.open ? officers.find((o) => o.id === search.open) : undefined

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["common.officers"]()}</h1>
          <p>{left > 0 ? m["officers_page.count_left"]({ here: here.length, left }) : m["officers_page.count"]({ here: here.length })}</p>
        </div>
        <div className="page-actions">
          {left > 0 && (
            <Segmented
              label={m["custody_page.view"]()}
              value={view}
              onChange={setView}
              items={[
                { value: 'here', label: m["officers_page.at_station"]() },
                { value: 'left', label: m["officers_page.left"]() },
              ]}
            />
          )}
          <PanelButton label={m["officers.submit"]()} title={m["officers.submit"]()} description={m["officers_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <OfficerForm onSuccess={close} onDirtyChange={setDirty} />}
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
              <DropdownMenuItem disabled={here.length === 0} onClick={() => setPrintRoll(true)}>
                {m["officers_page.print_roll"]()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {officers.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={PoliceBadgeIcon} />}>{m["officers_page.empty"]()}</EmptyNote>
      ) : (
        <>
          <label className="flex h-9 max-w-sm items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={m["officers_page.search"]()}
              aria-label={m["officers_page.search"]()}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {sections.length === 0 && query && <EmptyNote>{m["files.no_match"]({ query })}</EmptyNote>}
          {sections.map(([title, list]) => (
            <Group key={title} title={title}>
              {list.map((o) => {
                const until = view === 'here' ? onDutyUntil(o) : undefined
                return (
                  <GroupRow
                    key={o.id}
                    icon={<PersonAvatar name={o.name} size="sm" />}
                    label={o.name}
                    detail={[isDetective(o.rank) ? o.rank : null, o.post, o.badgeNumber].filter(Boolean).join(' · ')}
                    value={until ? m["officers_page.on_duty_until"]({ time: format(until, 'HH:mm') }) : undefined}
                    chevron
                    onClick={() => setOpen(o.id)}
                  />
                )
              })}
            </Group>
          ))}
        </>
      )}

      {current && (
        <PaperWindow open onOpenChange={(open) => !open && setOpen(null)} title={current.name}>
          <OfficerPaper officer={current} />
        </PaperWindow>
      )}
      {printRoll && (
        <PaperWindow open onOpenChange={setPrintRoll} title={m["officers_page.roll_title"]()}>
          <NominalRollPaper officers={here} />
        </PaperWindow>
      )}
    </article>
  )
}
