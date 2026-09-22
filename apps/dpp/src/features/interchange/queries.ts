import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getIdentity, getIncoming, listConnections, listIncoming, listOutgoing } from './data'

export const identityOptions = () => queryOptions({ queryKey: ['interchange', 'identity'] as const, queryFn: getIdentity })
export const connectionsOptions = () => queryOptions({ queryKey: ['interchange', 'connections'] as const, queryFn: listConnections })
export const incomingOptions = () => queryOptions({ queryKey: ['interchange', 'incoming'] as const, queryFn: listIncoming })
export const incomingDetailOptions = (id: string) => queryOptions({ queryKey: ['interchange', 'incoming', id] as const, queryFn: () => getIncoming(id) })
export const outgoingOptions = () => queryOptions({ queryKey: ['interchange', 'outgoing'] as const, queryFn: listOutgoing })

export const useIdentity = () => useSuspenseQuery(identityOptions())
export const useConnections = () => useSuspenseQuery(connectionsOptions())
export const useIncoming = () => useSuspenseQuery(incomingOptions())
export const useIncomingDetail = (id: string) => useSuspenseQuery(incomingDetailOptions(id))
export const useOutgoing = () => useSuspenseQuery(outgoingOptions())
/** For the file workspace, which must not suspend on it. */
export const useConnectionsQuiet = () => useQuery(connectionsOptions())
