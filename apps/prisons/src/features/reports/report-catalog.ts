import { m } from '@/paraglide/messages'
import type { ReportKind } from './schema'

export type CatalogEntry = {
  kind: ReportKind
  title: () => string
  about: () => string
  /** A register or return covers a stretch of time; a list is a snapshot of now. */
  takesPeriod: boolean
  /** Head Office holds no prisoners and a facility has no estate, so each kind belongs to one. */
  headOffice: boolean
  /** Wide tables print on a landscape page. */
  landscape: boolean
}

/** What this system can produce, in the order an officer reaches for them. It
 * mirrors the node's own list of kinds: asking for anything else is refused there. */
export const reportCatalog: readonly CatalogEntry[] = [
  { kind: 'monthly_return', title: () => m.reports_monthly_return(), about: () => m.reports_monthly_return_about(), takesPeriod: true, headOffice: false, landscape: false },
  { kind: 'admission_register', title: () => m.reports_admission_register(), about: () => m.reports_admission_register_about(), takesPeriod: true, headOffice: false, landscape: true },
  { kind: 'discharge_register', title: () => m.reports_discharge_register(), about: () => m.reports_discharge_register_about(), takesPeriod: true, headOffice: false, landscape: true },
  { kind: 'transfer_register', title: () => m.reports_transfer_register(), about: () => m.reports_transfer_register_about(), takesPeriod: true, headOffice: false, landscape: true },
  { kind: 'visitors_register', title: () => m.reports_visitors_register(), about: () => m.reports_visitors_register_about(), takesPeriod: true, headOffice: false, landscape: true },
  { kind: 'remand_list', title: () => m.reports_remand_list(), about: () => m.reports_remand_list_about(), takesPeriod: false, headOffice: false, landscape: true },
  { kind: 'network_register', title: () => m.reports_network_register(), about: () => m.reports_network_register_about(), takesPeriod: false, headOffice: true, landscape: true },
]

export const catalogEntry = (kind: string) => reportCatalog.find((entry) => entry.kind === kind)
