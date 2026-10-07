import { PanelButton } from '@/components/add-panel'
import { RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { isTaskView, TaskForm, TaskRow, taskViews, tasksOptions, useTasks, type TaskViewId } from '@/features/tasks'
import * as m from '@/paraglide/messages'
import { Task01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

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
  const navigate = useNavigate({ from: Route.fullPath })
  const { view = 'open' } = Route.useSearch()
  const { data: tasks } = useTasks(view)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.tasks"]()}</h1>
          <p>{m["tasks.lead"]()}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["tasks.add"]()} title={m["tasks.add"]()} description={m["tasks.add_description"]()} variant="default">
            {({ close, setDirty }) => <TaskForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <Segmented
        label={m["tasks.views"]()}
        value={view}
        onChange={(v) => void navigate({ search: { view: v }, replace: true })}
        className="self-start"
        items={taskViews.map((item) => ({ value: item.id, label: item.label }))}
      />

      {tasks.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Task01Icon} />}>{view === 'done' ? m["tasks.none_done"]() : m["tasks.none_due"]()}</EmptyNote>
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
