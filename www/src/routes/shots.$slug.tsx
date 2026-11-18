import { createFileRoute, notFound } from '@tanstack/react-router'
import { ProductWindow } from '@/components/replica/product-window'

/** Development only: one app window at its real size and nothing else, so it can be captured to an image
 * (scripts/capture-windows.ts). In a production build this page does not exist. */
export const Route = createFileRoute('/shots/$slug')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: Shot,
})

function Shot() {
  const { slug } = Route.useParams()
  return (
    <div id="shot" style={{ width: 1152, height: 774 }}>
      <ProductWindow slug={slug} bare />
    </div>
  )
}
