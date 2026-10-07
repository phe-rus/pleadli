import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { getPlatformStory, getProducts, getReadinessLabel } from '@/data/products'
import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/products/')({
  head: () => ({
    meta: [
      { title: `${m["products.title"]().replace(/\.$/, "")} · Pleadli` },
      { name: 'description', content: m["products.lead"]() },
      { property: 'og:title', content: `${m["products.title"]().replace(/\.$/, "")} · Pleadli` },
      { property: 'og:description', content: m["products.lead"]() },
    ],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-20">
        <Badge variant="secondary">{m["nav.products"]()}</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-5xl!">
          {m["products.title"]()}
        </h1>
        <p className="md:max-w-lg md:text-base!">
          {m["products.lead"]()}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {getProducts().map((product) => (
          <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                  {m["home.learn_more"]()}
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5!" />
                </span>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-8 py-16 md:py-20">
        <div className="flex flex-col md:max-w-md">
          <h2 className="text-2xl!">{m["products.story_title"]()}</h2>
          <p>{m["products.story_lead"]()}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {getPlatformStory().map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <HugeiconsIcon icon={item.icon} className="text-muted-foreground" />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="text-base!">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </article>
  )
}
