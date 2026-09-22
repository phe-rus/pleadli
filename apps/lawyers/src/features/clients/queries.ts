import { queryOptions, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createClient, listClients, updateClient } from './data'
import type { ClientInput } from './schema'

export const clientsOptions = (query = '') => queryOptions({ queryKey: ['clients', 'list', query] as const, queryFn: () => listClients(query) })
export const useClients = (query = '') => useSuspenseQuery(clientsOptions(query))
/** For pickers, which must not suspend the form they sit in. */
export const useClientChoices = () => useQuery(clientsOptions(''))

export const useCreateClient = () => useMutation({ mutationFn: (input: ClientInput) => createClient(input) })
export const useUpdateClient = () => useMutation({ mutationFn: (v: { id: string; input: ClientInput }) => updateClient(v.id, v.input) })
