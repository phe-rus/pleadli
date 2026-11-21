import { Button } from '@pleadli/ui/button'
import { useState } from 'react'

export type ReceivingAddressLabels = {
  /** "Your receiving address" */
  title: string
  /** One calm sentence: other offices must send to exactly this. */
  hint: string
  copy: string
  copied: string
  /** Shown while the relay has not yet said which address this computer's mail goes to. */
  unknown: string
}

/**
 * The address another institution must use to send to this office, shown first and large, with the office and
 * institution it belongs to as separate, quieter text. The address is the one the relay delivers to for this
 * computer (never the institution's licence address, which may differ). Props only.
 */
export function ReceivingAddress({ labels, address, name }: { labels: ReceivingAddressLabels; address: string | null | undefined; name?: string | null }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      // Clipboard can be refused; the address is still selectable on screen.
    }
  }
  return (
    <div data-receiving-address className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-muted-foreground">{labels.title}</p>
        <p className="select-all truncate font-mono">{address ?? labels.unknown}</p>
        {name ? <p className="truncate text-muted-foreground">{name}</p> : null}
        <p className="text-muted-foreground">{labels.hint}</p>
      </div>
      {address ? (
        <Button size="sm" variant="secondary" onClick={copy}>
          {done ? labels.copied : labels.copy}
        </Button>
      ) : null}
    </div>
  )
}
