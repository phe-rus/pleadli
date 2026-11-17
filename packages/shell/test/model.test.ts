import { describe, expect, test } from 'bun:test'
import { closeTab, initialState, jumpTarget, moveTab, openTab, parseWorkspace, serializeWorkspace, shortcutFor, togglePinned, type Rules, type WorkspaceState, type WorkspaceTab } from '../src/model'

const home: WorkspaceTab = { key: 'overview', kind: 'overview', title: 'Today', to: '/', pinned: true }
const rules: Rules = { home }
const tab = (n: number | string, extra: Partial<WorkspaceTab> = {}): WorkspaceTab => ({ key: `case:${n}`, kind: 'case', title: `Case ${n}`, to: `/cases/${n}`, ...extra })
const resolves = (to: string, key: string) => to.startsWith('/cases/') && key === `case:${to.split('/')[2]}`

const key = (over: Partial<Parameters<typeof shortcutFor>[0]>) => ({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...over })

describe('open', () => {
  test('a sixth tab replaces the one worked on longest ago, never Today or the new one', () => {
    let s: WorkspaceState = initialState(rules)
    for (let n = 1; n <= 4; n++) s = openTab(s, tab(n), rules, n * 10)
    s = openTab(s, tab(5), rules, 100)
    expect(s.tabs.map((t) => t.key)).toEqual(['overview', 'case:2', 'case:3', 'case:4', 'case:5'])
  })
  test('a pinned tab is kept while an unpinned one can go', () => {
    let s: WorkspaceState = initialState(rules)
    for (let n = 1; n <= 4; n++) s = openTab(s, tab(n), rules, n * 10)
    s = togglePinned(s, 'case:1', rules)
    s = openTab(s, tab(5), rules, 100)
    expect(s.tabs.some((t) => t.key === 'case:1')).toBe(true)
    expect(s.tabs.some((t) => t.key === 'case:2')).toBe(false)
  })
  test('recents never pass three and put the newest first', () => {
    let s: WorkspaceState = initialState(rules)
    for (let n = 1; n <= 4; n++) s = openTab(s, tab(n), rules, n)
    expect(s.recents.map((r) => r.key)).toEqual(['case:4', 'case:3', 'case:2'])
  })
  test('reopening an area refreshes its title, a record keeps its own', () => {
    let s = openTab(initialState(rules), { key: 'area:/x', kind: 'area', title: 'Old', to: '/x' }, rules)
    s = openTab(s, tab(1, { title: 'REF-1' }), rules)
    s = openTab(s, { key: 'area:/x', kind: 'area', title: 'New', to: '/x' }, rules)
    s = openTab(s, tab(1, { title: 'Case 1' }), rules)
    expect(s.tabs.find((t) => t.key === 'area:/x')?.title).toBe('New')
    expect(s.tabs.find((t) => t.key === 'case:1')?.title).toBe('REF-1')
  })
})

describe('close, pin and move', () => {
  test('a pinned tab and Today ignore close', () => {
    let s = openTab(initialState(rules), tab(1), rules)
    s = togglePinned(s, 'case:1', rules)
    expect(closeTab(s, 'case:1', rules)).toBe(s)
    expect(closeTab(s, 'overview', rules)).toBe(s)
    s = togglePinned(s, 'case:1', rules)
    expect(closeTab(s, 'case:1', rules).tabs.map((t) => t.key)).toEqual(['overview'])
  })
  test('nothing moves ahead of Today', () => {
    let s = openTab(openTab(initialState(rules), tab(1), rules), tab(2), rules)
    expect(moveTab(s, 'case:2', 'overview')).toBe(s)
    expect(moveTab(s, 'overview', 'case:2')).toBe(s)
    s = moveTab(s, 'case:2', 'case:1')
    expect(s.tabs.map((t) => t.key)).toEqual(['overview', 'case:2', 'case:1'])
  })
  test('Today cannot be pinned off', () => {
    const s = initialState(rules)
    expect(togglePinned(s, 'overview', rules)).toBe(s)
  })
})

