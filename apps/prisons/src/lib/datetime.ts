const pad = (n: number) => String(n).padStart(2, '0')

/** Milliseconds to the value a `datetime-local` input wants (local zone). */
export function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(value: string) {
  return new Date(value).getTime()
}

/** Milliseconds to the value a `date` input wants. */
export function toDateInput(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A `date` input value to local midnight in milliseconds, or null if empty. */
export function fromDateInput(value: string) {
  if (!value) return null
  return new Date(`${value}T00:00:00`).getTime()
}
