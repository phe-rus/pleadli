import { Createpanel } from '@/components/create-panel'
import { AttachmentsField, entityTypes } from '@/features/attachments'
import { ChargeForm, chargesForFileOptions, useChargesForFile } from '@/features/charges'
import { CommentThread } from '@/features/comments'
import { decisionProducesChargeSheet, decisionTypeLabel, DecisionForm, decisionsForFileOptions, useDecisionsForFile } from '@/features/decisions'
import { evidenceCategoryLabel, EvidenceForm, evidenceForFileOptions, useEvidenceForFile } from '@/features/evidence'
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
import { ReviewNoteForm, reviewNotesForFileOptions, useReviewNotesForFile } from '@/features/review-notes'
import { statementRoleLabel, StatementForm, statementsForFileOptions, useStatementsForFile } from '@/features/statements'
import { AddCircleIcon, Edit02Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextPreview } from '@pleadli/rich-text'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useState } from 'react'

export const Route = createFileRoute('/_public/files/$fileId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prosecutionFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...filePeopleOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...referralsForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...decisionsForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...chargesForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...statementsForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...evidenceForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...reviewNotesForFileOptions(params.fileId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/**
 * The prosecution file review workspace (docs/dpp/PRODUCT.md §Police
 * Material (received), §Review & Legal Observations) — a composed view
 * over one Prosecution File's own linked people, the actual material
 * received from Police (proposed charges, statements, evidence), the
 * prosecutor's own review trail, intake history, and decisions. This asks
 * a different question than Police's Investigation workspace: not "what
 * do we know and what needs investigating" but "what has been presented,
 * what does it establish, what should happen next."
 */
function RouteComponent() {
  const { fileId } = Route.useParams()
  const { data: file } = useProsecutionFile(fileId)
  const { data: people } = useFilePeople(fileId)
  const { data: referrals } = useReferralsForFile(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: evidenceItems } = useEvidenceForFile(fileId)
  const { data: reviewNotes } = useReviewNotesForFile(fileId)
  const unlinkPerson = useUnlinkPersonFromFile()

  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [decisionDirty, setDecisionDirty] = useState(false)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [resubmitDirty, setResubmitDirty] = useState(false)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [chargeDirty, setChargeDirty] = useState(false)
  const [statementOpen, setStatementOpen] = useState(false)
  const [statementDirty, setStatementDirty] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [evidenceDirty, setEvidenceDirty] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDirty, setNoteDirty] = useState(false)

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
          <h2 className="text-base font-medium">Allegations &amp; Proposed Charges</h2>
          <Createpanel
            open={chargeOpen}
            onOpenChange={setChargeOpen}
            isDirty={chargeDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add charge
              </Button>
            }
            headings={{ title: 'Add charge', description: 'Record a charge Police is proposing on this file.' }}
          >
            <ChargeForm prosecutionFileId={fileId} onSuccess={() => setChargeOpen(false)} onDirtyChange={setChargeDirty} />
          </Createpanel>
        </div>

        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No charges recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {charges.map((charge) => (
              <div key={charge.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{charge.offence}</span>
                  {charge.statutorySection && <Badge variant="outline">{charge.statutorySection}</Badge>}
                </div>
                <RichTextPreview value={charge.particulars} className="text-muted-foreground" />
                <CommentThread entityType="charge" entityId={charge.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Police Material: Statements</h2>
          <Createpanel
            open={statementOpen}
            onOpenChange={setStatementOpen}
            isDirty={statementDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add statement
              </Button>
            }
            headings={{ title: 'Add statement', description: 'Record a statement provided with the Police referral.' }}
          >
            <StatementForm prosecutionFileId={fileId} onSuccess={() => setStatementOpen(false)} onDirtyChange={setStatementDirty} />
          </Createpanel>
        </div>

        {statements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No statements received yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {statements.map((statement) => (
              <div key={statement.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{statementRoleLabel(statement.statementRole)}</Badge>
                  <span className="font-medium">
                    {statement.personLastName}, {statement.personFirstName}
                  </span>
                  <span className="text-xs text-muted-foreground">{format(statement.givenAt, 'PP')}</span>
                </div>
                <RichTextPreview value={statement.content} className="text-muted-foreground" />
                <AttachmentsField entityType={entityTypes.statement} entityId={statement.id} label="Scanned copy / attachments" />
                <CommentThread entityType="statement" entityId={statement.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Police Material: Evidence</h2>
          <Createpanel
            open={evidenceOpen}
            onOpenChange={setEvidenceOpen}
            isDirty={evidenceDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add evidence
              </Button>
            }
            headings={{ title: 'Add evidence', description: 'Record an exhibit or other evidence Police says exists.' }}
          >
            <EvidenceForm prosecutionFileId={fileId} onSuccess={() => setEvidenceOpen(false)} onDirtyChange={setEvidenceDirty} />
          </Createpanel>
        </div>

        {evidenceItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {evidenceItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{evidenceCategoryLabel(item.category)}</Badge>
                  {item.identificationMark && <span className="text-xs text-muted-foreground">{item.identificationMark}</span>}
                </div>
                <RichTextPreview value={item.description} className="text-muted-foreground" />
                <AttachmentsField entityType={entityTypes.evidenceItem} entityId={item.id} label="Photographs / attachments" />
                <CommentThread entityType="evidence_item" entityId={item.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Review &amp; Legal Observations</h2>
          <Createpanel
            open={noteOpen}
            onOpenChange={setNoteOpen}
            isDirty={noteDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={AddCircleIcon} />
                Add observation
              </Button>
            }
            headings={{ title: 'Add observation', description: 'Note a question, gap, or issue while reviewing, not a formal decision.' }}
          >
            <ReviewNoteForm prosecutionFileId={fileId} onSuccess={() => setNoteOpen(false)} onDirtyChange={setNoteDirty} />
          </Createpanel>
        </div>

        {reviewNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No observations recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 rounded-md border border-border/50">
            {reviewNotes.map((note) => (
              <div key={note.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{format(note.createdAt, 'PPp')}</span>
                  {note.author && <span className="text-xs text-muted-foreground">· {note.author}</span>}
                </div>
                <RichTextPreview value={note.note} className="text-muted-foreground" />
                <CommentThread entityType="review_note" entityId={note.id} />
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
                  {decisionProducesChargeSheet(decision.decisionType) && (
                    <Link
                      to="/print/charge-sheets/$fileId/$decisionId"
                      params={{ fileId, decisionId: decision.id }}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      View charge sheet
                    </Link>
                  )}
                </div>
                <RichTextPreview value={decision.reasons} className="text-muted-foreground" />
                <CommentThread entityType="decision" entityId={decision.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  )
}
