import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { orgModel } from '@/data/docs'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/how-it-works')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">How it works</Badge>
        <h1 className="text-3xl!">Shared case identity, institution-owned records</h1>
        <p>
          This is the design principle behind Pleadli, and the part that is already real in the
          platform's organizational model.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">The principle</h2>
        <p>
          A case should have one continuous identity as it moves between institutions. What stays
          separate is who owns the records: police records belong to the Uganda Police Force, DPP
          decisions belong to the DPP. An institution can reference a case without gaining access
          to another institution's internal records. Referenceability is not the same as
          visibility.
        </p>
        <p>
          Today the same matter can carry a station CRB number, a separate DPP file number, and a
          separate court cause number, with no shared thread between them. Closing that gap without
          collapsing institutional ownership is the actual engineering problem.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">What's real today: the organizational model</h2>
        <p>
          Case-level workflows arrive with Police and DPP. What already exists is the layer
          underneath them, institutions, their internal structure, and who belongs where.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {orgModel.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <HugeiconsIcon icon={item.icon} className="text-muted-foreground" />
              <CardTitle>{item.title}</CardTitle>
              <CardDescription className="text-base!">{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">One model, any size</h2>
        <p>
          The same organizational model is what lets a Pleadli application serve an individual
          user, a team, or a larger organization, an individual lawyer and a law firm both use
          Pleadli Lawyers through the same model, structured differently. The hierarchy shape is
          up to each organization, Pleadli doesn't assume every institution looks like a police
          force.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Platform vs. institutional administration</h2>
        <p>
          Platform administration manages Pleadli itself, which institutions exist and what
          they're entitled to use. Institutional administration is scoped to one institution:
          managing that institution's own units and members does not grant any visibility into
          another institution's structure.
        </p>
      </div>
    </div>
  )
}
