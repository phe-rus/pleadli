import { platformStoryFr, productsFr, readinessFr } from './products.fr'
import { platformStorySw, productsSw, readinessSw } from './products.sw'

type Overlay = Record<string, unknown>

/** Per language, keyed by product slug. English is the source in ../products.ts. */
export const productsText: Partial<Record<string, Record<string, Overlay>>> = { sw: productsSw, fr: productsFr}
export const readinessText = { sw: readinessSw, fr: readinessFr}
export const platformStoryText = { sw: platformStorySw, fr: platformStoryFr}
