// Keeps the shared shell shared: each app's config stays small, the view layer
// stays free of the live layer, and no app keeps a copy of a moved file.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const APPS = ['police', 'dpp', 'courts', 'lawyers', 'prisons']
const CONFIG_BUDGET = 350
const MOVED = ['tabs-store.tsx', 'tab-strip.tsx', 'tab-actions.ts', 'left-pillar.tsx', 'center-header.tsx', 'navigator.tsx', 'quick-actions.tsx', 'tab-icon.ts']

const problems: string[] = []
for (const app of APPS) {
  const dir = join('apps', app, 'src/features/workspace')
  const config = join(dir, 'config.tsx')
  if (!existsSync(config)) problems.push(`${app}: missing ${config}`)
  else {
    const lines = readFileSync(config, 'utf8').split('\n').length
    if (lines > CONFIG_BUDGET) problems.push(`${app}: config.tsx is ${lines} lines, budget ${CONFIG_BUDGET}`)
  }
  for (const name of MOVED) if (existsSync(join(dir, name))) problems.push(`${app}: ${name} is a copy of a file that now lives in @pleadli/shell`)
}

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
for (const file of walk('packages/shell/src/view')) {
  if (/from ['"](\.\.\/live|@tauri-apps|@tanstack)/.test(readFileSync(file, 'utf8'))) problems.push(`${file}: the view layer must not import live, Tauri or router code`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('shell budget ok')
