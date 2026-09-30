import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const stationFiguresSchema = z
  .object({
    inCustody: z.number().default(0),
    nearLimit: z.number().default(0),
    pastLimit: z.number().default(0),
    openCases: z.number().default(0),
    referralsPending: z.number().default(0),
    onDutyNow: z.number().default(0),
    officersActive: z.number().default(0),
  })
  .nullable()

export const stationSchema = z.object({
  id: z.string(),
  stationNumber: z.string(),
  name: z.string(),
  region: z.string().nullable(),
  district: z.string().nullable(),
  status: z.string(),
  connectedAt: z.number().nullable(),
  lastReportAt: z.number().nullable(),
  createdAt: z.number(),
  state: z.enum(['registered', 'requested', 'reporting', 'quiet', 'silent', 'revoked']),
  figures: stationFiguresSchema,
  reportedAt: z.number().nullable(),
  officers: z.number(),
})

export type StationView = z.infer<typeof stationSchema>

export const pendingRequestSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  requestedByBadge: z.string(),
  requestedByName: z.string(),
  requestedFrom: z.string(),
  createdAt: z.number(),
})

export type PendingRequest = z.infer<typeof pendingRequestSchema>

export const overviewSchema = z.object({
  stations: z.number(),
  reporting: z.number(),
  silent: z.number(),
  requested: z.number(),
  inCustody: z.number(),
  nearLimit: z.number(),
  pastLimit: z.number(),
  openCases: z.number(),
  referralsPending: z.number(),
  officers: z.number(),
  silentStations: z.array(z.string()),
})

export type CommandFigures = z.infer<typeof overviewSchema>

export const activationCodeSchema = z.object({ code: z.string(), expiresAt: z.number() })

export const rosterEntrySchema = z.object({
  name: z.string().nullable(),
  rank: z.string().nullable(),
  post: z.string().nullable(),
  badgeNumber: z.string().nullable(),
  role: z.string().nullable(),
  active: z.boolean(),
})

export type RosterEntry = z.infer<typeof rosterEntrySchema>

export const registerStationSchema = z.object({
  name: z.string().min(1, { error: () => m["validation.the_station_needs_a_name"]() }),
  region: z.string(),
  district: z.string(),
})

export type RegisterStationInput = z.infer<typeof registerStationSchema>

export function stationStateLabel(state: StationView['state']) {
  return {
    registered: m["command.state.registered"],
    requested: m["command.state.requested"],
    reporting: m["command.state.reporting"],
    quiet: m["command.state.quiet"],
    silent: m["command.state.silent"],
    revoked: m["command.state.revoked"],
  }[state]()
}

export function stationStateTone(state: StationView['state']): 'open' | 'waiting' | 'done' | 'stopped' | 'urgent' | 'neutral' {
  return { registered: 'neutral', requested: 'open', reporting: 'done', quiet: 'waiting', silent: 'urgent', revoked: 'stopped' }[state] as never
}
