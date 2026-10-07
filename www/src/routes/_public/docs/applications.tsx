import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { getProducts, getReadinessLabel } from '@/data/products'
import * as m from '@/paraglide/messages'
import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/applications')({
  head: () => seo({ title: `${m["docs.apps.title"]()} · Pleadli`, description: m["docs.apps.lead"](), path: '/docs/applications' }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">{m["docs.nav.applications"]()}</Badge>
        <h1 className="text-3xl!">{m["docs.apps.title"]()}</h1>
        <p>
          {m["docs.apps.lead"]()} {m["docs.see"]()}{' '}
          <Link to="/products" className="font-medium text-foreground underline underline-offset-2">
            {m["docs.apps.products_link"]()}
          </Link>{' '}
          {m["docs.apps.lead_after"]()}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {getProducts().map((product) => (
          <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <div
                    className={
                      product.readiness === 'building'
                        ? 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
                        : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                    }
                  >
                    <HugeiconsIcon icon={product.icon} />
                  </div>
                  <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'}>
                    {getReadinessLabel()[product.readiness]}
                  </Badge>
                </div>
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className="text-base!">{product.tagline}</CardDescription>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {m["docs.read_more"]()}
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5!" />
                </span>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.apps.useful_title"]()}</h2>
        <p>{m["docs.apps.useful_body"]()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.apps.first_title"]()}</h2>
        <p>{m["docs.apps.first_body"]()}</p>
      </div>
    </div>
  )
}
