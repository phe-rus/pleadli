import { findCase, findPaper } from '@/lib/public-lookup.server'
import { limitAnonymous } from '@/lib/quota.server'
import { getRequest } from '@tanstack/react-start/server'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

/** The pages /verify and /track call these; the same lookups are served as
 * JSON at /api/public/v1 (docs/platform/PUBLIC-AND-FIELD-API.md). */
const codeInput = z.object({ code: z.string().max(40) })

/** The pages are lookups too: same limit as the JSON API. */
async function guard() {
  const quota = await limitAnonymous(getRequest())
  if (!quota.ok) throw new Error(`too_many_requests:${quota.retryAfter}`)
}

export const verifyPaper = createServerFn({ method: 'GET' })
  .validator(codeInput)
  .handler(async ({ data }) => {
    await guard()
    return findPaper(data.code)
  })

export const trackCase = createServerFn({ method: 'GET' })
  .validator(codeInput)
  .handler(async ({ data }) => {
    await guard()
    return findCase(data.code)
  })
