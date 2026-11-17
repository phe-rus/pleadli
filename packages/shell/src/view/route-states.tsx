import { Button } from '@pleadli/ui/button'
import { Skeleton } from '@pleadli/ui/skeleton'

/** What a page shows when it fails to load: what happened in plain words, what
 * to do, and a Retry button. */
export function RouteErrorView({ title, body, retry, onRetry }: { title: string; body: string; retry: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <h2>{title}</h2>
      <p className="text-muted-foreground">{body}</p>
      <Button variant="outline" onClick={onRetry} className="cursor-pointer">
        {retry}
      </Button>
    </div>
  )
}

const bar = (width: string) => <Skeleton className={`h-4 ${width}`} />

/** A list while it loads: a heading and rows. */
export function ListSkeleton({ rows = 8, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className="flex flex-col gap-3 p-6">
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

/** A record while it loads: its title, a strip of tabs and a body. */
export function RecordSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className="flex flex-col gap-4 p-6">
      <Skeleton className="h-7 w-64" />
      <div className="flex gap-2">
        {bar('w-20')}
        {bar('w-20')}
        {bar('w-20')}
        {bar('w-20')}
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

/** A side panel while it loads. */
export function PanelSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className="flex flex-col gap-3 p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}
