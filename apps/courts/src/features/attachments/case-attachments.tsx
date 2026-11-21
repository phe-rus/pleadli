import { zoneFor } from '@pleadli/ui/lib/institution-zone'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { z } from 'zod'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { api, seg } from '@/lib/api'

const attachmentSchema = z.object({ id: z.string(), caseId: z.string(), name: z.string(), mediaType: z.string(), size: z.number(), sha256: z.string(), createdAt: z.number() })
type Attachment = z.infer<typeof attachmentSchema>
const contentSchema = z.object({ attachment: attachmentSchema, contentBase64: z.string() })
const maxSize = 10 * 1024 * 1024
const describe = (error: unknown) => error instanceof Error ? error.message : 'Please try again.'
function base64(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
async function load(caseId: string, id: string) {
  const result = contentSchema.parse(await api('GET', `/api/cases/${seg(caseId)}/attachments/${seg(id)}/content`))
  const bytes = Uint8Array.from(atob(result.contentBase64), c => c.charCodeAt(0))
  return { attachment: result.attachment, bytes, blob: new Blob([bytes], { type: result.attachment.mediaType }) }
}
function Preview({ caseId, attachment }: { caseId: string; attachment: Attachment }) {
  const query = useQuery({ queryKey: ['attachments', 'preview', caseId, attachment.id], queryFn: () => load(caseId, attachment.id), gcTime: 0, staleTime: 0, retry: false })
  const [url, setUrl] = useState<string>()
  const [imageError, setImageError] = useState(false)
  useEffect(() => {
    if (!query.data) return
    const value = URL.createObjectURL(query.data.blob); setUrl(value)
    return () => { URL.revokeObjectURL(value) }
  }, [query.data])
  if (query.isPending) return <p role="status">Opening and checking the original…</p>
  if (query.isError) return <div role="alert"><p>{describe(query.error)}</p><Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button></div>
  if (attachment.mediaType === 'text/plain') return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-background p-6 font-serif text-sm leading-relaxed">{new TextDecoder().decode(query.data.bytes)}</pre>
  if (!url) return <p role="status">Preparing preview…</p>
  if (attachment.mediaType.startsWith('image/')) return imageError ? <p role="alert">This image could not be displayed. Save the original copy to inspect it in an image reader.</p> : <img src={url} alt={attachment.name} onError={() => setImageError(true)} className="max-h-[60vh] w-full rounded-xl object-contain" />
  return <object data={url} type="application/pdf" className="h-[60vh] w-full rounded-xl border bg-background"><p className="p-6">PDF preview is unavailable in this window. Save a copy to read it in your PDF reader.</p></object>
}

/** Original files stay separate from the court's exhibit rulings. */
export function CaseAttachments({ caseId }: { caseId: string }) {
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Attachment | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setSelected(null); setError(null) }, [caseId])
  const key = ['attachments', 'case', caseId] as const
  const query = useQuery({ queryKey: key, queryFn: async () => attachmentSchema.array().parse(await api('GET', `/api/cases/${seg(caseId)}/attachments`)), retry: false })
  async function add(file: File) {
    setError(null)
    if (!file.size || file.size > maxSize) { setError('Choose a nonempty file no larger than 10 MB.'); return }
    if (!/\.(pdf|png|jpe?g|txt)$/i.test(file.name)) { setError('Choose a PDF, PNG, JPEG or text file.'); return }
    setAdding(true)
    try {
      await api('POST', `/api/cases/${seg(caseId)}/attachments`, { body: { name: file.name, contentBase64: base64(new Uint8Array(await file.arrayBuffer())) } })
      await Promise.all([client.invalidateQueries({ queryKey: key }), client.invalidateQueries({ queryKey: ['audit'] })])
      t.success('Original file attached')
    } catch (e) { setError(describe(e)) }
    finally { setAdding(false) }
  }
  async function save(attachment: Attachment) {
    if (saving) return
    setSaving(true)
    try {
      if (isTauri()) {
        if (!await invoke<boolean>('save_attachment', { caseId, id: attachment.id })) return
      } else {
        const original = await load(caseId, attachment.id), url = URL.createObjectURL(original.blob)
        const a = document.createElement('a'); a.href = url; a.download = attachment.name; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 30_000)
      }
      t.success('Original copy saved')
    } catch (e) { t.error('Could not save the attachment', { description: describe(e) }) }
    finally { setSaving(false) }
  }
  return <section className="page-section" aria-labelledby="case-attachments">
    <div className="section-head">
      <div><h2 id="case-attachments">Attached files</h2><p className="text-sm text-muted-foreground">Original supporting papers and scans. Attaching a file does not admit it as evidence.</p></div>
      <Button variant="secondary" size="sm" disabled={adding} onClick={() => input.current?.click()}>{adding ? 'Saving original…' : 'Attach file'}</Button>
      <input ref={input} type="file" className="hidden" aria-label="Choose case attachment" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void add(file) }} />
    </div>
    <p className="text-xs text-muted-foreground">PDF, PNG, JPEG or text · Up to 10 MB per file · Stored on this computer</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {query.isPending ? <p role="status">Loading attached files…</p> : query.isError ? <div role="alert"><p>{describe(query.error)}</p><Button size="sm" onClick={() => void query.refetch()}>Try again</Button></div> : query.data.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No attached files yet. Add the original paper or scan when it becomes available.</p> :
      <ul className="divide-y rounded-xl border bg-background">{query.data.map(attachment => <li key={attachment.id} className="flex flex-wrap items-center gap-3 p-4">
        <button className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setSelected(attachment)}><span className="block truncate font-medium">{attachment.name}</span><span className="text-xs text-muted-foreground">{Math.max(1, Math.round(attachment.size / 1024))} KB · {new Date(attachment.createdAt).toLocaleDateString(undefined, { timeZone: zoneFor(attachment.createdAt) })} · Original</span></button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(attachment)}>Preview</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => void save(attachment)}>Save copy</Button>
      </li>)}</ul>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-auto rounded-2xl p-6">
        <DialogHeader className="pr-8"><DialogTitle>{selected?.name ?? 'Attachment preview'}</DialogTitle><DialogDescription>Original supporting file. This preview does not certify the document or admit it as evidence.</DialogDescription></DialogHeader>
        {selected && <><Preview key={selected.id} caseId={caseId} attachment={selected} /><div className="flex flex-wrap items-center justify-between gap-4"><span className="max-w-full break-all text-xs text-muted-foreground">SHA-256: {selected.sha256}</span><Button variant="secondary" disabled={saving} onClick={() => void save(selected)}>{saving ? 'Saving…' : 'Save original copy'}</Button></div></>}
      </DialogContent>
    </Dialog>
  </section>
}
