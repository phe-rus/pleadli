import { acceptFirmFiling, listFirmFilings, returnFirmFiling, savePackage, type FirmFiling } from '@/features/exchange/data'
import * as m from '@/paraglide/messages'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Input } from '@pleadli/ui/input'
import { Link as RouterLink } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
type Claim = { title?: string; kind?: string; courtNumber?: string; firmName?: string; filedBy?: string; paragraphs?: string[] }
const parse = (p: string): Claim => {
  try {
    return JSON.parse(p)
  } catch {
    return {}
  }
}

/** Documents counsel has filed in cases of this registry. The case number the
 * firm gave is a claim: accepting checks it against the register. */
export function FirmFilings() {
  const [rows, setRows] = useState<FirmFiling[]>([])
  const [by, setBy] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const load = useCallback(async () => setRows(await listFirmFilings()), [])
  useEffect(() => {
    load().catch((e) => setNotice({ text: message(e), error: true }))
  }, [load])
  const run = async (work: () => Promise<string | void>) => {
    try {
      const text = await work()
      if (text) setNotice({ text })
      await load()
    } catch (e) {
      setNotice({ text: message(e), error: true })
    }
  }
  if (rows.length === 0 && !notice) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m['firm_filings.title']()}</CardTitle>
        <CardDescription>{m['firm_filings.desc']()}</CardDescription>
        <div className="pt-2"><Input aria-label={m['exchange.by_ph']()} placeholder={m['exchange.by_ph']()} value={by} onChange={(e) => setBy(e.target.value)} className="w-full sm:w-72" /></div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}
        {rows.map((r) => {
          const c = parse(r.payload)
          return (
            <div key={r.id} className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.title} <span className="text-muted-foreground">· {r.firmName} · {c.courtNumber}</span></span>
                <Badge variant={r.status === 'accepted' ? 'default' : 'secondary'}>{r.status === 'received' ? m['exchange.waiting']() : r.status === 'accepted' ? m['firm_filings.accepted']() : m['exchange.returned']()}</Badge>
              </div>
              <p>{(c.paragraphs ?? []).join(' ')}</p>
              {r.rejectReason && <p className="text-muted-foreground">{m['exchange.returned_reason']({ reason: r.rejectReason })}</p>}
              {r.status === 'accepted' && r.caseId && <RouterLink to="/cases/$caseId" params={{ caseId: r.caseId }} className="w-fit text-primary hover:underline">{m['exchange.open_case']()}</RouterLink>}
              {r.status === 'received' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={!by.trim()} onClick={() => run(async () => { const x = await acceptFirmFiling(r.id, by); if (await savePackage(x)) return m['firm_filings.accepted_notice']() })}>{m['firm_filings.accept']()}</Button>
                  <Input aria-label={m['exchange.reason_ph']()} placeholder={m['exchange.reason_ph']()} value={reasons[r.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} className="w-56" />
                  <Button size="sm" variant="secondary" disabled={!(reasons[r.id] ?? '').trim() || !by.trim()} onClick={() => run(async () => { const x = await returnFirmFiling(r.id, reasons[r.id] ?? '', by); if (await savePackage(x)) return m['firm_filings.returned_notice']() })}>{m['exchange.return_button']()}</Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
