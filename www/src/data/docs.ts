import * as m from '@/paraglide/messages'
import {
  Briefcase01Icon,
  FlowConnectionIcon,
  PoliceBadgeIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

/** Text is read through getters, so each request renders in its own language. */
export const docsNav = [
  { slug: '', get title() { return m["docs.nav.overview"]() }, to: '/docs' },
  { slug: 'getting-started', get title() { return m["docs.nav.getting_started"]() }, to: '/docs/getting-started' },
  { slug: 'how-it-works', get title() { return m["docs.nav.how_it_works"]() }, to: '/docs/how-it-works' },
  { slug: 'applications', get title() { return m["docs.nav.applications"]() }, to: '/docs/applications' },
  { slug: 'security', get title() { return m["docs.nav.security"]() }, to: '/docs/security' },
  { slug: 'documents', get title() { return m["docs.nav.documents"]() }, to: '/docs/documents' },
  { slug: 'ai', get title() { return m["docs.nav.ai"]() }, to: '/docs/ai' },
] as const

export const orgModel = [
  {
    id: 'organization',
    icon: FlowConnectionIcon,
    get title() { return m["docs.how.org.organization.title"]() },
    get description() { return m["docs.how.org.organization.body"]() },
  },
  {
    id: 'unit',
    icon: PoliceBadgeIcon,
    get title() { return m["docs.how.org.unit.title"]() },
    get description() { return m["docs.how.org.unit.body"]() },
  },
  {
    id: 'membership',
    icon: UserGroupIcon,
    get title() { return m["docs.how.org.membership.title"]() },
    get description() { return m["docs.how.org.membership.body"]() },
  },
  {
    id: 'entitlement',
    icon: Briefcase01Icon,
    get title() { return m["docs.how.org.entitlement.title"]() },
    get description() { return m["docs.how.org.entitlement.body"]() },
  },
] as const
