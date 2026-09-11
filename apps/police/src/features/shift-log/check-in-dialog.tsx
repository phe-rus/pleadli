import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { useState } from 'react'
import { useCheckInByBadge } from './queries'

export type CheckInDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Badge-entry check-in: whoever's at the desk types the arriving
 * officer's badge number, one submit. The remote-scan alternative is a
 * "Check in" button right in the normal remote app view (once an
 * officer's phone is logged in via the existing Settings > Remote Access
 * pairing QR) — no second QR, no special deep link, since that QR is
 * already the one thing meant to be displayed standing at the front
 * desk. */
export function CheckInDialog({ open, onOpenChange }: CheckInDialogProps) {
  const [badgeNumber, setBadgeNumber] = useState('')
  const checkIn = useCheckInByBadge()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!badgeNumber.trim()) return
    try {
      const result = await checkIn.mutateAsync(badgeNumber.trim())
      t.success(`${result.officerName} checked in`)
      setBadgeNumber('')
      onOpenChange(false)
    } catch {
      t.error('Could not check in', { description: 'No officer with that badge number.' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check in</DialogTitle>
          <DialogDescription>
            Type a badge number, or an officer can check in themselves from the remote app (Settings &gt; Remote
            Access has the QR).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="check-in-badge" className="text-xs text-muted-foreground">
              Badge number
            </label>
            <Input
              id="check-in-badge"
              value={badgeNumber}
              onChange={(e) => setBadgeNumber(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" size="sm" disabled={!badgeNumber.trim() || checkIn.isPending}>
            Check in
          </Button>
        </form>

        <DialogFooter>
          <Button type="button" size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
