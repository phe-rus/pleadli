import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const auditEntrySchema = z.object({
  seq: z.number(),
  version: z.number(),
  at: z.number(),
  actor: z.string().nullable(),
  action: z.string(),
  subjectType: z.string().nullable(),
  subjectId: z.string().nullable(),
  scopeId: z.string().nullable(),
  detail: z.string().nullable(),
  prevHash: z.string(),
  hash: z.string(),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

export const verificationSchema = z.object({ intact: z.boolean(), entries: z.number(), brokenAt: z.number().nullable() })
export type Verification = z.infer<typeof verificationSchema>

/** What each kind of record is called, by the first part of its route. A getter, so the words follow the language. */
const nouns: Record<string, () => string> = {
  people: () => m['audit.n_people'](),
  incidents: () => m['audit.n_incidents'](),
  duty: () => m['audit.n_duty'](),
  'station-assets': () => m['audit.n_station_assets'](),
  vehicles: () => m['audit.n_vehicles'](),
  cases: () => m['audit.n_cases'](),
  statements: () => m['audit.n_statements'](),
  custody: () => m['audit.n_custody'](),
  medical: () => m['audit.n_medical'](),
  bonds: () => m['audit.n_bonds'](),
  referrals: () => m['audit.n_referrals'](),
  'charge-sheets': () => m['audit.n_charge_sheets'](),
  exhibits: () => m['audit.n_exhibits'](),
  attachments: () => m['audit.n_attachments'](),
  officers: () => m['audit.n_officers'](),
  'station-diary': () => m['audit.n_station_diary'](),
  'check-ins': () => m['audit.n_check_ins'](),
  'shift-handovers': () => m['audit.n_shift_handovers'](),
}

/** The trail stores "POST /cases/:id/people" (the method and the shape of the route, never a record's content).
 * This turns it into a plain sentence; an action it does not know is shown as it was written. */
export function describeAction(stored: string): string {
  const refused = stored.endsWith(' (refused)')
  const action = refused ? stored.slice(0, -' (refused)'.length) : stored
  const [method = '', route = ''] = action.split(' ')
  const parts = route.split('/').filter(Boolean)
  const [first = '', second] = parts
  const thing = nouns[first]
  const rest = parts.slice(2)

  const said = (() => {
    if (first === 'export') return m['audit.a_export']()
    if (action.startsWith('export ')) return m['audit.a_export']()
    if (first === 'people' && rest[0] === 'photos') return method === 'DELETE' ? m['audit.a_person_photo_removed']() : m['audit.a_person_photo']()
    if (first === 'auth' && second === 'sign-out') return m['audit.a_sign_out']()
    if (first === 'auth' && second === 'policy') return m['audit.a_policy']()
    if (first === 'auth') return m['audit.a_sign_in']()
    if (first === 'system') return m['audit.a_set_up']()
    if (first === 'timezone') return m['audit.a_timezone']()
    if (first === 'rules') return second === 'import' ? m['audit.a_rules_imported']() : m['audit.a_rule_edited']()
    if (first === 'prints') return m['audit.a_print']()
    if (first === 'exchange') return second === 'import' ? m['audit.a_package_in']() : second === 'accept-invite' ? m['audit.a_invite']() : m['audit.a_package_out']()
    if (first === 'hq') return m['audit.a_hq']()
    if (first === 'backup-alerts') return m['audit.a_backup_alert']()
    if (first === 'import') return m['audit.a_bulk_import']()
    if (thing) {
      if (method === 'POST') return m['audit.added']({ thing: thing() })
      if (method === 'PUT' || method === 'PATCH') return m['audit.changed']({ thing: thing() })
      if (method === 'DELETE') return m['audit.removed']({ thing: thing() })
    }
    return m['audit.a_other']({ action })
  })()
  return refused ? m['audit.refused']({ what: said }) : said
}
