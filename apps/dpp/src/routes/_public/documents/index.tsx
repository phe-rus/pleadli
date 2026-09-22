import { Planned } from '@/components/planned'
import { DocumentLibrary, documentKinds, documentsOptions } from '@/features/documents'
import { decisionsOptions } from '@/features/decisions'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/documents/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...documentsOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...decisionsOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/** The official documents DPP produces from its own record. Each is prepared
 * from a decision as a draft, read, then issued, after which it is frozen. Each
 * prints, saves as PDF through the print dialog, and downloads as DOCX or
 * Markdown. */
function RouteComponent() {
  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Documents</h1>
          <p>Prepared from a decision, read first, then issued. An issued document is frozen and carries its reference.</p>
        </div>
      </header>

      <DocumentLibrary />

      <Planned title="Kinds of document" covers={documentKinds.map((k) => `${k.label}: ${k.about}`)}>
        These are the documents the product documentation names.
      </Planned>
      <Planned title="Not yet" covers={['Legal opinion', 'Indictment', 'Case summary', 'Decision notice', 'Court-related documents']}>
        No template for these is fixed by the research yet, so none is invented.
      </Planned>
    </article>
  )
}
