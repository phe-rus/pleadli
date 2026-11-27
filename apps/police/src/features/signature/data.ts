import { deleteAttachment, getAttachmentDataUrl, listAttachments } from '@/features/attachments/data'
import { api } from '@/lib/api'

/** An officer's signature is one sealed picture kept against their own officer record. */
const KIND = 'officer_signature'

export async function loadSignature(officerId: string): Promise<string | null> {
  const [latest] = await listAttachments(KIND, officerId)
  return latest ? ((await getAttachmentDataUrl(latest.id)) ?? null) : null
}

/** Replaces the signature: the new one is kept first, then the old ones go, so a failure never leaves none. */
export async function saveSignature(officerId: string, png: string) {
  const old = await listAttachments(KIND, officerId)
  await api('/attachments/bytes', { method: 'POST', body: JSON.stringify({ entityType: KIND, entityId: officerId, fileName: 'signature.png', dataBase64: png }) })
  for (const a of old) await deleteAttachment(a.id)
}

export async function clearSignature(officerId: string) {
  for (const a of await listAttachments(KIND, officerId)) await deleteAttachment(a.id)
}

/** The person who made a statement signs it once; the picture is a file of that statement, kept sealed with it. */
const MAKER_FILE = 'maker-signature.png'

export async function loadMakerSignature(statementId: string): Promise<string | null> {
  const found = (await listAttachments('statement', statementId)).find((a) => a.fileName === MAKER_FILE)
  return found ? ((await getAttachmentDataUrl(found.id)) ?? null) : null
}

export async function saveMakerSignature(statementId: string, png: string) {
  const old = (await listAttachments('statement', statementId)).filter((a) => a.fileName === MAKER_FILE)
  await api('/attachments/bytes', { method: 'POST', body: JSON.stringify({ entityType: 'statement', entityId: statementId, fileName: MAKER_FILE, dataBase64: png }) })
  for (const a of old) await deleteAttachment(a.id)
}
