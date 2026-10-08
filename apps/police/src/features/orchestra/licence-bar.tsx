import * as m from '@/paraglide/messages'
import { useMe } from '@/features/session'
import { Link } from '@tanstack/react-router'
import { useOrchestra } from './queries'

const WEEK = 7 * 24 * 60 * 60 * 1000

/** One quiet line over the page while there is something to say: the trial's
 * days, a trial or licence that has ended (records stay open; the line says
 * so), or a licence that needs the internet soon. Nothing when all is well. */
export function LicenceBar() {
  const { data: status } = useOrchestra()
  const { data: me } = useMe()
  if (!status) return null

  const admin = me?.role === 'admin'
  let text: string | null = null
  let strong = false
  if (status.state === 'trial') text = m["orchestra.bar.trial"]({ days: String(status.trialDaysLeft) })
  else if (status.state === 'trial_ended') (text = m["orchestra.bar.trial_ended"]()), (strong = true)
  else if (status.state === 'licence_ended') (text = m["orchestra.bar.licence_ended"]()), (strong = true)
  else if (status.licence && status.licence.validUntil - Date.now() < WEEK) text = m["orchestra.bar.go_online"]()
  if (!text) return null

  return (
    <div role="status" className={strong ? 'flex items-center justify-center gap-3 border-b bg-amber-500/10 px-4 py-1.5 text-[0.8125rem] text-amber-800 dark:text-amber-300 print:hidden' : 'flex items-center justify-center gap-3 border-b bg-muted/50 px-4 py-1.5 text-[0.8125rem] text-muted-foreground print:hidden'}>
      <span>{text}</span>
      {admin ? (
        <Link to="/settings" search={{ section: 'licence' }} className="font-medium text-foreground underline-offset-4 hover:underline">
          {status.state === 'licensed' ? m["orchestra.bar.open"]() : m["orchestra.bar.get_licence"]()}
        </Link>
      ) : (
        status.state !== 'licensed' && <span>{m["orchestra.bar.ask_admin"]()}</span>
      )}
    </div>
  )
}
