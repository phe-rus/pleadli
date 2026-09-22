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
export function ImportButton({ label = 'Import a package', variant = 'default', onImported }: { label?: string; variant?: 'default' | 'secondary' | 'outline'; onImported?: (outcome: ImportOutcome) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const run = useMutation({
    mutationFn: (file?: File) => importPackage(file),
    onSuccess: (outcome) => {
      if (!outcome) return
      t.success(outcome.message)
      onImported?.(outcome)
    },
    onError: (e) => t.error('The package was not taken in', { description: e instanceof ApiError ? e.message : typeof e === 'string' ? e : 'Please try again.' }),
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
          aria-label="Package file"
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
