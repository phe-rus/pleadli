import { api } from '@/lib/api'
import { evidenceForFileOptions } from '@/features/evidence/queries'
import { useFileItems } from '@/features/file-index/queries'
import { statementRoleLabel } from '@/features/statements'
import { statementsForFileOptions } from '@/features/statements/queries'
import { useBrand } from '@/features/installation'
import { offenceSchema } from '@/features/guide/data'
import { formatDate } from '@/lib/dates'
import { ageLabel } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'
import { ApiError } from '@/lib/api'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import * as z from 'zod'
import type { FileSummary } from '@/features/prosecution-files'
import type { IncomingSummary } from './schema'

const lbl = 'text-xs font-semibold tracking-wide text-muted-foreground'

type Have = { charges: number; roles: Record<string, number>; evidence: number; titles: string[] }
export type PaperState = 'found' | 'missing' | 'check'

/** Whether one line of the guide's "papers usually needed" is in the file. Only
 * what the file records in structure is judged: a charge, a statement by role,
 * an exhibit, or a scan whose title says so. Anything else is left to the
 * prosecutor ("check") rather than guessed. */
export function paperState(line: string, have: Have): PaperState {
  const l = line.toLowerCase()
  const role = (...r: string[]) => (r.some((x) => (have.roles[x] ?? 0) > 0) ? 'found' : 'missing')
  const titled = (re: RegExp) => (have.titles.some((t) => re.test(t)) ? 'found' : 'missing')
  if (l.includes('charge sheet')) return have.charges > 0 || have.titles.some((t) => /charge/i.test(t)) ? 'found' : 'missing'
  if (l.includes('statement of the accused')) return role('accused')
  if (l.includes('officer')) return role('arresting_officer', 'investigating_officer')
  if (/complainant|taken from|occupant|owner or keeper|in possession/.test(l)) return role('complainant')
  if (/saw|other people said/.test(l)) return role('witness')
  if (l.includes('exhibit')) return have.evidence > 0 || have.titles.some((t) => /exhibit/i.test(t)) ? 'found' : 'missing'
  if (l.includes('medical')) return titled(/medical|pf ?3|examination/i)
  return 'check'
}

const mark: Record<PaperState, { sign: string; cls: string }> = {
  found: { sign: '✓', cls: 'text-green-700' },
  missing: { sign: '✗', cls: 'text-[#9a3a00]' },
  check: { sign: '–', cls: 'text-muted-foreground' },
}

function useGuideForFile(fileId: string | undefined) {
  const { data: brand } = useBrand()
  const jurisdiction = brand?.jurisdiction ?? undefined
  return useQuery({
    queryKey: ['guide-for-file', fileId, jurisdiction] as const,
    queryFn: async () => z.array(offenceSchema).parse(await api('GET', '/api/guide/for-file', { query: { fileId: fileId!, jurisdiction: jurisdiction! } })),
    enabled: !!fileId && !!jurisdiction,
  })
}

/** Taking a file in: the ODPP number (suggested from the office's own last
 * number, to confirm or change), your name on it, and the received stamp on the
 * incoming register. Then the file opens. */
function ReceiveFile({ file }: { file: FileSummary }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const needsNumber = !file.odppRegistrationNumber
  const { data: suggestion } = useQuery({
    queryKey: ['registry', 'next-number'] as const,
    queryFn: async () => z.string().nullable().parse(await api('GET', '/api/registry/next-number')),
    enabled: needsNumber,
  })
  const [number, setNumber] = useState('')
  useEffect(() => setNumber(suggestion ?? ''), [suggestion, file.id])
  const receive = useMutation({
    mutationFn: () => api('POST', `/api/prosecution-files/${encodeURIComponent(file.id)}/receive`, { body: { odppNumber: needsNumber ? number : null } }),
    onSuccess: async () => {
      await qc.invalidateQueries()
      void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
    },
    onError: (e) => t.error(m["inbox.receive_failed"](), { description: e instanceof ApiError ? e.message : m["common.try_again"]() }),
  })
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        receive.mutate()
      }}
    >
      {needsNumber && (
        <label className="flex flex-col gap-1">
          <span className={lbl}>{m["inbox.odpp_number"]()}</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={m["inbox.odpp_number_placeholder"]()} className="h-10 rounded-[10px] border-0 bg-background px-3.5 text-sm outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring/40" />
          <span className="text-xs text-muted-foreground">{suggestion ? m["inbox.odpp_number_suggested"]() : m["inbox.odpp_number_none"]()}</span>
        </label>
      )}
      <button type="submit" disabled={receive.isPending} className="cursor-pointer rounded-[10px] border-0 bg-primary px-4 py-2.5 text-center font-semibold text-primary-foreground">
        {m["inbox.receive_open"]()}
      </button>
    </form>
  )
}

