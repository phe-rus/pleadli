import { ArrowTurnBackwardIcon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@pleadli/ui/components/button"
import { NotFoundRouteProps } from "@tanstack/react-router"
import { m } from '@/paraglide/messages'

export const Notfound = (props: NotFoundRouteProps) => {
    if (!window) return null
    return (
        <main className="fixed inset-0 flex flex-col h-svh w-full">
            <div className='container flex flex-col my-auto'>
                <div>
                    <h1>{props.isNotFound ? m.ui_page_not_found() : m.ui_route_not_found()}</h1>
                    <p>{m.ui_the_page_you_re_looking_for()}</p>
                </div>
                <div className='flex items-center gap-2 mt-10'>
                    <Button
                        onClick={() => window.history.back()}
                    >
                        <HugeiconsIcon icon={ArrowTurnBackwardIcon} />
                        {m.ui_navigate_to_previous_page()}
                    </Button>

                    <Button
                        variant='secondary'
                        onClick={() => window.location.reload()}
                    >
                        <HugeiconsIcon icon={RefreshIcon} />
                        {m.ui_refresh_page()}
                    </Button>
                </div>
            </div>
        </main>
    )
}