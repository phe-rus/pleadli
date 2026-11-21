import * as m from '@/paraglide/messages'
import { useRules } from './queries'

/** The name of the police service on every paper: the country the station works under decides it.
 * The Kenya and DR Congo names are draft until someone from those services has reviewed them. */
export function usePoliceForce(): string {
  const { data: pack } = useRules()
  if (pack?.country === 'KE') return m['charge_sheet.force_ke']()
  if (pack?.country === 'CD') return m['charge_sheet.force_cd']()
  return m['charge_sheet.force']()
}
