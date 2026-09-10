import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { listVaultDirectory } from './data'

export function vaultDirectoryOptions(relativePath: string) {
  return queryOptions({
    queryKey: ['vault-directory', relativePath],
    queryFn: () => listVaultDirectory(relativePath),
  })
}

/** Not suspended, and keeps the previous folder's listing on screen
 * while the next one loads — a file manager that blanks out between
 * every click reads as broken, not as "loading". */
export function useVaultDirectory(relativePath: string) {
  return useQuery({ ...vaultDirectoryOptions(relativePath), placeholderData: keepPreviousData })
}
