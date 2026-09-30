import { mattersOptions } from '@/features/matters'
import { parseShillings } from '@/features/money/data'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { Textarea } from '@pleadli/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { registerKinds, useAddRegisterEntry, useVoidRegisterEntry, type RegisterEntry, type RegisterId } from './data'

const kindLabels: Record<string, () => string> = {
    affidavit: m["registers.kind.affidavit"],
    statutory_declaration: m["registers.kind.statutory_declaration"],
    affirmation: m["registers.kind.affirmation"],
    attestation: m["registers.kind.attestation"],
    acknowledgment: m["registers.kind.acknowledgment"],
    certified_copy: m["registers.kind.certified_copy"],
    protest: m["registers.kind.protest"],
    other: m["registers.kind.other"],
}
export const kindLabel = (kind: string) => kindLabels[kind]?.() ?? kind

export const registerLabel = (register: RegisterId) => (register === 'oaths' ? m["registers.oaths"]() : m["registers.notarial"]())

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Refusal({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
      {text}
    </p>
  ) : null
}

/** One oath taken or notarial act done, entered as the person stands before
 * the commissioner. The backend numbers it and refuses what the law does not
 * allow; the refusal is shown here as it is. */
export function RegisterEntryForm({ register, place, onDone }: { register: RegisterId; place: string; onDone: (entry: RegisterEntry) => void }) {
  const add = useAddRegisterEntry()
  const kinds = registerKinds[register]
  const [kind, setKind] = useState(kinds[0])
  const [day, setDay] = useState(toIsoDay(Date.now()))
  const [where, setWhere] = useState(place)
  const [person, setPerson] = useState('')
  const [idDocument, setIdDocument] = useState('')
  const [address, setAddress] = useState('')
  const [document, setDocument] = useState('')
  const [pages, setPages] = useState('')
  const [interpreter, setInterpreter] = useState('')
  const [fee, setFee] = useState('')
  const [matterId, setMatterId] = useState('')
  const [notes, setNotes] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  // The practice's town arrives after the form opens; fill it once, never over what was typed.
  useEffect(() => {
    if (place) setWhere((current) => current || place)
  }, [place])
  const { data: matters = [] } = useQuery({ ...mattersOptions('open'), enabled: register === 'notarial' })
  const kindItems = kinds.map((k) => ({ value: k, label: kindLabel(k) }))
  const matterItems = [{ value: '', label: m["registers.no_matter"]() }, ...matters.map((mt) => ({ value: mt.id, label: mt.courtNumber ? `${mt.courtNumber} · ${mt.title}` : mt.title }))]

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setRefusal(null)
        const onDay = fromDateInput(day)
        if (!onDay) return
        add.mutate(
          {
            register,
            kind,
            onDay,
            place: where.trim() || null,
            personName: person.trim(),
            personIdDocument: idDocument.trim() || null,
            personAddress: address.trim() || null,
            documentTitle: document.trim(),
            pages: pages ? Number(pages) : null,
            interpreter: interpreter.trim() || null,
            fee: parseShillings(fee),
            matterId: matterId || null,
            notes: notes.trim() || null,
          },
          { onSuccess: onDone, onError: (error) => setRefusal(messageOf(error)) },
        )
      }}
    >
      <Field label={m["registers.field.kind"]()}>
        {() => (
          <Select items={kindItems} value={kind} onValueChange={(v) => v && setKind(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {kindItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={m["registers.field.day"]()}>{(id) => <Input id={id} type="date" name="onDay" value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
      <Field label={m["registers.field.place"]()} hint={m["registers.field.place_hint"]()}>
        {(id) => <Input id={id} name="place" value={where} onChange={(e) => setWhere(e.target.value)} />}
      </Field>
      <Field label={register === 'oaths' ? m["registers.field.deponent"]() : m["registers.field.person"]()}>
        {(id) => <Input id={id} name="personName" value={person} onChange={(e) => setPerson(e.target.value)} autoComplete="off" />}
      </Field>
      <Field label={m["registers.field.id_document"]()} hint={m["registers.field.id_document_hint"]()}>
        {(id) => <Input id={id} name="personIdDocument" value={idDocument} onChange={(e) => setIdDocument(e.target.value)} autoComplete="off" />}
      </Field>
      <Field label={m["registers.field.address"]()}>
        {(id) => <Input id={id} name="personAddress" value={address} onChange={(e) => setAddress(e.target.value)} />}
      </Field>
      <Field label={m["registers.field.document"]()} hint={m["registers.field.document_hint"]()}>
        {(id) => <Input id={id} name="documentTitle" value={document} onChange={(e) => setDocument(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={m["registers.field.pages"]()}>
          {(id) => <Input id={id} name="pages" inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value.replace(/\D/g, ''))} />}
        </Field>
        <Field label={m["registers.field.fee"]()}>
          {(id) => <Input id={id} name="fee" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />}
        </Field>
      </div>
      <Field label={m["registers.field.interpreter"]()} hint={m["registers.field.interpreter_hint"]()}>
        {(id) => <Input id={id} name="interpreter" value={interpreter} onChange={(e) => setInterpreter(e.target.value)} />}
      </Field>
      {register === 'notarial' ? (
        <Field label={m["registers.field.matter"]()}>
          {() => (
            <Select items={matterItems} value={matterId} onValueChange={(v) => setMatterId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {matterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-muted-foreground">{m["registers.not_own_matter"]()}</p>
      )}
      <Field label={m["registers.field.notes"]()}>
        {(id) => <Textarea id={id} name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <Refusal text={refusal} />
      <div className="mt-auto flex justify-end">
        <Button type="submit" disabled={!person.trim() || !document.trim() || add.isPending}>
          {m["registers.enter"]()}
        </Button>
      </div>
    </form>
  )
}

/** Striking an entry out, with the reason written beside it. */
export function VoidEntryForm({ entry, onDone }: { entry: RegisterEntry; onDone: () => void }) {
  const strike = useVoidRegisterEntry()
  const [reason, setReason] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        setRefusal(null)
        strike.mutate({ id: entry.id, reason }, { onSuccess: onDone, onError: (error) => setRefusal(messageOf(error)) })
      }}
    >
      <Field label={m["registers.void_reason"]()} hint={m["registers.void_hint"]()}>
        {(id) => <Input id={id} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <Refusal text={refusal} />
      <div className="flex justify-end">
        <Button type="submit" variant="destructive" size="sm" disabled={!reason.trim() || strike.isPending}>
          {m["registers.void"]()}
        </Button>
      </div>
    </form>
  )
}
