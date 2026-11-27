import { addAttachment, getAttachmentDataUrl, listAttachments, voidAttachment } from '@/features/attachments/data'

/** An officer's signature is one sealed picture kept against their own officer record. The node refuses anyone else. */
const KIND = 'officer_signature'

export async function loadSignature(officerId: string): Promise<string | null> {
  const [latest] = await listAttachments(KIND, officerId)
  return latest ? await getAttachmentDataUrl(latest.id) : null
}

/** The new picture is kept first and the old ones voided after, so a failure never leaves the officer with none. */
export async function saveSignature(officerId: string, png: string) {
  const old = await listAttachments(KIND, officerId)
  await addAttachment(KIND, officerId, { fileName: 'signature.png', contentBase64: png.split(',')[1] ?? png })
  for (const a of old) await voidAttachment(a.id, 'Replaced by a new signature')
}

export async function clearSignature(officerId: string) {
  for (const a of await listAttachments(KIND, officerId)) await voidAttachment(a.id, 'Removed by the officer')
}
