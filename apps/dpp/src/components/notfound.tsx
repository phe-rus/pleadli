import { ArrowTurnBackwardIcon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@pleadli/ui/components/button"
import { NotFoundRouteProps } from "@tanstack/react-router"
import * as m from '@/paraglide/messages'

export const Notfound = (props: NotFoundRouteProps) => {
    if (!window) return null
    return (
        <main className="fixed inset-0 flex flex-col h-svh w-full">
            <div className='container flex flex-col my-auto'>
                <div>
                    <h1>{props.isNotFound ? m["not_found.page_title"]() : m["not_found.route_title"]()}</h1>
                    <p>{m["not_found.body"]()}</p>
                </div>
                <div className='flex items-center gap-2 mt-10'>
                    <Button
                        onClick={() => window.history.back()}
                    >
                        <HugeiconsIcon icon={ArrowTurnBackwardIcon} />
                        {m["not_found.back"]()}
                    </Button>

                    <Button
                        variant='secondary'
                        onClick={() => window.location.reload()}
                    >
                        <HugeiconsIcon icon={RefreshIcon} />
                        {m["not_found.refresh"]()}
                    </Button>
                </div>
            </div>
        </main>
    )
}