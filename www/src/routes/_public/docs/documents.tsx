import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { getProducts } from '@/data/products'
import {
  CheckmarkCircle02Icon,
  CircleIcon,
  Folder02Icon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import * as m from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/docs/documents')({
  head: () => seo({ title: `${m["docs.documents.title"]()} · Pleadli`, description: m["docs.documents.lead"](), path: '/docs/documents' }),
  component: RouteComponent,
})

const pipeline = [
  { id: 'folder', get title() { return m["docs.documents.steps.folder.title"]() }, get description() { return m["docs.documents.steps.folder.body"]() } },
  { id: 'document', get title() { return m["docs.documents.steps.document.title"]() }, get description() { return m["docs.documents.steps.document.body"]() } },
  { id: 'version', get title() { return m["docs.documents.steps.version.title"]() }, get description() { return m["docs.documents.steps.version.body"]() } },
  { id: 'preview', get title() { return m["docs.documents.steps.preview.title"]() }, get description() { return m["docs.documents.steps.preview.body"]() } },
  { id: 'sign', get title() { return m["docs.documents.steps.sign.title"]() }, get description() { return m["docs.documents.steps.sign.body"]() } },
  { id: 'freeze', get title() { return m["docs.documents.steps.freeze.title"]() }, get description() { return m["docs.documents.steps.freeze.body"]() } },
] as const

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
          <HugeiconsIcon icon={Folder02Icon} data-icon="inline-start" />
          {m["docs.nav.documents"]()}
        </Badge>
        <h1 className="text-3xl!">{m["docs.documents.title"]()}</h1>
        <p>{m["docs.documents.lead"]()}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {pipeline.map((step, index) => (
          <div key={step.id} className="flex flex-col gap-1 rounded-lg border p-3">
            <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
            <span className="text-sm font-medium">{step.title}</span>
            <span className="text-xs text-muted-foreground">{step.description}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">{m["docs.documents.per_app_title"]()}</h2>
        <div className="flex flex-col gap-2">
          {getProducts().map((product) => (
            <Link
              key={product.slug}
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/40"
            >
              <StatusIcon state={product.documents.state} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground">{product.documents.detail}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.documents.missing_title"]()}</h2>
        <ul className="flex flex-col gap-1.5">
          {[m["docs.documents.missing.folders"](), m["docs.documents.missing.docx"](), m["docs.documents.missing.shared"]()].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Card className="gap-2 p-4">
        <CardTitle>{m["docs.documents.works_title"]()}</CardTitle>
        <CardDescription>{m["docs.documents.works_body"]()}</CardDescription>
      </Card>
    </div>
  )
}
