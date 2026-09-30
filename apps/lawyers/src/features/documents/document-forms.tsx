import { useState } from 'react'
import * as m from '@/paraglide/messages'
import { DateField } from '@/components/date-field'
import { SubmitButton } from '@/components/submit-button'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { installationOptions, useActor } from '@/features/installation'
import { matterOptions } from '@/features/matters/queries'
import { legalDate, templates, templatesFor, type TemplateContext } from '@/features/templates'
import { useQuery } from '@tanstack/react-query'
import { useCreateDocument, useFileDocument } from './queries'
import type { LawyerDocument } from './schema'

/** What a template is filled in from: the matter, the practice and the person
 * drafting, and the templates offered for the matter's kind. */
export function useTemplateContext(matterId: string) {
  const { data: detail } = useQuery(matterOptions(matterId))
  const { data: install } = useQuery(installationOptions())
  const actor = useActor()
  const matterType = detail?.matter.matterType ?? 'criminal_defence'
  const offered = templatesFor(matterType, install?.jurisdiction)
  const context = (): TemplateContext => ({
    court: detail?.matter.courtName ?? '',
    courtNumber: detail?.matter.courtNumber ?? '',
    client: detail?.client.name ?? '',
    otherSide: detail?.parties.find((p) => p.role === 'opposing_party')?.name ?? '',
    firm: install?.officeName ?? '',
    address: install?.address ?? '',
    advocate: actor?.name ?? '',
    today: legalDate(Date.now()),
    matterType,
  })
  return { offered, context }
}

/** Starting a document in a matter, from a template for its kind of matter,
 * filled in from the matter, the practice and the person drafting. You write
 * the rest in its own page. */
export function DocumentCreateForm({ matterId, onSuccess, onDirtyChange }: { matterId: string; onSuccess?: (document: LawyerDocument) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const create = useCreateDocument()
  const { offered, context } = useTemplateContext(matterId)
  const form = useAppForm({
    defaultValues: { template: offered[0]?.id ?? 'blank', title: '' },
    validators: { onSubmit: ({ value }) => (value.title.trim() || templates.find((t) => t.id === value.template)?.title(context()) ? undefined : m["document.form.title_required"]()) },
    onSubmit: async ({ value }) => {
      const template = templates.find((t) => t.id === value.template) ?? templates[templates.length - 1]
      const ctx = context()
      try {
        const document = await create.mutateAsync({ matterId, kind: template.kind, title: value.title.trim() || template.title(ctx), body: template.body(ctx) || undefined })
        t.success(m["document.form.started"]())
        onSuccess?.(document)
      } catch (error) {
        t.error(m["document.form.start_failed"](), { description: messageOf(error) })
      }
    },
  })
  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="template">{(f) => <f.select label={m["document.form.template"]()} options={offered.map((tp) => ({ value: tp.id, label: tp.label() }))} />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.template}>
        {(id) => {
          const tp = templates.find((x) => x.id === id)
          return tp && tp.id !== 'blank' ? <p className="text-muted-foreground">{m["document.form.template_hint"]()}</p> : null
        }}
      </form.Subscribe>
      <form.AppField name="title">{(f) => <f.input label={m["document.form.title"]()} placeholder={m["document.form.title_placeholder"]()} />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label={m["document.form.start"]()} />
      </DrawerFooter>
    </form>
  )
}

/** Filing: the day it was put before the court or sent, and to whom. Filing gives
 * the document a reference and freezes it. */
export function FileForm({ document, onSuccess }: { document: LawyerDocument; onSuccess?: () => void }) {
  const file = useFileDocument()
  // Shown in the panel itself: a toast would sit under the panel's overlay.
  const [refusal, setRefusal] = useState<string | null>(null)
  const form = useAppForm({
    defaultValues: { filedOn: toIsoDay(Date.now()), filedWith: '' },
    validators: { onSubmit: ({ value }) => (fromDateInput(value.filedOn) ? undefined : 'Choose the day it was filed.') },
    onSubmit: async ({ value }) => {
      try {
        await file.mutateAsync({ id: document.id, filedOn: fromDateInput(value.filedOn) ?? 0, filedWith: value.filedWith.trim() || null })
        t.success('Filed')
        onSuccess?.()
      } catch (error) {
        setRefusal(messageOf(error))
      }
    },
  })

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <p>Filing gives the document a reference and freezes it. It can be printed, and replaced by a new document, but never edited.</p>
      <form.AppField name="filedOn">{(f) => <DateField label="Filed on" value={f.state.value} onChange={f.handleChange} />}</form.AppField>
      <form.AppField name="filedWith">{(f) => <f.input label="Filed with (optional)" placeholder="The court, the registrar, the prison" />}</form.AppField>
      {refusal && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <strong>{m["document.file_failed"]()}</strong>
          <p className="not-typeset text-destructive">{refusal}</p>
        </div>
      )}
      <DrawerFooter>
        <SubmitButton form={form} label="File" />
      </DrawerFooter>
    </form>
  )
}
