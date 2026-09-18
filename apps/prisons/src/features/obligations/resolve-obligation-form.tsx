import { AreaField } from '@/components/form-fields'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useResolveObligation } from './queries'
import type { Obligation } from './schema'

type ResolveObligationFormProps = {
  obligation: Obligation
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Closes a threshold obligation by recording what was done about it. Who a
 * facility must notify when a threshold passes is not settled (research item
 * R-06), so the action is free text, not a fixed recipient.
 */
export function ResolveObligationForm({ obligation, onSuccess, onDirtyChange }: ResolveObligationFormProps) {
  const resolve = useResolveObligation()
  const [action, setAction] = useState('')

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          await resolve.mutateAsync({ key: obligation.key, kind: obligation.kind, prisonerId: obligation.prisonerId, actionTaken: action })
          t.success('Action recorded')
          onSuccess?.()
        } catch (error) {
          t.error('Could not record the action', { description: error instanceof ApiError ? error.message : 'Please try again.' })
        }
      }}
    >
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{obligation.title}</span>
        {obligation.prisonerName && <span className="text-muted-foreground">{obligation.prisonerName}</span>}
        {obligation.detail && <span className="text-xs text-muted-foreground">{obligation.detail}</span>}
      </div>
      <AreaField
        label="Action taken"
        value={action}
        onChange={(value) => {
          onDirtyChange?.(true)
          setAction(value)
        }}
        placeholder="Who was told, what was sent, what was decided"
      />
      <DrawerFooter>
        <Button type="submit" disabled={!action.trim() || resolve.isPending}>
          Record action
        </Button>
      </DrawerFooter>
    </form>
  )
}
