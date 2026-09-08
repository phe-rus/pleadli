import type { getDb } from './index'
import { people } from './schema'

/**
 * Dev/test convenience only — inserts a handful of sample people the first
 * time the local database is empty, so there's something to search/see
 * without manually adding records first. Not a product feature; remove or
 * gate behind a dev flag before this ships anywhere real.
 */
export async function seedIfEmpty(db: Awaited<ReturnType<typeof getDb>>) {
  const existing = await db.select().from(people).limit(1)
  if (existing.length > 0) return

  await db.insert(people).values([
    {
      firstName: 'Mungu',
      lastName: 'Wasswa',
      otherNames: 'M.',
      phone: '0772 445 190',
      nationalId: 'CM9012345ABCDE',
      address: 'Ntinda, Kampala',
    },
    {
      firstName: 'Deborah',
      lastName: 'Wasswa',
      phone: '0701 223 887',
      nationalId: 'CF8823410XYZAB',
      address: 'Bugolobi, Kampala',
    },
    {
      firstName: 'Wasswa',
      lastName: 'Otema',
      otherNames: 'K.',
      phone: '0782 991 004',
      address: 'Gulu Town',
    },
    {
      firstName: 'S.',
      lastName: 'Kigozi',
      nationalId: 'CM7712209QRSTU',
      address: 'Mukono',
    },
    {
      firstName: 'Grace',
      lastName: 'Nabirye',
      phone: '0759 664 213',
      nationalId: 'CF9034521LMNOP',
      address: 'Jinja Road, Kampala',
    },
  ])
}
