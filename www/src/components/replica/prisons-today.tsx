import {
  ArrowDataTransferHorizontalIcon, DashboardBrowsingIcon, Folder01Icon, GavelIcon, HandshakeIcon, Message01Icon, Notification01Icon, UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { AppShell, type ShellSection } from './app-shell'
import { ListPage } from './list-page'

export const prisonsAccent = {
  '--primary': 'oklch(0.43 0.115 18)',
  '--primary-foreground': 'oklch(0.97 0.01 18)',
  '--sidebar-primary': 'oklch(0.43 0.115 18)',
}

const sections: ShellSection[] = [
  { rows: [
    { icon: DashboardBrowsingIcon, label: 'Today' },
    { icon: Notification01Icon, label: 'Inbox', count: 1 },
  ] },
  { label: 'Prisoners', rows: [
    { icon: Folder01Icon, label: 'Everyone held', count: 1 },
    { icon: Folder01Icon, label: 'On remand', count: 1 },
    { icon: Folder01Icon, label: 'Past the bail limit' },
    { icon: Folder01Icon, label: 'Convicted' },
    { icon: Folder01Icon, label: 'Civil debtors' },
    { icon: Folder01Icon, label: 'Papers missing' },
    { icon: Folder01Icon, label: 'Released or moved' },
  ] },
  { label: 'The day', rows: [
    { icon: GavelIcon, label: 'Court' },
    { icon: ArrowDataTransferHorizontalIcon, label: 'Movements' },
    { icon: HandshakeIcon, label: 'Visits' },
    { icon: Message01Icon, label: 'Requests' },
  ] },
  { label: 'The prison', rows: [{ icon: UserGroupIcon, label: 'Officers' }] },
]

function PrisonsTodayPage() {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Tuesday 17 November</p>
          <h1>Today</h1>
          <p className="text-xs text-muted-foreground">Uganda · legal basis</p>
        </div>
        <div className="page-actions">
          <span className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-[550] text-primary-foreground shadow-xs">Receive someone</span>
        </div>
      </header>
      <section className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between px-1"><h2 data-slot="group-title">Court today</h2><span className="text-[0.8125rem] text-primary">Court diary</span></div>
        <div className="rounded-xl border bg-card px-4 py-2.5 text-[0.9375rem]">Nobody goes to court today.</div>
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between border-b pb-2"><h2>Attention</h2><span className="text-sm text-muted-foreground">1 to act on</span></div>
        <div className="flex items-start justify-between">
          <div className="flex flex-col"><strong>Monthly return</strong><span className="text-sm text-muted-foreground">The return for October 2026 has not been produced yet.</span></div>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Produce</span>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between border-b pb-2"><h2>Custody</h2><span className="text-sm text-muted-foreground">Open population</span></div>
        <div className="grid grid-cols-4 gap-4 text-sm text-muted-foreground">
          {[['1', 'Held now'], ['0', 'Convicted'], ['1', 'Remand'], ['0', 'Civil']].map(([n, l]) => (
            <div key={l}><div className="text-2xl font-semibold text-foreground">{n}</div>{l}</div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Approved capacity not set. · Longest on remand: 45 days</p>
      </section>
    </article>
  )
}

export function PrisonsToday() {
  return (
    <AppShell
      product="Pleadli Prisons" office="Luzira Upper Prison" crest="/images/brand/prisons-crest.svg"
      sections={sections}
      user={{ initials: 'SA', name: 'Screenshot Admin', sub: 'Badge 0142' }}
      banner={<div className="flex h-8 shrink-0 items-center justify-center gap-2 bg-amber-500/10 text-xs text-amber-800">The trial has ended. Every record stays open. <span className="font-medium">Licence</span></div>}
      screens={[
        { row: 'Today', tab: { icon: DashboardBrowsingIcon, label: 'Today' }, content: <PrisonsTodayPage /> },
        { row: 'Everyone held', tab: { icon: Folder01Icon, label: 'Everyone held' }, content: <ListPage title="Everyone held" action="Receive someone" groups={[{ title: "Held now · 1", items: [
          { title: "Kintu, Moses", detail: "On remand. Charged with robbery. Before Buganda Road Court.", right: "45 days" },
        ] }]} /> },
        { row: 'Visits', tab: { icon: HandshakeIcon, label: 'Visits' }, content: <ListPage title="Visits" action="Record a visit" groups={[{ title: "This week", items: [
          { title: "Kintu, Moses", detail: "Family visit. Sister, Ruth Kintu.", right: "Wed 10:00" },
        ] }]} /> },
      ]}
    />
  )
}
