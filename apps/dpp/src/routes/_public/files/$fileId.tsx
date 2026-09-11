import { Createpanel } from '@/components/create-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { decisionTypeLabel, DecisionForm, decisionsForFileOptions, useDecisionsForFile } from '@/features/decisions'
import {
  EditProsecutionFileForm,
  fileStatusLabel,
  filePeopleOptions,
  LinkPersonForm,
  personFullNameForRole,
  prosecutionFileOptions,
  useFilePeople,
  useProsecutionFile,
  useUnlinkPersonFromFile,
} from '@/features/prosecution-files'
import { referralsForFileOptions, ResubmissionForm, useReferralsForFile } from '@/features/referrals'
import { AddCircleIcon, Edit02Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/files/$fileId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prosecutionFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...filePeopleOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...referralsForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...decisionsForFileOptions(params.fileId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/**
 * The Charging Review / core workspace (docs/dpp/PRODUCT.md
 * §Charging Review, §Decisions & Reviews) — a composed view over one
 * Prosecution File's own already-linked people, intake/referral timeline,
 * and decision history, same "workspace, not a separate table" pattern as
 * Police's Investigation view. No separate `charging_review` route or
 * table exists; this page is where a prosecutor understands the file and
 * records a decision.
 */
function RouteComponent() {
  const { fileId } = Route.useParams()
  const { data: file } = useProsecutionFile(fileId)
  const { data: people } = useFilePeople(fileId)
  const { data: referrals } = useReferralsForFile(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const unlinkPerson = useUnlinkPersonFromFile()

  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [decisionDirty, setDecisionDirty] = useState(false)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [resubmitDirty, setResubmitDirty] = useState(false)

  if (!file) {
    return (
      <article className="container flex flex-col gap-3 pt-5 pb-20">
        <p className="text-sm text-muted-foreground">This file could not be found.</p>
      </article>
    )
  }

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1>{file.title}</h1>
            <Badge variant="outline">{fileStatusLabel(file.currentStatus)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {file.odppRegistrationNumber ?? 'No ODPP reg. no. yet'}
            {file.policeReference ? ` · Police ref. ${file.policeReference}` : ''}
            {file.policeStation ? ` · ${file.policeStation}` : ''}
            {file.courtCaseNumber ? ` · Court case ${file.courtCaseNumber}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">Received {format(file.receivedAt, 'PPp')}</p>
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
          headings={{ title: 'Edit file details', description: 'Update registration, reference, and court numbers.' }}
        >
          <EditProsecutionFileForm file={file} onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
        </Createpanel>
      </section>

      <RichTextPreview value={file.notes} className="max-w-2xl text-sm text-muted-foreground" />

      <section className="flex flex-col gap-3">
        <AttachmentsField entityType={entityTypes.prosecutionFile} entityId={file.id} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">People</h2>
          <Createpanel
            open={linkOpen}
            onOpenChange={setLinkOpen}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Link person
              </Button>
            }
            headings={{ title: 'Link person', description: 'Add an accused, complainant, or witness to this file.' }}
          >
            <LinkPersonForm prosecutionFileId={fileId} onSuccess={() => setLinkOpen(false)} />
          </Createpanel>
        </div>

        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one linked to this file yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {people.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{link.role}</Badge>
                  <span>{personFullNameForRole(link)}</span>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => unlinkPerson.mutate(link.id)} aria-label="Remove">
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Intake &amp; referrals</h2>
          <Createpanel
            open={resubmitOpen}
            onOpenChange={setResubmitOpen}
            isDirty={resubmitDirty}
            trigger={
              <Button size="sm" variant="secondary">
                Log resubmission
              </Button>
            }
            headings={{ title: 'Log resubmission', description: 'Record the file coming back from Police.' }}
          >
            <ResubmissionForm prosecutionFileId={fileId} onSuccess={() => setResubmitOpen(false)} onDirtyChange={setResubmitDirty} />
          </Createpanel>
        </div>

        <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
          {referrals.map((referral) => (
            <div key={referral.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={referral.isResubmission ? 'secondary' : 'outline'}>
                  {referral.isResubmission ? 'Resubmission' : 'Initial referral'}
                </Badge>
                <span className="text-xs text-muted-foreground">{format(referral.receivedAt, 'PPp')}</span>
              </div>
              <RichTextPreview value={referral.materialSummary} className="text-muted-foreground" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Decisions</h2>
          <Createpanel
            open={decisionOpen}
            onOpenChange={setDecisionOpen}
            isDirty={decisionDirty}
            trigger={
              <Button size="sm">
                <HugeiconsIcon icon={AddCircleIcon} />
                Record decision
              </Button>
            }
            headings={{ title: 'Record decision', description: 'Log a formal prosecutorial decision on this file.' }}
          >
            <DecisionForm prosecutionFileId={fileId} onSuccess={() => setDecisionOpen(false)} onDirtyChange={setDecisionDirty} />
          </Createpanel>
        </div>

        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {decisions.map((decision) => (
              <div key={decision.id} className={cn('flex flex-col gap-1 px-3 py-2 text-sm')}>
                <div className="flex items-center gap-2">
                  <Badge>{decisionTypeLabel(decision.decisionType)}</Badge>
                  <span className="text-xs text-muted-foreground">{format(decision.decidedAt, 'PPp')}</span>
                  {decision.decidedBy && <span className="text-xs text-muted-foreground">· {decision.decidedBy}</span>}
                </div>
                <RichTextPreview value={decision.reasons} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
