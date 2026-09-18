import { ApiError } from '@/lib/api'

/** The node writes its messages for officers, so they are shown as they are. */
export function transferErrorText(error: unknown, fallback: string) {
  return error instanceof ApiError && error.message ? error.message : fallback
}
