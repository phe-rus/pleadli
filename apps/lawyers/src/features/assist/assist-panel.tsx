import { clockLabel } from '@/features/clocks'
import { useActor } from '@/features/installation'
import { useCreateDocument, useTemplateContext } from '@/features/documents'
import { matterOptions } from '@/features/matters/queries'
import { papersOptions } from '@/features/papers/data'
import { assistDraftBody } from '@/features/templates'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TASKS, type AssistAnswer, type AssistTask } from './data'
import { useAskAssist, useAssistSettings } from './queries'

const taskText: Record<AssistTask, { label: () => string; about: () => string }> = {
  summary: { label: m["assist.task.summary"], about: m["assist.task.summary_about"] },
  chronology: { label: m["assist.task.chronology"], about: m["assist.task.chronology_about"] },
  summarise_document: { label: m["assist.task.summarise_document"], about: m["assist.task.summarise_document_about"] },
  unanswered: { label: m["assist.task.unanswered"], about: m["assist.task.unanswered_about"] },
  draft: { label: m["assist.task.draft"], about: m["assist.task.draft_about"] },
  explain_clock: { label: m["assist.task.explain_clock"], about: m["assist.task.explain_clock_about"] },
  chat: { label: m["assist.task.chat"], about: m["assist.task.chat_about"] },
}

const PASTE = '__paste__'

/** Assist on one matter, in the side panel: pick what you want, give it what
 * it needs, and read a labelled draft. Nothing it writes is kept unless you
 * make a document of it, and then you edit that document. */
export function AssistPanel({ matterId, initialTask = 'summary', initialRule }: { matterId: string; initialTask?: AssistTask; initialRule?: string }) {
  const { data: settings } = useAssistSettings()
  const { data: detail } = useQuery(matterOptions(matterId))
  const actor = useActor()
  const ask = useAskAssist(matterId)
  const readPapers = (useQuery(papersOptions(matterId)).data ?? []).filter((p) => p.hasTranscript)
  const [task, setTask] = useState<AssistTask>(initialTask)
  const [documentId, setDocumentId] = useState<string>(detail?.documents[0]?.id ?? PASTE)
  const [text, setText] = useState('')
  const [rule, setRule] = useState(initialRule ?? detail?.clocks.clocks[0]?.rule ?? '')
  const { offered, context } = useTemplateContext(matterId)
  const drafts = offered.filter((tpl) => tpl.id !== 'blank')
  const [template, setTemplate] = useState(drafts[0]?.id ?? '')
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [answer, setAnswer] = useState<AssistAnswer | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  if (!settings) return null
  if (!settings.ready) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p>{m["assist.panel.not_ready"]()}</p>
        {actor?.isAdmin ? (
          <Link to="/settings/$section" params={{ section: 'assist' }} className="text-primary underline">
            {m["assist.panel.set_up"]()}
          </Link>
        ) : (
          <p className="text-muted-foreground">{m["assist.panel.ask_admin"]()}</p>
        )}
      </div>
    )
  }

  const documents = [...(detail?.documents ?? []).map((d) => ({ id: d.id, title: d.reference ? `${d.reference} · ${d.title}` : d.title })), ...readPapers.map((p) => ({ id: p.id, title: p.title }))]
  const clocks = detail?.clocks.clocks ?? []
  const needsDocument = task === 'summarise_document' || task === 'unanswered'
  const chosenTemplate = drafts.find((tpl) => tpl.id === template)
  const ready =
    (needsDocument && (documentId !== PASTE || text.trim().length > 20)) ||
    (task === 'draft' && Boolean(chosenTemplate)) ||
    (task === 'explain_clock' && Boolean(rule)) ||
    (task === 'chat' && text.trim().length > 0) ||
    task === 'summary' ||
    task === 'chronology'

  const run = () => {
    setRefusal(null)
    const messages = task === 'chat' ? [...chat, { role: 'user' as const, content: text.trim() }] : undefined
    ask.mutate(
      {
        task,
        documentId: needsDocument && documentId !== PASTE ? documentId : undefined,
        text: (needsDocument && documentId === PASTE) || task === 'draft' ? text.trim() || undefined : undefined,
        // The template's kind in words the model reads; never a translated label.
        draftKind: task === 'draft' && chosenTemplate ? chosenTemplate.kind.replace(/_/g, ' ') : undefined,
        rule: task === 'explain_clock' ? rule : undefined,
        messages,
      },
      {
        onSuccess: (a) => {
          if (task === 'chat' && messages) {
            setChat([...messages, { role: 'assistant', content: a.text ?? '' }])
            setText('')
          } else setAnswer(a)
        },
        onError: (error) => setRefusal(messageOf(error)),
      },
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div role="radiogroup" aria-label={m["assist.panel.what"]()} className="flex flex-col gap-1">
        {TASKS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={task === id}
            onClick={() => {
              setTask(id)
              setAnswer(null)
              setRefusal(null)
            }}
            className={cn('flex cursor-pointer flex-col rounded-lg px-2.5 py-1.5 text-left ring-1 transition-colors', task === id ? 'bg-primary/5 ring-primary' : 'ring-transparent hover:bg-secondary/50')}
          >
            <strong>{taskText[id].label()}</strong>
            <span className="text-muted-foreground">{taskText[id].about()}</span>
          </button>
        ))}
      </div>

      {needsDocument && (
        <label className="flex flex-col gap-1.5">
          <span>{m["assist.panel.which_document"]()}</span>
          <Select value={documentId} onValueChange={(v) => setDocumentId(v ?? PASTE)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => (v === PASTE ? m["assist.panel.paste"]() : documents.find((d) => d.id === v)?.title ?? '')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {documents.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}
                  </SelectItem>
                ))}
                <SelectItem value={PASTE}>{m["assist.panel.paste"]()}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
      )}
      {needsDocument && documentId === PASTE && (
        <label className="flex flex-col gap-1.5">
          <span>{m["assist.panel.paste_label"]()}</span>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" />
        </label>
      )}

      {task === 'draft' && (
        <>
          <label className="flex flex-col gap-1.5">
            <span>{m["assist.panel.draft_what"]()}</span>
            <Select value={template} onValueChange={(v) => setTemplate(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => drafts.find((tpl) => tpl.id === v)?.label() ?? ''}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {drafts.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.label()}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span>{m["assist.panel.facts"]()}</span>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" placeholder={m["assist.panel.facts_placeholder"]()} />
          </label>
        </>
      )}

      {task === 'explain_clock' &&
        (clocks.length ? (
          <label className="flex flex-col gap-1.5">
            <span>{m["assist.panel.which_deadline"]()}</span>
            <Select value={rule} onValueChange={(v) => setRule(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => clockLabel(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clocks.map((c) => (
                    <SelectItem key={c.rule} value={c.rule}>
                      {clockLabel(c.rule)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        ) : (
          <p className="text-muted-foreground">{m["assist.panel.no_deadlines"]()}</p>
        ))}

      {task === 'chat' && (
        <div className="flex flex-col gap-2">
          {chat.map((turn, i) => (
            <div key={i} className={cn('rounded-lg p-2.5', turn.role === 'user' ? 'ml-8 bg-primary/5' : 'mr-8 bg-secondary/50')}>
              <Paragraphs text={turn.content} />
            </div>
          ))}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-20" placeholder={m["assist.panel.chat_placeholder"]()} />
        </div>
      )}

      <Button className="w-fit" disabled={!ready || ask.isPending} onClick={run}>
        {ask.isPending ? m["assist.panel.working"]() : task === 'chat' ? m["assist.panel.send"]() : m["assist.panel.ask"]()}
      </Button>

      {refusal && (
        <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
          {refusal}
        </p>
      )}

      {answer && task !== 'chat' && <AnswerView matterId={matterId} answer={answer} kind={chosenTemplate?.kind ?? 'general'} context={context} />}
    </div>
  )
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p.trim()}
          </p>
        ))}
    </>
  )
}

