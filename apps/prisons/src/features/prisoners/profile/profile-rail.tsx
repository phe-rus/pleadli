import { PhotoCapture } from '@/components/photo-capture'
import { UniformChip } from '@/features/numbering'
import { usePrisonerPhotos, useSavePrisonerPhoto } from '@/features/prisoner-photos'
import { PrisonerAvatar } from '@/features/prisoners/prisoner-avatar'
import { usePrisonerFile } from '@/features/custody'
import { ApiError } from '@/lib/api'
import { Camera01Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { custodyStatusLabel, prisonerFullName, prisonerSexes, nationalities, prisonerStatusLabel, type Prisoner } from '../schema'
import { Facts } from './blocks'

type View = 'front' | 'left' | 'right'
const views: readonly { value: View; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'left', label: 'Left side' },
  { value: 'right', label: 'Right side' },
]

function ageOn(dateOfBirth: number | null) {
  if (dateOfBirth == null) return null
  const born = new Date(dateOfBirth)
  const now = new Date()
  let years = now.getFullYear() - born.getFullYear()
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1
  return years
}

function lookup(list: readonly { value: string; label: string }[], value: string | null) {
  return value ? (list.find((item) => item.value === value)?.label ?? value) : null
}

export function ProfileRail({ prisoner }: { prisoner: Prisoner }) {
  const { data: file } = usePrisonerFile(prisoner.id)
  const { data: photos } = usePrisonerPhotos(prisoner.id)
  const [photoOpen, setPhotoOpen] = useState(false)
  const { clocks, obligations, instruments } = file

  const inCustody = prisoner.currentStatus === 'in_custody'
  const age = ageOn(prisoner.dateOfBirth)
  const number = prisoner.prisonerNumber ?? prisoner.id
  const now = Date.now()
  const overdue = obligations.filter((o) => o.dueAt != null && o.dueAt < now).length
  const pendingInstruments = instruments.some((i) => i.status === 'pending' || i.status === 'rectification_pending')
  const pastBail = inCustody && clocks.mandatoryBailOn != null && clocks.mandatoryBailOn <= now
  const inWindow = inCustody && clocks.paroleWindowOpensOn != null && clocks.paroleWindowOpensOn <= now && (clocks.releaseDueOn ?? 0) > now
  const side = photos.filter((p) => p.view !== 'front')

  return (
    <Card className="p-0">
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-col items-center gap-2">
          <PrisonerAvatar prisonerId={prisoner.id} name={prisonerFullName(prisoner)} size={160} className="rounded-xl" />
          {side.length > 0 && (
            <div className="flex items-center gap-2">
              {side.map((photo) => (
                <PrisonerAvatar
                  key={photo.view}
                  prisonerId={prisoner.id}
                  name={prisonerFullName(prisoner)}
                  view={photo.view}
                  size={44}
                  className="rounded-md"
                />
              ))}
            </div>
          )}
          <Button size="xs" variant="secondary" onClick={() => setPhotoOpen(true)}>
            <HugeiconsIcon icon={Camera01Icon} size={12} />
            {photos.length > 0 ? 'Retake photo' : 'Take photo'}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-lg leading-tight">{prisonerFullName(prisoner)}</h1>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(number)
              t.success('Number copied')
            }}
            className="flex w-fit max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
            title="Copy"
          >
            <span className="truncate">{number}</span>
            <HugeiconsIcon icon={Copy01Icon} size={12} className="shrink-0" />
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{prisonerStatusLabel(prisoner.status)}</Badge>
            <UniformChip status={prisoner.status} />
            <Badge variant={inCustody ? 'outline' : 'secondary'}>{custodyStatusLabel(prisoner.currentStatus)}</Badge>
          </div>
        </div>

        <Facts
          items={[
            { label: 'Age', value: age != null ? `${age} years (born ${format(prisoner.dateOfBirth!, 'd MMM yyyy')})` : null },
            { label: 'Sex', value: lookup(prisonerSexes, prisoner.sex) },
            { label: 'Nationality', value: lookup(nationalities, prisoner.nationality) },
            { label: 'National ID', value: prisoner.nationalId },
            { label: 'Reference', value: prisoner.reference },
            {
              label: 'Admitted',
              value: `${format(prisoner.admittedAt, 'd MMM yyyy')}${inCustody ? ` · ${clocks.daysHeld} days held` : ''}`,
            },
            { label: 'Location', value: prisoner.currentLocation ?? 'Not placed' },
            { label: 'Offence', value: prisoner.offence },
          ]}
        />

        {(pendingInstruments || pastBail || inWindow || clocks.reviewable || prisoner.documentsPending || prisoner.highCourtOnlyOffence || overdue > 0 || prisoner.currentStatus === 'in_transit') && (
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
            {(pendingInstruments || prisoner.documentsPending) && <Badge variant="destructive">Documents pending</Badge>}
            {pastBail && <Badge variant="destructive">Past mandatory bail</Badge>}
            {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
            {inWindow && <Badge variant="outline">Parole window open</Badge>}
            {clocks.reviewable && inCustody && <Badge variant="outline">s.88 review applies</Badge>}
            {prisoner.highCourtOnlyOffence && <Badge variant="secondary">High Court only</Badge>}
            {prisoner.currentStatus === 'in_transit' && <Badge variant="outline">In transit</Badge>}
          </div>
        )}
      </CardContent>

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Photos of {prisonerFullName(prisoner)}</DialogTitle>
            <DialogDescription>Take each view with a camera or upload a file. A new photo replaces the one on file for that view.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-4">
            {views.map((view) => (
              <PhotoSlot key={view.value} prisoner={prisoner} view={view.value} label={view.label} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function PhotoSlot({ prisoner, view, label }: { prisoner: Prisoner; view: View; label: string }) {
  const save = useSavePrisonerPhoto(prisoner.id, view)
  const { data: photos } = usePrisonerPhotos(prisoner.id)
  const [draft, setDraft] = useState<string | null>(null)
  const onFile = photos.some((p) => p.view === view)

  return (
    <div className="flex min-w-40 flex-1 basis-44 flex-col gap-2">
      <PhotoCapture value={draft} onChange={setDraft} label={label} hint={onFile ? 'On file' : 'None yet'} shape="portrait" />
      {draft && (
        <Button
          size="xs"
          disabled={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync(draft)
              setDraft(null)
              t.success(`${label} photo saved`)
            } catch (error) {
              t.error('Could not save the photo', { description: error instanceof ApiError ? error.message : 'Please try again.' })
            }
          }}
        >
          {save.isPending ? 'Saving…' : `Save ${label.toLowerCase()} photo`}
        </Button>
      )}
    </div>
  )
}
