import { seo } from '@/lib/seo'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { getProducts } from '@/data/products'
import {
  CheckmarkCircle02Icon,
  CircleIcon,
  Database02Icon,
  FingerPrintIcon,
  FolderLockIcon,
  Key01Icon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import * as m from '@/paraglide/messages'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/docs/security')({
  head: () => seo({ title: `${m["docs.security.title"]()} · Pleadli`, description: m["docs.security.lead"](), path: '/docs/security' }),
  component: RouteComponent,
})

const shared = [
  { id: 'db', icon: Database02Icon, get title() { return m["docs.security.shared.db.title"]() }, get description() { return m["docs.security.shared.db.body"]() } },
  { id: 'vault', icon: FolderLockIcon, get title() { return m["docs.security.shared.vault.title"]() }, get description() { return m["docs.security.shared.vault.body"]() } },
  { id: 'key', icon: Key01Icon, get title() { return m["docs.security.shared.key.title"]() }, get description() { return m["docs.security.shared.key.body"]() } },
  { id: 'audit', icon: FingerPrintIcon, get title() { return m["docs.security.shared.audit.title"]() }, get description() { return m["docs.security.shared.audit.body"]() } },
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
        <Badge variant="outline">{m["docs.nav.security"]()}</Badge>
        <h1 className="text-3xl!">{m["docs.security.title"]()}</h1>
        <p>{m["docs.security.lead"]()}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shared.map((item) => (
          <Card key={item.id} className="p-4">
            <HugeiconsIcon icon={item.icon} className="mb-2 text-muted-foreground" />
            <CardTitle>{item.title}</CardTitle>
            <CardDescription className="text-sm">{item.description}</CardDescription>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">{m["docs.security.per_app_title"]()}</h2>
        <p className="text-muted-foreground">{m["docs.security.per_app_lead"]()}</p>
        <div className="flex flex-col gap-2">
          {getProducts().map((product) => (
            <Link
              key={product.slug}
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/40"
            >
              <StatusIcon state={product.security.state} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground">{product.security.detail}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.security.open_title"]()}</h2>
        <ul className="flex flex-col gap-1.5">
          {[m["docs.security.open.police"](), m["docs.security.open.roles"](), m["docs.security.open.exchange"](), m["docs.security.open.codesign"]()].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">{m["docs.security.offline_title"]()}</h2>
        <p>{m["docs.security.offline_body"]()}</p>
      </div>
    </div>
  )
}
