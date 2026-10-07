import * as m from '@/paraglide/messages'

/** Kinds of office under an institution, and the usual one for each kind of
 * institution. Labels are read while rendering, in the visitor's language. */
export const officeKinds = ['command', 'station', 'office', 'court', 'facility', 'chambers'] as const
export const officeKindFor: Record<string, string> = { police: 'station', dpp: 'office', courts: 'court', prisons: 'facility', lawyers: 'chambers' }

export const officeKindLabel = (k: string) =>
  ({ command: m["orch.office.command"](), station: m["orch.office.station"](), office: m["orch.office.office"](), court: m["orch.office.court"](), facility: m["orch.office.facility"](), chambers: m["orch.office.chambers"]() })[k] ?? k

export const typeLabel = (k: string) =>
  ({ police: m["orch.type.police"](), dpp: m["orch.type.dpp"](), courts: m["orch.type.courts"](), prisons: m["orch.type.prisons"](), lawyers: m["orch.type.lawyers"]() })[k] ?? k

export const appLabel = (k: string) => `Pleadli ${({ police: 'Police', dpp: 'DPP', courts: 'Courts', lawyers: 'Lawyers', prisons: 'Prisons' } as Record<string, string>)[k] ?? k}`
