import { buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { usePrisonerFile } from './queries'

type PrisonerFileHeaderProps = {
  prisonerId: string
  /** Page-level actions such as editing identity details. */
  actions?: ReactNode
}

/**
 * The action bar over a prisoner's file: the way back, and the procedures
 * that change the person's state (docs/prisons/product-map/08 1.4). Identity,
 * dates and history live in the profile rail and the tabs beside it.
 */
export function PrisonerFileHeader({ prisonerId, actions }: PrisonerFileHeaderProps) {
  const { data: file } = usePrisonerFile(prisonerId)
  const { prisoner } = file
  const inCustody = prisoner.currentStatus === 'in_custody'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to="/prisoners" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        Back to population
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {inCustody && (
          <>
            <Link to="/procedures/transfer/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              {file.openTransfer ? 'Continue transfer' : 'Transfer out'}
            </Link>
            <Link to="/procedures/discharge/$prisonerId" params={{ prisonerId }} className={buttonVariants({ size: 'sm' })}>
              Discharge
            </Link>
          </>
        )}
        {prisoner.currentStatus === 'in_transit' && (
          <Link to="/movements" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            Open movements
          </Link>
        )}
      </div>
    </div>
  )
}
