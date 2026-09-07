import type { QueryClient } from "@tanstack/react-query"
import { QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

interface QueryproviderProps {
    query: QueryClient
    children: ReactNode
}

export const Queryprovider = ({
    query,
    children
}: QueryproviderProps) => {
    const [client] = useState(() => query)
    return (
        <QueryClientProvider client={client}>
            <>
                {children}
            </>
        </QueryClientProvider>
    )
}
