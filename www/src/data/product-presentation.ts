import { localized } from '@/lib/localized'

const stories = {
  police: { title: 'A clearer picture. Every shift.', lead: 'From the first report to the next enquiry. Keep cases, statements and custody records close at hand.', tone: 'police' },
  dpp: { title: 'Room to focus on the case.', lead: 'Bring your files, decisions and court papers together. See what needs your attention, and move the work forward.', tone: 'dpp' },
  courts: { title: 'The day in court. Beautifully organised.', lead: 'Hearings, notes, orders and rulings. A considered place for the work of the bench and registry.', tone: 'courts' },
  lawyers: { title: 'Your practice. In a better place.', lead: 'Keep matters, appointments, documents and client accounts together, so you can focus on the people you represent.', tone: 'lawyers' },
  prisons: { title: 'Every person. Every day accounted for.', lead: 'Keep the custody file, court dates and daily care in view. From the moment someone arrives to the day they leave.', tone: 'prisons' },
}
const fr = {
  police: { title: 'Une vue plus claire. À chaque service.', lead: 'Du premier signalement à la prochaine enquête. Gardez affaires, dépositions et registres de garde à vue à portée de main.' },
  dpp: { title: 'Du temps pour étudier le dossier.', lead: 'Réunissez dossiers, décisions et actes judiciaires. Voyez ce qui demande votre attention et faites avancer le travail.' },
  courts: { title: 'La journée au tribunal. Bien organisée.', lead: 'Audiences, notes, ordonnances et décisions. Un espace pensé pour le travail du siège et du greffe.' },
  lawyers: { title: 'Votre cabinet. Mieux organisé.', lead: 'Réunissez affaires, rendez-vous, documents et comptes clients pour vous concentrer sur les personnes que vous représentez.' },
  prisons: { title: 'Chaque personne. Chaque jour compte.', lead: 'Gardez dossiers de détention, audiences et soins quotidiens en vue, de l’arrivée au départ.' },
}
const sw = {
  police: { title: 'Picha iliyo wazi. Kila zamu.', lead: 'Kutoka taarifa ya kwanza hadi uchunguzi unaofuata. Weka mashauri, maelezo na kumbukumbu za mahabusu karibu.' },
  dpp: { title: 'Nafasi ya kuzingatia shauri.', lead: 'Leta majalada, maamuzi na nyaraka za mahakama pamoja. Ona kinachohitaji umakini wako na endeleza kazi.' },
  courts: { title: 'Siku mahakamani. Imepangwa vizuri.', lead: 'Vikao, maelezo, amri na maamuzi. Mahali palipoandaliwa kwa kazi ya mahakama na masjala.' },
  lawyers: { title: 'Ofisi yako. Mahali bora.', lead: 'Weka mashauri, miadi, nyaraka na akaunti za wateja pamoja ili uzingatie watu unaowawakilisha.' },
  prisons: { title: 'Kila mtu. Kila siku inahesabiwa.', lead: 'Ona jalada la mahabusu, tarehe za mahakama na huduma za kila siku, kutoka mapokezi hadi kuondoka.' },
}
export function productPresentation(slug: string) {
  const key = slug as keyof typeof stories
  return localized(stories[key] ?? stories.police, { fr: fr[key], sw: sw[key] })
}
