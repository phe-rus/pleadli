import { admissionInstrumentLabel, custodyStatusLabel, prisonerStatusLabel } from '@/features/prisoners'
import { facilityStatusLabel } from '@/features/facilities'
import { releaseTypeLabel } from '@/features/releases'
import { transferDirectionLabel, transferStateLabel } from '@/features/transfers'
import { visitStatusLabel, visitTypeLabel } from '@/features/visits'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { format } from 'date-fns/format'
import type * as z from 'zod'
import { m } from '@/paraglide/messages'
import { admissionRowsSchema, dischargeRowsSchema, networkRowsSchema, remandRowsSchema, transferRowsSchema, visitRowsSchema } from './schema'

/** The kinds of report the node builds as a table of one row per record. */
export type RegisterKind = 'admission_register' | 'discharge_register' | 'transfer_register' | 'visitors_register' | 'remand_list' | 'network_register'

export type RegisterColumn = { key: string; header: () => string; align?: 'right' }

/** A register as a table of text: its columns, and a way to read a report's
 * body into one record of cells per row. Written once, so the fixed register
 * an officer prints and the table they compose from the same records name and
 * show every column identically. */
export type RegisterDef = {
  columns: readonly RegisterColumn[]
  rows: (body: unknown, asAt: number) => Record<string, string>[] | null
}

const date = (ms: number | null | undefined) => (ms == null ? '' : format(ms, 'd MMM yyyy'))
const fullName = (first: string, last: string, other?: string | null) => [first, other, last].filter(Boolean).join(' ')

type ColumnSpec<T> = RegisterColumn & { cell: (row: T, asAt: number) => string | number }

function register<T>(schema: z.ZodType<{ rows: T[] }>, specs: readonly ColumnSpec<T>[]): RegisterDef {
  return {
    columns: specs.map(({ key, header, align }) => ({ key, header, align })),
    rows: (body, asAt) => {
      const parsed = schema.safeParse(body)
      if (!parsed.success) return null
      return parsed.data.rows.map((row) => Object.fromEntries(specs.map((spec) => [spec.key, String(spec.cell(row, asAt))])))
    },
  }
}

