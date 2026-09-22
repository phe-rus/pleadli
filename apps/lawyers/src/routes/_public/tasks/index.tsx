import { PanelButton } from '@/components/add-panel'
import { RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { isTaskView, TaskForm, TaskRow, taskViews, tasksOptions, useTasks, type TaskViewId } from '@/features/tasks'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/tasks/')({
  validateSearch: (search: Record<string, unknown>): { view?: TaskViewId } => (isTaskView(search.view) ? { view: search.view } : {}),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'open' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...tasksOptions(deps.view), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Every task, yours and those the state-funded scheme's rules make for an
 * appointed matter, earliest due first. Weekends are skipped when a day is worked
 * out from the rules; public holidays are not, so check a day that falls near one. */
function RouteComponent() {
  const { view = 'open' } = Route.useSearch()
  const { data: tasks } = useTasks(view)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Tasks</h1>
          <p>What is due, earliest first. Duties of a state-appointed matter are made for you and marked as such.</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Add a task" title="Add a task" description="Something to do, with a due day if it has one." variant="default">
            {({ close, setDirty }) => <TaskForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <nav aria-label="Views of the tasks" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {taskViews.map((item) => (
          <Link
            key={item.id}
            to="/tasks"
            search={{ view: item.id }}
            replace
            aria-current={item.id === view ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3 py-1.5 no-underline',
              item.id === view ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tasks.length === 0 ? (
        <EmptyNote>{view === 'done' ? 'No task has been finished yet.' : 'Nothing is due. Add a task, or open a state-appointed matter to see its duties.'}</EmptyNote>
      ) : (
        <RowList>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </RowList>
      )}
    </article>
  )
}
