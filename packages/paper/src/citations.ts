/**
 * The laws a paper names, found in its wording: "ss. 188 and 189 Penal Code
 * Act, Cap. 120", "section 66 of the Trial on Indictments Act", "Art. 23(6)",
 * "CPR O.8 r.18(1)". Plain pattern matching, no guessing: what is not written
 * on the paper is not listed.
 */
const PROVISION = String.raw`(?:ss?\.|sections?|Articles?|Arts?\.|O\.\s*\d+\s*r\.|rules?|r\.)\s*\d+[A-Za-z]?(?:\(\w+\))*(?:\s*(?:,|and|&|to)\s*\d+[A-Za-z]?(?:\(\w+\))*)*`
const INSTRUMENT = String.raw`(?:the\s+)?(?:[A-Z][\w']*\s+(?:(?:[A-Z][\w']*|of|on|and|the|for)\s+)*)?(?:Act|Rules|Code|Constitution|Decree|Regulations)(?:,?\s*(?:Cap\.?|Chapter)\s*\d+)?(?:,?\s*\d{4})?`
const ABBREVIATIONS = String.raw`\b(?:PCA|TIA|MCA|CPC|CPR|CPA)\b(?:,?\s*Cap\.?\s*\d+)?`

const pattern = new RegExp(
  String.raw`(?:${ABBREVIATIONS})\s*${PROVISION}|${PROVISION}(?:\s*(?:of\s+)?(?:${INSTRUMENT}|${ABBREVIATIONS}))?|${INSTRUMENT}|${ABBREVIATIONS}`,
  'g',
)

export function findCitations(text: string): string[] {
  const seen = new Map<string, string>()
  for (const match of text.matchAll(pattern)) {
    const cite = match[0].replace(/\s+/g, ' ').replace(/^the\s+/i, '').replace(/[,.;:]+$/, '').trim()
    if (cite.length < 3 || /^(The|This|That)\s/.test(cite)) continue
    const key = cite.toLowerCase()
    if (!seen.has(key)) seen.set(key, cite)
  }
  // A bare Act that also appears with a section is listed once, with the section.
  const all = [...seen.values()]
  return all.filter((c) => !all.some((other) => other !== c && other.length > c.length && other.includes(c)))
}
