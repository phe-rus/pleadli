import * as m from '@/paraglide/messages'
import {
  Database02Icon,
  EyeIcon,
  FlowConnectionIcon,
  IdentityCardIcon,
  Layers01Icon,
  Location01Icon,
  LockKeyIcon,
  Route01Icon,
} from '@hugeicons/core-free-icons'

/** Text is read through getters, so each request renders in its own language. */
export const principles = [
  {
    id: 'identity',
    icon: IdentityCardIcon,
    get title() { return m["about.principles.identity.title"]() },
    get description() { return m["about.principles.identity.body"]() },
  },
  {
    id: 'owned',
    icon: LockKeyIcon,
    get title() { return m["about.principles.owned.title"]() },
    get description() { return m["about.principles.owned.body"]() },
  },
  {
    id: 'reference',
    icon: EyeIcon,
    get title() { return m["about.principles.reference.title"]() },
    get description() { return m["about.principles.reference.body"]() },
  },
] as const

export const pillars = [
  {
    id: 'fragmentation',
    icon: FlowConnectionIcon,
    get title() { return m["about.pillars.fragmentation.title"]() },
    get paragraphs() { return [m["about.pillars.fragmentation.p1"](), m["about.pillars.fragmentation.p2"]()] },
  },
  {
    id: 'centralization',
    icon: Database02Icon,
    get title() { return m["about.pillars.centralization.title"]() },
    get paragraphs() { return [m["about.pillars.centralization.p1"]()] },
  },
  {
    id: 'purpose',
    icon: Layers01Icon,
    get title() { return m["about.pillars.purpose.title"]() },
    get paragraphs() { return [m["about.pillars.purpose.p1"](), m["about.pillars.purpose.p2"]()] },
  },
  {
    id: 'thread',
    icon: Route01Icon,
    get title() { return m["about.pillars.thread.title"]() },
    get paragraphs() { return [m["about.pillars.thread.p1"]()] },
  },
  {
    id: 'uganda',
    icon: Location01Icon,
    get title() { return m["about.pillars.uganda.title"]() },
    get paragraphs() { return [m["about.pillars.uganda.p1"]()] },
  },
] as const
