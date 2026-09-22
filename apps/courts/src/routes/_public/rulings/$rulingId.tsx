import { Createpanel } from '@/components/create-panel'
import { DateField } from '@/components/date-field'
import { Tag } from '@/components/status-tag'
import { CitationSearch } from '@/features/library'
import { DeliverForm, RulingSheet, rulingKindLabel, rulingOptions, updateRuling, useDiscardRuling, useRuling } from '@/features/rulings'
import { ApiError, messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { RichTextInput, richTextToPlainText } from '@pleadli/rich-text'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Field, FieldLabel } from '@pleadli/ui/field'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { format } from 'date-fns/format'
import { useCallback, useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/_public/rulings/$rulingId')({
  loader: async ({ context, params }) => {
    try {
      const ruling = await context.queryClient.query({ ...rulingOptions(params.rulingId), staleTime: 'static' })
      if (!ruling) throw notFound()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: RouteComponent,
})

type Saved = 'idle' | 'saving' | 'saved' | 'failed'

/** One decision. A draft is written here: the text saves as you go (a power cut
 * loses at most the last second or two), with the library beside it. A delivered
 * decision is the sheet itself, ready to print. */
function RouteComponent() {
  const { rulingId } = Route.useParams()
  const { data: ruling } = useRuling(rulingId)
  const discard = useDiscardRuling()
  const navigate = useNavigate()
  const [delivering, setDelivering] = useState(false)
  const [title, setTitle] = useState(ruling?.title ?? '')
  const [reserved, setReserved] = useState(ruling?.reservedOn ? toIsoDay(ruling.reservedOn) : '')
  const bodyRef = useRef(ruling?.body ?? '')
  const [saved, setSaved] = useState<Saved>('idle')
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ title, reserved })
  latest.current = { title, reserved }

  const save = useCallback(async () => {
    if (!dirty.current) return true
    dirty.current = false
    setSaved('saving')
    try {
      await updateRuling(rulingId, { title: latest.current.title.trim() || 'Untitled', body: bodyRef.current, reservedOn: fromDateInput(latest.current.reserved) })
      setSaved('saved')
      return true
    } catch (error) {
      dirty.current = true
      setSaved('failed')
      t.error('The draft could not be saved', { description: messageOf(error) })
      return false
    }
  }, [rulingId])

  const touch = useCallback(() => {
    dirty.current = true
    setSaved('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 1200)
  }, [save])

  // Whatever is unsaved when the page is left is saved then.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void save()
    },
    [save],
  )

  if (!ruling) return null
  const draft = ruling.status === 'draft'
  const days = ruling.reservedOn ? differenceInCalendarDays(new Date(), ruling.reservedOn) : null

  return (
    <article className="page">
      <header className="page-header print:hidden">
        <div>
          <h1>{ruling.reference ?? ruling.title}</h1>
          <p>
            {rulingKindLabel(ruling.kind)} in{' '}
            <Link to="/cases/$caseId" params={{ caseId: ruling.caseId }} className="text-foreground">
              {ruling.courtNumber}, {ruling.caseTitle}
            </Link>
            .
          </p>
        </div>
        <div className="page-actions">
          {draft ? (
            <>
              {days != null ? <Tag tone="urgent">{days === 1 ? 'Reserved 1 day' : `Reserved ${days} days`}</Tag> : <Tag tone="open">Draft</Tag>}
              <Tag tone="stopped">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'failed' ? 'Not saved' : 'Saves as you write'}</Tag>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (!window.confirm('Discard this draft?')) return
                  dirty.current = false
                  clearTimeout(timer.current)
                  discard.mutate(ruling.id, {
                    onSuccess: () => {
                      t.success('Draft discarded')
                      void navigate({ to: '/rulings' })
                    },
                    onError: (error) => t.error('Could not discard the draft', { description: messageOf(error) }),
                  })
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  clearTimeout(timer.current)
                  if (await save()) setDelivering(true)
                }}
              >
                Deliver
              </Button>
            </>
          ) : (
            <>
              {ruling.intact === false ? <Tag tone="urgent">Changed since delivery</Tag> : <Tag tone="done">Delivered, unchanged</Tag>}
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <HugeiconsIcon icon={PrinterIcon} />
                Print
              </Button>
            </>
          )}
        </div>
      </header>

      {draft ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-label="The decision" className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  latest.current = { ...latest.current, title: e.target.value }
                  touch()
                }}
              />
            </Field>
            <DateField
              label="Reserved on (optional)"
              value={reserved}
              onChange={(value) => {
                setReserved(value)
                latest.current = { ...latest.current, reserved: value }
                touch()
              }}
              description="If the decision is reserved, the day it was. It stays on Today until it is delivered."
            />
            <Field>
              <FieldLabel>Text</FieldLabel>
              <RichTextInput
                value={ruling.body}
                editorClassName="min-h-[28rem] max-h-[60vh]"
                placeholder="Write the decision. Headings, lists and numbered paragraphs are in the toolbar."
                onChange={(json) => {
                  bodyRef.current = richTextToPlainText(json).trim() ? json : ''
                  touch()
                }}
              />
            </Field>
          </section>
          <CitationSearch />
        </div>
      ) : (
        <>
          <RulingSheet ruling={ruling} />
          <section className="page-section print:hidden">
            <h2>Record</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Delivered</dt>
                <dd>
                  {ruling.deliveredOn ? format(ruling.deliveredOn, 'PP') : '·'} by {ruling.deliveredBy ?? '·'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">SHA-256 of the text as delivered</dt>
                <dd className="break-all">{ruling.contentSha256}</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      <Createpanel open={delivering} onOpenChange={setDelivering} headings={{ title: 'Deliver the decision', description: 'Give the day it was delivered in court.' }}>
        <DeliverForm ruling={ruling} onSuccess={() => setDelivering(false)} />
      </Createpanel>
    </article>
  )
}
