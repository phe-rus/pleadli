import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { t } from '@pleadli/ui/goey-toaster'
import * as m from '@/paraglide/messages'

type ServerFn<TInput, TResult> = (options: { data: TInput }) => Promise<TResult>

interface Options<TInput, TResult> {
  /** Toast shown when the call succeeds. */
  success?: (result: TResult, input: TInput) => string | undefined
  /** Re-run the current route's loaders afterwards. On by default. */
  invalidate?: boolean
  onSuccess?: (result: TResult, input: TInput) => void | Promise<void>
}

/** A TanStack Start server function as a mutation: pending state from the query
 * library, a toast on failure (and on success when `success` is given), and the
 * route's data refreshed afterwards. Call sites no longer carry their own
 * try/catch, busy flag and `router.invalidate()`. */
export function useServerMutation<TInput, TResult>(serverFn: ServerFn<TInput, TResult>, options: Options<TInput, TResult> = {}) {
  const router = useRouter()
  const { success, invalidate = true, onSuccess } = options
  return useMutation({
    mutationFn: (input: TInput) => serverFn({ data: input }),
    onSuccess: async (result, input) => {
      const message = success?.(result, input)
      if (message) t.success(message)
      await onSuccess?.(result, input)
      if (invalidate) await router.invalidate()
    },
    onError: (error) => {
      t.error(m['orch.failed'](), { description: error instanceof Error ? error.message : undefined })
    },
  })
}
