import * as m from '@/paraglide/messages'
import { SettingsCard } from '@/components/settings-card'
import { useMe } from '@/features/session/queries'
import { SignaturePad } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'
import { useClearSignature, useSaveSignature, useSignature } from './queries'

/** Settings: the signed-in officer draws, types or picks their signature once; papers they sign use it. */
export function SignatureCard() {
  const { data: me } = useMe()
  const officerId = me?.officerId
  const { data: image } = useSignature(officerId)
  const save = useSaveSignature(officerId)
  const clear = useClearSignature(officerId)
  const [signing, setSigning] = useState(false)
  const failed = (e: unknown) => t.error(m["signature.failed"](), { description: e instanceof Error ? e.message : String(e) })
  return (
    <SettingsCard
      title={m["signature.title"]()}
      description={m["signature.about"]()}
      action={
        <div className="flex gap-2">
          {image && (
            <Button size="sm" variant="ghost" onClick={() => clear.mutate(undefined, { onError: failed })}>
              {m["signature.remove"]()}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setSigning(true)}>
            {image ? m["signature.change"]() : m["signature.add"]()}
          </Button>
        </div>
      }
    >
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-white p-2">
        {image ? <img src={image} alt={m["signature.title"]()} className="max-h-full object-contain" /> : <span className="text-muted-foreground">{m["signature.none"]()}</span>}
      </div>
      {signing && (
        <SignaturePad
          name={me?.name}
          labels={{
            hint: m["signature.pad_hint"](), clear: m["signature.pad_clear"](), done: m["signature.pad_done"](), cancel: m["library.cancel"](),
            draw: m["signature.draw"](), type: m["signature.type"](), image: m["signature.image"](), typeHint: m["signature.type_hint"](), choose: m["signature.choose"](), imageHint: m["signature.image_hint"](),
          }}
          onCancel={() => setSigning(false)}
          onDone={(png) => {
            setSigning(false)
            save.mutate(png, { onSuccess: () => t.success(m["signature.saved"](), { id: 'signature-saved' }), onError: failed })
          }}
        />
      )}
    </SettingsCard>
  )
}
