import * as m from '@/paraglide/messages'
import { findRule, useRules } from '@/features/rules/queries'
import { useQuery } from '@tanstack/react-query'
import { useJuvenile } from './age'
import { personProfileOptions } from './queries'

/** Shown under a person chosen for custody when their date of birth makes them a child: the age, what
 * to do, and whether that guidance has been checked. Nothing shows for an adult or an unknown age. */
export function JuvenileNotice({ personId }: { personId: string }) {
  const { data: profile } = useQuery(personProfileOptions(personId))
  const { data: pack } = useRules()
  const { age, juvenile } = useJuvenile(profile?.person.dateOfBirth)
  if (!juvenile) return null
  const guidance = findRule(pack, 'juvenile.custody_guidance')
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-xl bg-destructive/[0.06] p-3 ring-1 ring-destructive/20">
      <strong className="text-destructive">{m["people.juvenile_notice"]({ age: age ?? 0 })}</strong>
      {guidance?.text && <span>{guidance.text}</span>}
      {guidance && guidance.status === 'draft' && <span className="text-muted-foreground">{m["rules.awaiting_one"]()}</span>}
    </div>
  )
}
