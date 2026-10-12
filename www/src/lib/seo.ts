const SITE = 'https://pleadli.com'

const pageKeywords: Record<string, string[]> = {
  '/': ['legal case management', 'justice software', 'offline legal software', 'Uganda'],
  '/downloads': ['desktop apps', 'Windows downloads', 'Police app', 'Courts app', 'Prisons app'],
  '/products': ['legal software applications', 'police', 'prosecution', 'courts', 'law firms', 'prisons'],
  '/products/police': ['police case management', 'station diary', 'custody records', 'investigations'],
  '/products/dpp': ['prosecution software', 'DPP case management', 'charging review', 'prosecution files'],
  '/products/courts': ['court case management', 'hearings', 'court orders', 'rulings', 'court documents'],
  '/products/lawyers': ['law practice management', 'advocate software', 'legal matters', 'client accounts'],
  '/products/prisons': ['prison management', 'custody records', 'remand tracking', 'prisoner files'],
  '/licensing': ['software licensing', 'institutional agreements', 'law firm licences', 'Pleadli trial'],
  '/about': ['Pleadli mission', 'Legal Orchestra', 'Justice Vincent Opyene', 'Uganda justice technology'],
  '/contact': ['Pleadli contact', 'product support', 'institutional pilot', 'partnership enquiries'],
  '/roadmap': ['Pleadli development roadmap', 'planned features', 'product availability'],
  '/docs': ['Pleadli user guide', 'application help', 'legal software documentation'],
  '/docs/getting-started': ['Pleadli installation', 'first setup', 'desktop app guide'],
  '/docs/how-it-works': ['offline working', 'institutional workspaces', 'Pleadli Orchestra guide'],
  '/docs/applications': ['Pleadli app guide', 'police tools', 'court tools', 'prison tools'],
  '/docs/security': ['Pleadli security', 'record protection', 'user permissions', 'local records'],
  '/docs/documents': ['legal documents', 'court papers', 'document exports', 'Pleadli documents guide'],
  '/docs/ai': ['Pleadli AI guide', 'legal AI assistance', 'human review'],
  '/verify': ['Pleadli document verification', 'verify a paper', 'document code'],
  '/track': ['Pleadli case tracking', 'follow a case', 'case reference'],
}

/** One page's own entry in search results and link previews: its title, its
 * description and its canonical address, so no two pages read the same. */
export function seo({ title, description, path }: { title: string; description: string; path: string }) {
  const url = `${SITE}${path === '/' ? '' : path}`
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { name: 'keywords', content: ['Pleadli', ...(pageKeywords[path] ?? [title])].join(', ') },
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
