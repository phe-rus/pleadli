import { authClient } from '@/auth/client'
import { Dashboard } from '@pleadli/ui/sidebar'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react'

type DashboardProps = ComponentProps<typeof Dashboard>

const footerLink = cn(
  'cursor-pointer rounded-lg px-2 py-1.5 text-start text-[0.8125rem] text-muted-foreground',
  'hover:bg-foreground/[0.05] hover:text-foreground disabled:cursor-default disabled:opacity-60',
)

/** The one frame around every signed-in page on pleadli.com: Pleadli Account
 * for institutions and Pleadli Admin for staff. Each passes its own brand,
 * navigation and words; the sidebar, footer and sign-out live here once. */
export function CloudShell({
  brand,
  nav,
  identity,
  signedInAs,
  websiteLabel,
  signOutLabel,
  signingOutLabel,
  banner,
  children,
}: {
  brand: DashboardProps['brand']
  nav: DashboardProps['itemLists']
  /** A small line under the brand, such as an institution's address. */
  identity?: ReactNode
  /** Shown above the sign-out button, such as the signed-in email. */
  signedInAs?: string
  /** When set, a link back to the public site is added to the footer. */
  websiteLabel?: string
  signOutLabel: string
  signingOutLabel?: string
  banner?: ReactNode
  children: ReactNode
}) {
  const [pending, setPending] = useState(false)
  const signOut = useCallback(() => {
    setPending(true)
    void authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })
  }, [])

  return (
    <Dashboard
      brand={brand}
      itemLists={nav}
      addOns={{
        enableNavigation: true,
        identity,
        banner,
        footer: (
          <div className="flex flex-col gap-0.5 border-t border-border/60 pt-3">
            {signedInAs ? <span className="truncate px-2 text-[0.8125rem] text-muted-foreground">{signedInAs}</span> : null}
            {websiteLabel ? <Link to="/" className={footerLink}>{websiteLabel}</Link> : null}
            <button type="button" onClick={signOut} disabled={pending} className={footerLink}>
              {pending && signingOutLabel ? signingOutLabel : signOutLabel}
            </button>
          </div>
        ),
      }}
    >
      {children}
    </Dashboard>
  )
}
