import { m } from '@/paraglide/messages'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { RecordsLibrary, type LibraryOverview, type LibraryRecord, type RecoverSummary } from '@pleadli/shell/view'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useCallback, useMemo } from 'react'

export const Route = createFileRoute('/_public/library/')({ component: RouteComponent })

/** The Library: the facility's own records, read from the records folder in its Documents. It is
 * for finding what the facility has already recorded. Documents are prepared inside each record. */
function RouteComponent() {
  const navigate = useNavigate()
  const load = useCallback(() => api('GET', '/api/records') as Promise<LibraryOverview>, [])
  const loadPaper = useCallback((id: string) => api('GET', '/api/records/paper', { query: { id } }) as Promise<string | null>, [])
  const saveNow = useCallback(() => api('POST', '/api/records/sync', { body: {} }), [])
  const recover = useCallback(async (phrase?: string) => (await api('POST', '/api/records/recover', { body: { phrase } })) as RecoverSummary, [])

  const labels = useMemo(
    () => ({
      search: m.records_search(),
      empty: m.records_empty(),
      noMatch: m.records_no_match(),
      folder: m.records_show_folder(),
      saveNow: m.records_save_now(),
      saved: m.records_saved(),
      recover: m.records_recover(),
      recoverTitle: m.records_recover_title(),
      recoverBody: m.records_recover_body(),
      recoverPhrase: m.records_recover_phrase(),
      recoverRun: m.records_recover_run(),
      recovered: (s: RecoverSummary) =>
        s.skipped.length
          ? m.records_recovered_skipped({ records: s.recordsFound, rows: s.rowsRestored, files: s.attachmentsRestored, skipped: s.skipped.length })
          : m.records_recovered({ records: s.recordsFound, rows: s.rowsRestored, files: s.attachmentsRestored }),
      locked: m.records_locked(),
      changedOutside: (n: number) => m.records_changed_outside({ n }),
      conflicts: (n: number) => m.records_conflicts({ n }),
      open: m.records_open(),
      showFolder: m.records_show_folder(),
      close: m.records_close(),
      noPaper: m.records_no_paper(),
      failed: m.records_failed(),
      restoreFound: (institution: string, records: number) => m.records_restore_found({ institution, records }),
      more: m.records_more(),
      kinds: [
        { kind: 'prisoners', label: m.records_kind_prisoners() },
      ],
    }),
    [],
  )

  const open = (r: LibraryRecord) => {
    if (r.kind === 'prisoners') void navigate({ to: '/prisoners/$prisonerId', params: { prisonerId: r.id } })
  }
  const show = isTauri()
    ? async (path: string) => {
        const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
        await revealItemInDir(path)
      }
    : undefined

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.records_title()}</h1>
        </div>
      </header>
      <RecordsLibrary labels={labels} load={load} loadPaper={loadPaper} saveNow={saveNow} recover={recover} onOpen={open} onShowFolder={show} formatDate={(ms) => format(ms, 'd MMM yyyy')} />
    </article>
  )
}
