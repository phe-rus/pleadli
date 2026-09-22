export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

/** Buckets a list of timestamps into `weeks` trailing weekly counts, most
 * recent week last. Shared by Overview (a compact recent trend) and
 * Reports & Analytics (the same real data, looked at more closely) so the
 * two views never compute "weeks ago" differently. */
export function weeklyBuckets(timestamps: number[], weeks = 8) {
  const now = Date.now()
  const buckets = Array.from({ length: weeks }, () => 0)
  for (const ts of timestamps) {
    const weeksAgo = Math.floor((now - ts) / WEEK_MS)
    const index = weeks - 1 - weeksAgo
    if (index >= 0 && index < weeks) buckets[index] += 1
  }
  return buckets
}

/** The approximate start timestamp of each bucket `weeklyBuckets` produces,
 * for labeling, bucket `weeks - 1` (the last one) is the current week. */
export function weekBucketStarts(weeks = 8) {
  const now = Date.now()
  return Array.from({ length: weeks }, (_, index) => {
    const weeksAgo = weeks - 1 - index
    return now - (weeksAgo + 1) * WEEK_MS
  })
}
