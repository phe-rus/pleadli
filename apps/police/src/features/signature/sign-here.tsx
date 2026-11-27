import * as m from '@/paraglide/messages'
import { SignaturePad } from '@pleadli/paper'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useState } from 'react'

export const padLabels = () => ({
  hint: m["signature.pad_hint"](), clear: m["signature.pad_clear"](), done: m["signature.pad_done"](), cancel: m["library.cancel"](),
  draw: m["signature.draw"](), type: m["signature.type"](), image: m["signature.image"](), typeHint: m["signature.type_hint"](), choose: m["signature.choose"](), imageHint: m["signature.image_hint"](),
})

/** A small "take signature" button under a paper's signature line (not printed); opens the pad for that person. */
export function SignHere({ name, label, onSigned }: { name?: string; label: string; onSigned: (png: string) => Promise<unknown> | void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="print:hidden">
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <SignaturePad
          name={name}
          labels={padLabels()}
          onCancel={() => setOpen(false)}
          onDone={(png) => {
            setOpen(false)
            Promise.resolve(onSigned(png)).then(
              () => t.success(m["signature.saved"](), { id: 'signature-saved' }),
              (e) => t.error(m["signature.failed"](), { description: e instanceof Error ? e.message : String(e) }),
            )
          }}
        />
      )}
    </div>
  )
}
