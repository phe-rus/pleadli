import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useSecurityStatus } from '@/features/security'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { verifyDocument } from './data'
import { api } from '@/lib/api'
import { SignaturePad } from '@pleadli/paper'

type PaperPrint = { code: string; title: string; body: string; reference: string | null; printedBy: string | null; printedAt: number }
import { useSeals, useSetSignature, useSetStamp } from './queries'

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg'].includes(file.type)) return reject(new Error(m["seal.wrong_type"]()))
    if (file.size > 400 * 1024) return reject(new Error(m["seal.too_big"]()))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function SealCard({ title, description, image, canEdit, onSave, pending, drawable = false }: { title: string; description: string; image: string | null | undefined; canEdit: boolean; onSave: (image: string | null) => void; pending: boolean; drawable?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [signing, setSigning] = useState(false)
  return (
    <SettingsCard title={title} badge={<Tag tone={image ? 'done' : 'neutral'}>{image ? m["seal.set"]() : m["seal.none"]()}</Tag>} description={description}>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-border">
          {image ? <img src={image} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">{m["seal.nothing"]()}</span>}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  onSave(await readImage(file))
                } catch (err) {
                  t.error(err instanceof Error ? err.message : String(err))
                }
              }}
            />
            {drawable && (
              <Button size="sm" disabled={pending || signing} onClick={() => setSigning(true)}>
                {m["seal.draw"]()}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
              {m["seal.upload"]()}
            </Button>
            {image && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSave(null)}>
                {m["seal.remove"]()}
              </Button>
            )}
          </div>
        )}
      </div>
      {signing && (
        <SignaturePad
          labels={{ hint: m["seal.pad_hint"](), clear: m["seal.pad_clear"](), done: m["seal.pad_done"](), cancel: m["common.cancel"]() }}
          onCancel={() => setSigning(false)}
          onDone={(png) => {
            setSigning(false)
            onSave(png)
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">{m["seal.hint"]()}</p>
    </SettingsCard>
  )
}

/** Settings > You: the image of your signature, put on documents you issue. */
export function SignatureCard() {
  const { data } = useSeals()
  const set = useSetSignature()
  return (
    <SealCard
      title={m["seal.signature_title"]()}
      description={m["seal.signature_body"]()}
      image={data?.signature}
      canEdit
      drawable
      pending={set.isPending}
      onSave={(image) => set.mutate(image, { onSuccess: () => t.success(m["settings.saved"]()), onError: (e) => t.error(m["settings.save_failed"](), { description: e.message }) })}
    />
  )
}

/** Settings > Office: the office stamp, put on every document issued here. */
export function StampCard() {
  const { data } = useSeals()
  const { data: status } = useSecurityStatus()
  const set = useSetStamp()
  return (
    <SealCard
      title={m["seal.stamp_title"]()}
      description={m["seal.stamp_body"]()}
      image={data?.stamp}
      canEdit={status?.actor?.role === 'administrator'}
      pending={set.isPending}
      onSave={(image) => set.mutate(image, { onSuccess: () => t.success(m["settings.saved"]()), onError: (e) => t.error(m["settings.save_failed"](), { description: e.message }) })}
    />
  )
}

/** Check a paper document: its reference and the code beside its QR. */
export function VerifyDocument() {
  const [reference, setReference] = useState('')
  const [code, setCode] = useState('')
  const check = useMutation({ mutationFn: () => verifyDocument(reference, code) })
  const paper = useMutation({ mutationFn: () => api('GET', '/api/prints/verify', { query: { code } }) as Promise<PaperPrint | null> })
  const r = check.data
  const p = paper.data
  return (
    <section className="flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-border/60">
      <div>
        <h2>{m["verify.title"]()}</h2>
        <p className="text-muted-foreground">{m["verify.lead"]()}</p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!code.trim()) return
          if (reference.trim()) {
            paper.reset()
            check.mutate()
          } else {
            check.reset()
            paper.mutate()
          }
        }}
      >
        <Input className="w-56" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={m["verify.reference"]()} />
        <Input className="w-44 font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder={m["verify.code"]()} />
        <Button size="sm" type="submit" disabled={!code.trim() || check.isPending || paper.isPending}>
          {m["verify.check"]()}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{m["verify.paper_hint"]()}</p>
      {paper.isSuccess &&
        (p ? (
          <div className="flex flex-col gap-2">
            <p className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/30">{m["verify.paper_genuine"]({ by: p.printedBy ?? m["verify.someone"](), date: formatDate(p.printedAt, 'datetime') })}</p>
            <article className="paper mx-auto w-full max-w-[210mm] p-[12mm] font-serif text-sm leading-relaxed whitespace-pre-wrap">
              <p className="mb-3 text-center font-semibold uppercase">{p.title}</p>
              {p.body}
            </article>
          </div>
        ) : (
          <p className="not-typeset rounded-xl bg-destructive/5 p-3 text-destructive ring-1 ring-destructive/30">{m["verify.not_found"]()}</p>
        ))}
      {r &&
        (r.genuine ? (
          <p className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/30">{m["verify.genuine"]({ title: r.title ?? '', file: r.fileTitle ?? '', author: r.author ?? '', date: r.issuedAt ? formatDate(r.issuedAt, 'long') : '' })}</p>
        ) : r.found ? (
          <p className="not-typeset rounded-xl bg-destructive/5 p-3 text-destructive ring-1 ring-destructive/30">{m["verify.mismatch"]()}</p>
        ) : (
          <p className="not-typeset rounded-xl bg-destructive/5 p-3 text-destructive ring-1 ring-destructive/30">{m["verify.not_found"]()}</p>
        ))}
    </section>
  )
}
