import { Copy01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Checkbox } from '@pleadli/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'

/** Shown exactly once, right after a PIN is set or reset. The advocate must
 * say they have saved it before the dialog can close: the code is the only
 * way back in if the PIN is forgotten, and this app has no other recovery
 * path. */
export function RecoveryCodeDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [saved, setSaved] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => !open && saved && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Your recovery code</DialogTitle>
        <DialogDescription>
          If you ever forget your PIN, this code is the only way back into your own matters, there is no other reset. Save it somewhere safe, such as a
          password manager, before you continue. It will not be shown again.
        </DialogDescription>
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3 font-mono text-sm">
          <span className="wrap-anywhere">{code}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void navigator.clipboard.writeText(code)
              t.success('Copied')
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} />
          </Button>
        </div>
        <label className="flex items-center gap-2">
          <Checkbox checked={saved} onCheckedChange={(value) => setSaved(value === true)} />
          I have saved this recovery code
        </label>
        <Button type="button" disabled={!saved} onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  )
}
