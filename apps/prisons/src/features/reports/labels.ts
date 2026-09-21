import { m } from '@/paraglide/messages'

/** How the monthly return names the stored values of the population profile. */
export const profileEducationLabel: Record<string, string> = {
  get none() { return m.route_reports_none() },
  get primary() { return m.route_reports_primary() },
  get secondary() { return m.route_reports_secondary() },
  get tertiary() { return m.route_reports_tertiary() },
  get other() { return m.route_reports_other() },
}

export const profileNationalityLabel: Record<string, string> = {
  get ugandan() { return m.route_reports_ugandan() },
  get foreign() { return m.route_reports_foreign() },
}
