const SITE = 'https://pleadli.com'

/** One page's own entry in search results and link previews: its title, its
 * description and its canonical address, so no two pages read the same. */
export function seo({ title, description, path }: { title: string; description: string; path: string }) {
  const url = `${SITE}${path === '/' ? '' : path}`
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { name: 'twitter:card', content: 'summary_large_image' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${SITE}/og-image.png` },
      { property: 'og:image:alt', content: title },
      { name: 'twitter:image', content: `${SITE}/og-image.png` },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
