import { usePrisonerFile } from '@/features/custody'
import { HealthEventForm, healthEventTypeLabel, useHealthEventsForPrisoner } from '@/features/health-events'
import {
  CertifyProgrammeForm,
  ProgrammeParticipationForm,
  programmeCategoryLabel,
  programmeStatusLabel,
  useProgrammeParticipationsForPrisoner,
  type ProgrammeParticipation,
} from '@/features/programme-participations'
import { RequestForm, ResolveRequestForm, requestCategoryLabel, useRequestsForPrisoner, type PrisonRequest } from '@/features/requests'
import { VisitForm, visitStatusLabel, visitTypeLabel, useVisitsForPrisoner } from '@/features/visits'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { Dash, FormDrawer, ItemDrawer, ProfileSection, ProfileTable } from './blocks'

const notes = (value: string | null) => (value ? <RichTextPreview value={value} className="text-muted-foreground" /> : <Dash />)

export function CareTab({ prisonerId }: { prisonerId: string }) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { data: healthEvents } = useHealthEventsForPrisoner(prisonerId)
  const { data: visits } = useVisitsForPrisoner(prisonerId)
  const { data: requests } = useRequestsForPrisoner(prisonerId)
  const { data: participations } = useProgrammeParticipationsForPrisoner(prisonerId)
  const [certifying, setCertifying] = useState<ProgrammeParticipation | null>(null)
  const [resolving, setResolving] = useState<PrisonRequest | null>(null)

  return (
    <div className="flex flex-col gap-8">
      <ProfileSection
        title="Visits"
        count={visits.length}
        action={
          <FormDrawer label="Record visit" title="Record visit" description="Log a visitor and supervising officer.">
            {(close, setDirty) => <VisitForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={visits}
          getKey={(v) => v.id}
          empty="No visits recorded yet."
          columns={[
            { header: 'Visitor', cell: (v) => <span className="font-medium">{v.visitorName}</span> },
            { header: 'When', cell: (v) => format(v.visitedAt, 'd MMM yyyy p') },
            { header: 'Type', cell: (v) => <Badge variant="secondary">{visitTypeLabel(v.visitType)}</Badge> },
            { header: 'Status', cell: (v) => <Badge variant={v.status === 'denied' ? 'destructive' : 'outline'}>{visitStatusLabel(v.status)}</Badge> },
            { header: 'Supervised by', cell: (v) => v.supervisingOfficer ?? <Dash /> },
            { header: 'Notes', className: 'min-w-40', cell: (v) => notes(v.notes) },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title="Health and welfare"
        count={healthEvents.length}
        action={
          <FormDrawer label="Record health event" title="Record health event" description="Log a hospital referral, return, or mental-hospital transfer.">
            {(close, setDirty) => <HealthEventForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={healthEvents}
          getKey={(e) => e.id}
          empty="No health events recorded yet."
          columns={[
            { header: 'Event', cell: (e) => <Badge variant="outline">{healthEventTypeLabel(e.eventType)}</Badge> },
            { header: 'When', cell: (e) => format(e.occurredAt, 'd MMM yyyy p') },
            { header: 'Facility', cell: (e) => e.facilityName ?? <Dash /> },
            { header: 'Authorised by', cell: (e) => e.authorizedBy ?? <Dash /> },
            { header: 'Notes', className: 'min-w-40', cell: (e) => notes(e.notes) },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title="Rehabilitation and work programmes"
        count={participations.length}
        action={
          <FormDrawer
            label="Record participation"
            title="Record programme participation"
            description="Log enrolment in vocational training, prison industries, or prison farming."
          >
            {(close, setDirty) => <ProgrammeParticipationForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={participations}
          getKey={(p) => p.id}
          empty="No programme participation recorded yet."
          columns={[
            { header: 'Programme', cell: (p) => <span className="font-medium">{p.programmeName}</span> },
            { header: 'Category', cell: (p) => <Badge variant="outline">{programmeCategoryLabel(p.category)}</Badge> },
            { header: 'Status', cell: (p) => <Badge variant="secondary">{programmeStatusLabel(p.status)}</Badge> },
            { header: 'Started', cell: (p) => format(p.startedAt, 'd MMM yyyy') },
            {
              header: 'Certified',
              cell: (p) =>
                p.completedAt ? (
                  `${format(p.completedAt, 'd MMM yyyy')}${p.certificateReference ? ` (${p.certificateReference})` : ''}`
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => setCertifying(p)}>
                    Mark completed and certified
                  </Button>
                ),
            },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title="Requests and complaints"
        count={requests.length}
        action={
          <FormDrawer label="Record complaint" title="Record complaint" description='Log a complaint raised via the Human Rights Committee ("Mukutano") mechanism.'>
            {(close, setDirty) => <RequestForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={requests}
          getKey={(r) => r.id}
          empty="No complaints recorded yet."
          columns={[
            { header: 'Category', cell: (r) => <Badge variant="outline">{requestCategoryLabel(r.category)}</Badge> },
            { header: 'Raised', cell: (r) => format(r.raisedAt, 'd MMM yyyy') },
            { header: 'What', className: 'min-w-48', cell: (r) => r.description },
            {
              header: 'Resolution',
              className: 'min-w-40',
              cell: (r) =>
                r.resolvedAt ? (
                  <div className="flex flex-col gap-0.5">
                    <Badge variant="secondary" className="w-fit">
                      Resolved {format(r.resolvedAt, 'd MMM yyyy')}
                    </Badge>
                    {r.outcomeNote && <RichTextPreview value={r.outcomeNote} className="text-muted-foreground" />}
                  </div>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => setResolving(r)}>
                    Mark resolved
                  </Button>
                ),
            },
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Family and contacts" count={file.contacts.length} description="Recorded at reception.">
        <ProfileTable
          rows={file.contacts}
          getKey={(c) => c.id}
          empty="No contacts recorded."
          columns={[
            { header: 'Name', cell: (c) => <span className="font-medium">{c.name}</span> },
            { header: 'Relationship', cell: (c) => c.relationship ?? <Dash /> },
            { header: 'Phone', cell: (c) => c.phone ?? <Dash /> },
            { header: 'Address', cell: (c) => c.address ?? <Dash /> },
            {
              header: 'Flags',
              cell: (c) => (
                <div className="flex flex-wrap gap-1">
                  {c.isEmergency && <Badge variant="outline">Emergency</Badge>}
                  {c.notifyOnImprisonment && <Badge variant="secondary">Notified</Badge>}
                  {!c.isEmergency && !c.notifyOnImprisonment && <Dash />}
                </div>
              ),
            },
          ]}
        />
      </ProfileSection>

      <ItemDrawer
        item={certifying}
        onClose={() => setCertifying(null)}
        title="Mark completed and certified"
        description="Record a UVTAB trade-testing or similar external assessment outcome."
      >
        {(p, close, setDirty) => <CertifyProgrammeForm key={p.id} participation={p} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>

      <ItemDrawer item={resolving} onClose={() => setResolving(null)} title="Mark resolved" description="Record what further action was taken.">
        {(r, close, setDirty) => <ResolveRequestForm key={r.id} request={r} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>
    </div>
  )
}
