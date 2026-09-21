import { CourtOutcomeForm } from '@/features/court-productions'
import { ResolveObligationForm } from './resolve-obligation-form'
import type { Obligation } from './schema'
import { Createpanel } from '@/components/create-panel'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { m } from '@/paraglide/messages'

/**
 * What an obligation lets an officer do on the spot. Court outcomes and the
 * action taken on a threshold are recorded in a drawer; everything else opens
 * its page. One hook so the queue on a prisoner's file and the attention list
 * on Today act the same way: `action(obligation)` is the control for a row,
 * and `drawers` is rendered once beside the list.
 */
export function useObligationActions(): { action: (obligation: Obligation) => ReactNode; drawers: ReactNode } {
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null)
  const [outcomeDirty, setOutcomeDirty] = useState(false)
  const [resolving, setResolving] = useState<Obligation | null>(null)
  const [resolveDirty, setResolveDirty] = useState(false)

  return {
    action: (obligation) => (
      <ObligationAction obligation={obligation} onOutcome={() => setOutcomeFor(obligation.procedure?.id ?? null)} onResolve={() => setResolving(obligation)} />
    ),
    drawers: (
      <>
        <Createpanel
          open={outcomeFor != null}
          onOpenChange={(open) => !open && setOutcomeFor(null)}
          isDirty={outcomeDirty}
          headings={{ title: m.obligations_record_the_court_outcome(), description: m.obligations_what_the_court_decided_at_this() }}
        >
          {outcomeFor && <CourtOutcomeForm productionId={outcomeFor} onSuccess={() => setOutcomeFor(null)} onDirtyChange={setOutcomeDirty} />}
        </Createpanel>

        <Createpanel
          open={resolving != null}
          onOpenChange={(open) => !open && setResolving(null)}
          isDirty={resolveDirty}
          headings={{ title: m.obligations_record_the_action_taken(), description: m.obligations_closes_this_item_with_what_was() }}
        >
          {resolving && <ResolveObligationForm obligation={resolving} onSuccess={() => setResolving(null)} onDirtyChange={setResolveDirty} />}
        </Createpanel>
      </>
    ),
  }
}

function ObligationAction({ obligation, onOutcome, onResolve }: { obligation: Obligation; onOutcome: () => void; onResolve: () => void }) {
  const small = buttonVariants({ size: 'xs', variant: 'secondary' })
  const p = obligation.procedure

  if (obligation.resolvable) {
    return (
      <Button size="xs" variant="secondary" onClick={onResolve}>
        {m.obligations_record_action()}
      </Button>
    )
  }
  if (!p) return null

  switch (p.kind) {
    case 'discharge':
      return p.id ? (
        <Link to="/procedures/discharge/$prisonerId" params={{ prisonerId: p.id }} className={small}>
          {m.obligations_discharge()}
        </Link>
      ) : null
    case 'court_outcome':
      return (
        <Button size="xs" variant="secondary" onClick={onOutcome}>
          {m.obligations_record_outcome()}
        </Button>
      )
    case 'transfer_arrival':
      return p.id ? (
        <Link to="/procedures/arrival/$transferId" params={{ transferId: p.id }} className={small}>
          {m.obligations_confirm_arrival()}
        </Link>
      ) : null
    case 'transfer_confirm':
      return (
        <Link to="/movements" className={small}>
          {m.obligations_open_movements()}
        </Link>
      )
    case 'instrument':
    case 'sentence':
    case 'regularise':
    case 'hospital_return':
    case 'file':
      return p.id ? (
        <Link to="/prisoners/$prisonerId" params={{ prisonerId: p.id }} className={small}>
          {m.obligations_open_file()}
        </Link>
      ) : null
    default:
      return null
  }
}
