/** Uganda Police Force ranks, most senior first, each with the spellings a
 * station types for it. Rank is free text on an officer, so a nominal roll
 * orders by matching it here; an unknown rank sorts after every known one.
 * Kenya and DR Congo ranks belong to their own country packs, later. */
const ugandaRanks: { rank: string; match: RegExp }[] = [
  { rank: 'Inspector General of Police', match: /^(igp|inspector general)/ },
  { rank: 'Deputy Inspector General of Police', match: /^(digp|deputy inspector general)/ },
  { rank: 'Assistant Inspector General of Police', match: /^(aigp|assistant inspector general)/ },
  { rank: 'Senior Commissioner of Police', match: /^(scp|senior commissioner)/ },
  { rank: 'Commissioner of Police', match: /^(cp|commissioner)\b/ },
  { rank: 'Assistant Commissioner of Police', match: /^(acp|ass(istan)?t\.? commissioner)/ },
  { rank: 'Senior Superintendent of Police', match: /^(ssp|senior superintendent)/ },
  { rank: 'Superintendent of Police', match: /^(sp|superintendent)\b/ },
  { rank: 'Assistant Superintendent of Police', match: /^(asp|ass(istan)?t\.? superintendent)/ },
  { rank: 'Inspector of Police', match: /^(ip|inspector)\b/ },
  { rank: 'Assistant Inspector of Police', match: /^(aip|ass(istan)?t\.? inspector)/ },
  { rank: 'Sergeant', match: /^(sgt|sergeant|sergent)/ },
  { rank: 'Corporal', match: /^(cpl|corporal)/ },
  { rank: 'Police Constable', match: /^(pc|police constable|constable)\b/ },
  { rank: 'Special Police Constable', match: /^(spc|special police constable|special constable)/ },
]

/** 0 for the most senior rank, larger for junior ranks, and past the end of
 * the list for a rank this station spells some other way. */
export function rankSeniority(rank: string | null | undefined) {
  const text = (rank ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(d\/|det\.? |detective )/, '')
  if (!text) return ugandaRanks.length + 1
  const index = ugandaRanks.findIndex((r) => r.match.test(text))
  return index === -1 ? ugandaRanks.length : index
}

/** The rank's full name when it is one this list knows, as typed otherwise. */
export function rankTitle(rank: string | null | undefined) {
  const index = rankSeniority(rank)
  return index < ugandaRanks.length ? ugandaRanks[index].rank : (rank ?? '').trim()
}

/** A CID rank ("D/CPL", "Det. Sgt"): the section heading gives the rank, so
 * a list row only repeats the rank when it says the officer is a detective. */
export function isDetective(rank: string | null | undefined) {
  return /^(d\/|det\.? |detective )/i.test((rank ?? '').trim())
}
