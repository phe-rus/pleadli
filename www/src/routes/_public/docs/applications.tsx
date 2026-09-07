import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { institutions } from '@/data/home'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/institutions')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">Institutions</Badge>
        <h1 className="text-3xl!">Built one institution at a time</h1>
        <p>
          Pleadli is not attempting every institution at once. Police and DPP come first, real and
          in progress, not a placeholder for a future rollout.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {institutions.map((institution) => (
          <Card key={institution.name}>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between">
                <div
                  className={
                    institution.status === 'Building now'
                      ? 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
                      : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                  }
                >
                  <HugeiconsIcon icon={institution.icon} />
                </div>
                <Badge variant={institution.status === 'Building now' ? 'default' : 'secondary'}>
                  {institution.status}
                </Badge>
              </div>
              <div>
                <CardTitle>
                  {institution.name === 'Police'
                    ? 'Uganda Police Force'
                    : institution.name === 'DPP'
                      ? 'Office of the DPP'
                      : institution.name}
                </CardTitle>
                <CardDescription className="text-base!">{institution.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Why this order</h2>
        <p>
          Police and DPP sit next to each other in the case lifecycle, investigation and
          prosecution decisions, which makes the shared-identity, institution-owned-records model
          testable end to end without needing every institution built first. Courts, Lawyers, and
          Prisons extend the same model once that's proven.
        </p>
      </div>
    </div>
  )
}
