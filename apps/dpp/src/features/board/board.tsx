import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Add01Icon, Delete02Icon, SparklesIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { Textarea } from '@pleadli/ui/textarea'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { taskStatuses, type Task, type TaskStatus } from './data'
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from './queries'

export const statusLabel = (status: TaskStatus) =>
  ({
    todo: m["board.col.todo"],
    doing: m["board.col.doing"],
    waiting_police: m["board.col.waiting_police"],
    waiting_court: m["board.col.waiting_court"],
    done: m["board.col.done"],
  })[status]()

const DAY = 86_400_000

function dueTone(dueAt: number | null, done: boolean) {
  if (!dueAt || done) return 'text-muted-foreground'
  if (dueAt < Date.now() - DAY / 2) return 'text-destructive'
  if (dueAt < Date.now() + 2 * DAY) return 'text-amber-600 dark:text-amber-400'
  return 'text-muted-foreground'
}

/** A date input's value from a timestamp, and back (noon, so time zones never
 * move the day). */
const toDay = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : '')
const fromDay = (v: string) => (v ? new Date(`${v}T12:00:00`).getTime() : null)

/** One task as a card. Clicking it opens its details in place: note, due
 * date, delete. A task Assist proposed says so until someone keeps it. */
export function TaskCard({ task, showFile = true, draggable = true }: { task: Task; showFile?: boolean; draggable?: boolean }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(task.note ?? '')
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const done = task.status === 'done'

  return (
    <div
      draggable={draggable && !open}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task', task.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'group/task flex flex-col gap-2 rounded-xl bg-card p-3 shadow-xs ring-1 ring-border/60 transition-shadow hover:shadow-sm',
        task.proposed && 'ring-dashed bg-primary/5 ring-primary/40',
        draggable && !open && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={done ? m["board.reopen"]() : m["board.mark_done"]()}
          onClick={() => update.mutate({ id: task.id, change: { status: done ? 'todo' : 'done', keep: true } })}
          className={cn(
            'mt-0.5 flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 transition-colors',
            done ? 'bg-primary text-primary-foreground ring-primary' : 'ring-border hover:ring-foreground/40',
          )}
        >
          {done && <HugeiconsIcon icon={Tick02Icon} className="size-3" />}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn('min-w-0 flex-1 cursor-pointer text-left', done && 'text-muted-foreground line-through')}>
          {task.title}
        </button>
      </div>

      {(task.proposed || (showFile && task.fileTitle) || task.dueAt) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6.5 text-xs">
          {task.proposed && (
            <span className="inline-flex items-center gap-1 text-primary">
              <HugeiconsIcon icon={SparklesIcon} className="size-3" />
              {m["board.suggested"]()}
            </span>
          )}
          {showFile && task.fileTitle && task.prosecutionFileId && (
            <Link to="/files/$fileId" params={{ fileId: task.prosecutionFileId }} className="max-w-full truncate text-muted-foreground no-underline hover:text-foreground">
              {task.fileReference ?? task.fileTitle}
            </Link>
          )}
          {task.dueAt && <span className={dueTone(task.dueAt, done)}>{m["board.due"]({ date: formatDate(task.dueAt) })}</span>}
        </div>
      )}

      {task.proposed && !open && (
        <div className="flex gap-2 pl-6.5">
          <Button size="xs" onClick={() => update.mutate({ id: task.id, change: { keep: true } })}>
            {m["board.keep"]()}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => remove.mutate(task.id)}>
            {m["board.dismiss"]()}
          </Button>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 pl-6.5">
          <Textarea
            value={note}
            placeholder={m["board.note_placeholder"]()}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (task.note ?? '') && update.mutate({ id: task.id, change: { note: note.trim() || null } })}
            className="min-h-16"
          />
          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {m["board.due_label"]()}
            <Input type="date" className="h-8 w-40" value={toDay(task.dueAt)} onChange={(e) => update.mutate({ id: task.id, change: { dueAt: fromDay(e.target.value) } })} />
          </label>
          <div className="flex justify-between gap-2">
            <Button size="xs" variant="ghost" onClick={() => remove.mutate(task.id)} className="text-destructive">
              <HugeiconsIcon icon={Delete02Icon} />
              {m["board.delete"]()}
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setOpen(false)}>
              {m["board.close"]()}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Type a task and press Enter. */
export function AddTask({ fileId, status = 'todo', autoFocus = false }: { fileId?: string; status?: TaskStatus; autoFocus?: boolean }) {
  const [title, setTitle] = useState('')
  const create = useCreateTask()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        create.mutate({ title: title.trim(), status, prosecutionFileId: fileId ?? null }, { onSuccess: () => setTitle('') })
      }}
      className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-transparent transition-colors focus-within:bg-card focus-within:ring-border/60"
    >
      <HugeiconsIcon icon={Add01Icon} className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={title}
        autoFocus={autoFocus}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={m["board.add_placeholder"]()}
        aria-label={m["board.add_placeholder"]()}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </form>
  )
}

/** The office's tasks in five columns. Drag a card to move it. */
export function Board() {
  const { data: tasks = [] } = useTasks()
  const update = useUpdateTask()
  const [over, setOver] = useState<TaskStatus | null>(null)

  return (
    <div className="no-scrollbar -mx-2 flex min-h-0 flex-1 gap-3 overflow-x-auto px-2 pb-4">
      {taskStatuses.map((status) => {
        const column = tasks.filter((t) => t.status === status).sort((a, b) => Number(b.proposed) - Number(a.proposed) || a.position - b.position)
        return (
          <section
            key={status}
            aria-label={statusLabel(status)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(status)
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = e.dataTransfer.getData('text/task')
              const task = tasks.find((t) => t.id === id)
              if (task && task.status !== status) {
                const last = Math.max(0, ...column.map((t) => t.position))
                update.mutate({ id, change: { status, position: last + 1, keep: true } })
              }
            }}
            className={cn(
              'flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-secondary/50 p-2 transition-colors motion-reduce:transition-none',
              over === status && 'bg-primary/10 ring-1 ring-primary/30',
            )}
          >
            <header className="flex items-center justify-between px-2 pt-1">
              <h2 className="text-sm">{statusLabel(status)}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{column.length}</span>
            </header>
            {status === 'todo' && <AddTask />}
            <div className="flex flex-col gap-2">
              {column.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
              {column.length === 0 && status !== 'todo' && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{m["board.empty_column"]()}</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** A file's own tasks, compact, for the file workspace. */
export function FileTasks({ fileId }: { fileId: string }) {
  const { data: tasks = [] } = useTasks(fileId)
  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')
  return (
    <div className="flex flex-col gap-2">
      {open.map((task) => (
        <TaskCard key={task.id} task={task} showFile={false} draggable={false} />
      ))}
      <AddTask fileId={fileId} />
      {done.length > 0 && <p className="px-3 text-xs text-muted-foreground">{m["board.done_count"]({ count: done.length })}</p>}
    </div>
  )
}
