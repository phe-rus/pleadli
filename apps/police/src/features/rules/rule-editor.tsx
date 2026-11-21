import * as m from '@/paraglide/messages'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { Segmented } from '@pleadli/ui/segmented'
import { t } from '@pleadli/ui/goey-toaster'
import { Textarea } from '@pleadli/ui/textarea'
import { useState } from 'react'
import { useEditRule } from './queries'
import type { Rule } from './schema'

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)

/** Where an office changes one of its own rules: the number, the offences, the wording, where it comes from
 * and who checked it. What it saves is the next version of the rules, so nothing earlier is lost. */
export function RuleEditor({ rule, open, onOpenChange }: { rule: Rule; open: boolean; onOpenChange: (open: boolean) => void }) {
  const edit = useEditRule()
  const [value, setValue] = useState(rule.value?.toString() ?? '')
  const [terms, setTerms] = useState(rule.terms.join('\n'))
  const [exceptions, setExceptions] = useState(rule.exceptions.join('\n'))
  const [text, setText] = useState(rule.text ?? '')
  const [citation, setCitation] = useState(rule.citation ?? '')
  const [status, setStatus] = useState<Rule['status']>(rule.status)
  const [reviewedBy, setReviewedBy] = useState(rule.reviewedBy ?? '')
  const [reviewedOn, setReviewedOn] = useState(rule.reviewedOn ?? '')
  const [note, setNote] = useState(rule.note ?? '')

  const save = async () => {
    try {
      const pack = await edit.mutateAsync({
        id: rule.id,
        edit: { value: value.trim() ? Number(value) : null, terms: lines(terms), exceptions: lines(exceptions), text, citation, status, reviewedBy, reviewedOn, note },
      })
      t.success(m["rules.edit_saved"](), { description: m["rules.edit_saved_detail"]({ version: pack.version }) })
      onOpenChange(false)
    } catch (error) {
      t.error(m["rules.edit_failed"](), { description: error instanceof ApiError ? error.message : m["common.try_again"]() })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m["rules.edit_title"]()}</DialogTitle>
          <DialogDescription>{rule.title}. {m["rules.edit_hint"]()}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {rule.kind === 'number' && (
            <Field>
              <FieldLabel>{m["rules.edit_value"]()}</FieldLabel>
              <Input type="number" min={1} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          )}
          {rule.kind === 'offence_list' && (
            <>
              <Field>
                <FieldLabel>{m["rules.edit_terms"]()}</FieldLabel>
                <Textarea rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{m["rules.edit_exceptions"]()}</FieldLabel>
                <Textarea rows={3} value={exceptions} onChange={(e) => setExceptions(e.target.value)} />
              </Field>
            </>
          )}
          {rule.kind !== 'number' && (
            <Field>
              <FieldLabel>{m["rules.edit_text"]()}</FieldLabel>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
          <Field>
            <FieldLabel>{m["rules.edit_citation"]()}</FieldLabel>
            <Input value={citation} onChange={(e) => setCitation(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{m["rules.edit_status"]()}</FieldLabel>
            <Segmented
              label={m["rules.edit_status"]()}
              value={status}
              onChange={setStatus}
              size="sm"
              items={[
                { value: 'draft', label: m["rules.status_draft"]() },
                { value: 'sourced', label: m["rules.status_sourced"]() },
                { value: 'reviewed', label: m["rules.status_reviewed"]() },
              ]}
            />
          </Field>
          {status === 'reviewed' && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>{m["rules.edit_reviewed_by"]()}</FieldLabel>
                <Input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{m["rules.edit_reviewed_on"]()}</FieldLabel>
                <Input type="date" value={reviewedOn} onChange={(e) => setReviewedOn(e.target.value)} />
              </Field>
            </div>
          )}
          <Field>
            <FieldLabel>{m["rules.edit_note"]()}</FieldLabel>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{m["rules.edit_cancel"]()}</Button>
          <Button disabled={edit.isPending} onClick={() => void save()}>{m["rules.edit_save"]()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
