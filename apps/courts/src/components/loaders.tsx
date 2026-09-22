import { LoaderCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@pleadli/ui/lib/utils"

export const Loaders = () => {
    return (
        <main className={cn(
            'flex flex-col h-screen items-center justify-center',
            'bg-background rounded'
        )}>
            <div className="m-auto">
                <HugeiconsIcon
                    icon={LoaderCircleIcon}
                    className="size-8 animate-spin"
                />
            </div>
        </main>
    )
}