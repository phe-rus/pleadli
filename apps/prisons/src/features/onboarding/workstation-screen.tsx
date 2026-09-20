import { ScreenHeader, screenTransition } from '@/components/pre-auth-layout'
import { useConnectToNode } from '@/features/node'
import { ApiError } from '@/lib/api'
import { m } from '@/paraglide/messages'
import { ArrowLeft01Icon, ComputerIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { t } from '@pleadli/ui/goey-toaster'
import { motion } from 'framer-motion'

/** Another computer in a facility that already has a node: it enrols with the
 * node's address, fingerprint and a one-time code, and holds no data of its own. */
export function WorkstationScreen({ onBack }: { onBack: () => void }) {
  const connect = useConnectToNode()

  const form = useAppForm({
    defaultValues: { address: '', fingerprint: '', code: '' },
    onSubmit: async ({ value }) => {
      try {
        await connect.mutateAsync(value)
      } catch (error) {
        t.error(m.onboarding_workstation_failed(), { description: error instanceof ApiError ? error.message : m.onboarding_try_again() })
      }
    },
  })

  return (
    <motion.div {...screenTransition} className="flex w-full max-w-sm flex-col gap-6">
      <button type="button" onClick={onBack} className="-ml-1 flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground">
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        {m.onboarding_back()}
      </button>
      <ScreenHeader icon={ComputerIcon} title={m.onboarding_workstation_title()} description={m.onboarding_workstation_description()} />
      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="address">{(f) => <f.input label={m.onboarding_workstation_address()} placeholder="192.168.1.10:47921" autoComplete="url" autoFocus />}</form.AppField>
        <form.AppField name="fingerprint">{(f) => <f.input label={m.onboarding_workstation_fingerprint()} placeholder="AB:CD:…" autoComplete="off" />}</form.AppField>
        <form.AppField name="code">{(f) => <f.input label={m.onboarding_workstation_code()} placeholder="1234-5678" autoComplete="off" />}</form.AppField>
        <form.AppForm>
          <div className="*:w-full">
            <form.submit label={connect.isPending ? m.onboarding_workstation_connecting() : m.onboarding_workstation_connect()} />
          </div>
        </form.AppForm>
      </form>
    </motion.div>
  )
}
