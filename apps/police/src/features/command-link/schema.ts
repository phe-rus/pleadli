import * as z from 'zod'

export const linkSchema = z
  .object({
    address: z.string(),
    stationNumber: z.string(),
    stationName: z.string().nullable(),
    state: z.enum(['pending', 'connected', 'rejected']),
    requestedBy: z.string().nullable(),
    connectedAt: z.number().nullable(),
    lastReportAt: z.number().nullable(),
    lastError: z.string().nullable(),
  })
  .nullable()

export type Link = z.infer<typeof linkSchema>

export const connectSchema = z.object({
  address: z.string().min(1, 'Enter the address of the command.'),
  stationNumber: z.string().min(1, 'Enter the station number the command gave this station.'),
  activationCode: z.string(),
})

export type ConnectInput = z.infer<typeof connectSchema>
