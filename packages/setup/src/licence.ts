import type { Locale } from './types'

/**
 * The licence every installation accepts before setup. Public: it is shown
 * before anything is configured, and can be read again from Settings.
 *
 * Status: written for the product, NOT yet reviewed by a lawyer. The signed
 * contract with each institution prevails (clause 10). Bump LICENCE_VERSION
 * whenever the text changes, so installations record what they accepted.
 */

export const LICENCE_VERSION = '2026-09-30'

export type LicenceSection = { heading: string; body: string }
export type LicenceText = { title: string; sections: readonly LicenceSection[] }

export const LICENCE: Record<Locale, LicenceText> = {
  en: {
    title: 'Pleadli licence agreement',
    sections: [
      { heading: '1. Who this licence is for', body: 'This licence is between Pleadli and the public institution, firm or practice installing this software (the Institution). The people the Institution authorises to use it (Users) act on its behalf.' },
      { heading: '2. What you may do', body: 'The Institution may install and use the software on the computers and devices it controls, for its own work, for as long as its agreement with Pleadli is in force.' },
      { heading: '3. What you may not do', body: 'You may not sell, rent or pass the software to anyone else, remove its notices, or try to get around its security, its audit trail or its licence checks.' },
      { heading: '4. Your records belong to you', body: 'Every record, document and file entered into the software belongs to the Institution. It is kept on the Institution\'s own computers and is encrypted there. Nothing is sent anywhere unless the Institution sets up a connection itself. Pleadli has no access to the Institution\'s records.' },
      { heading: '5. Decisions stay with people', body: 'The software helps people do their work. It never makes a legal decision. Any assisted feature, including artificial intelligence, is off until the Institution turns it on, and what it produces is a draft until a named person accepts it.' },
      { heading: '6. Your responsibilities', body: 'The Institution decides who may use the software, keeps sign-in details private, keeps its devices secure, and keeps backups. It uses the software in line with the law of its country, including data protection law.' },
      { heading: '7. Updates and support', body: 'Pleadli provides updates and support as agreed with the Institution. Updates never remove or change records without the Institution\'s action.' },
      { heading: '8. Limits', body: 'The software is provided as agreed in the contract. Except where the law does not allow it, Pleadli is not liable for indirect loss or for decisions made using the software.' },
      { heading: '9. Governing law', body: 'This licence is governed by the law of the country the Institution operates in, unless the signed contract says otherwise.' },
      { heading: '10. The signed contract comes first', body: 'Where this licence and the Institution\'s signed contract with Pleadli differ, the signed contract applies. If a translation of this licence differs from the English text, the English text applies.' },
    ],
  },
  sw: {
    title: 'Mkataba wa leseni ya Pleadli',
    sections: [
      { heading: '1. Leseni hii ni ya nani', body: 'Leseni hii ni kati ya Pleadli na taasisi ya umma, kampuni au ofisi ya uwakili inayosakinisha programu hii (Taasisi). Watu ambao Taasisi inawaruhusu kuitumia (Watumiaji) wanafanya kazi kwa niaba yake.' },
      { heading: '2. Unachoruhusiwa kufanya', body: 'Taasisi inaweza kusakinisha na kutumia programu kwenye kompyuta na vifaa inavyovisimamia, kwa kazi zake yenyewe, kwa muda wote ambao makubaliano yake na Pleadli yanatumika.' },
      { heading: '3. Usichoruhusiwa kufanya', body: 'Huruhusiwi kuuza, kukodisha au kumpa mtu mwingine programu, kuondoa matangazo yake, au kujaribu kukwepa ulinzi wake, kumbukumbu zake za ukaguzi au ukaguzi wa leseni.' },
      { heading: '4. Kumbukumbu zako ni zako', body: 'Kila kumbukumbu, hati na jalada lililowekwa kwenye programu ni mali ya Taasisi. Huhifadhiwa kwenye kompyuta za Taasisi yenyewe na husimbwa huko. Hakuna kinachotumwa popote isipokuwa Taasisi yenyewe iweke muunganisho. Pleadli haina uwezo wa kufikia kumbukumbu za Taasisi.' },
      { heading: '5. Maamuzi yanabaki kwa watu', body: 'Programu huwasaidia watu kufanya kazi yao. Haifanyi uamuzi wowote wa kisheria. Kipengele chochote cha kusaidia, ikiwemo akili bandia, huzimwa hadi Taasisi ikiwashe, na kinachotolewa ni rasimu hadi mtu aliyetajwa akikubali.' },
      { heading: '6. Majukumu yako', body: 'Taasisi huamua nani anaweza kutumia programu, huhifadhi siri za kuingia, hulinda vifaa vyake, na huhifadhi nakala rudufu. Huitumia programu kwa mujibu wa sheria za nchi yake, ikiwemo sheria ya ulinzi wa taarifa binafsi.' },
      { heading: '7. Masasisho na msaada', body: 'Pleadli hutoa masasisho na msaada kama ilivyokubaliwa na Taasisi. Masasisho kamwe hayaondoi wala kubadilisha kumbukumbu bila hatua ya Taasisi.' },
      { heading: '8. Mipaka', body: 'Programu hutolewa kama ilivyokubaliwa katika mkataba. Isipokuwa pale sheria isiporuhusu, Pleadli haiwajibiki kwa hasara isiyo ya moja kwa moja au kwa maamuzi yaliyofanywa kwa kutumia programu.' },
      { heading: '9. Sheria inayotumika', body: 'Leseni hii inaongozwa na sheria ya nchi ambamo Taasisi inafanya kazi, isipokuwa mkataba uliosainiwa useme vinginevyo.' },
      { heading: '10. Mkataba uliosainiwa unatangulia', body: 'Pale leseni hii na mkataba uliosainiwa kati ya Taasisi na Pleadli vinapotofautiana, mkataba uliosainiwa ndio unaotumika. Tafsiri ya leseni hii ikitofautiana na maandishi ya Kiingereza, maandishi ya Kiingereza ndiyo yanayotumika.' },
    ],
  },
  de: {
    title: 'Pleadli Lizenzvereinbarung',
    sections: [
      { heading: '1. Für wen diese Lizenz gilt', body: 'Diese Lizenz gilt zwischen Pleadli und der öffentlichen Stelle, Kanzlei oder Praxis, die diese Software installiert (die Institution). Die Personen, die die Institution zur Nutzung berechtigt (Nutzende), handeln in ihrem Auftrag.' },
      { heading: '2. Was Sie dürfen', body: 'Die Institution darf die Software auf den Computern und Geräten installieren und nutzen, die sie selbst verwaltet, für ihre eigene Arbeit, solange ihre Vereinbarung mit Pleadli gilt.' },
      { heading: '3. Was Sie nicht dürfen', body: 'Sie dürfen die Software nicht verkaufen, vermieten oder an Dritte weitergeben, ihre Hinweise entfernen oder versuchen, ihre Sicherheit, ihr Prüfprotokoll oder ihre Lizenzprüfung zu umgehen.' },
      { heading: '4. Ihre Akten gehören Ihnen', body: 'Alle Einträge, Dokumente und Akten in der Software gehören der Institution. Sie werden auf den eigenen Computern der Institution gespeichert und dort verschlüsselt. Nichts wird irgendwohin übertragen, außer die Institution richtet selbst eine Verbindung ein. Pleadli hat keinen Zugriff auf die Akten der Institution.' },
      { heading: '5. Entscheidungen treffen Menschen', body: 'Die Software unterstützt Menschen bei ihrer Arbeit. Sie trifft niemals eine rechtliche Entscheidung. Jede Assistenzfunktion, auch künstliche Intelligenz, ist ausgeschaltet, bis die Institution sie einschaltet, und ihr Ergebnis bleibt ein Entwurf, bis eine namentlich genannte Person es annimmt.' },
      { heading: '6. Ihre Pflichten', body: 'Die Institution bestimmt, wer die Software nutzen darf, hält Anmeldedaten geheim, sichert ihre Geräte und erstellt Sicherungskopien. Sie nutzt die Software im Einklang mit dem Recht ihres Landes, einschließlich des Datenschutzrechts.' },
      { heading: '7. Aktualisierungen und Unterstützung', body: 'Pleadli stellt Aktualisierungen und Unterstützung wie mit der Institution vereinbart bereit. Aktualisierungen entfernen oder ändern niemals Akten ohne Zutun der Institution.' },
      { heading: '8. Grenzen', body: 'Die Software wird wie im Vertrag vereinbart bereitgestellt. Soweit gesetzlich zulässig, haftet Pleadli nicht für mittelbare Schäden oder für Entscheidungen, die mit Hilfe der Software getroffen wurden.' },
      { heading: '9. Anwendbares Recht', body: 'Für diese Lizenz gilt das Recht des Landes, in dem die Institution tätig ist, sofern der unterzeichnete Vertrag nichts anderes bestimmt.' },
      { heading: '10. Der unterzeichnete Vertrag hat Vorrang', body: 'Weichen diese Lizenz und der unterzeichnete Vertrag der Institution mit Pleadli voneinander ab, gilt der unterzeichnete Vertrag. Weicht eine Übersetzung dieser Lizenz vom englischen Text ab, gilt der englische Text.' },
    ],
  },
  fr: {
    title: 'Contrat de licence Pleadli',
    sections: [
      { heading: '1. À qui s\'adresse cette licence', body: 'Cette licence lie Pleadli et l\'institution publique, le cabinet ou l\'étude qui installe ce logiciel (l\'Institution). Les personnes que l\'Institution autorise à l\'utiliser (les Utilisateurs) agissent pour son compte.' },
      { heading: '2. Ce que vous pouvez faire', body: 'L\'Institution peut installer et utiliser le logiciel sur les ordinateurs et appareils qu\'elle gère, pour son propre travail, tant que son accord avec Pleadli est en vigueur.' },
      { heading: '3. Ce que vous ne pouvez pas faire', body: 'Vous ne pouvez pas vendre, louer ou céder le logiciel à un tiers, retirer ses mentions, ni tenter de contourner sa sécurité, son journal d\'audit ou ses contrôles de licence.' },
      { heading: '4. Vos dossiers vous appartiennent', body: 'Chaque enregistrement, document et dossier saisi dans le logiciel appartient à l\'Institution. Il est conservé sur les ordinateurs de l\'Institution et y est chiffré. Rien n\'est envoyé nulle part, sauf si l\'Institution met elle-même en place une connexion. Pleadli n\'a aucun accès aux dossiers de l\'Institution.' },
      { heading: '5. Les décisions restent humaines', body: 'Le logiciel aide les personnes dans leur travail. Il ne prend jamais de décision juridique. Toute fonction d\'assistance, y compris l\'intelligence artificielle, reste désactivée jusqu\'à ce que l\'Institution l\'active, et ce qu\'elle produit reste un projet jusqu\'à ce qu\'une personne nommée l\'accepte.' },
      { heading: '6. Vos responsabilités', body: 'L\'Institution décide qui peut utiliser le logiciel, garde les identifiants confidentiels, sécurise ses appareils et effectue des sauvegardes. Elle utilise le logiciel conformément au droit de son pays, y compris le droit de la protection des données.' },
      { heading: '7. Mises à jour et assistance', body: 'Pleadli fournit les mises à jour et l\'assistance convenues avec l\'Institution. Une mise à jour ne supprime ni ne modifie jamais de dossiers sans action de l\'Institution.' },
      { heading: '8. Limites', body: 'Le logiciel est fourni comme prévu au contrat. Sauf lorsque la loi ne le permet pas, Pleadli n\'est pas responsable des pertes indirectes ni des décisions prises à l\'aide du logiciel.' },
      { heading: '9. Droit applicable', body: 'Cette licence est régie par le droit du pays où l\'Institution exerce, sauf disposition contraire du contrat signé.' },
      { heading: '10. Le contrat signé prévaut', body: 'En cas de différence entre cette licence et le contrat signé entre l\'Institution et Pleadli, le contrat signé s\'applique. Si une traduction de cette licence diffère du texte anglais, le texte anglais s\'applique.' },
    ],
  },
}
