import { findRule, useRules } from '@/features/rules/queries'

/** Whole years between an ISO date of birth (YYYY-MM-DD) and a moment, or null when none is recorded
 * or it cannot be read. */
export function ageOn(dateOfBirth: string | null | undefined, atMs: number = Date.now()): number | null {
  if (!dateOfBirth) return null
  const [y, mo, d] = dateOfBirth.split('-').map(Number)
  if (!y || !mo || !d) return null
  const at = new Date(atMs)
  let age = at.getFullYear() - y
  if (at.getMonth() + 1 < mo || (at.getMonth() + 1 === mo && at.getDate() < d)) age -= 1
  return age >= 0 ? age : null
}

/** The age below which someone is a child, from the legal rules in force. Eighteen until the rules
 * have loaded, so a juvenile is never missed while they do. */
export function useChildAge(): number {
  const { data: pack } = useRules()
  return findRule(pack, 'juvenile.age')?.value ?? 18
}

/** Whether the person is a juvenile, and their age. A person with no date of birth is neither
 * flagged nor cleared: the screens say the age is not recorded. */
export function useJuvenile(dateOfBirth: string | null | undefined): { age: number | null; juvenile: boolean } {
  const childAge = useChildAge()
  const age = ageOn(dateOfBirth)
  return { age, juvenile: age != null && age < childAge }
}
