import { assistModel, setAssistModel, useAssistModel } from './model-choice'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { listModels } from './data'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { AlertCircleIcon, ArrowUp02Icon, Cancel01Icon, Delete02Icon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { EventType, type StreamChunk } from '@tanstack/ai'
import { stream, useChat } from '@tanstack/ai-react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as z from 'zod'
import { assistContext } from './context'
import { useAssistSettings } from './queries'
import { documentOptions } from '@/features/documents/queries'
import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------- open or closed, everywhere

const KEY = 'pleadli:dpp:assist-open'
const listeners = new Set<() => void>()
function readOpen() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
let open = readOpen()
export function setAssistOpen(next: boolean | ((was: boolean) => boolean)) {
  open = typeof next === 'function' ? next(open) : next
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {}
  listeners.forEach((l) => l())
}
export function useAssistOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )
}

// ---------------------------------------------------------------- where the prosecutor is

/** The file on screen, if any, and the place in words for Assist. */
function usePlace() {
  const pathname = useLocation({ select: (l) => l.pathname })
  // On a document's page, Assist works on the file the document belongs to.
  const documentId = /^\/documents\/([^/]+)/.exec(pathname)?.[1]
  const { data: doc } = useQuery({ ...documentOptions(documentId ?? ''), enabled: Boolean(documentId) })
  return useMemo(() => {
    const file = /^\/files\/([^/]+)/.exec(pathname)?.[1] ?? doc?.prosecutionFileId
    const place = documentId && doc ? `the document "${doc.title}" of a case file` : file ? 'a case file' : pathname === '/' ? 'Today' : pathname.startsWith('/cases') ? 'the Cases board' : pathname.startsWith('/calendar') ? 'the Calendar' : pathname
    return { fileId: file ?? null, place }
  }, [pathname, documentId, doc])
}

// ---------------------------------------------------------------- the conversation

const replySchema = z.object({ text: z.string(), model: z.string() })

type Plain = { role: string; content: string }
/** Messages as plain role and text, whichever shape the chat client holds. */
function plain(messages: ReadonlyArray<unknown>): Plain[] {
  return messages
    .map((msg) => {
      const m = msg as { role: string; content?: unknown; parts?: Array<{ type: string; content?: string }> }
      const content = typeof m.content === 'string' ? m.content : (m.parts ?? []).filter((p) => p.type === 'text').map((p) => p.content ?? '').join('')
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content }
    })
    .filter((m) => m.content.trim())
}

/** The backend answers in one piece; this turns the answer into the AG-UI
 * events TanStack AI's chat client reads, so the desktop needs no streaming
 * server and the key never leaves the backend. */
function connection(fileId: string | null, place: string, model: { current: string | null }) {
  return stream(async function* (messages): AsyncIterable<StreamChunk> {
    const runId = crypto.randomUUID()
    const threadId = fileId ?? 'office'
    const messageId = crypto.randomUUID()
    yield { type: EventType.RUN_STARTED, runId, threadId } as StreamChunk
    try {
      const reply = replySchema.parse(await api('POST', '/api/assist/chat', { body: { messages: plain(messages), fileId, place, context: assistContext(fileId), model: assistModel() || undefined } }))
      model.current = reply.model
      yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as StreamChunk
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: reply.text } as StreamChunk
      yield { type: EventType.TEXT_MESSAGE_END, messageId } as StreamChunk
      yield { type: EventType.RUN_FINISHED, runId, threadId } as StreamChunk
    } catch (e) {
      yield { type: EventType.RUN_ERROR, message: e instanceof Error ? e.message : String(e) } as StreamChunk
    }
  })
}

/** Short paragraphs and dashes as a list, nothing more: answers are plain. */
function Answer({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          return (
            <ul key={i} className="flex flex-col gap-1 pl-4">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*([-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '')}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block.replace(/\*\*/g, '')}</p>
      })}
    </div>
  )
}