type Item = { title: string; sub: string; at: number; file?: FileSummary; package?: IncomingSummary }

/** The selected line as a triage sheet: what the file is about, who sent it,
 * what is in it, and whether what that offence usually needs is there. The one
 * button opens it, which registers it like the received stamp on paper. */
export function InboxPreview({ item }: { item: Item }) {
  const fileId = item.file?.id
  const { data: scans = [] } = useFileItems(fileId ?? '')
  const { data: statements = [] } = useQuery({ ...statementsForFileOptions(fileId ?? ''), enabled: !!fileId })
  const { data: evidence = [] } = useQuery({ ...evidenceForFileOptions(fileId ?? ''), enabled: !!fileId })
  const { data: guide = [] } = useGuideForFile(fileId)
  const f = item.file

  const roles: Record<string, number> = {}
  for (const s of statements) roles[s.statementRole] = (roles[s.statementRole] ?? 0) + 1
  const have: Have = { charges: f?.chargeCount ?? 0, roles, evidence: evidence.length, titles: scans.map((s) => s.title) }
  const entry = guide[0]
  const needs = entry?.papers ?? []
  const missing = needs.filter((p) => paperState(p, have) === 'missing').length
  const total = statements.length + scans.length + evidence.length

  const fact = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  )

  return (
    <aside className="flex flex-col gap-5 rounded-2xl bg-secondary/40 p-6 lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-col gap-1">
        <div className="text-xl font-semibold leading-tight">{item.title}</div>
        <div className="text-[13px] text-muted-foreground">{item.sub}</div>
      </div>

      {f && (
        <div className="flex flex-col">
          {fact(m["inbox.col.accused"](), f.accused)}
          {fact(m["inbox.col.offence"](), [f.offence, entry?.sectionRefs && `s. ${entry.sectionRefs}`].filter(Boolean).join(', '))}
          {fact(m["inbox.col.from"](), f.policeStation)}
          {fact(m["inbox.col.received"](), `${formatDate(f.awaitingSince)} · ${ageLabel(f.awaitingSince).toLowerCase()}`)}
        </div>
      )}

      {f && (
        <div className="flex flex-col gap-2">
          <div className={lbl}>{m["inbox.in_file"]()} · {total}</div>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">{m["inbox.no_papers"]()}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {statements.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span>{s.personFirstName} {s.personLastName}</span>
                  <span className="text-muted-foreground">{statementRoleLabel(s.statementRole)}</span>
                </li>
              ))}
              {scans.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span>{s.title}</span>
                  <span className="text-muted-foreground">{m["inbox.scan"]()}</span>
                </li>
              ))}
              {evidence.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>{e.identificationMark || e.description || m["material.evidence"]()}</span>
                  <span className="text-muted-foreground">{m["material.evidence"]()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {f && (
        <div className="flex flex-col gap-2">
          <div className={lbl}>{entry ? m["inbox.needs_title"]({ offence: entry.title.toUpperCase() }) : m["inbox.needs_none_title"]()}</div>
          {!entry ? (
            <p className="text-sm text-muted-foreground">{f.chargeCount === 0 ? m["inbox.needs_no_charge"]() : m["inbox.needs_no_guide"]()}</p>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                {needs.map((p) => {
                  const st = paperState(p, have)
                  return (
                    <li key={p} className="flex gap-2">
                      <span aria-hidden className={cn('w-4 shrink-0 text-center font-semibold', mark[st].cls)}>{mark[st].sign}</span>
                      <span className={cn(st === 'missing' && 'font-medium')}>{p}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs leading-snug text-muted-foreground">{missing > 0 ? m["inbox.needs_missing"]({ count: missing }) : m["inbox.needs_note"]()}</p>
            </>
          )}
        </div>
      )}

      {f ? (
        !f.odppRegistrationNumber || !f.assignedTo ? (
          <ReceiveFile file={f} />
        ) : (
          <Link to="/files/$fileId" params={{ fileId: f.id }} className="rounded-[10px] bg-primary px-4 py-2.5 text-center font-semibold text-primary-foreground no-underline">
            {m["inbox.open_file"]()}
          </Link>
        )
      ) : (
        item.package && (
          <Link to="/incoming/$packageId" params={{ packageId: item.package.id }} className="rounded-[10px] bg-primary px-4 py-2.5 text-center font-semibold text-primary-foreground no-underline">
            {m["interchange.read"]()}
          </Link>
        )
      )}
      <p className="text-xs leading-snug text-muted-foreground">{m["inbox.opening_note"]()}</p>
    </aside>
  )
}
