import { SettingsCard } from '@/components/settings-card'
import { formatDay } from '@/lib/dates'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useState } from 'react'
import { verifyDocument } from './data'
import type { DocumentVerification } from './schema'

/** Checking a printed copy: its reference and the code in its footer (or the
 * QR, which carries both). */
export function VerifyCard() {
  const [reference, setReference] = useState('')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<DocumentVerification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = (r: DocumentVerification) =>
    ({
      genuine: m["verify.genuine"]({ title: r.title ?? '', day: r.filedOn ? formatDay(r.filedOn) : '', by: r.filedBy ?? '' }),
      changed: m["verify.changed"](),
      mismatch: m["verify.mismatch"](),
      not_found: m["verify.not_found"](),
    })[r.result]
  return (
    <SettingsCard
      title={m["verify.title"]()}
      description={m["verify.description"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          setResult(await verifyDocument(reference, code))
        } catch (err) {
          setError(messageOf(err))
        }
      }}
      action={
        <Button type="submit" size="sm" disabled={!reference.trim() || !code.trim()}>
          {m["verify.check"]()}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input aria-label={m["verify.reference"]()} placeholder="DOC/2026/0001" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input aria-label={m["verify.code"]()} placeholder="3F9A0C21B7DE" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      {result && (
        <p role="status" className={result.result === 'genuine' ? 'text-emerald-700 dark:text-emerald-300' : 'not-typeset text-destructive'}>
          {text(result)}
        </p>
      )}
      {error && <p role="alert" className="not-typeset text-destructive">{error}</p>}
    </SettingsCard>
  )
}
