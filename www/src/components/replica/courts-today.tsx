import {
  Add01Icon, BookOpen01Icon, CalendarCheckOut01Icon, ChartBarLineIcon, DashboardBrowsingIcon, FolderViewIcon, Files01Icon, GavelIcon,
  LegalDocument01Icon, Settings01Icon, Task01Icon, Alert02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { ListPage } from './list-page'
import { AppShell, type ShellSection } from './app-shell'

export const courtsAccent = {
  '--primary': 'oklch(0.852 0.199 91.936)',
  '--primary-foreground': 'oklch(0.421 0.095 57.708)',
  '--ring': 'oklch(0.737 0.021 106.9)',
  '--sidebar-primary': 'oklch(0.681 0.162 75.834)',
  '--sidebar-primary-foreground': 'oklch(0.987 0.026 102.212)',
}

const sections: ShellSection[] = [
  { rows: [{ icon: DashboardBrowsingIcon, label: 'Today', }] },
  { label: 'Bench work', rows: [
    { icon: CalendarCheckOut01Icon, label: 'Cause list' },
    { icon: LegalDocument01Icon, label: 'Rulings and judgments' },
    { icon: GavelIcon, label: 'Orders' },
  ] },
  { label: 'Register', rows: [
    { icon: FolderViewIcon, label: 'Open cases' },
    { icon: Task01Icon, label: 'No next date', count: 1 },
    { icon: LegalDocument01Icon, label: 'Concluded' },
    { icon: Files01Icon, label: 'All cases' },
  ] },
  { label: 'Reference', rows: [{ icon: BookOpen01Icon, label: 'Library' }] },
  { label: 'Office', rows: [
    { icon: ChartBarLineIcon, label: 'Returns' },
    { icon: Settings01Icon, label: 'Settings' },
  ] },
]

function Tile({ label, icon, tint, value, meta, caption }: { label: string; icon: typeof Add01Icon; tint: string; value: number; meta?: string; caption: string }) {
  return (
    <Card className="h-full gap-3 p-0">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tint)}><HugeiconsIcon icon={icon} size={16} /></div>
          <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums text-foreground">{value}</span>
            {meta && <Badge variant="secondary">{meta}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Line({ title, summary, tag }: { title: string; summary: string; tag?: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0">
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      <div className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate text-[0.9375rem] font-semibold">{title}</strong>
        <span className="truncate text-sm text-muted-foreground">{summary}</span>
      </div>
      {tag && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">{tag}</span>}
      <span className="text-sm font-medium text-primary-ink">Open</span>
    </li>
  )
}

/** Pleadli Courts, Today: the bench's day, drawn from the app's own overview page and shell. Sample records only. */
function CourtsTodayPage() {
  return (
      <article className="page">
        <Card className="border-amber-500/40 bg-amber-500/5 p-0">
          <CardContent className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full bg-amber-500" />
              <h3>No next date</h3><span>·</span><p>1 open case with no sitting fixed.</p>
            </div>
            <span className="text-sm font-medium text-primary-ink">Open the list</span>
          </CardContent>
        </Card>
        <header className="page-header">
          <div>
            <h1>Today</h1>
            <p>Tuesday 17 November 2026. What is listed, and what has been left open.</p>
          </div>
          <div className="page-actions">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-[550] text-primary-foreground shadow-xs"><HugeiconsIcon icon={Add01Icon} className="size-4" /> Register a case</span>
          </div>
        </header>
        <section className="grid grid-cols-4 gap-4">
          <Tile label="Sittings today" icon={CalendarCheckOut01Icon} tint="bg-primary/10 text-primary" value={2} caption="On the cause list for today" />
          <Tile label="Open cases" icon={FolderViewIcon} tint="bg-emerald-500/10 text-emerald-600" value={3} meta="Registered here" caption="Criminal cases before this court" />
          <Tile label="No next date" icon={Alert02Icon} tint="bg-rose-500/10 text-rose-600" value={1} meta="Action needed" caption="Open cases with no sitting fixed" />
          <Tile label="Draft orders" icon={GavelIcon} tint="bg-amber-500/10 text-amber-600" value={0} meta="Not issued" caption="Prepared but not yet issued" />
        </section>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
          <div className="flex flex-col gap-6">
            <section className="page-section">
              <div className="section-head"><h2>Listed today</h2><span className="text-sm font-medium text-primary-ink">Cause list</span></div>
              <ul className="m-0 flex list-none flex-col p-0">
                <Line title="09:00 CRB 214/2026, Uganda v. Okello John" summary="Hearing, Court 2. Okello John." />
                <Line title="11:00 CRB 231/2026, Uganda v. Auma Grace" summary="Plea, Court 2. Auma Grace." />
              </ul>
            </section>
            <section className="page-section">
              <div className="section-head"><h2>Needs attention</h2><Badge variant="secondary">3 items</Badge></div>
              <ul className="m-0 flex list-none flex-col p-0">
                <Line title="CRB 198/2026, Uganda v. Mugisha Peter and another" summary="No sitting is fixed." tag="No next date" />
                <Line title="CRB 214/2026, Uganda v. Okello John" summary="Okello John's remand runs to Nov 20, 2026." tag="Remand ending" />
              </ul>
            </section>
          </div>
          <div className="flex flex-col gap-6">
            <section className="page-section">
              <h2>Adjournments, last 8 weeks</h2>
              <Card className="p-0"><CardContent className="p-0"><div className="flex justify-between p-5 text-sm"><p>0 adjournments</p><p className="text-muted-foreground">Peak: 1/wk</p></div><div className="h-1 bg-primary" /></CardContent></Card>
            </section>
            <section className="page-section">
              <h2>Why sittings were adjourned</h2>
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No sitting has been adjourned in this period.</div>
            </section>
          </div>
        </div>
      </article>
  )
}

export function CourtsToday() {
  return (
    <AppShell
      product="Pleadli Courts" office="Buganda Road Chief Magistrate's Court" crest="/images/brand/courts-crest.svg"
      sections={sections}
      user={{ initials: 'HS', name: 'Hon. Sarah Achieng', sub: 'Magistrate Grade I' }}
      screens={[
  { row: "Today", tab: { icon: DashboardBrowsingIcon, label: "Today" }, content: <CourtsTodayPage /> },
  { row: "Cause list", tab: { icon: CalendarCheckOut01Icon, label: "Cause list" }, content: <ListPage eyebrow="Tuesday 17 November 2026" title="Cause list" action="Schedule a sitting" groups={[{ title: "Listed today · 2", items: [
    { title: "09:00 CRB 214/2026, Uganda v. Okello John", detail: "Hearing, Court 2", right: "Scheduled" },
    { title: "11:00 CRB 231/2026, Uganda v. Auma Grace", detail: "Plea, Court 2", right: "Scheduled" },
  ] }]} /> },
  { row: "Open cases", tab: { icon: FolderViewIcon, label: "Open cases" }, content: <ListPage title="Open cases" action="Register a case" groups={[{ title: "Criminal cases before this court", items: [
    { title: "CRB 214/2026, Uganda v. Okello John", detail: "Hearing set for today" },
    { title: "CRB 231/2026, Uganda v. Auma Grace", detail: "Plea set for today" },
    { title: "CRB 198/2026, Uganda v. Mugisha Peter and another", detail: "No next date" },
  ] }]} /> },
]}
    />
  )
}