function Conversation({ fileId, place }: { fileId: string | null; place: string }) {
  const model = useRef<string | null>(null)
  const conn = useMemo(() => connection(fileId, place, model), [fileId, place])
  const { messages, sendMessage, isLoading, error, clear } = useChat({ connection: conn })
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Braces matter: scrollIntoView returns a Promise in current Chromium, and an effect must return nothing or a cleanup.
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, isLoading])

  const suggestions = fileId
    ? [m["assist.ask.missing"](), m["assist.ask.decide"](), m["assist.ask.law"](), m["assist.ask.next"]()]
    : [m["assist.ask.today"](), m["assist.ask.how_stage"](), m["assist.ask.limits"]()]

  const send = (text: string) => {
    if (!text.trim() || isLoading) return
    setDraft('')
    void sendMessage(text.trim())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">{fileId ? m["assist.dock.file_intro"]() : m["assist.dock.office_intro"]()}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="cursor-pointer rounded-full bg-secondary px-3 py-1 text-left text-sm hover:bg-secondary/70">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {plain(messages).map((msg, i) => (
          <div key={i} className={cn('max-w-[92%] rounded-2xl px-3 py-2', msg.role === 'user' ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-secondary/60')}>
            {msg.role === 'user' ? msg.content : <Answer text={msg.content} />}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 self-start rounded-2xl bg-secondary/60 px-3 py-2 text-muted-foreground">
            <HugeiconsIcon icon={SparklesIcon} className="size-4 animate-pulse text-primary" />
            {m["assist.thinking"]()}
          </div>
        )}
        {error && (
          <p className="not-typeset flex items-start gap-2 text-destructive">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
            {error.message}
          </p>
        )}
        <div ref={end} />
      </div>
      {messages.length > 0 && (
        <div className="flex items-center justify-between py-1 text-xs text-muted-foreground">
          <span>{model.current ? m["assist.dock.model"]({ model: model.current }) : ''}</span>
          <button type="button" onClick={clear} className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground">
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
            {m["assist.dock.clear"]()}
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-end gap-2 rounded-2xl bg-card p-2 ring-1 ring-border/60 focus-within:ring-primary/40"
      >
        <textarea
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
          placeholder={fileId ? m["assist.dock.ask_file"]() : m["assist.dock.ask_office"]()}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon-sm" disabled={!draft.trim() || isLoading} aria-label={m["assist.dock.send"]()}>
          <HugeiconsIcon icon={ArrowUp02Icon} />
        </Button>
      </form>
      <p className="pt-2 text-center text-[0.6875rem] text-muted-foreground">{m["assist.dock.footer"]({ date: formatDate(Date.now()) })}</p>
    </div>
  )
}

/** Which model answers, chosen where the asking happens. Automatic (the
 * provider's recommended model, with backups) is the default; anyone may pick
 * another from the provider's own list, and it stays chosen on this computer. */
function ModelPicker({ provider }: { provider: string }) {
  const chosen = useAssistModel()
  const { data: models = [] } = useQuery({ queryKey: ['assist', 'models', provider], queryFn: listModels, staleTime: 30 * 60_000, retry: false })
  const best = models.find((x) => x.rank === 1)
  const sorted = [...models].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.label.localeCompare(b.label))
  const items = [
    { value: 'auto', label: best ? m["assist.model.auto_with"]({ model: best.label }) : m["assist.model.auto"]() },
    ...(chosen && !models.some((x) => x.id === chosen) ? [{ value: chosen, label: chosen }] : []),
    ...sorted.map((x) => ({ value: x.id, label: x.label })),
  ]
  return (
    <Select items={items} value={chosen || 'auto'} onValueChange={(v) => setAssistModel(!v || v === 'auto' ? '' : String(v))}>
      <SelectTrigger size="sm" aria-label={m["assist.model.label"]()} className="h-7 max-w-[12rem] min-w-0 rounded-full border-0 bg-foreground/[0.05] px-2.5 text-xs shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** Assist, docked on the right of every screen, opened from the ribbon. It
 * knows where the prosecutor is: on a file it reads that file (with the law
 * and the office's history); elsewhere it answers about the office and the
 * platform. The conversation starts fresh for each file. */
export function AssistDock() {
  const isOpen = useAssistOpen()
  const { fileId, place } = usePlace()
  const { data: settings } = useAssistSettings()
  if (!isOpen) return null
  return (
    <aside aria-label={m["assist.title"]()} className="flex w-[24rem] shrink-0 flex-col gap-3 border-l border-border/40 bg-background p-3 print:hidden">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex shrink-0 items-center gap-2 text-base">
          <HugeiconsIcon icon={SparklesIcon} className="size-5 text-primary" />
          {m["assist.title"]()}
          <span className="text-xs font-normal text-muted-foreground">{fileId ? m["assist.dock.on_file"]() : m["assist.dock.on_office"]()}</span>
        </h2>
        <div className="flex min-w-0 items-center gap-1">
          {settings?.ready && <ModelPicker provider={settings.provider} />}
          <Button size="icon-sm" variant="ghost" onClick={() => setAssistOpen(false)} aria-label={m["board.close"]()}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>
      </header>
      {!settings?.ready ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-secondary/50 p-4">
          <strong>{m["assist.off_title"]()}</strong>
          <p className="text-muted-foreground">{m["assist.off_body"]()}</p>
          <Link to="/settings/$section" params={{ section: 'assist' }} className="w-fit">
            {m["assist.open_settings"]()}
          </Link>
        </div>
      ) : (
        <Conversation key={fileId ?? 'office'} fileId={fileId} place={place} />
      )}
    </aside>
  )
}
