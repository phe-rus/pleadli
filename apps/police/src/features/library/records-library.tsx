import * as m from '@/paraglide/messages'
import { api } from '@/lib/api'
import { format } from '@/lib/date'
import { RecordsLibrary, type LibraryOverview, type LibraryRecord, type RecoverSummary } from '@pleadli/shell/view'
import { useNavigate } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useCallback, useMemo } from 'react'

const post = (path: string, body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) })

/** The Library: the station's own records, read from the records folder in its Documents. */
export function PoliceRecordsLibrary() {
  const navigate = useNavigate()
  const load = useCallback(() => api('/records') as Promise<LibraryOverview>, [])
  const loadPaper = useCallback((id: string) => api(`/records/paper?id=${encodeURIComponent(id)}`) as Promise<string | null>, [])
  const saveNow = useCallback(() => post('/records/sync', {}), [])
  const recover = useCallback(async (phrase?: string) => (await post('/records/recover', { phrase })) as RecoverSummary, [])

  const labels = useMemo(
    () => ({
      search: m['records.search'](),
      empty: m['records.empty'](),
      noMatch: m['records.no_match'](),
      folder: m['records.show_folder'](),
      saveNow: m['records.save_now'](),
      saved: m['records.saved'](),
      recover: m['records.recover'](),
      recoverTitle: m['records.recover_title'](),
      recoverBody: m['records.recover_body'](),
      recoverPhrase: m['records.recover_phrase'](),
      recoverRun: m['records.recover_run'](),
      recovered: (s: RecoverSummary) =>
        s.skipped.length
          ? m['records.recovered_skipped']({ records: s.recordsFound, rows: s.rowsRestored, files: s.attachmentsRestored, skipped: s.skipped.length })
          : m['records.recovered']({ records: s.recordsFound, rows: s.rowsRestored, files: s.attachmentsRestored }),
      locked: m['records.locked'](),
      changedOutside: (n: number) => m['records.changed_outside']({ n }),
      conflicts: (n: number) => m['records.conflicts']({ n }),
      open: m['records.open'](),
      showFolder: m['records.show_folder'](),
      close: m['records.close'](),
      noPaper: m['records.no_paper'](),
      failed: m['records.failed'](),
      restoreFound: (institution: string, records: number) => m['records.restore_found']({ institution, records }),
      more: m['records.more'](),
      kinds: [
        { kind: 'cases', label: m['records.kind_cases']() },
        { kind: 'people', label: m['records.kind_people']() },
      ],
    }),
    [],
  )

  const open = (r: LibraryRecord) => {
    if (r.kind === 'cases') void navigate({ to: '/investigations/$caseId', params: { caseId: r.id } })
    else if (r.kind === 'people') void navigate({ to: '/search/people/$personId', params: { personId: r.id } })
  }
  const show = isTauri()
    ? async (path: string) => {
        const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
        await revealItemInDir(path)
      }
    : undefined

  return <RecordsLibrary labels={labels} load={load} loadPaper={loadPaper} saveNow={saveNow} recover={recover} onOpen={open} onShowFolder={show} formatDate={(ms) => format(ms, 'd MMM yyyy')} />
}
