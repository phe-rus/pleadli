import type { Product } from '@/data/products'
import { ProductWindow } from './replica/product-window'
import * as m from '@/paraglide/messages'
import { cn } from '@pleadli/ui/lib/utils'

/** The app's window as it really looks, with a one-line note under it. */
export function ProductPreview({ product }: { product: Product }) {
  return <figure className={`product-preview product-tone-${product.slug}`}>
    <ProductWindow slug={product.slug} name={product.name} index={0} priority />
    <figcaption className={cn(
      'mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed',
      'text-muted-foreground',
    )}>{m['preview.real_note']()}</figcaption>
  </figure>
}
