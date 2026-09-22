import { Createpanel } from '@/components/create-panel'
import { CaseRow } from '@/components/list-cards/case-row'
import { PersonAvatar } from '@/components/person-avatar'
import { RecordExportActions } from '@/components/record-export-actions'
import { caseStatusLabel } from '@/features/cases/schema'
import {
  custodyCompliance,
  custodyStatusLabel,
} from '@/features/custody/schema'
import { bondStatusLabel } from '@/features/bonds/schema'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import {
  personFullName,
  personProfileOptions,
  PersonForm,
  PersonPhotosField,
  useExportPersonDocument,
  usePersonProfile,
} from '@/features/people'
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

export const Route = createFileRoute('/_public/search/people/$personId')({
  loader: async ({ context, params }) => {
    const profile = await context.queryClient.query({
      ...personProfileOptions(params.personId),
      staleTime: 'static',
    })
    if (!profile) throw notFound()
  },
  component: RouteComponent,
})

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
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

function RelatedRow({
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

function RouteComponent() {
  const { personId } = Route.useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const { data: profile } = usePersonProfile(personId)
  const exportDocument = useExportPersonDocument(personId)

  if (!profile) return null
  const { person } = profile

  const handleExport = async (format: 'pdf' | 'docx') => {
    try {
      const found = await exportDocument.mutateAsync(format)
      if (found) t.success(`${format === 'pdf' ? 'PDF' : 'Word'} document exported`)
    } catch {
      t.error(`Could not export to ${format === 'pdf' ? 'PDF' : 'Word'}`, { description: 'Please try again.' })
    }
  }

  return (
    <article className="page">
      <Link
        to="/search/people"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        Back to People
      </Link>

      <section className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <PersonAvatar name={personFullName(person)} headshotAttachmentId={person.headshotAttachmentId} size="lg" />
          <div className="flex flex-col gap-1">
            <h1>{personFullName(person)}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>Phone: {person.phone ?? '·'}</span>
              <span>NIN / National ID: {person.nationalId ?? '·'}</span>
              <span>Address: {person.address ?? '·'}</span>
              <span>Recorded: {format(person.createdAt, 'PPP')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RecordExportActions
            onPrint={() => navigate({ to: '/print/people/$personId', params: { personId } })}
            onExport={handleExport}
            exportPending={exportDocument.isPending}
          />
          <Createpanel
            open={editOpen}
            onOpenChange={setEditOpen}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={Edit02Icon} />
                Edit
              </Button>
            }
            headings={{ title: 'Edit person', description: "Update this person's recorded details." }}
          >
            <PersonForm person={person} onSuccess={() => setEditOpen(false)} />
          </Createpanel>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Section title="Cases" count={profile.cases.length}>
          {profile.cases.map((c) => (
            <Link key={c.id} to="/investigations/$caseId" params={{ caseId: c.id }}>
              <CaseRow
                row={{
                  reference: c.reference,
                  title: c.summary,
                  status: c.status,
                  statusLabel: caseStatusLabel(c.status),
                  subtitle: `${c.peopleCount} people involved`,
                }}
              />
            </Link>
          ))}
        </Section>

        <Section title="Incidents" count={profile.incidents.length}>
          {profile.incidents.map((i) => (
            <RelatedRow
              key={i.id}
              to="/incidents"
              search={{ open: i.id }}
              title={i.summary}
              subtitle={i.location ?? undefined}
              meta={<span className="text-xs text-muted-foreground">{format(i.occurredAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Statements" count={profile.statements.length}>
          {profile.statements.map((s) => (
            <RelatedRow
              key={s.id}
              to="/statements"
              search={{ open: s.id }}
              title={<RichTextPreview value={s.content} className="line-clamp-1" />}
              subtitle={s.officerName ? `Taken by ${s.officerName}` : undefined}
              meta={<span className="text-xs text-muted-foreground">{format(s.givenAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Custody" count={profile.custodyRecords.length}>
          {profile.custodyRecords.map((record) => {
            const compliance = record.status === 'in_custody' ? custodyCompliance(record) : null
            return (
              <RelatedRow
                key={record.id}
                to="/search/custody"
                search={{ open: record.id }}
                title={custodyStatusLabel(record.status)}
                subtitle={record.location ?? undefined}
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

        <Section title="Bonds & sureties" count={profile.bonds.length}>
          {profile.bonds.map((bond) => (
            <RelatedRow
              key={bond.id}
              to="/search/bonds"
              search={{ open: bond.id }}
              title={bondStatusLabel(bond.status)}
              subtitle={bond.withSurety ? (bond.suretyName ?? 'With surety') : 'No surety'}
              meta={<span className="text-xs text-muted-foreground">{format(bond.grantedAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Evidence" count={profile.exhibits.length}>
          {profile.exhibits.map((exhibit) => (
            <RelatedRow
              key={exhibit.id}
              to="/evidence"
              search={{ open: exhibit.id }}
              title={exhibit.description}
              subtitle={exhibitStatusLabel(exhibit.status)}
              meta={<span className="text-xs text-muted-foreground">{format(exhibit.recoveredAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Charge sheets" count={profile.chargeSheets.length}>
          {profile.chargeSheets.map((cs) => (
            <Link
              key={cs.id}
              to="/legal-forms/$chargeSheetId"
              params={{ chargeSheetId: cs.id }}
              className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{cs.offence}</p>
                <p className="truncate text-xs text-muted-foreground">{cs.caseReference}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{format(cs.chargedAt, 'PP')}</span>
            </Link>
          ))}
        </Section>

        <Section title="Vehicles" count={profile.vehicles.length}>
          {profile.vehicles.map((vehicle) => (
            <RelatedRow
              key={vehicle.id}
              to="/vehicles"
              search={{ open: vehicle.id }}
              title={vehicle.plateNumber}
              subtitle={[vehicle.make, vehicle.model].filter(Boolean).join(' ') || undefined}
              meta={<span className="text-xs text-muted-foreground">{format(vehicle.createdAt, 'PP')}</span>}
            />
          ))}
        </Section>

        <Section title="Station Diary" count={profile.stationDiaryEntries.length}>
          {profile.stationDiaryEntries.map((entry) => (
            <RelatedRow
              key={entry.id}
              to="/sd-log"
              search={{ open: entry.id }}
              title={<RichTextPreview value={entry.content} className="line-clamp-1" />}
              subtitle={entry.category.replace(/_/g, ' ')}
              meta={<span className="text-xs text-muted-foreground">{format(entry.createdAt, 'PP')}</span>}
            />
          ))}
        </Section>
      </div>

      <section className="md:max-w-md">
        <PersonPhotosField personId={personId} attachments={profile.attachments} />
      </section>

      <section className="md:max-w-md">
        <AttachmentsField entityType={entityTypes.person} entityId={personId} label="Files" />
      </section>
    </article>
  )
}
