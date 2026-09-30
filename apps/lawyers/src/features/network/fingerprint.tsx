import { fingerprintGroups } from './data'

/** The certificate fingerprint as a grid a person compares group by group
 * between the office screen and the computer joining it. */
export function Fingerprint({ value }: { value: string }) {
  return (
    <div className="not-typeset grid grid-cols-4 gap-x-3 gap-y-1 rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-sm tracking-wider text-foreground" aria-label={value}>
      {fingerprintGroups(value).map((group, i) => (
        <span key={i}>{group}</span>
      ))}
    </div>
  )
}