export const registerDefs: Record<RegisterKind, RegisterDef> = {
  admission_register: register(admissionRowsSchema, [
    { key: 'prisonerNumber', header: () => m.reports_column_prisoner_no(), cell: (r) => r.prisonerNumber ?? '' },
    { key: 'name', header: () => m.reports_column_name(), cell: (r) => fullName(r.firstName, r.lastName, r.otherNames) },
    { key: 'category', header: () => m.reports_column_category(), cell: (r) => prisonerStatusLabel(r.status) },
    { key: 'authority', header: () => m.reports_column_authority(), cell: (r) => [admissionInstrumentLabel(r.admissionInstrumentType), r.admissionAuthority].filter(Boolean).join(', ') },
    { key: 'offence', header: () => m.reports_column_offence(), cell: (r) => r.offence ?? '' },
    { key: 'admitted', header: () => m.reports_column_admitted(), cell: (r) => date(r.admittedAt) },
    { key: 'now', header: () => m.reports_column_now(), cell: (r) => custodyStatusLabel(r.currentStatus) },
  ]),
  discharge_register: register(dischargeRowsSchema, [
    { key: 'prisonerNumber', header: () => m.reports_column_prisoner_no(), cell: (r) => r.prisonerNumber ?? '' },
    { key: 'name', header: () => m.reports_column_name(), cell: (r) => fullName(r.firstName, r.lastName) },
    { key: 'type', header: () => m.reports_column_type(), cell: (r) => releaseTypeLabel(r.releaseType) },
    { key: 'date', header: () => m.reports_column_date(), cell: (r) => date(r.releasedAt) },
    { key: 'orderedBy', header: () => m.reports_column_ordered_by(), cell: (r) => r.orderedBy ?? '' },
    { key: 'authorisedBy', header: () => m.reports_column_authorised_by(), cell: (r) => r.authorisedBy ?? '' },
  ]),
  transfer_register: register(transferRowsSchema, [
    { key: 'date', header: () => m.reports_column_date(), cell: (r) => date(r.transferredAt) },
    { key: 'direction', header: () => m.reports_column_direction(), cell: (r) => transferDirectionLabel(r.direction) },
    { key: 'state', header: () => m.reports_column_state(), cell: (r) => transferStateLabel(r.direction, r.state) },
    { key: 'person', header: () => m.reports_column_person(), cell: (r) => [r.personName, r.prisonerNumber].filter(Boolean).join(' · ') },
    { key: 'otherPrison', header: () => m.reports_column_other_prison(), cell: (r) => r.otherPrisonName ?? '' },
    { key: 'order', header: () => m.reports_column_order(), cell: (r) => [r.orderReference, r.orderingAuthority].filter(Boolean).join(', ') },
    { key: 'reason', header: () => m.reports_column_reason(), cell: (r) => r.reason ?? '' },
  ]),
  visitors_register: register(visitRowsSchema, [
    { key: 'date', header: () => m.reports_column_date(), cell: (r) => date(r.visitedAt) },
    { key: 'visitor', header: () => m.reports_column_visitor(), cell: (r) => [r.visitorName, r.relationship].filter(Boolean).join(', ') },
    { key: 'prisoner', header: () => m.reports_column_prisoner(), cell: (r) => [fullName(r.prisonerFirstName, r.prisonerLastName), r.prisonerNumber].filter(Boolean).join(' · ') },
    { key: 'type', header: () => m.reports_column_type(), cell: (r) => visitTypeLabel(r.visitType) },
    { key: 'outcome', header: () => m.reports_column_outcome(), cell: (r) => visitStatusLabel(r.status) },
    { key: 'party', header: () => m.reports_column_party(), cell: (r) => r.partySize, align: 'right' },
    { key: 'time', header: () => m.reports_column_time(), cell: (r) => (r.startedAt ? `${format(r.startedAt, 'HH:mm')}${r.endedAt ? ` to ${format(r.endedAt, 'HH:mm')}` : ''}` : '') },
  ]),
  remand_list: register(remandRowsSchema, [
    { key: 'prisonerNumber', header: () => m.reports_column_prisoner_no(), cell: (r) => r.prisonerNumber ?? '' },
    { key: 'name', header: () => m.reports_column_name(), cell: (r) => fullName(r.firstName, r.lastName) },
    { key: 'offence', header: () => m.reports_column_offence(), cell: (r) => r.offence ?? '' },
    { key: 'remandedBy', header: () => m.reports_column_remanded_by(), cell: (r) => r.admissionAuthority ?? '' },
    { key: 'admitted', header: () => m.reports_column_admitted(), cell: (r) => date(r.admittedAt) },
    { key: 'daysHeld', header: () => m.reports_column_days_held(), cell: (r, asAt) => differenceInCalendarDays(asAt, r.admittedAt), align: 'right' },
    { key: 'highCourtOnly', header: () => m.reports_column_high_court_only(), cell: (r) => (r.highCourtOnlyOffence ? m.reports_yes() : m.reports_no()) },
    { key: 'lastProduced', header: () => m.reports_column_last_produced(), cell: (r) => date(r.lastProducedAt) },
  ]),
  network_register: register(networkRowsSchema, [
    { key: 'facilityNumber', header: () => m.reports_column_facility_no(), cell: (r) => r.facilityNumber },
    { key: 'name', header: () => m.reports_column_facility(), cell: (r) => r.name },
    { key: 'region', header: () => m.reports_column_region(), cell: (r) => r.region },
    { key: 'location', header: () => m.reports_column_location(), cell: (r) => r.location },
    { key: 'status', header: () => m.reports_column_status(), cell: (r) => facilityStatusLabel(r.status) },
    { key: 'officers', header: () => m.reports_column_officers(), cell: (r) => r.officerCount, align: 'right' },
    { key: 'held', header: () => m.reports_column_held(), cell: (r) => r.heldAtLastSync ?? m.reports_not_reported(), align: 'right' },
    { key: 'lastSynced', header: () => m.reports_column_last_synced(), cell: (r) => (r.lastSyncedAt ? format(r.lastSyncedAt, 'd MMM yyyy, HH:mm') : m.reports_never()) },
  ]),
}

export const isRegisterKind = (kind: string): kind is RegisterKind => kind in registerDefs
