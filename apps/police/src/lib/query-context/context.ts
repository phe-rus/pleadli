import { focusManager, QueryCache, QueryClient } from "@tanstack/react-query"

if (typeof window !== "undefined") {
    focusManager.setEventListener((setFocused) => {
        setFocused(true)
        return undefined
    })
}

let cachedClient: QueryClient | undefined
export const clientContext = () => {
    return new QueryClient({
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
    })
}

export function queryContext() {
    if (typeof window !== "undefined") {
        if (!cachedClient) cachedClient = clientContext()
        return cachedClient
    }
    return clientContext()
}