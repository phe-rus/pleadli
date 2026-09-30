import * as m from '@/paraglide/messages'
import { useReportDirty } from '@/hooks/use-report-dirty'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { FieldDescription, FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { useChain, useSaveChain } from './queries'

export type ChainFormProps = {
  onSuccess?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

/** Where this station sits: the region, district and division above it, as
 * the officer knows them. Each is optional, and none is checked against a list,
 * because the structure is not yet confirmed. */
export function ChainForm({ onSuccess, onDirtyChange }: ChainFormProps) {
  const { data: chain } = useChain()
  const save = useSaveChain()
  const above = (kind: string) => chain.above.find((unit) => unit.kind === kind)?.name ?? ''

  const form = useAppForm({
    defaultValues: { region: above('region'), district: above('district'), division: above('division') },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(value)
        t.success(m["units.saved"]())
        onSuccess?.()
      } catch {
        t.error(m["units.save_failed"](), { description: m["common.try_again"]() })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField name="region">{(f) => <f.input label={m["common.region"]()} placeholder={m["units.region_placeholder"]()} />}</form.AppField>
        <form.AppField name="district">{(f) => <f.input label={m["common.district"]()} />}</form.AppField>
        <form.AppField name="division">{(f) => <f.input label={m["onboarding.division"]()} />}</form.AppField>
        <FieldDescription>{m["units.blank_hint"]()}</FieldDescription>
      </FieldGroup>

      <DrawerFooter>
        <form.AppForm>
          <form.submit label={m["units.submit"]()} />
        </form.AppForm>
      </DrawerFooter>
    </form>
  )
}
