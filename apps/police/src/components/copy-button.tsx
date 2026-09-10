import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { isTauri } from '@tauri-apps/api/core'
import { CheckmarkCircle02Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

export type CopyButtonProps = {
  value: string
  label?: string
}

/** Copies `value` to the clipboard — the native OS clipboard in Tauri,
 * `navigator.clipboard` in the browser-dev fallback. */
export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (isTauri()) {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
        await writeText(value)
      } else {
        await navigator.clipboard.writeText(value)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      t.error('Could not copy to clipboard')
    }
  }

  return (
    <Button type="button" size="icon-xs" variant="ghost" aria-label={label} title={label} onClick={handleCopy}>
      <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
    </Button>
  )
}
