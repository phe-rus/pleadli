import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { getProducts } from '@/data/products'
import * as m from '@/paraglide/messages'
import {
  CheckmarkCircle02Icon,
  CircleIcon,
  MinusSignCircleIcon,
  Robot01Icon,
  ShieldQuestionMarkIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/docs/ai')({
  head: () => seo({ title: `${m["docs.ai.title"]()} · Pleadli`, description: m["docs.ai.lead"](), path: '/docs/ai' }),
  component: RouteComponent,
})

const stages = ['generated', 'suggested', 'reviewed', 'official'] as const

function StatusIcon({ state }: { state: true | false | 'partial' }) {
  const icon = state === true ? CheckmarkCircle02Icon : state === 'partial' ? MinusSignCircleIcon : CircleIcon
  return (
    <HugeiconsIcon
      icon={icon}
      className={cn(
        'size-4! shrink-0',
        state === true && 'text-primary',
        state === 'partial' && 'text-muted-foreground',
        state === false && 'text-muted-foreground/50',
      )}
    />
  )
}

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">
          <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
          {m["docs.nav.ai"]()}
        </Badge>
        <h1 className="text-3xl!">{m["docs.ai.title"]()}</h1>
        <p>{m["docs.ai.lead"]()}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage) => (
          <Card key={stage} className="p-4">
            <CardTitle>{m[`docs.ai.stage.${stage}.title`]()}</CardTitle>
            <CardDescription className="text-sm">{m[`docs.ai.stage.${stage}.body`]()}</CardDescription>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">{m["docs.ai.per_app_title"]()}</h2>
        <div className="flex flex-col gap-2">
          {getProducts().map((product) => (
            <Link
              key={product.slug}
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/40"
            >
              <StatusIcon state={product.ai.state} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground">{product.ai.detail}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.ai.rules_title"]()}</h2>
        <ul className="flex flex-col gap-1.5">
          {[m["docs.ai.rules.provider"](), m["docs.ai.rules.context"](), m["docs.ai.rules.deadlines"](), m["docs.ai.rules.adopt"]()].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
        <HugeiconsIcon icon={ShieldQuestionMarkIcon} className="mt-0.5 size-5! shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{m["docs.ai.privilege"]()}</p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <HugeiconsIcon icon={Robot01Icon} className="size-4! shrink-0" />
        {m["docs.ai.planned"]()}
      </div>
    </div>
  )
}
