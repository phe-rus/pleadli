import { availableDecisionTypes } from '@/features/decisions/schema'
import { activeJurisdiction } from '@/lib/jurisdiction'
import { prosecutionNames } from '@pleadli/setup'
import { localeNames } from '@/features/i18n'
import { getLocale } from '@/paraglide/runtime'
import type { CountryContext } from './data'
import { computeClocks, type CustodyEvent } from '@/features/custody'
import { formatDate } from '@/lib/dates'

/** The file's clocks as the app counted them, in plain lines for Assist. */
let readCustody: (fileId: string) => CustodyEvent[] = () => []
export function setCustodyReader(read: (fileId: string) => CustodyEvent[]) {
  readCustody = read
}
/** Hours or days, in plain English, for the model. */
const span = (ms: number) => {
  const h = Math.round(Math.abs(ms) / 3_600_000)
  return h >= 48 ? `${Math.round(h / 24)} days` : `${h} hours`
}

/** The clocks spelled out for the model, most urgent first: what it must act
 * on now and what is already past, so a small model cannot mistake one for
 * the other. */
function clockLines(fileId: string): string[] {
  const now = Date.now()
  const order = { overdue: 0, soon: 1, running: 2, late: 3, met: 4 }
  return [...computeClocks(readCustody(fileId), activeJurisdiction(), now)]
    .sort((a, b) => order[a.status] - order[b.status])
    .map((c) => {
      const what = `${c.limit.label.en}${c.person ? ` (${c.person})` : ''}, ${c.limit.basis}`
      const due = formatDate(c.dueAt, 'datetime')
      switch (c.status) {
        case 'overdue':
          return `OVERDUE: ${what}. Ran out ${span(now - c.dueAt)} ago, on ${due}. Act on this first.`
        case 'soon':
          return `URGENT, ACT NOW: ${what}. Runs out in ${span(c.dueAt - now)}, on ${due}.`
        case 'running':
          return `RUNNING: ${what}. Runs out in ${span(c.dueAt - now)}, on ${due}.`
        case 'late':
          return `PAST, MET LATE: ${what}. Was due ${due}, ended ${formatDate(c.stoppedAt!, 'datetime')}. Nothing left to do for it now except note the breach.`
        default:
          return `PAST, MET: ${what}. Ended ${formatDate(c.stoppedAt!, 'datetime')} in time.`
      }
    })
}

/** What Assist is told about where it works: the country, the language to
 * answer in, the laws the office works under, and the decisions it can take.
 * All of it from the country pack, so there is one source. */
export function assistContext(fileId?: string | null): CountryContext {
  const country = activeJurisdiction()
  return {
    code: country?.code ?? '',
    institution: `${prosecutionNames(country).name} (${prosecutionNames(country).short}), headed by the ${prosecutionNames(country).head}`,
    country: country?.name.en ?? 'not set',
    fileSections: country?.fileSections?.sections.map((s) => `${s.code}. ${s.title.en}`) ?? [],
    timeLimits: country?.timeLimits.map((t) => `${t.label.en}: ${t.hours >= 72 ? `${t.hours / 24} days` : `${t.hours} hours`} (${t.basis})`) ?? [],
    courts: [...(country?.courts ?? [])],
    clocks: fileId ? clockLines(fileId) : [],
    language: localeNames[getLocale() as keyof typeof localeNames] ?? 'English',
    laws: country?.laws.map((l) => (l.cite ? `${l.title} (${l.cite})` : l.title)) ?? [],
    decisions: availableDecisionTypes().map((d) => `${d.value}: ${d.label}`),
  }
}
