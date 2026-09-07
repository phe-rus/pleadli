import { listCases } from '@/db'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@pleadli/ui/empty'
import { NoteAddIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: () => listCases(),
  component: RouteComponent,
})

function RouteComponent() {
  const cases = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Cases opened at this station, stored locally.</p>
      </div>

      {cases.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={NoteAddIcon} />
          </EmptyMedia>
          <EmptyTitle>No open cases yet</EmptyTitle>
          <EmptyDescription>Cases opened through intake will show up here.</EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle>{c.complainant}</CardTitle>
                <CardDescription className="text-base!">
                  {c.location} — {c.created_at}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
