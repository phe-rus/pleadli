import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useState } from 'react'
import type { Locale } from './types'

/** An institution already in this computer's records folder, found before setup. */
export type RestoreOffer = {
  institution: string
  records: number
  lastSaved: number
  /** Restores the institution's work. A phrase is only needed on a computer that did not make the folder. */
  onRestore: (phrase?: string) => Promise<void>
}

const WORDS: Record<Locale, { found: (n: string) => string; detail: (n: number, d: string) => string; restore: string; other: string; phrase: string; failed: string }> = {
  en: {
    found: (n) => `${n} is already here`,
    detail: (n, d) => `${n} records, last saved ${d}`,
    restore: 'Restore',
    other: 'Restore with the recovery phrase',
    phrase: 'Recovery phrase',
    failed: 'Could not restore. Check the phrase and try again.',
  },
  sw: {
    found: (n) => `${n} tayari ipo hapa`,
    detail: (n, d) => `Rekodi ${n}, ya mwisho ilihifadhiwa ${d}`,
    restore: 'Rejesha',
    other: 'Rejesha kwa maneno ya uokoaji',
    phrase: 'Maneno ya uokoaji',
    failed: 'Imeshindwa kurejesha. Angalia maneno na ujaribu tena.',
  },
  fr: {
    found: (n) => `${n} est déjà ici`,
    detail: (n, d) => `${n} dossiers, dernier enregistrement ${d}`,
    restore: 'Restaurer',
    other: 'Restaurer avec la phrase de récupération',
    phrase: 'Phrase de récupération',
    failed: 'Restauration impossible. Vérifiez la phrase et réessayez.',
  },
}

export function RestoreCard({ offer, locale }: { offer: RestoreOffer; locale: Locale }) {
  const w = WORDS[locale]
  const [phrase, setPhrase] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await offer.onRestore(phrase.trim() || undefined)
    } catch {
      setFailed(true)
      setAsking(true)
    } finally {
      setBusy(false)
    }
  }
  const date = new Date(offer.lastSaved).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left">
      <div>
        <h3 className="font-semibold">{w.found(offer.institution)}</h3>
        <p className="text-muted-foreground">{w.detail(offer.records, date)}</p>
      </div>
      {asking && <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={w.phrase} aria-label={w.phrase} autoComplete="off" spellCheck={false} />}
      {failed && <p className="text-destructive">{w.failed}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={busy || (asking && !phrase.trim() && failed)}>{w.restore}</Button>
        {!asking && (
          <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setAsking(true)}>
            {w.other}
          </button>
        )}
      </div>
    </div>
  )
}
