import {
  AlarmClock, Car01Icon, CellsIcon, File02Icon, FingerPrintCheckIcon, Folder01Icon, GunIcon, Home01Icon,
  Mic01Icon, Notebook01Icon, ShieldKeyIcon, Share08Icon, SirenIcon, UserGroupIcon, UserIcon, BarChartIcon, ArchiveIcon, Add01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { ListPage } from './list-page'
import { AppShell, type ShellSection } from './app-shell'

const sections: ShellSection[] = [
  { rows: [
    { icon: Home01Icon, label: 'Today', },
    { icon: Notebook01Icon, label: 'Station diary' },
    { icon: SirenIcon, label: 'Incidents' },
    { icon: UserGroupIcon, label: 'People' },
    { icon: Car01Icon, label: 'Vehicles' },
    { icon: Folder01Icon, label: 'Documents' },
  ] },
  { label: 'Cells', rows: [
    { icon: CellsIcon, label: 'In custody', count: 1, urgent: true },
    { icon: AlarmClock, label: 'Bonds and sureties' },
  ] },
  { label: 'Cases', rows: [
    { icon: Folder01Icon, label: 'Under investigation', count: 3 },
    { icon: Folder01Icon, label: 'With the DPP', count: 1 },
    { icon: Folder01Icon, label: 'Closed' },
    { icon: Folder01Icon, label: 'All cases' },
  ] },
  { label: 'Case papers', rows: [
    { icon: Mic01Icon, label: 'Statements' },
    { icon: FingerPrintCheckIcon, label: 'Exhibits' },
    { icon: File02Icon, label: 'Charge sheets' },
    { icon: Share08Icon, label: 'Referrals' },
  ] },
  { label: 'Station', rows: [
    { icon: ShieldKeyIcon, label: 'Officers' },
    { icon: UserIcon, label: 'Duty roster' },
    { icon: GunIcon, label: 'Armory' },
    { icon: ArchiveIcon, label: 'Impounded assets' },
    { icon: BarChartIcon, label: 'Statistics' },
  ] },
]

/** Pleadli Police, Today: the station's day, drawn from the app's own overview page and
 * shell. Sample records only. */
function PoliceTodayPage() {
  return (
      <article className="page">
        <header className="page-header">
          <div>
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Tuesday 17 November</p>
            <h1>Today</h1>
          </div>
          <div className="page-actions">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-[550] text-primary-foreground shadow-xs">
              <HugeiconsIcon icon={Add01Icon} className="size-4" /> New diary entry
            </span>
          </div>
        </header>

        <section className="flex flex-col gap-2 rounded-xl bg-destructive/[0.06] p-4 ring-1 ring-destructive/20">
          <h2 className="text-destructive">Cannot wait</h2>
          <ul className="flex list-none flex-col gap-1 p-0">
            <li className="-mx-2 flex flex-col rounded-xl px-2 py-1.5 text-foreground">
              <strong>Wasswa, Mungu M.</strong>
              <span className="text-amber-800">8 hours left. Must be in court or released by Tue 11:47 AM.</span>
            </li>
          </ul>
        </section>

        <div className="grid grid-cols-4 gap-3">
          <Stat label="In custody" value={1} />
          <Stat label="Diary entries today" value={5} />
          <Stat label="Under investigation" value={3} />
          <Stat label="On duty now" value={4} />
        </div>

        <Group title="Waiting for a reply">
          <GroupRow
            icon={<RowIcon><HugeiconsIcon icon={Share08Icon} /></RowIcon>}
            label="CC-2026-0001"
            detail="Sent to Resident State Attorney, Buganda Road 56 seconds ago"
            chevron
          />
        </Group>

        <Group title="Just happened">
          <GroupRow label="Handover to Mungu Wasswa" detail="Deborah Wasswa" value={<span className="text-xs">56 seconds ago</span>} />
          <GroupRow label="Deborah Wasswa checked in" detail="Badge entry" value={<span className="text-xs">58 seconds ago</span>} />
        </Group>
      </article>
  )
}

export function PoliceToday() {
  return (
    <AppShell
      product="Pleadli Police" office="Kampala Central Police Station" crest="/images/brand/police-crest.png"
      sections={sections}
      user={{ initials: 'JA', name: 'Inspector Joan Atim', sub: 'Kampala Central Police Station · Administrator' }}
      screens={[
  { row: "Today", tab: { icon: Home01Icon, label: "Today" }, content: <PoliceTodayPage /> },
  { row: "Station diary", tab: { icon: Notebook01Icon, label: "Station diary" }, content: <ListPage eyebrow="Tuesday 17 November" title="Station diary" action="New diary entry" groups={[{ title: "Today", items: [
    { title: "Handover to Mungu Wasswa", detail: "Deborah Wasswa", right: "56 seconds ago" },
    { title: "Deborah Wasswa checked in", detail: "Badge entry", right: "58 seconds ago" },
    { title: "Report of theft, motor vehicle", detail: "Kira Road. Complainant Grace Namutebi", right: "2 hours ago" },
  ] }]} /> },
  { row: "In custody", tab: { icon: CellsIcon, label: "In custody" }, content: <ListPage title="In custody" action="Book in a person" groups={[{ title: "In the cells · 1", items: [
    { title: "Wasswa, Mungu M.", detail: "Theft of motor vehicle. 8 hours left before court or release." },
  ] }]} /> },
]}
    />
  )
}
