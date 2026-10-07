import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { orgModel } from '@/data/docs'
import * as m from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/how-it-works')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">{m["docs.nav.how_it_works"]()}</Badge>
        <h1 className="text-3xl!">{m["docs.how.title"]()}</h1>
        <p>{m["docs.how.lead"]()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.how.principle_title"]()}</h2>
        <p>{m["docs.how.principle_p1"]()}</p>
        <p>{m["docs.how.principle_p2"]()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.how.real_title"]()}</h2>
        <p>{m["docs.how.real_body"]()}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {orgModel.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <HugeiconsIcon icon={item.icon} className="text-muted-foreground" />
              <CardTitle>{item.title}</CardTitle>
              <CardDescription className="text-base!">{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.how.size_title"]()}</h2>
        <p>{m["docs.how.size_body"]()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.how.admin_title"]()}</h2>
        <p>{m["docs.how.admin_body"]()}</p>
      </div>
    </div>
  )
}
