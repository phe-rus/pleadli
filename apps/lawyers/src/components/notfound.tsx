import { ArrowTurnBackwardIcon, RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@pleadli/ui/components/button"
import { NotFoundRouteProps } from "@tanstack/react-router"

export const Notfound = (props: NotFoundRouteProps) => {
    if (!window) return null
    return (
        <main className="fixed inset-0 flex flex-col h-svh w-full">
            <div className='container flex flex-col my-auto'>
                <div>
                    <h1>{props.isNotFound ? "Page not found" : "Route not found"}</h1>
                    <p>The page you're looking for doesn't exist.</p>
                </div>
                <div className='flex items-center gap-2 mt-10'>
                    <Button
                        onClick={() => window.history.back()}
                    >
                        <HugeiconsIcon icon={ArrowTurnBackwardIcon} />
                        Navigate to previous page
                    </Button>

                    <Button
                        variant='secondary'
                        onClick={() => window.location.reload()}
                    >
                        <HugeiconsIcon icon={RefreshIcon} />
                        Refresh page
                    </Button>
                </div>
            </div>
        </main>
    )
}