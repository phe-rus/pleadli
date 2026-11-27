import { m } from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { useSession } from '@/features/session'
import { SignaturePad } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { t as toast } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useClearSignature, useSaveSignature, useSignature } from './queries'

/** Settings: the signed-in officer draws, types or picks their signature once; the documents they issue use it. */
export function SignatureCard() {
  const { data: session } = useSession()
  const officerId = session?.officer.id
  const { data: image } = useSignature(officerId)
  const save = useSaveSignature(officerId)
  const clear = useClearSignature(officerId)
  const [signing, setSigning] = useState(false)
  const failed = (e: unknown) => toast.error(m.signature_failed(), { description: e instanceof Error ? e.message : String(e) })
  return (
    <SettingsCard title={m.signature_title()} description={m.signature_about()}>
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-white p-2">
        {image ? <img src={image} alt={m.signature_title()} className="max-h-full object-contain" /> : <span className="text-muted-foreground">{m.signature_none()}</span>}
      </div>
      <div className="flex justify-end gap-2 pt-3">
        {image && (
          <Button size="sm" variant="ghost" onClick={() => clear.mutate(undefined, { onError: failed })}>
            {m.signature_remove()}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setSigning(true)}>
          {image ? m.signature_change() : m.signature_add()}
        </Button>
      </div>
      {signing && (
        <SignaturePad
          name={session?.officer.name}
          labels={{
            hint: m.signature_pad_hint(), clear: m.signature_pad_clear(), done: m.signature_pad_done(), cancel: m.signature_cancel(),
            draw: m.signature_draw(), type: m.signature_type(), image: m.signature_image(), typeHint: m.signature_type_hint(), choose: m.signature_choose(), imageHint: m.signature_image_hint(),
          }}
          onCancel={() => setSigning(false)}
          onDone={(png) => {
            setSigning(false)
            save.mutate(png, { onSuccess: () => toast.success(m.signature_saved(), { id: 'signature-saved' }), onError: failed })
          }}
        />
      )}
    </SettingsCard>
  )
}
