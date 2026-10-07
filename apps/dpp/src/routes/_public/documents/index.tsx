import * as m from '@/paraglide/messages'
import { VerifyDocument } from '@/features/documents/seals'
import { DocumentLibrary, documentsOptions } from '@/features/documents'
import { decisionsOptions } from '@/features/decisions'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@pleadli/ui/dialog'

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
          <h1>{m["nav.item.documents"]()}</h1>
          <p>{m["page.documents.about"]()}</p>
        </div>
        <div className="page-actions">
          {/* Checking a paper someone hands you is occasional: a sheet, not a form on the page. */}
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="secondary">{m["doc.verify_button"]()}</Button>} />
            <DialogContent className="sm:max-w-lg">
              <VerifyDocument />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <DocumentLibrary />
    </article>
  )
}
