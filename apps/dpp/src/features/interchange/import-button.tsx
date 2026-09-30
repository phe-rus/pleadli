import * as m from '@/paraglide/messages'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { useRef } from 'react'
import { importPackage } from './data'
import type { ImportOutcome } from './schema'

/** Takes a package in from wherever it was carried: a stick, a download, an
 * e-mail attachment. It does not matter how it arrived. What it is, and whether
 * it is accepted, is decided by what is inside it. */
export function ImportButton({ label = m["interchange.import"](), variant = 'default', onImported }: { label?: string; variant?: 'default' | 'secondary' | 'outline'; onImported?: (outcome: ImportOutcome) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const run = useMutation({
    mutationFn: (file?: File) => importPackage(file),
    onSuccess: (outcome) => {
      if (!outcome) return
      t.success(outcome.message)
      onImported?.(outcome)
    },
    onError: (e) => t.error(m["interchange.import_failed"](), { description: e instanceof ApiError ? e.message : typeof e === 'string' ? e : m["common.try_again"]() }),
  })

  return (
    <>
      <Button size="sm" variant={variant} disabled={run.isPending} onClick={() => (isTauri() ? run.mutate(undefined) : input.current?.click())}>
        {label}
      </Button>
      {!isTauri() && (
        <input
          ref={input}
          type="file"
          accept=".pxpkg"
          hidden
          aria-label={m["interchange.package_file"]()}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) run.mutate(file)
          }}
        />
      )}
    </>
  )
}
