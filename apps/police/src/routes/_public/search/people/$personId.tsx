import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { AttachmentsField, entityTypes, useAttachmentDataUrl } from '@/features/attachments'
import { bondStatusLabel } from '@/features/bonds/schema'
import { caseRoles, caseStatusLabel } from '@/features/cases/schema'
import { custodyCompliance, custodyStatusLabel } from '@/features/custody/schema'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { IdentityPhotos, personFullName, personProfileOptions, PersonForm, useExportPersonDocument, usePersonProfile, type PersonProfile } from '@/features/people'
import { stationDiaryCategoryLabel } from '@/features/station-diary/schema'
import { format, formatDistanceToNowStrict } from '@/lib/date'
import {
  AlarmClockIcon,
  BinocularsIcon,
  Car01Icon,
  CellsIcon,
  File02Icon,
  FingerPrintCheckIcon,
  Mic01Icon,
  MoreHorizontalIcon,
  Notebook01Icon,
  SirenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { richTextToPlainText } from '@pleadli/rich-text'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow, RowIcon } from '@pleadli/ui/grouped'
import { cn } from '@pleadli/ui/lib/utils'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

type Tab = 'overview' | 'timeline' | 'photos' | 'files'

export const Route = createFileRoute('/_public/search/people/$personId')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => (['timeline', 'photos', 'files'].includes(search.tab as string) ? { tab: search.tab as Tab } : {}),
  loader: async ({ context, params }) => {
    const profile = await context.queryClient.query({ ...personProfileOptions(params.personId), staleTime: 'static' })
    if (!profile) throw notFound()
  },
  component: RouteComponent,
})

const roleLabel = (role: string) => caseRoles.find((r) => r.value === role)?.label ?? role

/** A row that opens the record it names. */
function LinkRow({ to, search, params, icon, label, detail, value }: { to: string; search?: Record<string, string>; params?: Record<string, string>; icon?: ReactNode; label: ReactNode; detail?: ReactNode; value?: ReactNode }) {
  return (
    <GroupRow
      icon={icon}
      label={label}
      detail={detail}
      value={value}
      chevron
      render={({ className, children }) => (
        <Link to={to as never} search={search as never} params={params as never} className={className}>
          {children}
        </Link>
      )}
    />
  )
}

const glyph = (icon: typeof CellsIcon, red = false) => (
  <RowIcon tone={red ? 'red' : 'gray'}>
    <HugeiconsIcon icon={icon} />
  </RowIcon>
)

type Event = { at: number; key: string; icon: typeof CellsIcon; label: string; detail?: string; to: string; search?: Record<string, string>; params?: Record<string, string> }

/** Everything the station holds about the person, as one story in time. */
function timeline(p: PersonProfile): Event[] {
  return [
    ...p.custodyRecords.map((r) => ({ at: r.arrestedAt, key: `c${r.id}`, icon: CellsIcon, label: m["person.event.arrested"](), detail: [r.location, r.caseReference, custodyStatusLabel(r.status)].filter(Boolean).join(' · '), to: '/search/custody', search: { view: 'all', open: r.id } })),
    ...p.bonds.map((b) => ({ at: b.grantedAt, key: `b${b.id}`, icon: AlarmClockIcon, label: m["person.event.bond"](), detail: [bondStatusLabel(b.status), b.withSurety ? b.suretyName : null].filter(Boolean).join(' · '), to: '/search/bonds', search: { view: 'all', open: b.id } })),
    ...p.statements.map((s) => ({ at: s.givenAt, key: `s${s.id}`, icon: Mic01Icon, label: m["person.event.statement"](), detail: [s.caseReference, s.officerName ? m["investigation.taken_by"]({ name: s.officerName }) : null].filter(Boolean).join(' · '), to: '/statements', search: { open: s.id } })),
    ...p.chargeSheets.map((c) => ({ at: c.chargedAt, key: `h${c.id}`, icon: File02Icon, label: m["person.event.charged"]({ offence: c.offence }), detail: c.caseReference, to: '/legal-forms', search: { open: c.id } })),
    ...p.incidents.map((i) => ({ at: i.occurredAt, key: `i${i.id}`, icon: SirenIcon, label: i.summary, detail: i.location ?? undefined, to: '/incidents', search: { open: i.id } })),
    ...p.exhibits.map((e) => ({ at: e.recoveredAt, key: `e${e.id}`, icon: FingerPrintCheckIcon, label: m["person.event.exhibit"]({ item: e.description }), detail: exhibitStatusLabel(e.status), to: '/evidence', search: { open: e.id } })),
    ...p.stationDiaryEntries.map((d) => ({ at: d.createdAt, key: `d${d.id}`, icon: Notebook01Icon, label: richTextToPlainText(d.content).slice(0, 90) || stationDiaryCategoryLabel(d.category), detail: stationDiaryCategoryLabel(d.category), to: '/sd-log', search: { open: d.id } })),
    ...p.vehicles.map((v) => ({ at: v.createdAt, key: `v${v.id}`, icon: Car01Icon, label: m["person.event.vehicle"]({ plate: v.plateNumber }), detail: [v.make, v.model].filter(Boolean).join(' ') || undefined, to: '/vehicles', search: { open: v.id } })),
    ...p.cases.map((c) => ({ at: c.createdAt, key: `k${c.id}`, icon: BinocularsIcon, label: m["person.event.case"]({ reference: c.reference }), detail: c.summary, to: '/investigations/$caseId', params: { caseId: c.id } })),
  ].sort((a, b) => b.at - a.at)
}

