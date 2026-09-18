import * as z from 'zod'
import { api } from '@/lib/api'
import {
  checklistSchema,
  confirmArrivalSchema,
  dispatchResultSchema,
  dispatchTransferSchema,
  dossierPreviewSchema,
  fileExportSchema,
  prepareTransferSchema,
  transferSchema,
  type Checklist,
  type ConfirmArrivalInput,
  type DispatchTransferInput,
  type PrepareTransferInput,
} from './schema'

const base = '/api/prisons/transfers'
const idPath = (id: string) => `${base}/${encodeURIComponent(id)}`

export async function listTransfers() {
  return z.array(transferSchema).parse(await api('GET', base))
}

export async function listTransfersForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/transfers`)
  return z.array(transferSchema).parse(rows)
}

export async function prepareTransfer(input: PrepareTransferInput) {
  const parsed = prepareTransferSchema.parse(input)
  const body = {
    ...parsed,
    orderReference: parsed.orderReference || null,
    orderingAuthority: parsed.orderingAuthority || null,
    reason: parsed.reason || null,
    notes: parsed.notes || null,
  }
  return transferSchema.parse(await api('POST', base, { body }))
}

export async function saveChecklist(id: string, checklist: Checklist) {
  const body = checklistSchema.parse(checklist)
  return transferSchema.parse(await api('PUT', `${idPath(id)}/checklist`, { body }))
}

export async function dispatchTransfer(id: string, input: DispatchTransferInput) {
  const parsed = dispatchTransferSchema.parse(input)
  const body = { ...parsed, escort: parsed.escort || null, transport: parsed.transport || null }
  return dispatchResultSchema.parse(await api('POST', `${idPath(id)}/dispatch`, { body }))
}

export async function cancelTransfer(id: string, reason: string) {
  return transferSchema.parse(await api('POST', `${idPath(id)}/cancel`, { body: { reason } }))
}

export async function getDossierFile(id: string) {
  return fileExportSchema.parse(await api('GET', `${idPath(id)}/dossier-file`))
}

export async function getReceiptFile(id: string) {
  return fileExportSchema.parse(await api('GET', `${idPath(id)}/receipt-file`))
}

export async function importDossier(input: { contentBase64: string; passphrase: string }) {
  return transferSchema.parse(await api('POST', `${base}/import`, { body: input }))
}

export async function importReceipt(input: { contentBase64: string }) {
  return transferSchema.parse(await api('POST', `${base}/import-receipt`, { body: input }))
}

export async function getDossierPreview(id: string) {
  return dossierPreviewSchema.parse(await api('GET', `${idPath(id)}/dossier`))
}

export async function confirmArrival(id: string, input: ConfirmArrivalInput) {
  const parsed = confirmArrivalSchema.parse(input)
  const body = {
    ...parsed,
    discrepancyNote: parsed.discrepancyNote || null,
    placement: parsed.placement || null,
    healthScreenNote: parsed.healthScreenNote || null,
  }
  return transferSchema.parse(await api('POST', `${idPath(id)}/confirm`, { body }))
}
