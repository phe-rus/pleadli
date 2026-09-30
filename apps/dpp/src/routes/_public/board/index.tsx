import * as m from '@/paraglide/messages'
import { Board, tasksOptions } from '@/features/board'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/board/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...tasksOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The office's tasks as a board: to do, doing, waiting on Police, waiting
 * on the court, done. */
function RouteComponent() {
  return (
    <article className="page flex min-h-0 flex-1 flex-col">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.board"]()}</h1>
          <p>{m["page.board.about"]()}</p>
        </div>
      </header>
      <Board />
    </article>
  )
}
