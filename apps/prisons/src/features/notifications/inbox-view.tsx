import { AreaField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { parseSearchRoute } from '@/lib/parse-search-route'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useState } from 'react'
import { useInbox, useInboxItem, useMarkRead, useSetInboxStatus } from './queries'
import { RecordCommunication } from './record-communication'
import { isOpen, kindLabel, originLabel, statusLabel } from './schema'
import { m } from '@/paraglide/messages'

/** One message, read in full: where it came from, who it is for, what it is
 * about, what has been done with it and by whom, and the way into the record
 * it concerns. Opening it marks it read for this officer. */
function Reader({ id }: { id: string }) {
  const navigate = useNavigate()
  const { data: item } = useInboxItem(id)
  const markRead = useMarkRead()
  const setStatus = useSetInboxStatus()
  const [note, setNote] = useState('')

  const needsMark = item != null && !item.read
  useEffect(() => {
    if (needsMark) markRead.mutate(id)
    // Once per message opened; the mutation refreshes `read`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, needsMark])
  useEffect(() => setNote(''), [id])

  if (!item) {
    return (
      <div className="page">
        <p>{m.notifications_opening()}</p>
      </div>
    )
  }

  const act = (status: 'acknowledged' | 'actioned' | 'dismissed') =>
    setStatus.mutate(
      { id, status, note },
      {
        onSuccess: () => {
          setNote('')
          if (status === 'actioned') t.success(m.notifications_marked_as_actioned())
        },
        onError: (error) => t.error(m.notifications_could_not_update_it(), { description: error instanceof ApiError ? error.message : m.notifications_please_try_again() }),
      },
    )

  const rows: [string, React.ReactNode][] = [
    [m.notifications_from(), item.source],
    ['To', item.recipient],
    [m.notifications_type(), kindLabel[item.kind] ?? item.kind],
    ...(item.recordedByName ? ([[m.notifications_recorded_by(), item.recordedByName]] as [string, string][]) : []),
    ...(item.resolution ? ([[m.notifications_outcome(), item.resolution]] as [string, string][]) : []),
    [
      m.notifications_handled(),
      item.actionedAt ? `${format(item.actionedAt, 'd MMM yyyy, HH:mm')}${item.actionedByName ? ` by ${item.actionedByName}` : ''}` : m.notifications_not_yet(),
    ],
    [m.notifications_opened_by(), item.reads.length === 0 ? m.notifications_no_one_yet() : item.reads.map((r) => `${r.officerName} (${format(r.readAt, 'd MMM, HH:mm')})`).join(', ')],
  ]

  return (
    <div className="page max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1>{item.subject}</h1>
        <p>
          {originLabel[item.origin]} · {format(item.createdAt, 'EEE d MMM yyyy, HH:mm')}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-y border-border/40 py-3">
        <Badge variant={item.status === 'new' ? 'default' : 'secondary'}>{statusLabel[item.status]}</Badge>
        <span className="flex-1" />
        {item.relatedRoute && <Button onClick={() => void navigate(parseSearchRoute(item.relatedRoute!) as never)}>{m.notifications_open_the_record()}</Button>}
        {isOpen(item) && (
          <>
            {item.status === 'new' && (
              <Button variant="secondary" disabled={setStatus.isPending} onClick={() => act('acknowledged')}>
                {m.notifications_acknowledge()}
              </Button>
            )}
            <Button variant="secondary" disabled={setStatus.isPending} onClick={() => act('actioned')}>
              {m.notifications_mark_as_actioned()}
            </Button>
            <Button variant="ghost" disabled={setStatus.isPending} onClick={() => act('dismissed')}>
              {m.notifications_dismiss()}
            </Button>
          </>
        )}
      </div>

      {item.body ? <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-card p-4">{item.body}</p> : <p>{m.notifications_there_is_no_text_with_this()}</p>}

      {isOpen(item) && <AreaField label={m.notifications_note()} value={note} onChange={setNote} description={m.notifications_optional_kept_with_the_message_when()} />}

      <table className="w-full">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="w-36 align-top text-muted-foreground">{label}</td>
              <td className="align-top">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The inbox's content view: the chosen message in full, or a quiet prompt to
 * choose one from the list in the sidebar. The list lives in the sidebar, so
 * the two never compete for the same space. */
export function InboxView({ selectedId, onSelect }: { selectedId: string | undefined; onSelect: (id: string | undefined) => void }) {
  const { data: items = [] } = useInbox()
  const [recording, setRecording] = useState(false)
  const selected = selectedId && items.some((item) => item.id === selectedId) ? selectedId : undefined
  const waiting = items.filter((item) => !item.read && isOpen(item)).length

  return (
    <>
      {selected ? (
        <Reader key={selected} id={selected} />
      ) : (
        <div className="page">
          <header className="page-header">
            <div>
              <h1>{m.notifications_inbox()}</h1>
              <p className="md:max-w-xl">
                {waiting > 0 ? m.notifications_unread_3({ waiting }) : ''}{m.notifications_choose_a_message()}
              </p>
            </div>
            <Button onClick={() => setRecording(true)}>{m.notifications_record_a_communication()}</Button>
          </header>
        </div>
      )}
      <RecordCommunication open={recording} onOpenChange={setRecording} onRecorded={(id) => onSelect(id)} />
    </>
  )
}
