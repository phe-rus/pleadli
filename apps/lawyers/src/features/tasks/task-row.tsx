import { PanelButton } from '@/components/add-panel'
import { Row } from '@/components/operational-row'
import { Tag } from '@/components/status-tag'
import { messageOf } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { TaskForm } from './task-form'
import { useRemoveTask, useSetTaskDone } from './queries'
import type { Task } from './schema'

/** One task: its title, the matter it belongs to and its due day, with the
 * button that finishes it. A duty from the state-funded scheme says so and is
 * finished, never edited or removed. */
export function TaskRow({ task, showMatter = true }: { task: Task; showMatter?: boolean }) {
  const done = useSetTaskDone()
  const remove = useRemoveTask()
  const overdue = task.doneAt == null && task.dueOn != null && task.dueOn < Date.now() - 24 * 3_600_000
  const rule = task.source === 'state_rule'

  return (
    <Row
      aligned
      marker={overdue ? 'urgent' : task.doneAt == null ? 'open' : undefined}
      title={task.title}
      summary={
        <>
          {task.dueOn ? `Due ${format(task.dueOn, 'EEE d MMM yyyy')}. ` : 'No due day. '}
          {showMatter && task.matterId && (
            <>
              <Link to="/matters/$matterId" params={{ matterId: task.matterId }} className="text-foreground">
                {task.courtNumber ?? task.matterTitle}
              </Link>
              .{' '}
            </>
          )}
          {task.detail}
        </>
      }
      trailing={
        <>
          {rule && <Tag tone="waiting">State-funded duty</Tag>}
          {overdue && <Tag tone="urgent">Overdue</Tag>}
          {!rule && task.doneAt == null && (
            <PanelButton label="Edit" title="Edit the task" description="Change the task or its due day." variant="ghost" icon={false}>
              {({ close, setDirty }) => <TaskForm existing={task} onSuccess={close} onDirtyChange={setDirty} />}
            </PanelButton>
          )}
          {!rule && (
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(task.id, { onError: (error) => t.error('Could not remove the task', { description: messageOf(error) }) })}>
              Remove
            </Button>
          )}
          <Button
            size="sm"
            variant={task.doneAt == null ? 'secondary' : 'ghost'}
            onClick={() => done.mutate({ id: task.id, done: task.doneAt == null }, { onError: (error) => t.error('Could not update the task', { description: messageOf(error) }) })}
          >
            {task.doneAt == null ? 'Done' : 'Reopen'}
          </Button>
        </>
      }
    />
  )
}
