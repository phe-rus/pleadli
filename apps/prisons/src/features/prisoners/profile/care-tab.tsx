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
import { m } from '@/paraglide/messages'

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
        title={m.prisoners_visits()}
        count={visits.length}
        action={
          <FormDrawer label={m.prisoners_record_visit()} title={m.prisoners_record_visit()} description={m.prisoners_log_a_visitor_and_supervising_officer()}>
            {(close, setDirty) => <VisitForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={visits}
          getKey={(v) => v.id}
          empty={m.prisoners_no_visits_recorded_yet()}
          columns={[
            { header: m.prisoners_visitor(), cell: (v) => <span className="font-medium">{v.visitorName}</span> },
            { header: m.prisoners_when(), cell: (v) => format(v.visitedAt, 'd MMM yyyy p') },
            { header: m.prisoners_type(), cell: (v) => <Badge variant="secondary">{visitTypeLabel(v.visitType)}</Badge> },
            { header: m.prisoners_status(), cell: (v) => <Badge variant={v.status === 'denied' ? 'destructive' : 'outline'}>{visitStatusLabel(v.status)}</Badge> },
            { header: m.prisoners_supervised_by(), cell: (v) => v.supervisingOfficer ?? <Dash /> },
            { header: m.prisoners_notes(), className: 'min-w-40', cell: (v) => notes(v.notes) },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title={m.prisoners_health_and_welfare()}
        count={healthEvents.length}
        action={
          <FormDrawer label={m.prisoners_record_health_event()} title={m.prisoners_record_health_event()} description={m.prisoners_log_a_hospital_referral_return_or()}>
            {(close, setDirty) => <HealthEventForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={healthEvents}
          getKey={(e) => e.id}
          empty={m.prisoners_no_health_events_recorded_yet()}
          columns={[
            { header: m.prisoners_event(), cell: (e) => <Badge variant="outline">{healthEventTypeLabel(e.eventType)}</Badge> },
            { header: m.prisoners_when(), cell: (e) => format(e.occurredAt, 'd MMM yyyy p') },
            { header: m.prisoners_facility(), cell: (e) => e.facilityName ?? <Dash /> },
            { header: m.prisoners_authorised_by(), cell: (e) => e.authorizedBy ?? <Dash /> },
            { header: m.prisoners_notes(), className: 'min-w-40', cell: (e) => notes(e.notes) },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title={m.prisoners_rehabilitation_and_work_programmes()}
        count={participations.length}
        action={
          <FormDrawer
            label={m.prisoners_record_participation()}
            title={m.prisoners_record_programme_participation()}
            description={m.prisoners_log_enrolment_in_vocational_training_pri()}
          >
            {(close, setDirty) => <ProgrammeParticipationForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={participations}
          getKey={(p) => p.id}
          empty={m.prisoners_no_programme_participation_recorded_yet()}
          columns={[
            { header: m.prisoners_programme(), cell: (p) => <span className="font-medium">{p.programmeName}</span> },
            { header: m.prisoners_category(), cell: (p) => <Badge variant="outline">{programmeCategoryLabel(p.category)}</Badge> },
            { header: m.prisoners_status(), cell: (p) => <Badge variant="secondary">{programmeStatusLabel(p.status)}</Badge> },
            { header: m.prisoners_started(), cell: (p) => format(p.startedAt, 'd MMM yyyy') },
            {
              header: m.prisoners_certified(),
              cell: (p) =>
                p.completedAt ? (
                  `${format(p.completedAt, 'd MMM yyyy')}${p.certificateReference ? ` (${p.certificateReference})` : ''}`
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => setCertifying(p)}>
                    {m.prisoners_mark_completed_and_certified()}
                  </Button>
                ),
            },
          ]}
        />
      </ProfileSection>

      <ProfileSection
        title={m.prisoners_requests_and_complaints()}
        count={requests.length}
        action={
          <FormDrawer label={m.prisoners_record_complaint()} title={m.prisoners_record_complaint()} description={m.prisoners_log_a_complaint_raised_via_the()}>
            {(close, setDirty) => <RequestForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={requests}
          getKey={(r) => r.id}
          empty={m.prisoners_no_complaints_recorded_yet()}
          columns={[
            { header: m.prisoners_category(), cell: (r) => <Badge variant="outline">{requestCategoryLabel(r.category)}</Badge> },
            { header: m.prisoners_raised(), cell: (r) => format(r.raisedAt, 'd MMM yyyy') },
            { header: m.prisoners_what(), className: 'min-w-48', cell: (r) => r.description },
            {
              header: m.prisoners_resolution(),
              className: 'min-w-40',
              cell: (r) =>
                r.resolvedAt ? (
                  <div className="flex flex-col gap-0.5">
                    <Badge variant="secondary" className="w-fit">
                      {m.prisoners_resolved({ resolvedAt: format(r.resolvedAt, 'd MMM yyyy') })}</Badge>
                    {r.outcomeNote && <RichTextPreview value={r.outcomeNote} className="text-muted-foreground" />}
                  </div>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => setResolving(r)}>
                    {m.prisoners_mark_resolved()}
                  </Button>
                ),
            },
          ]}
        />
      </ProfileSection>

      <ProfileSection title={m.prisoners_family_and_contacts()} count={file.contacts.length} description={m.prisoners_recorded_at_reception()}>
        <ProfileTable
          rows={file.contacts}
          getKey={(c) => c.id}
          empty={m.prisoners_no_contacts_recorded()}
          columns={[
            { header: m.prisoners_name(), cell: (c) => <span className="font-medium">{c.name}</span> },
            { header: m.prisoners_relationship(), cell: (c) => c.relationship ?? <Dash /> },
            { header: m.prisoners_phone(), cell: (c) => c.phone ?? <Dash /> },
            { header: m.prisoners_address(), cell: (c) => c.address ?? <Dash /> },
            {
              header: m.prisoners_flags(),
              cell: (c) => (
                <div className="flex flex-wrap gap-1">
                  {c.isEmergency && <Badge variant="outline">{m.prisoners_emergency()}</Badge>}
                  {c.notifyOnImprisonment && <Badge variant="secondary">{m.prisoners_notified()}</Badge>}
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
        title={m.prisoners_mark_completed_and_certified()}
        description={m.prisoners_record_a_uvtab_trade_testing_or()}
      >
        {(p, close, setDirty) => <CertifyProgrammeForm key={p.id} participation={p} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>

      <ItemDrawer item={resolving} onClose={() => setResolving(null)} title={m.prisoners_mark_resolved()} description={m.prisoners_record_what_further_action_was_taken()}>
        {(r, close, setDirty) => <ResolveRequestForm key={r.id} request={r} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>
    </div>
  )
}
