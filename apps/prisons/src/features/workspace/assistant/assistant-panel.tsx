import { AiMagicIcon, ArrowDown01Icon, ArrowUp02Icon, Cancel01Icon, Copy01Icon, StopIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from 'date-fns/format'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { identityForPath } from '../tab-identity'
import { useWorkspace } from '../tabs-store'
import { m } from '@/paraglide/messages'
import type { AssistantContext, ChatMessage } from './assistant-client'
import { useAssistant } from './assistant-store'

const COMPOSER_MAX_HEIGHT = 160

/** One thing the assistant may read for the next question. On means it is
 * sent; the officer decides per question, the chip is never assumed. */
function ContextChip({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'flex max-w-full cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
        on ? 'border-primary/30 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <HugeiconsIcon icon={on ? Tick02Icon : Cancel01Icon} className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

/** Small text under a message: when it was sent, and for an answer a way to copy it. */
function MessageMeta({ message, copyable }: { message: ChatMessage; copyable: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard
      .writeText(message.text)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100 motion-reduce:transition-none">
      <time dateTime={new Date(message.at).toISOString()}>{format(message.at, 'HH:mm')}</time>
      {copyable && (
        <button type="button" onClick={copy} className="flex cursor-pointer items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3" />
          {copied ? m.assistant_copied() : m.assistant_copy()}
        </button>
      )}
    </div>
  )
}

function Message({ message, canRetry, onRetry }: { message: ChatMessage; canRetry: boolean; onRetry: () => void }) {
  if (message.role === 'assistant') {
    return (
      <div className="group/message flex gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeiconsIcon icon={AiMagicIcon} className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</div>
          <MessageMeta message={message} copyable />
        </div>
      </div>
    )
  }
  return (
    <div className="group/message flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-primary-foreground">{message.text}</div>
      {message.failed ? (
        <div className="flex items-center gap-2 text-xs text-destructive">
          {m.assistant_failed()}
          {canRetry && (
            <button type="button" onClick={onRetry} className="cursor-pointer underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/50">
              {m.assistant_retry()}
            </button>
          )}
        </div>
      ) : message.stopped ? (
        <span className="text-xs text-muted-foreground">{m.assistant_stopped()}</span>
      ) : (
        <MessageMeta message={message} copyable={false} />
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-2" role="status" aria-label={m.assistant_thinking()}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HugeiconsIcon icon={AiMagicIcon} className="size-3.5" />
      </span>
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span key={delay} style={{ animationDelay: `${delay}ms` }} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
        ))}
      </span>
    </div>
  )
}

/** The assistant, docked in the right pillar: a conversation, and under it a
 * composer that shows exactly which parts of the workspace it may read. It is
 * available on every screen, not only a prisoner's file. The reply itself
 * comes from `askAssistant`, which is not connected yet, so a question that
 * cannot be answered is marked as not sent rather than answered with
 * something invented. */
export function AssistantPanel() {
  const { messages, pending, draft, setDraft, send, retry, stop, clear } = useAssistant()
  const { tabs, activeKey, rightOpen, rightMode } = useWorkspace()
  const active = tabs.find((tab) => tab.key === activeKey)
  const identity = active ? identityForPath(active.to) : null
  const record = active && identity?.kind === 'prisoner' ? { kind: 'prisoner' as const, id: identity.recordId, name: active.title } : null

  const [withView, setWithView] = useState(true)
  const [withRecord, setWithRecord] = useState(true)
  const field = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const stuckToEnd = useRef(true)
  const [away, setAway] = useState(false)

  const context: AssistantContext = {
    view: withView && active ? { title: active.title, path: active.to } : undefined,
    record: withRecord && record ? record : undefined,
  }

  const submit = () => {
    if (!draft.trim() || pending) return
    send(draft, context)
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  // The composer grows with what is typed, up to a limit, then scrolls.
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
  }, [draft])

  // Opening the panel puts the cursor in the composer, ready to type.
  useEffect(() => {
    if (rightOpen && rightMode === 'assistant') requestAnimationFrame(() => field.current?.focus())
  }, [rightOpen, rightMode])

  // New messages follow the end of the conversation, unless the officer has
  // scrolled up to read; then a button offers the way back instead.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (stuckToEnd.current || last?.role === 'user') end.current?.scrollIntoView({ block: 'end' })
  }, [messages, pending])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stuckToEnd.current = distance < 80
    setAway(distance > 160)
  }

  const suggestions = record ? [m.assistant_suggest_record(), m.assistant_suggest_overdue()] : [m.assistant_suggest_today(), m.assistant_suggest_view()]
  const lastId = messages[messages.length - 1]?.id

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/20 px-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
          <span className="truncate">{m.assistant_not_connected()}</span>
        </span>
        {messages.length > 0 && (
          <button type="button" onClick={clear} className="shrink-0 cursor-pointer rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
            {m.assistant_new_chat()}
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="no-scrollbar h-full overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pt-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HugeiconsIcon icon={AiMagicIcon} className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h4>{m.assistant_empty_title()}</h4>
              <p>{m.assistant_empty_body()}</p>
            </div>
            <div className="flex w-full flex-col gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion)
                    field.current?.focus()
                  }}
                  className="cursor-pointer rounded-lg border border-border/60 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div role="log" aria-live="polite" aria-label={m.assistant_conversation()} className="flex flex-col gap-4">
            {messages.map((message) => (
              <Message key={message.id} message={message} canRetry={message.id === lastId && !pending} onRetry={() => retry(message.id, context)} />
            ))}
            {pending && <Thinking />}
          </div>
        )}
        <div ref={end} />
      </div>
        {away && (
          <Button
            size="icon-sm"
            variant="secondary"
            onClick={() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })}
            aria-label={m.assistant_jump_to_latest()}
            title={m.assistant_jump_to_latest()}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full shadow-md"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
          </Button>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="shrink-0 px-3 pb-3"
      >
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-2 shadow-xs transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 motion-reduce:transition-none">
          {(active || record) && (
            <div role="group" aria-label={m.assistant_context_label()} className="flex flex-wrap gap-1">
              {active && <ContextChip label={m.assistant_context_view({ title: active.title })} on={withView} onToggle={() => setWithView((on) => !on)} />}
              {record && <ContextChip label={m.assistant_context_record({ name: record.name })} on={withRecord} onToggle={() => setWithRecord((on) => !on)} />}
            </div>
          )}
          <textarea
            ref={field}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={m.assistant_composer_placeholder()}
            aria-label={m.assistant_composer_placeholder()}
            className="max-h-40 min-h-8 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{m.assistant_composer_hint()}</span>
            {pending ? (
              <Button type="button" size="icon" variant="secondary" onClick={stop} aria-label={m.assistant_stop()} title={m.assistant_stop()} className="rounded-full">
                <HugeiconsIcon icon={StopIcon} />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!draft.trim()} aria-label={m.assistant_send()} title={m.assistant_send()} className="rounded-full">
                <HugeiconsIcon icon={ArrowUp02Icon} />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
