import { listDeliveries, listPrisonLinks, sendOrder, savePackage, type Delivery, type PrisonLink } from '@/features/exchange/data'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { useCallback, useEffect, useState } from 'react'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** On an issued remand or release order: send it to a prison that has
 * confirmed this registry, and show where each delivery stands. */
export function SendOrder({ orderId }: { orderId: string }) {
  const [links, setLinks] = useState<PrisonLink[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [choice, setChoice] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const load = useCallback(async () => {
    setLinks((await listPrisonLinks()).filter((l) => l.status === 'trusted'))
    setDeliveries(await listDeliveries(orderId))
  }, [orderId])
  useEffect(() => {
    load().catch((e) => setNotice({ text: message(e), error: true }))
  }, [load])
  const send = async () => {
    try {
      const sealed = await sendOrder(orderId, choice)
      const prison = links.find((l) => l.id === choice)?.prisonName ?? ''
      if (await savePackage(sealed)) setNotice({ text: m['prison.sent_notice']({ prison }) })
      await load()
    } catch (e) {
      setNotice({ text: message(e), error: true })
    }
  }
  return (
    <section className="page-section print:hidden" aria-label={m['prison.send_title']()}>
      <h2>{m['prison.send_title']()}</h2>
      <p className="text-muted-foreground">{m['prison.send_desc']()}</p>
      {notice && <p role="status" className={notice.error ? 'text-destructive' : undefined}>{notice.text}</p>}
      {links.length === 0 ? (
        <p className="text-muted-foreground">{m['prison.none_trusted']()}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={m['prison.choose_prison']()} value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2">
            <option value="">{m['prison.choose_prison']()}</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>{l.prisonName}</option>
            ))}
          </select>
          <Button size="sm" disabled={!choice} onClick={send}>{m['prison.send']()}</Button>
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-muted-foreground">
        {deliveries.map((d, i) => (
          <li key={i}>{d.outcome === 'recorded' ? m['prison.delivered']({ prison: d.prisonName }) : d.outcome ? m['prison.returned']({ prison: d.prisonName, reason: d.reason ?? '' }) : m['prison.awaiting']({ prison: d.prisonName })}</li>
        ))}
      </ul>
    </section>
  )
}
