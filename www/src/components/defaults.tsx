import { Button } from '@pleadli/ui/button'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultBoundary({ error, reset }: ErrorComponentProps) {
  return (
    <main className="container mx-auto flex flex-col gap-3 p-8 pt-20">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unexpected error.'}</p>
      <Button size="sm" className="w-fit" onClick={reset}>
        Try again
      </Button>
    </main>
  )
}

export function NotFound() {
  return (
    <main className="container mx-auto p-8 pt-20">
      <h1 className="mb-3 text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
    </main>
  )
}
