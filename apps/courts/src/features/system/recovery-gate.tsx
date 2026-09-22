import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { FC, PropsWithChildren } from 'react'
import * as z from 'zod'

const statusSchema = z.object({ state: z.enum(['ready', 'recovery']), reason: z.string().nullable() })

/** Decides before any page loads whether the data could be opened. If it could
 * not, the window says so plainly instead of every page failing to load. */
export const RecoveryGate: FC<PropsWithChildren> = ({ children }) => {
  const { data, isError } = useQuery({
    queryKey: ['system', 'status'] as const,
    queryFn: async () => statusSchema.parse(await api('GET', '/api/system/status')),
    staleTime: Infinity,
    retry: false,
  })

  if (data?.state === 'recovery') {
    return (
      <article className="flex h-svh w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <h1>The court&rsquo;s data could not be opened</h1>
        <p className="max-w-lg text-muted-foreground">
          Nothing has been changed or deleted. The records are still on this computer, but this copy of Pleadli Courts cannot read them right now.
          {data.reason ? ` ${data.reason}` : ''}
        </p>
        <p className="max-w-lg text-muted-foreground">Restoring from a backup is not built into this version. Keep the data folder as it is and ask for help before you do anything else.</p>
      </article>
    )
  }
  if (isError) {
    return (
      <article className="flex h-svh w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <h1>Pleadli Courts could not start</h1>
        <p className="max-w-lg text-muted-foreground">The application did not answer. Close it and open it again.</p>
      </article>
    )
  }
  return <>{children}</>
}
