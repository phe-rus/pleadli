import {
  Analytics01Icon, Calendar03Icon, ChartBarLineIcon, Clock01Icon, DashboardBrowsingIcon, FileImportIcon, Folder01Icon,
  LegalDocument01Icon, NetworkIcon, Task01Icon, UserGroupIcon, Add01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { ListPage } from './list-page'
import { AppShell, type ShellSection } from './app-shell'

export const dppAccent = {
  '--primary': 'oklch(0.852 0.199 91.936)',
  '--primary-foreground': 'oklch(0.421 0.095 57.708)',
  '--ring': 'oklch(0.737 0.021 106.9)',
  '--sidebar-primary': 'oklch(0.681 0.162 75.834)',
  '--sidebar-primary-foreground': 'oklch(0.987 0.026 102.212)',
}

const sections: ShellSection[] = [
  { rows: [
    { icon: DashboardBrowsingIcon, label: 'Today', },
    { icon: Clock01Icon, label: 'Recent' },
    { icon: Task01Icon, label: 'Tasks' },
    { icon: Calendar03Icon, label: 'Calendar' },
    { icon: LegalDocument01Icon, label: 'Documents' },
  ] },
  { label: 'Files', rows: [
    { icon: FileImportIcon, label: 'Inbox' },
    { icon: Folder01Icon, label: 'All files' },
    { icon: Folder01Icon, label: 'New', count: 1 },
    { icon: Folder01Icon, label: 'In review' },
    { icon: Folder01Icon, label: 'To decide' },
    { icon: Folder01Icon, label: 'To prepare' },
    { icon: Folder01Icon, label: 'To hand over' },
    { icon: Folder01Icon, label: 'Following up' },
    { icon: Folder01Icon, label: 'With Police' },
    { icon: Folder01Icon, label: 'Closed' },
  ] },
  { label: 'Office', rows: [
    { icon: UserGroupIcon, label: 'People' },
    { icon: NetworkIcon, label: 'Police stations' },
    { icon: Analytics01Icon, label: 'Workload' },
    { icon: ChartBarLineIcon, label: 'Statistics' },
  ] },
]

/** Pleadli DPP, Today, drawn from the app's own overview page and shell. Sample records only. */
function DppTodayPage() {
  return (
      <article className="page">
        <header className="page-header">
          <div>
            <p className="text-[0.8125rem] font-medium text-muted-foreground">Tuesday, November 17, 2026</p>
            <h1>Today</h1>
          </div>
          <div className="page-actions">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-[550] text-primary-foreground shadow-xs">
              <HugeiconsIcon icon={Add01Icon} className="size-4" /> New file
            </span>
          </div>
        </header>

        <Group title="Needs attention · 1">
          <GroupRow
            icon={<RowIcon><HugeiconsIcon icon={Folder01Icon} /></RowIcon>}
            label="State vs. Okello: theft of motor vehicle"
            detail="ODPP/KLA/0142/2026 · Robert Okello · Waiting 3 days."
            chevron
          />
        </Group>

        <section className="flex flex-col gap-1.5">
          <div className="flex items-end justify-between px-1">
            <h2 data-slot="group-title">At a glance</h2>
            <span className="text-[0.8125rem] text-primary-ink">Workload</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Awaiting a decision" value={1} tone="attention" />
            <Stat label="New files" value={1} />
            <Stat label="With Police" value={2} />
            <Stat label="Drafts to issue" value={0} />
          </div>
        </section>

        <Group title="Recent activity">
          <GroupRow label="Police referral received" detail="State vs. Okello: theft of motor vehicle" value={<span className="text-xs">3 days ago</span>} />
        </Group>
      </article>
  )
}

export function DppToday() {
  return (
    <AppShell
      product="Pleadli · ODPP" office="Kampala Central Office" crest="/images/brand/dpp-crest.png"
      sections={sections}
      user={{ initials: 'GN', name: 'Grace Nakato', sub: 'Senior State Attorney' }}
      banner={<div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-muted/60 text-xs text-muted-foreground">Pleadli DPP trial: 30 days left. <span className="font-medium text-foreground">Licence</span></div>}
      screens={[
  { row: "Today", tab: { icon: DashboardBrowsingIcon, label: "Today" }, content: <DppTodayPage /> },
  { row: "Inbox", tab: { icon: FileImportIcon, label: "Inbox" }, content: <ListPage title="Inbox" action="Receive a file" groups={[{ title: "Waiting for review · 1", items: [
    { title: "State vs. Okello: theft of motor vehicle", detail: "From Kira Road Police Station. Received 3 days ago." },
  ] }]} /> },
  { row: "All files", tab: { icon: Folder01Icon, label: "All files" }, content: <ListPage title="All files" action="New file" groups={[{ title: "Open", items: [
    { title: "State vs. Okello: theft of motor vehicle", detail: "ODPP/KLA/0142/2026 · Robert Okello", right: "Awaiting decision" },
    { title: "State vs. Auma: assault", detail: "ODPP/KLA/0139/2026 · Grace Auma", right: "With Police" },
  ] }]} /> },
]}
    />
  )
}
