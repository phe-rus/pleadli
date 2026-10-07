import { getLocale, type Locale } from '@/paraglide/runtime'

export type DeepPartial<T> = T extends readonly (infer U)[] ? (DeepPartial<U> | undefined)[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base
  if (Array.isArray(base)) {
    const o = over as unknown[]
    return base.map((item, i) => merge(item, o[i])) as T
  }
  // Icons and other components are objects too: only plain data is merged.
  if (base && typeof base === 'object' && Object.getPrototypeOf(base) === Object.prototype) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = merge(out[k], v)
    return out as T
  }
  return (typeof over === typeof base ? over : base) as T
}

/** English content with the visitor's language laid over it. Whatever a
 * translation leaves out stays in English rather than going blank. Read it
 * while rendering (never at module load), so each request gets its language. */
export function localized<T>(base: T, overlays: Partial<Record<Locale, unknown>>): T {
  return merge(base, overlays[getLocale()])
}
