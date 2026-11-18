import * as m from '@/paraglide/messages'
import { Createpanel } from '@/components/create-panel'
import { CopyButton } from '@/components/copy-button'
import { RecordExportActions } from '@/components/record-export-actions'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { CaseBinder } from '@/features/paper/case-binder'
import {
  caseRoleLabel,
  caseStatusLabel,
  caseWorkspaceOptions,
  casePersonName,
  CaseForm,
  useCaseWorkspace,
  useExportCaseDocument,
} from '@/features/cases'
import { bondPersonName, bondStatusLabel } from '@/features/bonds/schema'
import { custodyCompliance, custodyPersonName, custodyStatusLabel } from '@/features/custody/schema'
import { referralDestinationTypeLabel, referralStatusLabel } from '@/features/referrals/schema'
import { statementPersonName } from '@/features/statements/schema'
import { ArrowLeft01Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { ApiError } from '@/lib/api'
import { buttonVariants } from '@pleadli/ui/button'
import { RecordTabsView } from '@pleadli/shell'
import { useState } from 'react'

export const Route = createFileRoute('/_public/investigations/$caseId')({
  loader: async ({ context, params }) => {
    const workspace = await context.queryClient.query({
      ...caseWorkspaceOptions(params.caseId),
      staleTime: 'static',
    })
    if (!workspace) throw notFound()
  },
  // A restricted case this officer may not open is a refusal with a reason, not a page that failed.
  errorComponent: ({ error }) => {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <article className="page">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <h1>{m["cases.restricted_title"]()}</h1>
            <p className="text-muted-foreground">{m["cases.restricted_hidden"]()}</p>
            <Link to="/investigations" className={buttonVariants({ variant: 'secondary' })}>{m["cases.back_to_cases"]()}</Link>
          </div>
        </article>
      )
    }
    throw error
  },
  component: RouteComponent,
})

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        {title} <span className="tabular-nums">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground">{m["common.none_recorded"]()}</p>
      ) : (
        <div className="flex flex-col gap-1">{children}</div>
      )}
    </section>
  )
}

function Row({
  to,
  search,
  title,
  subtitle,
  meta,
}: {
  to: string
  search?: Record<string, string>
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <Link
      to={to}
      search={search}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5',
        'transition-colors hover:bg-muted/60',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {meta && <div className="shrink-0">{meta}</div>}
    </Link>
  )
}

type TimelineEvent = { at: number; label: string }

