import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useState } from 'react'
import { useOfficerByBadge } from './queries'
import type { Officer } from './schema'

export type BadgeAttributionInputProps = {
  label?: string
  onResolved: (officer: Officer) => void
}

/** Lightweight, badge number only officer lookup for routine attribution
 * (who did this), no password, matching the exact pattern Police's shift
 * check in already uses. Not a login: this never gates anything, it only
 * resolves which active officer a badge number belongs to. A future
 * consumer (the audit trail, feature 19) drops this in wherever it needs
 * to attribute an action. */
export function BadgeAttributionInput({ label = 'Badge number', onResolved }: BadgeAttributionInputProps) {
  const [badgeNumber, setBadgeNumber] = useState('')
  const [notFound, setNotFound] = useState(false)
  const lookup = useOfficerByBadge()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!badgeNumber.trim()) return
    setNotFound(false)
    const officer = await lookup.mutateAsync(badgeNumber.trim())
    if (officer) {
      onResolved(officer)
      setBadgeNumber('')
    } else {
      setNotFound(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="badge-attribution" className="text-xs text-muted-foreground">
          {label}
        </label>
        <Input
          id="badge-attribution"
          value={badgeNumber}
          onChange={(e) => {
            setBadgeNumber(e.target.value)
            setNotFound(false)
          }}
        />
        {notFound && <p className="text-xs text-destructive">No active officer with that badge number.</p>}
      </div>
      <Button type="submit" size="sm" disabled={!badgeNumber.trim() || lookup.isPending}>
        Confirm
      </Button>
    </form>
  )
}
