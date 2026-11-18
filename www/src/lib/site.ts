/** Which copy of the site this is, so development is never mistaken for
 * production: the address it is served from (links, share cards, structured
 * data), and a flag the interface uses to mark itself.
 *
 * `bun run dev` is the local copy (http://localhost:3000, a local database,
 * nothing shared). A build for pleadli.com is the live site. Another place,
 * such as a staging Worker, sets VITE_SITE_URL when it builds. */
export const IS_DEV: boolean = import.meta.env.DEV

export const SITE: string = ((import.meta.env.VITE_SITE_URL as string | undefined) || (IS_DEV ? 'http://localhost:3000' : 'https://pleadli.com')).replace(/\/$/, '')
