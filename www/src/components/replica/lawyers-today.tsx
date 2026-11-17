import {
  Calendar03Icon, ChartBarLineIcon, ChartHistogramIcon, Clock01Icon, DashboardBrowsingIcon, Folder01Icon, Invoice01Icon, LegalDocument01Icon,
  Stamp01Icon, Task01Icon, UserAdd01Icon, UserGroupIcon, Add01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { Stat } from '@pleadli/ui/stat'
import { AppShell, type ShellSection } from './app-shell'
import { ListPage } from './list-page'

export const lawyersAccent = {
  '--primary': 'oklch(0.379 0.146 265.522)',
  '--primary-foreground': 'oklch(0.97 0.014 254.604)',
  '--sidebar-primary': 'oklch(0.379 0.146 265.522)',
}

const sections: ShellSection[] = [
  { rows: [
    { icon: DashboardBrowsingIcon, label: 'Today' },
    { icon: Clock01Icon, label: 'Recent' },
    { icon: Calendar03Icon, label: 'Diary' },
    { icon: Task01Icon, label: 'Bring-ups', count: 1, urgent: true },
    { icon: LegalDocument01Icon, label: 'Documents' },
  ] },
  { label: 'Files', rows: [
    { icon: Folder01Icon, label: 'Active files' },
    { icon: Folder01Icon, label: 'No next date', count: 2 },
    { icon: Folder01Icon, label: 'Criminal register' },
    { icon: Folder01Icon, label: 'Closed files' },
    { icon: Folder01Icon, label: 'All files' },
  ] },
  { label: 'Office', rows: [
    { icon: UserGroupIcon, label: 'Clients' },
    { icon: UserAdd01Icon, label: 'Non-contentious work' },
    { icon: Stamp01Icon, label: 'Registers' },
    { icon: Invoice01Icon, label: 'Accounts' },
    { icon: ChartBarLineIcon, label: 'Time sheets' },
    { icon: ChartHistogramIcon, label: 'Practice report' },
  ] },
]

function LawyersTodayPage() {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Tuesday, November 17, 2026</p>
          <h1>Today</h1>
        </div>
        <div className="page-actions">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-[550] text-primary-foreground shadow-xs"><HugeiconsIcon icon={Add01Icon} className="size-4" /> Open a matter</span>
        </div>
      </header>
      <Group title="In court today">
        <GroupRow label="CRB 214/2026, Uganda v. Okello John" detail="Hearing, Court 2 · Okello John, on remand" value={<span className="flex gap-2 text-xs"><span className="rounded-md bg-muted px-2.5 py-1.5">Attended</span><span className="rounded-md bg-muted px-2.5 py-1.5">Adjourned</span></span>} />
      </Group>
      <Group title="Needs attention · 2">
        <GroupRow icon={<RowIcon><HugeiconsIcon icon={Folder01Icon} /></RowIcon>} label="CRB 231/2026, Uganda v. Auma Grace" detail="Nothing is in the diary." chevron />
        <GroupRow icon={<RowIcon tone="red"><HugeiconsIcon icon={Clock01Icon} /></RowIcon>} label="CRB 214/2026, Uganda v. Okello John" detail="Certificate of trial readiness was due Nov 10, 2026." chevron />
      </Group>
      <section className="flex flex-col gap-1.5">
        <h2 data-slot="group-title">Your practice</h2>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Open matters" value={3} />
          <Stat label="No next date" value={2} tone="attention" />
          <Stat label="Tasks" value={3} tone="urgent" />
          <Stat label="Drafts" value={1} />
        </div>
      </section>
    </article>
  )
}

export function LawyersToday() {
  return (
    <AppShell
      product="Pleadli Lawyers" office="Nambooze and Associates Advocates" crest="/images/brand/lawyers-crest.svg"
      sections={sections}
      user={{ initials: 'RN', name: 'Rebecca Nambooze', sub: 'Nambooze and Associates' }}
      banner={<div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-muted/60 text-xs text-muted-foreground">Pleadli Lawyers trial: 30 days left. <span className="font-medium text-foreground">Licence</span></div>}
      screens={[
        { row: 'Today', tab: { icon: DashboardBrowsingIcon, label: 'Today' }, content: <LawyersTodayPage /> },
        { row: 'Diary', tab: { icon: Calendar03Icon, label: 'Diary' }, content: <ListPage eyebrow="November 2026" title="Diary" action="Add to the diary" groups={[{ title: "This week", items: [
          { title: "CRB 214/2026, Uganda v. Okello John", detail: "Hearing, Court 2", right: "Tue 09:00" },
          { title: "HCCS 88/2026, Nsubuga Traders Ltd v. Kato Hardware", detail: "Mention, Commercial Division", right: "Thu 10:30" },
        ] }]} /> },
        { row: 'Criminal register', tab: { icon: Folder01Icon, label: 'Criminal register' }, content: <ListPage title="Criminal register" action="Open a matter" groups={[{ title: "Open", items: [
          { title: "CRB 214/2026, Uganda v. Okello John", detail: "Client on remand to Nov 20, 2026" },
          { title: "CRB 231/2026, Uganda v. Auma Grace", detail: "Nothing is in the diary." },
        ] }]} /> },
      ]}
    />
  )
}
