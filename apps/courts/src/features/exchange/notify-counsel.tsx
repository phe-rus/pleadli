import { listNoticeDeliveries, listFirmLinks, notify, savePackage, type FirmDelivery, type FirmLink } from '@/features/exchange/data'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { useCallback, useEffect, useState } from 'react'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** On a sitting or an issued order: notify counsel through a firm that has
 * confirmed this registry, and show where each delivery stands. */
export function NotifyCounsel({ kind, id }: { kind: 'order' | 'sitting'; id: string }) {
  const [links, setLinks] = useState<FirmLink[]>([])
  const [deliveries, setDeliveries] = useState<FirmDelivery[]>([])
  const [choice, setChoice] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const load = useCallback(async () => {
    setLinks((await listFirmLinks()).filter((l) => l.status === 'trusted'))
    setDeliveries(await listNoticeDeliveries(id))
  }, [id])
  useEffect(() => {
    load().catch((e) => setNotice({ text: message(e), error: true }))
  }, [load])
  const send = async () => {
    try {
      const sealed = await notify(kind, id, choice)
      const firm = links.find((l) => l.id === choice)?.firmName ?? ''
      if (await savePackage(sealed)) setNotice({ text: m['firm.sent_notice']({ firm }) })
      await load()
    } catch (e) {
      setNotice({ text: message(e), error: true })
    }
  }
  return (
    <section className="page-section print:hidden" aria-label={m['firm.send_title']()}>
      <h2>{m['firm.send_title']()}</h2>
      <p className="text-muted-foreground">{m['firm.send_desc']()}</p>
      {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}
      {links.length === 0 ? (
        <p className="text-muted-foreground">{m['firm.none_trusted']()}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={m['firm.choose_firm']()} value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2">
            <option value="">{m['firm.choose_firm']()}</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>{l.firmName}</option>
            ))}
          </select>
          <Button size="sm" disabled={!choice} onClick={send}>{m['firm.send']()}</Button>
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-muted-foreground">
        {deliveries.map((d, i) => (
          <li key={i}>{d.outcome === 'recorded' ? m['firm.delivered']({ firm: d.firmName }) : d.outcome ? m['firm.returned']({ firm: d.firmName, reason: d.reason ?? '' }) : m['firm.awaiting']({ firm: d.firmName })}</li>
        ))}
      </ul>
    </section>
  )
}
