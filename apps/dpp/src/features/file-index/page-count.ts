import { getAttachmentDataUrl } from '@/features/attachments/data'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { PDFDocument } from 'pdf-lib'

/** How many pages a stored scan has: a PDF is counted, a photo is one page.
 * The count is only used to lay out the sorting screen, so a scan that cannot
 * be counted (unreadable or locked) is treated as one page rather than failing. */
async function countPages(attachmentId: string): Promise<number> {
  const url = await getAttachmentDataUrl(attachmentId)
  if (!url || url.startsWith('data:image')) return 1
  try {
    const bytes = url.startsWith('data:')
      ? Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0))
      : new Uint8Array(await (await fetch(url)).arrayBuffer())
    if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') return 1
    return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount()
  } catch {
    return 1
  }
}

export const pageCountOptions = (attachmentId: string) => queryOptions({ queryKey: ['scan-pages', attachmentId] as const, queryFn: () => countPages(attachmentId), staleTime: Infinity })
export const usePageCount = (attachmentId: string | null) => useQuery({ ...pageCountOptions(attachmentId ?? ''), enabled: !!attachmentId })
