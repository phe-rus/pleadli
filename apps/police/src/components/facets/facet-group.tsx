import { Checkbox } from '@pleadli/ui/checkbox'
import { cn } from '@pleadli/ui/lib/utils'

export type FacetItem = {
  label: string
  count: number
}

export type FacetGroupProps = {
  label: string
  facets: readonly FacetItem[]
  defaultChecked?: readonly string[]
  className?: string
}

export const FacetGroup = ({ label, facets, defaultChecked, className }: FacetGroupProps) => {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-col gap-3">
        {facets.map((facet) => (
          <label
            key={facet.label}
            className="group flex cursor-pointer items-center justify-between gap-3 text-xs"
          >
            <span className="flex items-center gap-2">
              <Checkbox defaultChecked={defaultChecked?.includes(facet.label)} />
              {facet.label}
            </span>
            <span className="text-[0.625rem] text-muted-foreground tabular-nums">
              {facet.count}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}