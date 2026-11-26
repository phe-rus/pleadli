import { DocumentLibrary, DocumentSheet, useDocuments } from '@/features/documents'
import { useDecisionsForFile } from '@/features/decisions'
import { NotifyPoliceButton } from '@/features/interchange'
import { NewDocumentButton } from '@/features/templates/new-document'
import type { ProsecutionFile } from '@/features/prosecution-files'
import * as m from '@/paraglide/messages'
import { Link } from '@tanstack/react-router'
import { CountedTabs } from '@pleadli/shell'
import type { ReactNode } from 'react'

const lbl = 'text-xs font-semibold tracking-wide text-muted-foreground'

/** The Send board: the papers that go back, exactly as they print, and how
 * they go. The delivery cards come in as `delivery` so this stays free of the
 * case tab's export code. */
export function SendBoard({ file, delivery }: { file: ProsecutionFile; delivery: ReactNode }) {
  const { data: documents } = useDocuments(file.id)
  const { data: decisions } = useDecisionsForFile(file.id)
  const latest = [...decisions].sort((a, b) => b.decidedAt - a.decidedAt)[0]
  const sheets = [...documents].sort((a, b) => a.preparedAt - b.preparedAt).slice(-2)

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-[min(100%,26rem)] flex-[999_1_30rem] flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className={lbl}>{file.policeStation ? m["peruse.send_back"]({ station: file.policeStation.toUpperCase() }) : m["peruse.send_back_unknown"]()}</span>
          <NewDocumentButton fileId={file.id} decisionId={latest?.id ?? null} decisionKind={latest?.decisionType ?? null} />
        </div>
        <CountedTabs
          tabs={[
            {
              id: 'latest',
              label: m["peruse.tab_papers"](),
              count: documents.length,
              content: (
                <div className="flex flex-col gap-4">
        {sheets.length === 0 ? (
          <p className="rounded-2xl p-4 text-sm text-muted-foreground ring-1 ring-border">{m["peruse.send_no_docs"]()}</p>
        ) : (
          sheets.map((doc) => (
            <div key={doc.id} className="flex flex-col gap-1">
              <div className="max-h-[34rem] overflow-hidden rounded-xl bg-secondary/40 p-3 ring-1 ring-border/60 [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
                <DocumentSheet document={doc} />
              </div>
              <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="self-end text-sm text-primary">
                {m["peruse.send_open"]()}
              </Link>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">{m["peruse.send_sheet_note"]()}</p>

                </div>
              ),
            },
            { id: 'all', label: m["peruse.send_all_docs"](), count: documents.length, content: <DocumentLibrary fileId={file.id} /> },
          ]}
        />
      </div>

      <aside className="flex min-w-[min(100%,18rem)] flex-[1_1_18rem] flex-col gap-4 rounded-2xl bg-secondary/40 p-5 lg:max-w-80">
        <b className="text-base font-semibold">{m["peruse.send_how"]()}</b>
        {file.policeConnectionId && latest && (
          <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
            <strong className="font-semibold">{m["peruse.send_postbox"]()}</strong>
            <span className="text-sm text-muted-foreground">{m["peruse.send_postbox_about"]()}</span>
            <div>
              <NotifyPoliceButton decisionId={latest.id} />
            </div>
          </div>
        )}
        {delivery}
      </aside>
    </div>
  )
}
