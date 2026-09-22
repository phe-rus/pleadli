import { focusManager, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

if (typeof window !== "undefined") {
    focusManager.setEventListener((setFocused) => {
        setFocused(true)
        return undefined
    })
}

let cachedClient: QueryClient | undefined
export const clientContext = () => {
    // One person, one machine: after any successful write, every read model
    // (queues, counts, chronology) is stale, so all of them refresh. Cheaper
    // than every mutation naming the reads it touches, and never wrong.
    const client: QueryClient = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                retry: (count, error) => {
                    const status = (error as { status?: number })?.status
                    return status !== 401 && status !== 403 && count < 2
                },
            },
        },
        queryCache: new QueryCache({
            onError: (error) => {
                if (error.name === "AbortError") return
                console.error(error)
            },
        }),
        mutationCache: new MutationCache({
            onSuccess: () => {
                void client.invalidateQueries()
            },
        }),
    })
    return client
}

export function queryContext() {
    if (typeof window !== "undefined") {
        if (!cachedClient) cachedClient = clientContext()
        return cachedClient
    }
    return clientContext()
}