describe('load', () => {
  test('a saved tab that no longer resolves is dropped, Today stays first', () => {
    const raw = JSON.stringify({ tabs: [tab(1), { key: 'case:9', kind: 'case', title: 'Gone', to: '/gone' }], recents: [{ key: 'case:9', kind: 'case', title: 'Gone', to: '/gone' }] })
    const s = parseWorkspace(raw, rules, { resolves })
    expect(s.tabs.map((t) => t.key)).toEqual(['overview', 'case:1'])
    expect(s.recents).toEqual([])
  })
  test('garbage falls back to an empty workspace', () => {
    expect(parseWorkspace('{not json', rules, { resolves }).tabs).toEqual([home])
    expect(parseWorkspace(null, rules, { resolves }).leftOpen).toBe(true)
  })
  test('Prisons fields load from their present names, the width is clamped', () => {
    const raw = JSON.stringify({ rightOpen: true, rightLocked: true, rightWidth: 560, sidebarView: 'inbox', rightMode: 'record', areasTouched: true, ignored: 1 })
    const s = parseWorkspace(raw, rules, { resolves, extras: ['sidebarView', 'rightMode', 'areasTouched'] })
    expect(s.rightOpen).toBe(true)
    expect(s.rightLocked).toBe(true)
    expect(s.rightWidth).toBe(560)
    expect(s.extras).toEqual({ sidebarView: 'inbox', rightMode: 'record', areasTouched: true })
    expect(parseWorkspace(JSON.stringify({ rightWidth: 5000 }), rules, { resolves }).rightWidth).toBe(720)
  })
  test('saving and loading round trips with extras at the top level', () => {
    const s = { ...openTab(initialState(rules), tab(1), rules, 5), extras: { rightMode: 'assistant' } }
    const raw = serializeWorkspace(s)
    expect(JSON.parse(raw).rightMode).toBe('assistant')
    expect(parseWorkspace(raw, rules, { resolves, extras: ['rightMode'] })).toEqual(s)
  })
  test('folded sections load and an unseen section counts as open', () => {
    const s = parseWorkspace(JSON.stringify({ sections: { cells: false, odd: 'x' } }), rules, { resolves })
    expect(s.sections).toEqual({ cells: false })
  })
})

describe('shortcuts', () => {
  test('Ctrl K does nothing with search off, and toggles with search on', () => {
    expect(shortcutFor(key({}), { searchEnabled: false, searchOpen: false })).toBeNull()
    expect(shortcutFor(key({}), { searchEnabled: true, searchOpen: false })).toEqual({ type: 'search' })
    expect(shortcutFor(key({}), { searchEnabled: true, searchOpen: true })).toEqual({ type: 'search' })
  })
  test('nothing else fires while search is open', () => {
    const ctx = { searchEnabled: true, searchOpen: true }
    for (const k of ['w', 'Tab', '1', '9', 't', 's']) expect(shortcutFor(key({ key: k }), ctx)).toBeNull()
  })
  test('tabs, jumps, quick add and save', () => {
    const ctx = { searchEnabled: true, searchOpen: false }
    expect(shortcutFor(key({ key: 'w' }), ctx)).toEqual({ type: 'close' })
    expect(shortcutFor(key({ key: 'Tab', shiftKey: true }), ctx)).toEqual({ type: 'cycle', delta: -1 })
    expect(shortcutFor(key({ key: 'Tab' }), ctx)).toEqual({ type: 'cycle', delta: 1 })
    expect(shortcutFor(key({ key: '3' }), ctx)).toEqual({ type: 'jump', index: 2 })
    expect(shortcutFor(key({ key: 't', ctrlKey: false, metaKey: true }), ctx)).toEqual({ type: 'quick-add' })
    expect(shortcutFor(key({ key: 's' }), ctx)).toEqual({ type: 'save' })
    expect(shortcutFor(key({ key: 'w', altKey: true }), ctx)).toBeNull()
    expect(shortcutFor(key({ key: 'w', ctrlKey: false }), ctx)).toBeNull()
  })
  test('9 jumps to the last tab', () => {
    expect(jumpTarget(8, 4)).toBe(3)
    expect(jumpTarget(1, 4)).toBe(1)
    expect(jumpTarget(6, 4)).toBe(-1)
  })
})

describe('Prisons side panel kept as an option', () => {
  const prisons: Rules = { home, rightTemporary: true }
  test('an unlocked side panel starts closed, a locked one comes back open at its width', () => {
    expect(parseWorkspace(JSON.stringify({ rightOpen: true, rightLocked: false }), prisons, { resolves }).rightOpen).toBe(false)
    const locked = parseWorkspace(JSON.stringify({ rightOpen: true, rightLocked: true, rightWidth: 560 }), prisons, { resolves })
    expect(locked.rightOpen).toBe(true)
    expect(locked.rightWidth).toBe(560)
    expect(parseWorkspace(JSON.stringify({ rightOpen: true, rightLocked: false }), rules, { resolves }).rightOpen).toBe(true)
  })
})
