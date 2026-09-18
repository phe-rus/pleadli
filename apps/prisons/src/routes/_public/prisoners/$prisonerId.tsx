import { Createpanel } from '@/components/create-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { CourtProductionForm, courtProductionsForPrisonerOptions, productionMethodLabel, useCourtProductionsForPrisoner } from '@/features/court-productions'
import { HealthEventForm, healthEventTypeLabel, healthEventsForPrisonerOptions, useHealthEventsForPrisoner } from '@/features/health-events'
import {
  admissionInstrumentLabel,
  custodyStatusLabel,
  daysInCustody,
  EditPrisonerForm,
  mandatoryBailThresholdDays,
  prisonerOptions,
  prisonerStatusLabel,
  usePrisoner,
} from '@/features/prisoners'
import {
  CertifyProgrammeForm,
  ProgrammeParticipationForm,
  programmeCategoryLabel,
  programmeParticipationsForPrisonerOptions,
  programmeStatusLabel,
  useProgrammeParticipationsForPrisoner,
  type ProgrammeParticipation,
} from '@/features/programme-participations'
import {
  PropertyRecordForm,
  ReturnPropertyForm,
  propertyRecordsForPrisonerOptions,
  usePropertyRecordsForPrisoner,
  type PropertyRecord,
} from '@/features/property-records'
import { releaseTypeLabel, ReleaseForm, releasesForPrisonerOptions, useReleasesForPrisoner } from '@/features/releases'
import {
  RequestForm,
  ResolveRequestForm,
  requestCategoryLabel,
  requestsForPrisonerOptions,
  useRequestsForPrisoner,
  type PrisonRequest,
} from '@/features/requests'
import { transferDirectionLabel, TransferForm, transfersForPrisonerOptions, useTransfersForPrisoner } from '@/features/transfers'
import { VisitForm, visitStatusLabel, visitTypeLabel, visitsForPrisonerOptions, useVisitsForPrisoner } from '@/features/visits'
import { AddCircleIcon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/prisoners/$prisonerId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...courtProductionsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...releasesForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...visitsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...healthEventsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...programmeParticipationsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...propertyRecordsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...requestsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/**
 * The Prisoner workspace (docs/prisons/PRODUCT.md §2) — custody/remand
 * status, court-production history, release history, and documents, all
 * over one core record. Health and Transfers are deliberately not built in
 * this first slice (see PRODUCT.md's navigation notes).
 */
function RouteComponent() {
  const { prisonerId } = Route.useParams()
  const { data: prisoner } = usePrisoner(prisonerId)
  const { data: productions } = useCourtProductionsForPrisoner(prisonerId)
  const { data: releases } = useReleasesForPrisoner(prisonerId)
  const { data: visits } = useVisitsForPrisoner(prisonerId)
  const { data: healthEvents } = useHealthEventsForPrisoner(prisonerId)
  const { data: transfers } = useTransfersForPrisoner(prisonerId)
  const { data: participations } = useProgrammeParticipationsForPrisoner(prisonerId)
  const { data: propertyRecords } = usePropertyRecordsForPrisoner(prisonerId)
  const { data: requests } = useRequestsForPrisoner(prisonerId)

  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [productionOpen, setProductionOpen] = useState(false)
  const [productionDirty, setProductionDirty] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseDirty, setReleaseDirty] = useState(false)
  const [visitOpen, setVisitOpen] = useState(false)
  const [visitDirty, setVisitDirty] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [healthDirty, setHealthDirty] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirty, setTransferDirty] = useState(false)
  const [programmeOpen, setProgrammeOpen] = useState(false)
  const [programmeDirty, setProgrammeDirty] = useState(false)
  const [certifyingParticipation, setCertifyingParticipation] = useState<ProgrammeParticipation | null>(null)
  const [certifyDirty, setCertifyDirty] = useState(false)
  const [propertyOpen, setPropertyOpen] = useState(false)
  const [propertyDirty, setPropertyDirty] = useState(false)
  const [returningRecord, setReturningRecord] = useState<PropertyRecord | null>(null)
  const [returnDirty, setReturnDirty] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestDirty, setRequestDirty] = useState(false)
  const [resolvingRequest, setResolvingRequest] = useState<PrisonRequest | null>(null)
  const [resolveDirty, setResolveDirty] = useState(false)

  if (!prisoner) {
    return (
      <article className="container flex flex-col gap-3 pt-5 pb-20">
        <p className="text-sm text-muted-foreground">This prisoner could not be found.</p>
      </article>
    )
  }

  const inCustody = prisoner.currentStatus === 'in_custody'
  const daysHeld = daysInCustody(prisoner.admittedAt)
  const threshold = mandatoryBailThresholdDays(prisoner.highCourtOnlyOffence)

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1>
              {prisoner.lastName}, {prisoner.firstName}
              {prisoner.otherNames ? ` ${prisoner.otherNames}` : ''}
            </h1>
            <Badge variant="secondary">{prisonerStatusLabel(prisoner.status)}</Badge>
            <Badge variant={inCustody ? 'outline' : 'secondary'}>{custodyStatusLabel(prisoner.currentStatus)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {prisoner.reference ?? 'No reference recorded'}
            {prisoner.nationalId ? ` · ${prisoner.nationalId}` : ''}
            {prisoner.admissionAuthority ? ` · ${prisoner.admissionAuthority}` : ''}
            {prisoner.currentLocation ? ` · ${prisoner.currentLocation}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Admitted {format(prisoner.admittedAt, 'PPp')} under {admissionInstrumentLabel(prisoner.admissionInstrumentType)}
            {inCustody && ` · ${daysHeld} days in custody (mandatory-bail threshold: ${threshold} days)`}
          </p>
          {inCustody && daysHeld >= threshold && (
            <Badge variant="destructive" className="w-fit">
              Past constitutional mandatory-bail threshold
            </Badge>
          )}
        </div>

        <Createpanel
          open={editOpen}
          onOpenChange={setEditOpen}
          isDirty={editDirty}
          trigger={
            <Button size="sm" variant="secondary">
              <HugeiconsIcon icon={Edit02Icon} />
              Edit details
            </Button>
          }
          headings={{ title: 'Edit prisoner details', description: 'Update identity, category, and notes.' }}
        >
          <EditPrisonerForm prisoner={prisoner} onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
        </Createpanel>
      </section>

      <RichTextPreview value={prisoner.notes} className="max-w-2xl text-sm text-muted-foreground" />

      <section className="flex flex-col gap-3">
        <AttachmentsField entityType={entityTypes.prisoner} entityId={prisoner.id} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Court production &amp; remand</h2>
          <Createpanel
            open={productionOpen}
            onOpenChange={setProductionOpen}
            isDirty={productionDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record production
              </Button>
            }
            headings={{ title: 'Record court production', description: 'Log a court-ordered production (s.67).' }}
          >
            <CourtProductionForm prisonerId={prisonerId} onSuccess={() => setProductionOpen(false)} onDirtyChange={setProductionDirty} />
          </Createpanel>
        </div>

        {productions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No court productions recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {productions.map((production) => (
              <div key={production.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{format(production.productionDate, 'PPp')}</span>
                  {production.courtReference && <Badge variant="outline">{production.courtReference}</Badge>}
                  <Badge variant="secondary">{productionMethodLabel(production.productionMethod)}</Badge>
                </div>
                <RichTextPreview value={production.purpose} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Visits</h2>
          <Createpanel
            open={visitOpen}
            onOpenChange={setVisitOpen}
            isDirty={visitDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record visit
              </Button>
            }
            headings={{ title: 'Record visit', description: 'Log a visitor and supervising officer.' }}
          >
            <VisitForm prisonerId={prisonerId} onSuccess={() => setVisitOpen(false)} onDirtyChange={setVisitDirty} />
          </Createpanel>
        </div>

        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {visits.map((visit) => (
              <div key={visit.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{visit.visitorName}</span>
                  <span className="text-xs text-muted-foreground">{format(visit.visitedAt, 'PPp')}</span>
                  <Badge variant={visit.status === 'denied' ? 'destructive' : 'outline'}>{visitStatusLabel(visit.status)}</Badge>
                  <Badge variant="secondary">{visitTypeLabel(visit.visitType)}</Badge>
                  {visit.supervisingOfficer && <span className="text-xs text-muted-foreground">· {visit.supervisingOfficer}</span>}
                  {visit.authorizedBy && <span className="text-xs text-muted-foreground">· authorized by {visit.authorizedBy}</span>}
                </div>
                <RichTextPreview value={visit.notes} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Health &amp; welfare</h2>
          <Createpanel
            open={healthOpen}
            onOpenChange={setHealthOpen}
            isDirty={healthDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record health event
              </Button>
            }
            headings={{ title: 'Record health event', description: 'Log a hospital referral, return, or mental-hospital transfer.' }}
          >
            <HealthEventForm prisonerId={prisonerId} onSuccess={() => setHealthOpen(false)} onDirtyChange={setHealthDirty} />
          </Createpanel>
        </div>

        {healthEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No health events recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {healthEvents.map((event) => (
              <div key={event.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{healthEventTypeLabel(event.eventType)}</Badge>
                  <span className="text-xs text-muted-foreground">{format(event.occurredAt, 'PPp')}</span>
                  {event.facilityName && <span className="text-xs text-muted-foreground">· {event.facilityName}</span>}
                </div>
                <RichTextPreview value={event.notes} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Transfers</h2>
          <Createpanel
            open={transferOpen}
            onOpenChange={setTransferOpen}
            isDirty={transferDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record transfer
              </Button>
            }
            headings={{ title: 'Record transfer', description: 'Log a move to or from another prison.' }}
          >
            <TransferForm prisonerId={prisonerId} onSuccess={() => setTransferOpen(false)} onDirtyChange={setTransferDirty} />
          </Createpanel>
        </div>

        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{transferDirectionLabel(transfer.direction)}</Badge>
                  <span className="text-xs text-muted-foreground">{format(transfer.transferredAt, 'PPp')}</span>
                  {transfer.otherPrisonName && <span className="text-xs text-muted-foreground">· {transfer.otherPrisonName}</span>}
                </div>
                <RichTextPreview value={transfer.notes} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Rehabilitation &amp; work programmes</h2>
          <Createpanel
            open={programmeOpen}
            onOpenChange={setProgrammeOpen}
            isDirty={programmeDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record participation
              </Button>
            }
            headings={{ title: 'Record programme participation', description: 'Log enrolment in vocational training, prison industries, or prison farming.' }}
          >
            <ProgrammeParticipationForm prisonerId={prisonerId} onSuccess={() => setProgrammeOpen(false)} onDirtyChange={setProgrammeDirty} />
          </Createpanel>
        </div>

        {participations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No programme participation recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {participations.map((participation) => (
              <div key={participation.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{participation.programmeName}</span>
                  <Badge variant="outline">{programmeCategoryLabel(participation.category)}</Badge>
                  <Badge variant="secondary">{programmeStatusLabel(participation.status)}</Badge>
                  <span className="text-xs text-muted-foreground">since {format(participation.startedAt, 'PP')}</span>
                  {participation.completedAt ? (
                    <span className="text-xs text-muted-foreground">
                      · certified {format(participation.completedAt, 'PP')}
                      {participation.certificateReference ? ` (${participation.certificateReference})` : ''}
                    </span>
                  ) : (
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setCertifyingParticipation(participation)}>
                      Mark completed &amp; certified
                    </Button>
                  )}
                </div>
                <RichTextPreview value={participation.notes} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

      <Createpanel
        open={certifyingParticipation !== null}
        onOpenChange={(open) => {
          if (!open) setCertifyingParticipation(null)
        }}
        isDirty={certifyDirty}
        headings={{ title: 'Mark completed & certified', description: 'Record a UVTAB trade-testing or similar external assessment outcome.' }}
      >
        {certifyingParticipation && (
          <CertifyProgrammeForm
            key={certifyingParticipation.id}
            participation={certifyingParticipation}
            onSuccess={() => setCertifyingParticipation(null)}
            onDirtyChange={setCertifyDirty}
          />
        )}
      </Createpanel>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Property &amp; effects</h2>
          <Createpanel
            open={propertyOpen}
            onOpenChange={setPropertyOpen}
            isDirty={propertyDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add property record
              </Button>
            }
            headings={{ title: 'Add property record', description: "Record belongings placed in the officer in charge's custody (s.62)." }}
          >
            <PropertyRecordForm prisonerId={prisonerId} onSuccess={() => setPropertyOpen(false)} onDirtyChange={setPropertyDirty} />
          </Createpanel>
        </div>

        {propertyRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">No property recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {propertyRecords.map((record) => (
              <div key={record.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{record.description}</span>
                  <span className="text-xs text-muted-foreground">{format(record.recordedAt, 'PP')}</span>
                  {record.returnedAt ? (
                    <Badge variant="outline">Returned {format(record.returnedAt, 'PP')}</Badge>
                  ) : (
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setReturningRecord(record)}>
                      Mark returned
                    </Button>
                  )}
                </div>
                {record.returnedNote && <p className="text-xs text-muted-foreground">{record.returnedNote}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <Createpanel
        open={returningRecord !== null}
        onOpenChange={(open) => {
          if (!open) setReturningRecord(null)
        }}
        isDirty={returnDirty}
        headings={{ title: 'Mark property returned', description: 'Record return at release/discharge (s.62(3)).' }}
      >
        {returningRecord && (
          <ReturnPropertyForm
            key={returningRecord.id}
            record={returningRecord}
            onSuccess={() => setReturningRecord(null)}
            onDirtyChange={setReturnDirty}
          />
        )}
      </Createpanel>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Requests &amp; complaints</h2>
          <Createpanel
            open={requestOpen}
            onOpenChange={setRequestOpen}
            isDirty={requestDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record complaint
              </Button>
            }
            headings={{ title: 'Record complaint', description: 'Log a complaint raised via the Human Rights Committee ("Mukutano") mechanism.' }}
          >
            <RequestForm prisonerId={prisonerId} onSuccess={() => setRequestOpen(false)} onDirtyChange={setRequestDirty} />
          </Createpanel>
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No complaints recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{requestCategoryLabel(request.category)}</Badge>
                  <span className="text-xs text-muted-foreground">{format(request.raisedAt, 'PPp')}</span>
                  {request.resolvedAt ? (
                    <Badge variant="secondary">Resolved {format(request.resolvedAt, 'PP')}</Badge>
                  ) : (
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setResolvingRequest(request)}>
                      Mark resolved
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground">{request.description}</p>
                {request.outcomeNote && <RichTextPreview value={request.outcomeNote} className="text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}
      </section>

      <Createpanel
        open={resolvingRequest !== null}
        onOpenChange={(open) => {
          if (!open) setResolvingRequest(null)
        }}
        isDirty={resolveDirty}
        headings={{ title: 'Mark resolved', description: 'Record what further action was taken.' }}
      >
        {resolvingRequest && (
          <ResolveRequestForm
            key={resolvingRequest.id}
            request={resolvingRequest}
            onSuccess={() => setResolvingRequest(null)}
            onDirtyChange={setResolveDirty}
          />
        )}
      </Createpanel>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Releases</h2>
          <Createpanel
            open={releaseOpen}
            onOpenChange={setReleaseOpen}
            isDirty={releaseDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record release
              </Button>
            }
            headings={{ title: 'Record release', description: 'Log a formal release event for this prisoner.' }}
          >
            <ReleaseForm prisonerId={prisonerId} onSuccess={() => setReleaseOpen(false)} onDirtyChange={setReleaseDirty} />
          </Createpanel>
        </div>

        {releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No releases recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {releases.map((release) => (
              <div key={release.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge>{releaseTypeLabel(release.releaseType)}</Badge>
                  <span className="text-xs text-muted-foreground">{format(release.releasedAt, 'PPp')}</span>
                  {release.orderedBy && <span className="text-xs text-muted-foreground">· {release.orderedBy}</span>}
                </div>
                <RichTextPreview value={release.notes} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