function RouteComponent() {
  const { caseId } = Route.useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [tab, setTab] = useState('overview')
  const { data: workspace } = useCaseWorkspace(caseId)
  const exportDocument = useExportCaseDocument(caseId)

  if (!workspace) return null
  const { case: kase, people, statements, custodyRecords, bonds, exhibits, chargeSheets, referrals } = workspace

  const handleExport = async (format: 'pdf' | 'docx') => {
    try {
      const found = await exportDocument.mutateAsync(format)
      if (found) t.success(format === 'pdf' ? m["data_io.pdf_exported"]() : m["data_io.word_exported"]())
    } catch {
      t.error(format === 'pdf' ? m["data_io.pdf_failed"]() : m["data_io.word_failed"](), { description: m["common.try_again"]() })
    }
  }

  const timeline: TimelineEvent[] = [
    { at: kase.createdAt, label: m["investigation.tl_opened"]({ reference: kase.reference }) },
    ...statements.map((s) => ({ at: s.givenAt, label: m["investigation.tl_statement"]({ name: statementPersonName(s) }) })),
    ...custodyRecords.map((r) => ({ at: r.arrestedAt, label: m["investigation.tl_arrested"]({ name: custodyPersonName(r), status: custodyStatusLabel(r.status) }) })),
    ...bonds.map((b) => ({ at: b.grantedAt, label: m["investigation.tl_bond"]({ name: bondPersonName(b) }) })),
    ...exhibits.map((e) => ({ at: e.recoveredAt, label: m["investigation.tl_exhibit"]({ description: e.description }) })),
    ...chargeSheets.map((cs) => ({ at: cs.chargedAt, label: m["investigation.tl_charged"]({ offence: cs.offence }) })),
    ...referrals.map((r) => ({ at: r.referredAt, label: m["investigation.tl_referred"]({ destination: referralDestinationTypeLabel(r.destinationType) }) })),
  ].sort((a, b) => b.at - a.at)

  return (
    <article className="page">
      <Link
        to="/investigations"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        {m["investigation.back"]()}
      </Link>

      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1>{kase.reference}</h1>
            <CopyButton value={kase.reference} label={m["investigation.copy_reference"]()} />
            <Badge variant={kase.status === 'open' ? 'default' : 'secondary'}>{caseStatusLabel(kase.status)}</Badge>
          </div>
          <p className="max-w-lg text-sm text-muted-foreground">{kase.summary}</p>
        </div>

        <div className="flex items-center gap-2">
          <RecordExportActions
            onPrint={() => navigate({ to: '/print/investigations/$caseId', params: { caseId } })}
            onExport={handleExport}
            exportPending={exportDocument.isPending}
          />
          <Createpanel
            open={editOpen}
            onOpenChange={setEditOpen}
            isDirty={editDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={Edit02Icon} />
                {m["investigation.edit_case"]()}
              </Button>
            }
            headings={{ title: m["intake_page.edit_title"](), description: m["intake_page.edit_desc"]() }}
          >
            <CaseForm case={kase} onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
          </Createpanel>
        </div>
      </section>

      <RecordTabsView
        labels={{
          overview: { label: m["investigation.tab_overview"](), empty: '', action: '' },
          papers: { label: m["investigation.tab_papers"](), empty: m["investigation.empty_papers"](), action: '' },
          people: { label: m["investigation.tab_people"](), empty: '', action: '' },
          history: { label: m["investigation.tab_history"](), empty: '', action: '' },
        }}
        value={tab}
        onValueChange={setTab}
        content={{
          overview: (
            <div className="grid grid-cols-1 gap-8 p-4 md:grid-cols-2">
              {custodyRecords.length + bonds.length + referrals.length + people.length === 0 && (
                <aside className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 md:col-span-2">
                  <h2 className="text-sm font-medium">{m["investigation.next_title"]()}</h2>
                  <p className="text-xs text-muted-foreground">{m["investigation.next_hint"]()}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/statements" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m["investigation.next_statement"]()}</Link>
                    <Link to="/evidence" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m["investigation.next_exhibit"]()}</Link>
                    <Link to="/search/custody" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m["investigation.next_arrest"]()}</Link>
                    <Link to="/medical" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m["investigation.next_medical"]()}</Link>
                    <Link to="/referrals" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{m["investigation.next_refer"]()}</Link>
                  </div>
                </aside>
              )}
        <Section title={m["common.custody"]()} count={custodyRecords.length}>
          {custodyRecords.map((record) => {
            const compliance = record.status === 'in_custody' ? custodyCompliance(record) : null
            return (
              <Row
                key={record.id}
                to="/search/custody"
                search={{ open: record.id }}
                title={custodyPersonName(record)}
                subtitle={custodyStatusLabel(record.status)}
                meta={
                  compliance ? (
                    <Badge variant={compliance.isOverdue ? 'destructive' : 'secondary'}>
                      {compliance.isOverdue
                        ? m["common.hours_overdue"]({ hours: Math.abs(compliance.hoursRemaining).toFixed(1) })
                        : m["investigation.hours_left"]({ hours: compliance.hoursRemaining.toFixed(1) })}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{format(record.arrestedAt, 'PP')}</span>
                  )
                }
              />
            )
          })}
        </Section>

        <Section title={m["investigation.bonds_sureties"]()} count={bonds.length}>
          {bonds.map((bond) => (
            <Row
              key={bond.id}
              to="/search/bonds"
              search={{ open: bond.id }}
              title={bondPersonName(bond)}
              subtitle={bondStatusLabel(bond.status)}
              meta={<span className="text-xs text-muted-foreground">{format(bond.grantedAt, 'PP')}</span>}
            />
          ))}
        </Section>


        <Section title={m["common.referrals"]()} count={referrals.length}>
          {referrals.map((r) => (
            <Row
              key={r.id}
              to="/referrals"
              search={{ open: r.id }}
              title={r.destinationName || referralDestinationTypeLabel(r.destinationType)}
              subtitle={referralStatusLabel(r.status)}
              meta={<span className="text-xs text-muted-foreground">{format(r.referredAt, 'PP')}</span>}
            />
          ))}
        </Section>
            </div>
          ),
          people: (
            <div className="p-4 md:max-w-xl">
        <Section title={m["cases.people_involved"]()} count={people.length}>
          {people.map((p) => (
            <Link
              key={p.id}
              to="/search/people/$personId"
              params={{ personId: p.personId }}
              className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60"
            >
              <span className="truncate text-xs font-medium">{casePersonName(p)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{caseRoleLabel(p.role)}</span>
            </Link>
          ))}
        </Section>
            </div>
          ),
          history: (
            <div className="p-4 md:max-w-xl">
        <Section title={m["investigation.timeline"]()} count={timeline.length}>
          {timeline.map((event, index) => (
            <div key={index} className="flex items-center justify-between gap-3 px-1.5 py-1.5">
              <span className="text-xs">{event.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{format(event.at, 'PP')}</span>
            </div>
          ))}
        </Section>
            </div>
          ),
          papers: (
            <div className="flex flex-col gap-8 p-4">
      <CaseBinder reference={kase.reference} summary={kase.summary} statements={statements} exhibits={exhibits} chargeSheets={chargeSheets} />

      <section className="md:max-w-md">
        <AttachmentsField entityType={entityTypes.case} entityId={kase.id} label={m["common.files"]()} />
      </section>
            </div>
          ),
        }}
      />
    </article>
  )
}
