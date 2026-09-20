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
import { m } from '@/paraglide/messages'

type View = 'front' | 'left' | 'right'
const views: readonly { value: View; label: string }[] = [
  { value: 'front', get label() { return m.prisoners_front() } },
  { value: 'left', get label() { return m.prisoners_left_side() } },
  { value: 'right', get label() { return m.prisoners_right_side() } },
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
            {photos.length > 0 ? m.prisoners_retake_photo() : m.prisoners_take_photo()}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-lg leading-tight">{prisonerFullName(prisoner)}</h1>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(number)
              t.success(m.prisoners_number_copied())
            }}
            className="flex w-fit max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
            title={m.prisoners_copy()}
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
            { label: m.prisoners_age(), value: age != null ? `${age} years (born ${format(prisoner.dateOfBirth!, 'd MMM yyyy')})` : null },
            { label: m.prisoners_sex(), value: lookup(prisonerSexes, prisoner.sex) },
            { label: m.prisoners_nationality(), value: lookup(nationalities, prisoner.nationality) },
            { label: m.prisoners_national_id(), value: prisoner.nationalId },
            { label: m.prisoners_reference(), value: prisoner.reference },
            {
              label: m.prisoners_admitted_2(),
              value: `${format(prisoner.admittedAt, 'd MMM yyyy')}${inCustody ? ` · ${m.prisoners_days_held_plain({ days: clocks.daysHeld })}` : ''}`,
            },
            { label: m.prisoners_location(), value: prisoner.currentLocation ?? m.prisoners_not_placed() },
            { label: m.prisoners_offence(), value: prisoner.offence },
          ]}
        />

        {(pendingInstruments || pastBail || inWindow || clocks.reviewable || prisoner.documentsPending || prisoner.highCourtOnlyOffence || overdue > 0 || prisoner.currentStatus === 'in_transit') && (
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
            {(pendingInstruments || prisoner.documentsPending) && <Badge variant="destructive">{m.prisoners_documents_pending()}</Badge>}
            {pastBail && <Badge variant="destructive">{m.prisoners_past_mandatory_bail()}</Badge>}
            {overdue > 0 && <Badge variant="destructive">{m.prisoners_overdue({ overdue })}</Badge>}
            {inWindow && <Badge variant="outline">{m.prisoners_parole_window_open()}</Badge>}
            {clocks.reviewable && inCustody && <Badge variant="outline">{m.prisoners_s_88_review_applies()}</Badge>}
            {prisoner.highCourtOnlyOffence && <Badge variant="secondary">{m.prisoners_high_court_only()}</Badge>}
            {prisoner.currentStatus === 'in_transit' && <Badge variant="outline">{m.prisoners_in_transit()}</Badge>}
          </div>
        )}
      </CardContent>

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{m.prisoners_photos_of({ prisoner: prisonerFullName(prisoner) })}</DialogTitle>
            <DialogDescription>{m.prisoners_take_each_view_with_a_camera()}</DialogDescription>
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
      <PhotoCapture value={draft} onChange={setDraft} label={label} hint={onFile ? m.prisoners_on_file() : m.prisoners_none_yet()} shape="portrait" />
      {draft && (
        <Button
          size="xs"
          disabled={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync(draft)
              setDraft(null)
              t.success(m.prisoners_photo_saved({ label }))
            } catch (error) {
              t.error(m.prisoners_could_not_save_the_photo(), { description: error instanceof ApiError ? error.message : m.prisoners_please_try_again() })
            }
          }}
        >
          {save.isPending ? m.prisoners_saving() : m.prisoners_save_photo({ label: label.toLowerCase() })}
        </Button>
      )}
    </div>
  )
}
