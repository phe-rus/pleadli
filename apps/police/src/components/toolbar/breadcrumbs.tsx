import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@pleadli/ui/components/breadcrumb"
import { Link, useLocation } from "@tanstack/react-router"
import { Fragment } from "react"

// Long id-like segments (UUIDs, etc.) get shortened for display — the
// breadcrumb's job is orientation in the tree, not identifying the exact
// record; the page itself already shows the full identity.
function displaySegment(segment: string) {
  if (/^[0-9a-f-]{16,}$/i.test(segment)) {
    return `${segment.slice(0, 8)}…`
  }
  return segment
}

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)

  const crumbs = [
    { label: "Overview", to: "/" },
    ...segments.map((segment, index) => ({
      label: displaySegment(segment),
      to: "/" + segments.slice(0, index + 1).join("/"),
    })),
  ]

  return (
    <Breadcrumb data-not-typeset>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={crumb.to}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.to as never}>{crumb.label}</Link>} />
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
