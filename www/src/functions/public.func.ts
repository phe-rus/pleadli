import { findCase, findPaper } from '@/lib/public-lookup.server'
import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

/** The pages /verify and /track call these; the same lookups are served as
 * JSON at /api/public/v1 (docs/platform/PUBLIC-AND-FIELD-API.md). */
const codeInput = z.object({ code: z.string().max(40) })

export const verifyPaper = createServerFn({ method: 'GET' })
  .validator(codeInput)
  .handler(async ({ data }) => findPaper(data.code))

export const trackCase = createServerFn({ method: 'GET' })
  .validator(codeInput)
  .handler(async ({ data }) => findCase(data.code))
