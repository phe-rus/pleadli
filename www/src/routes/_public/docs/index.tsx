import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import * as m from '@/paraglide/messages'
import { ArrowRight02Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/')({
  head: () => seo({ title: `${m["docs.index.title"]()} · Pleadli`, description: m["docs.index.lead"](), path: '/docs' }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">
          <HugeiconsIcon icon={BookOpen01Icon} data-icon="inline-start" />
          {m["docs.index.badge"]()}
        </Badge>
        <h1 className="text-3xl!">{m["docs.index.title"]()}</h1>
        <p>{m["docs.index.lead"]()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.index.what_title"]()}</h2>
        <p>{m["docs.index.what_body"]()}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.index.scope_title"]()}</h2>
        <p>
          {m["docs.index.scope_body"]()} {m["docs.see"]()}{' '}
          <Link to="/products" className="font-medium text-foreground underline underline-offset-2">
            {m["docs.products_link"]()}
          </Link>{' '}
          {m["docs.index.scope_after"]()}
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{m["docs.nav.how_it_works"]()}</CardTitle>
            <CardDescription className="text-base!">{m["docs.index.next_body"]()}</CardDescription>
          </div>
          <Link
            to="/docs/how-it-works"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary"
          >
            {m["docs.read_next"]()}
            <HugeiconsIcon icon={ArrowRight02Icon} className="size-4!" />
          </Link>
        </CardHeader>
      </Card>
    </div>
  )
}