/**
 * A person, as an officer needs to meet them: the face and the name, and at
 * once whatever matters now (in the cells and how long is left, out on bond,
 * a suspect in an open case). Then their cases with the part they play, the
 * whole story with the station in time, the photographs and the files.
 */
function RouteComponent() {
  const { personId } = Route.useParams()
  const { tab = 'overview' } = Route.useSearch()
  const navigate = useNavigate()
  const { data: profile } = usePersonProfile(personId)
  const exportDocument = useExportPersonDocument(personId)
  const { data: face } = useAttachmentDataUrl(profile?.person.headshotAttachmentId)
  if (!profile) return null
  const { person } = profile
  const name = personFullName(person)

  const handleExport = async (kind: 'pdf' | 'docx') => {
    try {
      const found = await exportDocument.mutateAsync(kind)
      if (found) t.success(kind === 'pdf' ? m["data_io.pdf_exported"]() : m["data_io.word_exported"]())
    } catch {
      t.error(kind === 'pdf' ? m["data_io.pdf_failed"]() : m["data_io.word_failed"](), { description: m["common.try_again"]() })
    }
  }

  const inCells = profile.custodyRecords.find((r) => r.status === 'in_custody')
  const limit = inCells ? custodyCompliance(inCells) : null
  const onBond = profile.bonds.filter((b) => b.status === 'active')
  const roleIn = (caseId: string) => profile.caseRoles.filter((r) => r.caseId === caseId).map((r) => roleLabel(r.role))
  const openSuspect = profile.cases.filter((c) => c.status === 'open' && profile.caseRoles.some((r) => r.caseId === c.id && (r.role === 'suspect' || r.role === 'accused')))
  const events = timeline(profile)

  const chips: { label: string; tone: 'red' | 'amber' | 'plain' }[] = [
    ...(inCells && limit ? [{ label: limit.isOverdue ? m["person.chip.past_limit"]() : m["person.chip.in_cells"]({ left: formatDistanceToNowStrict(limit.deadline) }), tone: (limit.isOverdue || limit.hoursRemaining <= 6 ? 'red' : 'amber') as 'red' | 'amber' }] : []),
    ...(onBond.length > 0 ? [{ label: m["person.chip.on_bond"](), tone: 'amber' as const }] : []),
    ...(openSuspect.length > 0 ? [{ label: openSuspect.length === 1 ? m["person.chip.suspect_one"]() : m["person.chip.suspect_n"]({ count: openSuspect.length }), tone: 'plain' as const }] : []),
  ]

  return (
    <article className="page">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="aspect-[3/4] w-32 shrink-0 overflow-hidden rounded-2xl bg-foreground/[0.04] ring-1 ring-border/70 sm:w-36">
          {face ? (
            <img src={face} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-3xl font-semibold text-muted-foreground/50">
              {(person.firstName[0] ?? '') + (person.lastName[0] ?? '')}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="leading-tight">{name}</h1>
          <p className="text-muted-foreground">{[person.nationalId && `${m["person.nin"]()} ${person.nationalId}`, person.phone, person.address].filter(Boolean).join(' · ') || m["people_page.recorded"]({ date: format(person.createdAt, 'PPP') })}</p>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    c.tone === 'red' ? 'bg-destructive text-white' : c.tone === 'amber' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-foreground/[0.06] text-foreground',
                  )}
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inCells ? (
            <Link to="/search/custody" search={{ open: inCells.id }} className={buttonVariants({ size: 'sm' })}>
              {m["person.action.custody"]()}
            </Link>
          ) : (
            <PanelButton label={m["people_page.edit"]()} title={m["people_page.edit_title"]()} description={m["people_page.edit_desc"]()} icon={false}>
              {({ close }) => <PersonForm person={person} onSuccess={close} />}
            </PanelButton>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="secondary" aria-label={m["files.more"]()} title={m["files.more"]()}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => void navigate({ to: '/print/people/$personId', params: { personId } })}>{m["people_page.print_profile"]()}</DropdownMenuItem>
              <DropdownMenuItem disabled={exportDocument.isPending} onClick={() => void handleExport('pdf')}>
                {m["people_page.save_pdf"]()}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={exportDocument.isPending} onClick={() => void handleExport('docx')}>
                {m["people_page.save_word"]()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Segmented
        label={m["people_page.sections"]()}
        value={tab}
        onChange={(next) => void navigate({ to: '/search/people/$personId', params: { personId }, search: next === 'overview' ? {} : { tab: next }, replace: true })}
        items={[
          { value: 'overview', label: m["person.tab.overview"]() },
          { value: 'timeline', label: m["person.tab.timeline"](), count: events.length || undefined },
          { value: 'photos', label: m["person.tab.photos"]() },
          { value: 'files', label: m["person.tab.files"]() },
        ]}
        className="self-start"
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(inCells || onBond.length > 0) && (
            <Group title={m["person.now_title"]()}>
              {inCells && limit && (
                <LinkRow
                  to="/search/custody"
                  search={{ open: inCells.id }}
                  icon={glyph(CellsIcon, limit.isOverdue || limit.hoursRemaining <= 6)}
                  label={m["person.now.in_cells"]()}
                  detail={m["person.now.arrested"]({ when: formatDistanceToNowStrict(inCells.arrestedAt, { addSuffix: true }), where: inCells.location ?? '' })}
                  value={<span className={cn('text-xs font-medium', limit.isOverdue && 'text-destructive')}>{m["person.now.by"]({ deadline: format(limit.deadline, 'EEE HH:mm') })}</span>}
                />
              )}
              {onBond.map((b) => (
                <LinkRow
                  key={b.id}
                  to="/search/bonds"
                  search={{ view: 'all', open: b.id }}
                  icon={glyph(AlarmClockIcon)}
                  label={m["person.now.on_bond"]()}
                  detail={b.reportingSchedule ?? (b.withSurety ? m["person.now.surety"]({ name: b.suretyName ?? '' }) : m["bonds_page.own_recognisance"]())}
                  value={<span className="text-xs">{format(b.grantedAt, 'd MMM')}</span>}
                />
              ))}
            </Group>
          )}

          {profile.cases.length > 0 && (
            <Group title={m["nav.cases"]()}>
              {profile.cases.map((c) => (
                <LinkRow
                  key={c.id}
                  to="/investigations/$caseId"
                  params={{ caseId: c.id }}
                  icon={glyph(BinocularsIcon)}
                  label={c.reference}
                  detail={[roleIn(c.id).join(', '), c.summary].filter(Boolean).join(' · ')}
                  value={<span className="text-xs">{caseStatusLabel(c.status)}</span>}
                />
              ))}
            </Group>
          )}

          <Group title={m["people_page.particulars"]()}>
            <GroupRow label={m["identity.national_id"]()} value={person.nationalId ?? m["people_page.not_recorded"]()} />
            <GroupRow label={m["identity.phone"]()} value={person.phone ?? m["people_page.not_recorded"]()} />
            <GroupRow label={m["identity.address"]()} value={person.address ?? m["people_page.not_recorded"]()} />
            <GroupRow label={m["people_page.first_recorded"]()} value={format(person.createdAt, 'PPP')} />
          </Group>

          {events.length > 0 && (
            <Group title={m["person.latest"]()} action={<Link to="/search/people/$personId" params={{ personId }} search={{ tab: 'timeline' }} className="text-[0.8125rem]">{m["person.see_all"]()}</Link>}>
              {events.slice(0, 4).map((e) => (
                <LinkRow key={e.key} to={e.to} search={e.search} params={e.params} icon={glyph(e.icon)} label={e.label} detail={e.detail} value={<span className="text-xs">{format(e.at, 'd MMM yyyy')}</span>} />
              ))}
            </Group>
          )}
        </div>
      )}

      {tab === 'timeline' &&
        (events.length === 0 ? (
          <p className="text-muted-foreground">{m["people_page.no_history"]()}</p>
        ) : (
          Object.entries(
            events.reduce<Record<string, Event[]>>((acc, e) => {
              const key = format(e.at, 'MMMM yyyy')
              ;(acc[key] ??= []).push(e)
              return acc
            }, {}),
          ).map(([month, list]) => (
            <Group key={month} title={month}>
              {list.map((e) => (
                <LinkRow key={e.key} to={e.to} search={e.search} params={e.params} icon={glyph(e.icon)} label={e.label} detail={e.detail} value={<span className="text-xs">{format(e.at, 'd MMM, HH:mm')}</span>} />
              ))}
            </Group>
          ))
        ))}

      {tab === 'photos' && <IdentityPhotos personId={personId} attachments={profile.attachments} />}

      {tab === 'files' && <AttachmentsField entityType={entityTypes.person} entityId={personId} label={m["common.files"]()} />}
    </article>
  )
}
