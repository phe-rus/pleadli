import { Folder01Icon, File01Icon, Search01Icon, AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@pleadli/ui/dropdown-menu'
import { Input } from '@pleadli/ui/input'
import { useCallback, useEffect, useMemo, useState } from 'react'

/** One record in the institution's records folder, as the Library lists it. */
export type LibraryRecord = {
  id: string
  kind: string
  reference: string
  title: string
  updatedAt: number
  folder: string
  intact: boolean
}

export type LibraryOverview = {
  path: string
  records: LibraryRecord[]
  conflicts: number
  changedOutside: number
  addedOutside: number
  locked: boolean
  /** An institution is in this folder that this computer has not restored. */
  restore?: { institution: string; records: number; lastSaved: number } | null
}

export type RecoverSummary = { recordsFound: number; rowsRestored: number; attachmentsRestored: number; skipped: string[] }

export type RecordsLibraryLabels = {
  search: string
  empty: string
  noMatch: string
  folder: string
  saveNow: string
  saved: string
  recover: string
  recoverTitle: string
  recoverBody: string
  recoverPhrase: string
  recoverRun: string
  recovered: (s: RecoverSummary) => string
  locked: string
  changedOutside: (n: number) => string
  conflicts: (n: number) => string
  open: string
  showFolder: string
  close: string
  noPaper: string
  failed: string
  /** "X was found in this folder", shown when this computer has not restored it. */
  restoreFound?: (institution: string, records: number) => string
  more?: string
  /** Names of each kind of record, in the order the tabs show them. */
  kinds: { kind: string; label: string }[]
}

/**
 * The Library: the institution's own records, read from its records folder. It shows what is on
 * disk (cases, files, prisoners), finds them, shows the paper of each, and is the way back in
 * when the database is lost. It keeps no folders of its own.
 */
export function RecordsLibrary({
  labels,
  load,
  loadPaper,
  saveNow,
  recover,
  onOpen,
  onShowFolder,
  formatDate,
}: {
  labels: RecordsLibraryLabels
  load: () => Promise<LibraryOverview>
  loadPaper: (id: string) => Promise<string | null>
  saveNow: () => Promise<unknown>
  recover: (phrase?: string) => Promise<RecoverSummary>
  /** Opens the record's working screen (the case, the file, the prisoner), when it has one. */
  onOpen?: (record: LibraryRecord) => void
  onShowFolder?: (path: string) => void
  formatDate: (ms: number) => string
}) {
  const [overview, setOverview] = useState<LibraryOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState(labels.kinds[0]?.kind ?? '')
  const [shown, setShown] = useState<LibraryRecord | null>(null)
  const [paper, setPaper] = useState<string | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const reload = useCallback(() => {
    load().then((o) => { setOverview(o); setError(null) }).catch((e) => setError(String(e?.message ?? e)))
  }, [load])
  useEffect(reload, [reload])

  useEffect(() => {
    setPaper(undefined)
    if (shown) loadPaper(shown.id).then(setPaper).catch(() => setPaper(null))
  }, [shown, loadPaper])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of overview?.records ?? []) c[r.kind] = (c[r.kind] ?? 0) + 1
    return c
  }, [overview])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (overview?.records ?? [])
      .filter((r) => labels.kinds.some((k) => k.kind === r.kind))
      .filter((r) => (needle ? [r.reference, r.title].some((s) => s.toLowerCase().includes(needle)) : r.kind === kind))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [overview, query, kind])

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setNote(null)
    try {
      const said = await fn()
      if (said) setNote(said)
      reload()
    } catch (e) {
      setNote(String((e as Error)?.message ?? e) || labels.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-9 min-w-56 max-w-sm flex-1 items-center gap-2 rounded-lg bg-foreground/[0.045] px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
          <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        {!query && (
          <div role="tablist" className="flex items-center gap-1">
            {labels.kinds.map((k) => (
              <button
                key={k.kind}
                role="tab"
                aria-selected={kind === k.kind}
                onClick={() => setKind(k.kind)}
                className={`rounded-md px-2.5 py-1.5 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${kind === k.kind ? 'bg-foreground/[0.07] font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {k.label}
                <span className="ml-1.5 text-muted-foreground tabular-nums">{counts[k.kind] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="ghost" aria-label={labels.more ?? "…"} disabled={busy}>…</Button>} />
            <DropdownMenuContent align="end">
              {overview && onShowFolder && <DropdownMenuItem onClick={() => onShowFolder(overview.path)}>{labels.showFolder}</DropdownMenuItem>}
              <DropdownMenuItem disabled={overview?.locked} onClick={() => run(async () => { await saveNow(); return labels.saved })}>{labels.saveNow}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setPhrase(''); setRecovering(true) }}>{labels.recover}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {overview?.restore && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/8 px-4 py-3">
          <p className="text-[0.875rem] text-foreground">{labels.restoreFound ? labels.restoreFound(overview.restore.institution, overview.restore.records) : overview.restore.institution}</p>
          <Button size="sm" disabled={busy} onClick={() => { setPhrase(''); setRecovering(true) }}>{labels.recover}</Button>
        </div>
      )}
      {overview?.locked && (
        <p className="flex items-center gap-2 text-[0.8125rem] text-foreground">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 text-amber-600" /> {labels.locked}
        </p>
      )}
      {overview && (overview.changedOutside > 0 || overview.conflicts > 0) && (
        <p className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0" />
          {[overview.changedOutside > 0 && labels.changedOutside(overview.changedOutside), overview.conflicts > 0 && labels.conflicts(overview.conflicts)].filter(Boolean).join(' · ')}
        </p>
      )}
      {note && <p className="text-[0.8125rem] text-muted-foreground" role="status">{note}</p>}
      {error && <p className="text-[0.8125rem] text-destructive" role="alert">{error}</p>}

      {overview && rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{query ? labels.noMatch : labels.empty}</p>}

      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => setShown(r)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <HugeiconsIcon icon={r.kind === 'station' ? File01Icon : Folder01Icon} className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[0.875rem] font-medium text-foreground">{r.reference || r.title}</span>
                {r.reference && <span className="truncate text-[0.8125rem] text-muted-foreground">{r.title}</span>}
              </span>
              {!r.intact && <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 text-amber-600" aria-label={labels.changedOutside(1)} />}
              <span className="shrink-0 text-[0.75rem] text-muted-foreground tabular-nums">{r.updatedAt ? formatDate(r.updatedAt) : ''}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!shown} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{shown?.reference || shown?.title}</DialogTitle>
            {shown?.reference && <DialogDescription>{shown.title}</DialogDescription>}
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-lg bg-foreground/[0.035] p-4 text-[0.8125rem] leading-relaxed text-foreground">
            {paper === undefined ? null : paper === null ? labels.noPaper : <Paper text={paper} />}
          </div>
          <DialogFooter>
            {shown && onShowFolder && (
              <Button variant="ghost" onClick={() => onShowFolder(shown.folder)}>{labels.showFolder}</Button>
            )}
            {shown && onOpen && shown.kind !== 'station' && <Button onClick={() => { onOpen(shown); setShown(null) }}>{labels.open}</Button>}
            <Button variant="secondary" onClick={() => setShown(null)}>{labels.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recovering} onOpenChange={setRecovering}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.recoverTitle}</DialogTitle>
            <DialogDescription>{labels.recoverBody}</DialogDescription>
          </DialogHeader>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={labels.recoverPhrase} aria-label={labels.recoverPhrase} autoComplete="off" spellCheck={false} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRecovering(false)}>{labels.close}</Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const s = await recover(phrase.trim() || undefined)
                  setRecovering(false)
                  // Every open screen was read before the records came back; start them again.
                  if (s.rowsRestored > 0) window.setTimeout(() => window.location.reload(), 1800)
                  return labels.recovered(s)
                })
              }
            >
              {labels.recoverRun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The record's Markdown paper, shown as a paper: headings, fields, rules. Only the few shapes the
 * records folder writes, so nothing here can run or fetch anything. */
function Paper({ text }: { text: string }) {
  const blocks = text.split('\n')
  return (
    <div className="flex flex-col gap-1.5">
      {blocks.map((line, i) => {
        if (!line.trim()) return null
        if (line.startsWith('# ')) return <h3 key={i} className="text-[0.9375rem] font-semibold">{line.slice(2)}</h3>
        if (line.startsWith('## ')) return <h4 key={i} className="mt-2 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{line.slice(3)}</h4>
        if (line.trim() === '---') return <hr key={i} className="my-2 border-border/60" />
        const field = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(line)
        if (field) return (
          <p key={i} className="flex gap-3">
            <span className="w-32 shrink-0 text-muted-foreground">{field[1]}</span>
            <span className="min-w-0 break-words">{field[2]}</span>
          </p>
        )
        if (line.startsWith('- ')) return <p key={i} className="pl-3">{line.slice(2)}</p>
        return <p key={i}>{line.replace(/\*\*/g, '')}</p>
      })}
    </div>
  )
}
