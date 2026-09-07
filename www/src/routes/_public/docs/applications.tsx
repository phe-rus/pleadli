import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { applications } from '@/data/home'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/applications')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">Applications</Badge>
        <h1 className="text-3xl!">A family of purpose-built applications</h1>
        <p>
          Pleadli Police, Pleadli DPP, Pleadli Courts, Pleadli Lawyers, and Pleadli Prisons are
          separate applications, each designed around the work its users actually do. They are
          connected by Pleadli Cloud and by the cases they legitimately share, not merged into one
          product.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {applications.map((application) => (
          <Card key={application.name}>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between">
                <div
                  className={
                    application.status === 'Building now'
                      ? 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
                      : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                  }
                >
                  <HugeiconsIcon icon={application.icon} />
                </div>
                <Badge variant={application.status === 'Building now' ? 'default' : 'secondary'}>
                  {application.status}
                </Badge>
              </div>
              <div>
                <CardTitle>{application.name}</CardTitle>
                <CardDescription className="text-base!">{application.focus}</CardDescription>
              </div>
              <ul className="flex flex-col gap-1.5">
                {application.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                    {point}
                  </li>
                ))}
              </ul>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Independently useful</h2>
        <p>
          Each application provides value on its own. A police station can use Pleadli Police to
          manage its own work whether or not a given case has reached the DPP. An individual
          lawyer can use Pleadli Lawyers for their own practice with no court connection at all.
          Interoperability becomes valuable when a legitimate relationship exists, it isn't a
          requirement for an application to be useful.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Why Police and DPP first</h2>
        <p>
          Police and DPP sit next to each other in a case's early life, investigation and
          prosecution, which makes the shared-identity, institution-owned-records model testable
          end to end without needing every application built first. This is a practical starting
          point, not a sequence the other applications are waiting in line behind.
        </p>
      </div>
    </div>
  )
}
