// Guards messages/{en,sw,fr}.json, which are the source of truth for the site's
// copy. Every locale must carry the same keys, and the house rule (no em-dashes)
// must hold. Run with `bun run i18n:check`.
import { readFileSync } from 'node:fs'

const LOCALES = ['en', 'sw', 'fr'] as const

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (key === '$schema') continue
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

const messages = Object.fromEntries(
  LOCALES.map((locale) => [locale, flatten(JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')))]),
) as Record<(typeof LOCALES)[number], Map<string, string>>

const problems: string[] = []
const base = messages.en

for (const locale of LOCALES) {
  for (const [key, text] of messages[locale]) {
    if (text.includes('—')) problems.push(`${locale}: em-dash in ${key}`)
    if (locale !== 'en' && !base.has(key)) problems.push(`${locale}: ${key} is not in en`)
  }
  if (locale === 'en') continue
  for (const key of base.keys()) if (!messages[locale].has(key)) problems.push(`${locale}: missing ${key}`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`messages ok: ${base.size} keys in ${LOCALES.join(', ')}`)
