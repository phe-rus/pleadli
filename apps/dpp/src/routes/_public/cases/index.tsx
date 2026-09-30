import * as m from '@/paraglide/messages'
import { boardOptions, CaseBoard } from '@/features/pipeline'
import { ProsecutionFileForm } from '@/features/prosecution-files'
import { PanelButton } from '@/components/add-panel'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/cases/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...boardOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** The office's cases as a board of the seven stages. */
function RouteComponent() {
  const navigate = useNavigate()
  return (
    <article className="page flex min-h-0 flex-1 flex-col">
      <header className="page-header">
        <div>
          <h1>{m["nav.item.cases"]()}</h1>
          <p>{m["page.cases.about"]()}</p>
        </div>
        <div className="page-actions">
          <Link to="/files" search={{ view: 'all' }} className="text-sm">
            {m["cases.as_list"]()}
          </Link>
          <PanelButton label={m["workspace.quick.open_file"]()} title={m["workspace.quick.open_file"]()} description={m["workspace.quick.open_file_description"]()} variant="default">
            {({ close, setDirty }) => (
              <ProsecutionFileForm
                onDirtyChange={setDirty}
                onSuccess={(file) => {
                  close()
                  void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>
      <CaseBoard />
    </article>
  )
}
