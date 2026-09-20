/** What a jurisdiction supplies so the rest of the application does not
 * assume one country. Only the parts the application reads today are here;
 * thresholds, instruments, registers and return layouts join as their
 * features are made pack-aware. Adding a jurisdiction is legal work that
 * ends in a pack, never a change to a country field. */
export type JurisdictionPack = {
  id: string
  name: string
  country: string
  /** Shown to the officer. Dates in this build are still kept in East Africa
   * Time, so no other timezone is offered. */
  timezone: { id: string; label: string }
  regions: readonly string[]
  numbering: { pattern: string; reset: 'yearly' | 'never'; provisional: boolean }
  /** Placeholders that show the shape of a value; never stored. */
  examples: { facilityCode: string; badge: string }
}
