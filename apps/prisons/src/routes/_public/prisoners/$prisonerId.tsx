import { Createpanel } from '@/components/create-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { CourtProductionForm, courtProductionsForPrisonerOptions, useCourtProductionsForPrisoner } from '@/features/court-productions'
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
import { releaseTypeLabel, ReleaseForm, releasesForPrisonerOptions, useReleasesForPrisoner } from '@/features/releases'
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

  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [productionOpen, setProductionOpen] = useState(false)
  const [productionDirty, setProductionDirty] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseDirty, setReleaseDirty] = useState(false)

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
                </div>
                <RichTextPreview value={production.purpose} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>

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
