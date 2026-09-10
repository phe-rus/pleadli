import { Createpanel } from '@/components/create-panel'
import { CopyButton } from '@/components/copy-button'
import { RecordExportActions } from '@/components/record-export-actions'
import { AttachmentsField, entityTypes } from '@/features/attachments'
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
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { chargeSheetAccusedName } from '@/features/legal-forms/schema'
import { referralDestinationTypeLabel, referralStatusLabel } from '@/features/referrals/schema'
import { statementPersonName } from '@/features/statements/schema'
import { ArrowLeft01Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/investigations/$caseId')({
  loader: async ({ context, params }) => {
    const workspace = await context.queryClient.query({
      ...caseWorkspaceOptions(params.caseId),
      staleTime: 'static',
    })
    if (!workspace) throw notFound()
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
        <p className="text-xs text-muted-foreground">None recorded.</p>
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
  const { data: workspace } = useCaseWorkspace(caseId)
  const exportDocument = useExportCaseDocument(caseId)

  if (!workspace) return null
  const { case: kase, people, statements, custodyRecords, bonds, exhibits, chargeSheets, referrals } = workspace

  const handleExport = async (format: 'pdf' | 'docx') => {
    try {
      const found = await exportDocument.mutateAsync(format)
      if (found) t.success(`${format === 'pdf' ? 'PDF' : 'Word'} document exported`)
    } catch {
      t.error(`Could not export to ${format === 'pdf' ? 'PDF' : 'Word'}`, { description: 'Please try again.' })
    }
  }

  const timeline: TimelineEvent[] = [
    { at: kase.createdAt, label: `Case ${kase.reference} opened` },
    ...statements.map((s) => ({ at: s.givenAt, label: `Statement taken from ${statementPersonName(s)}` })),
    ...custodyRecords.map((r) => ({ at: r.arrestedAt, label: `${custodyPersonName(r)} arrested, ${custodyStatusLabel(r.status)}` })),
    ...bonds.map((b) => ({ at: b.grantedAt, label: `Bond granted for ${bondPersonName(b)}` })),
    ...exhibits.map((e) => ({ at: e.recoveredAt, label: `Exhibit recovered: ${e.description}` })),
    ...chargeSheets.map((cs) => ({ at: cs.chargedAt, label: `Charged: ${cs.offence}` })),
    ...referrals.map((r) => ({ at: r.referredAt, label: `Referred to ${referralDestinationTypeLabel(r.destinationType)}` })),
  ].sort((a, b) => b.at - a.at)

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <Link
        to="/investigations"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        Back to Investigations
      </Link>

      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1>{kase.reference}</h1>
            <CopyButton value={kase.reference} label="Copy case reference" />
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
                Edit case
              </Button>
            }
            headings={{ title: 'Edit case', description: 'Update this case.' }}
          >
            <CaseForm case={kase} onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
          </Createpanel>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Section title="People involved" count={people.length}>
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

        <Section title="Timeline" count={timeline.length}>
          {timeline.map((event, index) => (
            <div key={index} className="flex items-center justify-between gap-3 px-1.5 py-1.5">
              <span className="text-xs">{event.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{format(event.at, 'PP')}</span>
            </div>
          ))}
        </Section>

        <Section title="Statements" count={statements.length}>
          {statements.map((s) => (
            <Row
              key={s.id}
              to="/statements"
              search={{ open: s.id }}
              title={<RichTextPreview value={s.content} className="line-clamp-1" />}
              subtitle={s.officerName ? `Taken by ${s.officerName}` : undefined}
              meta={<span className="text-xs text-muted-foreground">{format(s.givenAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Custody" count={custodyRecords.length}>
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
                        ? `${Math.abs(compliance.hoursRemaining).toFixed(1)}h overdue`
                        : `${compliance.hoursRemaining.toFixed(1)}h left`}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{format(record.arrestedAt, 'PP')}</span>
                  )
                }
              />
            )
          })}
        </Section>

        <Section title="Bonds & sureties" count={bonds.length}>
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
        <Section title="Evidence" count={exhibits.length}>
          {exhibits.map((exhibit) => (
            <Row
              key={exhibit.id}
              to="/evidence"
              search={{ open: exhibit.id }}
              title={exhibit.description}
              subtitle={exhibitStatusLabel(exhibit.status)}
              meta={<span className="text-xs text-muted-foreground">{format(exhibit.recoveredAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Charge sheets" count={chargeSheets.length}>
          {chargeSheets.map((cs) => (
            <Link
              key={cs.id}
              to="/legal-forms/$chargeSheetId"
              params={{ chargeSheetId: cs.id }}
              className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{cs.offence}</p>
                <p className="truncate text-xs text-muted-foreground">{chargeSheetAccusedName(cs) ?? '·'}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{format(cs.chargedAt, 'PP')}</span>
            </Link>
          ))}
        </Section>

        <Section title="Referrals" count={referrals.length}>
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

      <section className="md:max-w-md">
        <AttachmentsField entityType={entityTypes.case} entityId={kase.id} label="Files" />
      </section>
    </article>
  )
}