function AnswerView({
  matterId,
  answer,
  kind,
  context,
}: {
  matterId: string
  answer: AssistAnswer
  kind: string
  context: () => Parameters<typeof assistDraftBody>[0]
}) {
  const create = useCreateDocument()
  const navigate = useNavigate()
  const copy = () => {
    const lines = answer.text ?? (answer.draft ? answer.draft.paragraphs.map((p, i) => `${i + 1}. ${p}`).join('\n') : answer.points.map((p) => [p.date, p.text, p.source && `(${p.source})`].filter(Boolean).join(' ')).join('\n'))
    void navigator.clipboard?.writeText(lines).then(() => t.success(m["assist.panel.copied"]()))
  }
  const makeDocument = () => {
    if (!answer.draft) return
    const body = assistDraftBody(context(), kind, answer.draft.title, answer.draft.paragraphs)
    create.mutate(
      { matterId, kind, title: answer.draft.title, body },
      {
        onSuccess: (document) => {
          t.success(m["document.form.started"]())
          void navigate({ to: '/documents/$documentId', params: { documentId: document.id } })
        },
        onError: (error) => t.error(m["document.form.start_failed"](), { description: messageOf(error) }),
      },
    )
  }

  return (
    <section aria-label={m["assist.panel.answer"]()} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-border">
      <p className="text-muted-foreground">{m["assist.panel.label"]({ model: answer.model })}</p>
      {answer.text && <Paragraphs text={answer.text} />}
      {answer.points.length > 0 && (
        <ol className="flex flex-col gap-2 pl-5">
          {answer.points.map((p, i) => (
            <li key={i}>
              {p.date && <strong>{p.date}: </strong>}
              {p.text}
              {p.source && <span className="text-muted-foreground"> ({p.source})</span>}
            </li>
          ))}
        </ol>
      )}
      {answer.draft && (
        <>
          <strong>{answer.draft.title}</strong>
          <ol className="flex flex-col gap-2 pl-5">
            {answer.draft.paragraphs.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </>
      )}
      {!answer.text && !answer.points.length && !answer.draft && <p>{m["assist.panel.empty"]()}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          {m["assist.panel.copy"]()}
        </Button>
        {answer.draft && (
          <Button size="sm" disabled={create.isPending} onClick={makeDocument}>
            {m["assist.panel.make_document"]()}
          </Button>
        )}
      </div>
    </section>
  )
}
