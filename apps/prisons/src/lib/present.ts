/** The pieces that are there, in order: a list built from conditions such as
 * `count > 0 && m.something({ count })`, with the ones that did not apply
 * dropped. Typed to take the branded strings the messages return. */
export function present(parts: readonly (string | false | null | undefined)[]): string[] {
  return parts.filter((part): part is string => Boolean(part))
}
