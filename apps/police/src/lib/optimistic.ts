import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Optimistic updates for the app's lists, written once so every feature uses the same careful
 * steps. The recipe is the standard TanStack Query one: stop any refetch that could overwrite the
 * change, remember what was cached, apply the change at once, put it back if the save fails, and
 * refetch when the call settles so the screen always ends up showing what was really stored.
 *
 * Every list in this app is "newest first by its own date, at most 50 rows", so a new record is
 * slotted in by that date (not just placed on top) and the list never grows past its page.
 */

type Item = { id: string }

export type ListConfig = {
  /** The cache key every list of this kind starts with, e.g. ['custody', 'list']. */
  listKey: QueryKey
  /** Everything to refetch once the save settles. Defaults to the list key. */
  invalidate?: QueryKey[]
  /** The item field the list is sorted by, newest first. */
  sortBy?: string
  /** The page size the list is cut to. */
  limit?: number
}

const isEmpty = (value: unknown) => value === '' || value == null
/** The list nobody has searched or filtered, the one on screen while a record is being added. */
const isUnfiltered = (key: QueryKey, listKey: QueryKey) => key.slice(listKey.length).every(isEmpty)
const isItem = (value: unknown): value is Item => typeof value === 'object' && value !== null && typeof (value as Item).id === 'string'

/** The record as it will look once the edit is saved: only fields the record already has, and only
 * where the kind of value matches, so a form field that is not a column is never copied in. */
function applyEdit<T extends Item>(item: T, edit: object): T {
  const next: Record<string, unknown> = { ...item }
  for (const [field, value] of Object.entries(edit)) {
    if (!(field in next)) continue
    if (value === null || next[field] === null || typeof value === typeof next[field]) next[field] = value
  }
  return next as T
}

function slotIn<T extends Item>(items: T[], created: T, config: ListConfig): T[] {
  const others = items.filter((item) => item.id !== created.id)
  const sortBy = config.sortBy
  const merged = sortBy
    ? [...others, created].sort((a, b) => Number((b as Record<string, unknown>)[sortBy] ?? 0) - Number((a as Record<string, unknown>)[sortBy] ?? 0))
    : [created, ...others]
  const limit = config.limit ?? 50
  return merged.length > Math.max(limit, items.length) ? merged.slice(0, Math.max(limit, items.length)) : merged
}

function refreshAll(queryClient: QueryClient, config: ListConfig) {
  for (const queryKey of config.invalidate ?? [config.listKey]) void queryClient.invalidateQueries({ queryKey })
  // What the station has to do next is read from all of these records, so it is read again whenever any of them changes.
  void queryClient.invalidateQueries({ queryKey: ['attention'] })
}

/** A new record goes into the list the instant the save returns it. */
export function optimisticCreate<T extends Item = Item>(queryClient: QueryClient, config: ListConfig) {
  return {
    onSuccess: (created: T) => {
      if (!isItem(created)) return
      queryClient.setQueriesData<unknown>(
        { queryKey: config.listKey, predicate: (query) => isUnfiltered(query.queryKey, config.listKey) },
        (old: unknown) => (Array.isArray(old) ? slotIn(old as T[], created, config) : old),
      )
    },
    onSettled: () => refreshAll(queryClient, config),
  }
}

/** An edit shows in every cached list at once, and comes back out if the save fails. */
export function optimisticUpdate<T extends Item = Item>(queryClient: QueryClient, config: ListConfig) {
  return {
    onMutate: async ({ id, input }: { id: string; input: object }) => {
      await queryClient.cancelQueries({ queryKey: config.listKey })
      const snapshot = queryClient.getQueriesData<unknown>({ queryKey: config.listKey })
      queryClient.setQueriesData<unknown>({ queryKey: config.listKey }, (old: unknown) =>
        Array.isArray(old) ? old.map((item) => (isItem(item) && item.id === id ? applyEdit(item, input) : item)) : old,
      )
      return function rollback() {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
      }
    },
    onError: (_error: unknown, _vars: unknown, rollback: (() => void) | undefined) => rollback?.(),
    onSuccess: (saved: T) => {
      if (!isItem(saved)) return
      queryClient.setQueriesData<unknown>({ queryKey: config.listKey }, (old: unknown) =>
        Array.isArray(old) ? old.map((item) => (isItem(item) && item.id === saved.id ? saved : item)) : old,
      )
    },
    onSettled: () => refreshAll(queryClient, config),
  }
}

/** For a list that is changed in a way only the app's own code can describe (the diary's
 * placeholder row): change it now, and get back the way to undo it. */
export async function optimisticList<T>(
  queryClient: QueryClient,
  prefix: QueryKey,
  change: (items: T[]) => T[],
  applies: (key: QueryKey) => boolean = () => true,
) {
  await queryClient.cancelQueries({ queryKey: prefix })
  const snapshot = queryClient.getQueriesData<T[]>({ queryKey: prefix, predicate: (query) => applies(query.queryKey) })
  for (const [key, data] of snapshot) {
    if (Array.isArray(data)) queryClient.setQueryData<T[]>(key, change(data))
  }
  return function rollback() {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
  }
}

/** A record id that cannot clash with a real one, for the moment before the save returns. */
export const pendingId = () => `pending-${crypto.randomUUID()}`
export const isPendingId = (id: string) => id.startsWith('pending-')
