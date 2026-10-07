import type { Institution, Locale } from './types'

/**
 * The setup flow's own words, in every shipped language. Kept in the package
 * (not in each app's Paraglide catalog) so every app says the same thing and a
 * new app gets setup fully translated for free. Display only: never compare
 * or store these.
 */

type Intro = { what: string; never: string }

export type SetupMessages = {
  back: string
  continue: string
  finish: string
  finishing: string
  open: (product: string) => string
  step: (n: number, total: number) => string
  optional: string
  loading: string

  welcome_title: (product: string) => string
  welcome_lead: string
  what_title: string
  never_title: string
  data_title: string
  data_body: string
  intro: Record<Institution, Intro>

  licence_title: string
  licence_lead: string
  licence_accept: string
  licence_scroll: string
  licence_version: (v: string) => string

  where_title: string
  where_lead: string
  area_east_africa: string
  status_ready: string
  status_provisional: string
  status_research: string
  status_hint_ready: string
  status_hint_provisional: string
  status_hint_research: string
  language_title: string
  language_lead: string
  language_used_in: (country: string) => string
  language_other: string

  model_title: string
  model_lead: string
  office_title: string
  office_body: string
  hq_title: string
  hq_body: string
  hq_unavailable: string
  office_name: string
  office_name_placeholder: string
  hq_name: string
  region_choose: string
  region_type: string

  protection_title: string
  protection_lead: string
  none_title: string
  none_body: string
  basic_title: string
  basic_body: string
  full_title: string
  full_body: string
  recommended: string
  always_encrypted: string

  look_title: string
  look_lead: string
  logo: string
  logo_hint: string
  logo_upload: string
  logo_default: string
  logo_failed: string
  colour: string
  preview: string
  preview_button: string

  people_title: string
  people_lead: string
  admin_title: string
  admin_lead: string
  name: string
  rank: string
  role: string
  pin: string
  pin_hint: string
  password: string
  password_hint: string
  confirm: string
  mismatch: string
  pin_invalid: string
  password_short: string
  name_required: string
  factor_title: string
  factor_lead: string
  factor_manual: string
  factor_code: string
  factor_code_invalid: string
  factor_failed: string
  others_title: string
  others_lead: string
  others_none: string
  add_person: string
  remove: string
  first_sign_in: string

  done_title: string
  done_lead: string
  summary_country: string
  summary_language: string
  summary_model: string
  summary_office: string
  summary_protection: string
  summary_people: (n: number) => string
  failed: string

  signin_who: string
  signin_not_you: string
  signin_submit: string
  signin_busy: string
  signin_code_lead: string
  signin_enrol_lead: string
  signin_failed: string
  signin_no_people: string
}

const en: SetupMessages = {
  back: 'Back',
  continue: 'Continue',
  finish: 'Finish setup',
  finishing: 'Setting up…',
  open: (p) => `Open ${p}`,
  step: (n, t) => `Step ${n} of ${t}`,
  optional: 'Optional',
  loading: 'Opening…',

  welcome_title: (p) => `Welcome to ${p}`,
  welcome_lead: 'A few questions, then you are ready to work. It takes about three minutes.',
  what_title: 'What it does',
  never_title: 'What it never does',
  data_title: 'Where your records live',
  data_body: 'On this computer, locked with encryption. Nothing leaves it unless your office sets up a connection.',
  intro: {
    dpp: {
      what: 'Receive files from the police, review the evidence, decide, prepare the documents and follow each case to court.',
      never: 'It never makes a decision for you. Every decision is yours, signed in your name.',
    },
    police: {
      what: 'Record reports, run custody and investigations, and send complete files to the prosecutor.',
      never: 'It never decides who is charged or held. Officers decide; the system keeps the record.',
    },
    prisons: {
      what: 'Receive people into custody, keep every warrant and date in order, and release on time.',
      never: 'It never releases or holds anyone on its own. Officers decide; the system checks the dates.',
    },
    courts: {
      what: 'Keep the register, run sittings and produce the record of each case.',
      never: 'It never decides a case. The court decides.',
    },
    lawyers: {
      what: 'Keep client matters, documents and court dates in one place.',
      never: 'It never gives legal advice. You do.',
    },
  },

  licence_title: 'Licence',
  licence_lead: 'Please read the licence. You can read it again at any time in Settings.',
  licence_accept: 'I have read the licence and accept it for my institution or practice',
  licence_scroll: 'Scroll to the end to accept',
  licence_version: (v) => `Version ${v}`,

  where_title: 'Where do you work?',
  where_lead: 'This sets the reference numbers, file layout and laws the app uses.',
  area_east_africa: 'East Africa',
  status_ready: 'Ready',
  status_provisional: 'Being confirmed',
  status_research: 'Basic',
  status_hint_ready: 'Checked against official sources.',
  status_hint_provisional: 'Works today. Some details are still being confirmed with practitioners.',
  status_hint_research: 'Works with general settings. Country details will follow in an update.',
  language_title: 'Language',
  language_lead: 'You can change it at any time, and each person can choose their own.',
  language_used_in: (c) => `Used in ${c}`,
  language_other: 'Other languages',

  model_title: 'Is this an office or headquarters?',
  model_lead: 'An office does the daily work. Headquarters oversees the offices.',
  office_title: 'An office',
  office_body: 'A regional office or station. Works on its own from the first day, and can connect to headquarters later.',
  hq_title: 'Headquarters',
  hq_body: 'The national office. Approves offices that connect to it and sees their returns.',
  hq_unavailable: 'In this country this institution has no national headquarters.',
  office_name: 'Name of this office',
  office_name_placeholder: 'For example, Wandegeya',
  hq_name: 'Name of headquarters',
  region_choose: 'Choose…',
  region_type: 'Type the name',

  protection_title: 'How should it be protected?',
  protection_lead: 'You can raise the protection later. Lowering it needs an administrator.',
  none_title: 'No sign-in',
  none_body: 'One person on a computer only they use. The app opens straight away.',
  basic_title: 'PIN for everyone',
  basic_body: 'Each person has their own 6-digit PIN. The app locks when nobody has used it for a while.',
  full_title: 'Full protection',
  full_body: 'A password and a code from an authenticator app on the phone. Every action is recorded. For offices with several people.',
  recommended: 'Recommended',
  always_encrypted: 'Whatever you choose, your records are always encrypted on this computer.',

  look_title: 'Make it yours',
  look_lead: 'Your crest and colour appear on every screen, and on every document you print.',
  logo: 'Crest or logo',
  logo_hint: 'PNG, JPG, SVG or WebP, up to 1 MB.',
  logo_upload: 'Choose an image',
  logo_default: 'Use the default',
  logo_failed: 'That image could not be used. Try a PNG or JPG under 1 MB.',
  colour: 'Colour',
  preview: 'Preview',
  preview_button: 'Open file',

  people_title: 'Who will use it?',
  people_lead: 'Start with yourself. You will be the administrator.',
  admin_title: 'You, the administrator',
  admin_lead: 'The administrator adds people and changes settings.',
  name: 'Full name',
  rank: 'Rank or title',
  role: 'Role',
  pin: 'PIN',
  pin_hint: '6 digits. Do not use your phone PIN.',
  password: 'Password',
  password_hint: 'At least 12 characters. A short sentence works well.',
  confirm: 'Type it again',
  mismatch: 'The two do not match.',
  pin_invalid: 'A PIN is exactly 6 digits.',
  password_short: 'Use at least 12 characters.',
  name_required: 'Enter a name.',
  factor_title: 'Link your phone',
  factor_lead: 'Open an authenticator app (such as Google Authenticator or Microsoft Authenticator) and scan this code.',
  factor_manual: 'Or type this key',
  factor_code: 'Code shown on the phone',
  factor_code_invalid: 'Enter the 6-digit code from the phone.',
  factor_failed: 'The code could not be prepared. Try again.',
  others_title: 'Anyone else?',
  others_lead: 'You can also add people later in Settings.',
  others_none: 'With no sign-in, only one person uses this computer. Choose a PIN or full protection to add others.',
  add_person: 'Add a person',
  remove: 'Remove',
  first_sign_in: 'They link their phone the first time they sign in.',

  done_title: 'All set',
  done_lead: 'Here is what was set up. You can change any of it in Settings.',
  summary_country: 'Country',
  summary_language: 'Language',
  summary_model: 'Type',
  summary_office: 'Office',
  summary_protection: 'Protection',
  summary_people: (n) => (n === 1 ? '1 person' : `${n} people`),
  failed: 'Setup could not be finished.',

  signin_who: 'Who is signing in?',
  signin_not_you: 'Someone else',
  signin_submit: 'Sign in',
  signin_busy: 'Signing in…',
  signin_code_lead: 'Enter the 6-digit code from the authenticator app on your phone.',
  signin_enrol_lead: 'This is your first sign-in. Link your phone to finish.',
  signin_failed: 'That did not work. Check it and try again.',
  signin_no_people: 'Nobody can sign in yet. Ask the administrator.',
}

const sw: SetupMessages = {
  back: 'Rudi',
  continue: 'Endelea',
  finish: 'Maliza usanidi',
  finishing: 'Inasanidi…',
  open: (p) => `Fungua ${p}`,
  step: (n, t) => `Hatua ${n} kati ya ${t}`,
  optional: 'Si lazima',
  loading: 'Inafungua…',

  welcome_title: (p) => `Karibu ${p}`,
  welcome_lead: 'Maswali machache, kisha uko tayari kufanya kazi. Inachukua takriban dakika tatu.',
  what_title: 'Inachofanya',
  never_title: 'Isichofanya kamwe',
  data_title: 'Kumbukumbu zako zinakaa wapi',
  data_body: 'Kwenye kompyuta hii, zimefungwa kwa usimbaji fiche. Hakuna kinachotoka isipokuwa ofisi yako iweke muunganisho.',
  intro: {
    dpp: {
      what: 'Pokea majalada kutoka polisi, pitia ushahidi, amua, andaa nyaraka na fuatilia kila kesi hadi mahakamani.',
      never: 'Haifanyi uamuzi kwa niaba yako. Kila uamuzi ni wako, kwa jina lako.',
    },
    police: {
      what: 'Andika taarifa, simamia mahabusu na upelelezi, na tuma majalada kamili kwa mwendesha mashtaka.',
      never: 'Haiamui nani ashtakiwe au azuiliwe. Maafisa huamua; mfumo hutunza kumbukumbu.',
    },
    prisons: {
      what: 'Pokea watu gerezani, weka kila hati na tarehe kwa mpangilio, na achilia kwa wakati.',
      never: 'Haimwachilii wala kumzuia mtu yeyote yenyewe. Maafisa huamua; mfumo hukagua tarehe.',
    },
    courts: {
      what: 'Tunza rejista, endesha vikao na toa kumbukumbu ya kila kesi.',
      never: 'Haiamui kesi. Mahakama huamua.',
    },
    lawyers: {
      what: 'Weka mashauri ya wateja, nyaraka na tarehe za mahakama mahali pamoja.',
      never: 'Haitoi ushauri wa kisheria. Wewe ndiye unatoa.',
    },
  },

  licence_title: 'Leseni',
  licence_lead: 'Tafadhali soma leseni. Unaweza kuisoma tena wakati wowote kwenye Mipangilio.',
  licence_accept: 'Nimesoma leseni na ninaikubali kwa niaba ya taasisi au ofisi yangu',
  licence_scroll: 'Sogeza hadi mwisho ili kukubali',
  licence_version: (v) => `Toleo ${v}`,

  where_title: 'Unafanya kazi wapi?',
  where_lead: 'Hii huweka namba za kumbukumbu, mpangilio wa jalada na sheria ambazo programu inatumia.',
  area_east_africa: 'Afrika Mashariki',
  status_ready: 'Tayari',
  status_provisional: 'Inathibitishwa',
  status_research: 'Msingi',
  status_hint_ready: 'Imekaguliwa dhidi ya vyanzo rasmi.',
  status_hint_provisional: 'Inafanya kazi leo. Baadhi ya maelezo bado yanathibitishwa na wataalamu.',
  status_hint_research: 'Inafanya kazi kwa mipangilio ya jumla. Maelezo ya nchi yatakuja kwenye sasisho.',
  language_title: 'Lugha',
  language_lead: 'Unaweza kuibadilisha wakati wowote, na kila mtu anaweza kuchagua yake.',
  language_used_in: (c) => `Inatumika ${c}`,
  language_other: 'Lugha nyingine',

  model_title: 'Hii ni ofisi au makao makuu?',
  model_lead: 'Ofisi hufanya kazi ya kila siku. Makao makuu husimamia ofisi.',
  office_title: 'Ofisi',
  office_body: 'Ofisi ya kanda au kituo. Inafanya kazi yenyewe tangu siku ya kwanza, na inaweza kuunganishwa na makao makuu baadaye.',
  hq_title: 'Makao makuu',
  hq_body: 'Ofisi ya kitaifa. Huidhinisha ofisi zinazoungana nayo na huona taarifa zao.',
  hq_unavailable: 'Katika nchi hii taasisi hii haina makao makuu ya kitaifa.',
  office_name: 'Jina la ofisi hii',
  office_name_placeholder: 'Kwa mfano, Wandegeya',
  hq_name: 'Jina la makao makuu',
  region_choose: 'Chagua…',
  region_type: 'Andika jina',

  protection_title: 'Ilindwe vipi?',
  protection_lead: 'Unaweza kuongeza ulinzi baadaye. Kupunguza kunahitaji msimamizi.',
  none_title: 'Bila kuingia',
  none_body: 'Mtu mmoja kwenye kompyuta anayoitumia peke yake. Programu hufunguka mara moja.',
  basic_title: 'PIN kwa kila mtu',
  basic_body: 'Kila mtu ana PIN yake ya tarakimu 6. Programu hujifunga isipotumika kwa muda.',
  full_title: 'Ulinzi kamili',
  full_body: 'Nenosiri na msimbo kutoka programu ya uthibitishaji kwenye simu. Kila kitendo hurekodiwa. Kwa ofisi zenye watu kadhaa.',
  recommended: 'Inapendekezwa',
  always_encrypted: 'Chochote utakachochagua, kumbukumbu zako husimbwa kwenye kompyuta hii kila wakati.',

  look_title: 'Ifanye iwe yako',
  look_lead: 'Nembo na rangi yako huonekana kwenye kila skrini na kila hati unayochapisha.',
  logo: 'Nembo',
  logo_hint: 'PNG, JPG, SVG au WebP, hadi MB 1.',
  logo_upload: 'Chagua picha',
  logo_default: 'Tumia ya kawaida',
  logo_failed: 'Picha hiyo haikuweza kutumika. Jaribu PNG au JPG chini ya MB 1.',
  colour: 'Rangi',
  preview: 'Muonekano',
  preview_button: 'Fungua jalada',

  people_title: 'Nani ataitumia?',
  people_lead: 'Anza na wewe mwenyewe. Utakuwa msimamizi.',
  admin_title: 'Wewe, msimamizi',
  admin_lead: 'Msimamizi huongeza watu na kubadilisha mipangilio.',
  name: 'Jina kamili',
  rank: 'Cheo',
  role: 'Jukumu',
  pin: 'PIN',
  pin_hint: 'Tarakimu 6. Usitumie PIN ya simu yako.',
  password: 'Nenosiri',
  password_hint: 'Angalau herufi 12. Sentensi fupi inafaa.',
  confirm: 'Iandike tena',
  mismatch: 'Hazilingani.',
  pin_invalid: 'PIN ni tarakimu 6 kamili.',
  password_short: 'Tumia angalau herufi 12.',
  name_required: 'Andika jina.',
  factor_title: 'Unganisha simu yako',
  factor_lead: 'Fungua programu ya uthibitishaji (kama Google Authenticator au Microsoft Authenticator) na uchanganue msimbo huu.',
  factor_manual: 'Au andika ufunguo huu',
  factor_code: 'Msimbo unaoonekana kwenye simu',
  factor_code_invalid: 'Andika msimbo wa tarakimu 6 kutoka kwenye simu.',
  factor_failed: 'Msimbo haukuweza kuandaliwa. Jaribu tena.',
  others_title: 'Mtu mwingine yeyote?',
  others_lead: 'Unaweza pia kuongeza watu baadaye kwenye Mipangilio.',
  others_none: 'Bila kuingia, ni mtu mmoja tu anayetumia kompyuta hii. Chagua PIN au ulinzi kamili ili kuongeza wengine.',
  add_person: 'Ongeza mtu',
  remove: 'Ondoa',
  first_sign_in: 'Wataunganisha simu zao mara ya kwanza wanapoingia.',

  done_title: 'Tayari',
  done_lead: 'Hiki ndicho kilichosanidiwa. Unaweza kubadilisha chochote kwenye Mipangilio.',
  summary_country: 'Nchi',
  summary_language: 'Lugha',
  summary_model: 'Aina',
  summary_office: 'Ofisi',
  summary_protection: 'Ulinzi',
  summary_people: (n) => (n === 1 ? 'Mtu 1' : `Watu ${n}`),
  failed: 'Usanidi haukuweza kukamilika.',

  signin_who: 'Nani anaingia?',
  signin_not_you: 'Mtu mwingine',
  signin_submit: 'Ingia',
  signin_busy: 'Inaingia…',
  signin_code_lead: 'Andika msimbo wa tarakimu 6 kutoka programu ya uthibitishaji kwenye simu yako.',
  signin_enrol_lead: 'Hii ni mara yako ya kwanza kuingia. Unganisha simu yako ili kumaliza.',
  signin_failed: 'Haikufanikiwa. Kagua kisha ujaribu tena.',
  signin_no_people: 'Hakuna anayeweza kuingia bado. Muulize msimamizi.',
}


const fr: SetupMessages = {
  back: 'Retour',
  continue: 'Continuer',
  finish: 'Terminer la configuration',
  finishing: 'Configuration…',
  open: (p) => `Ouvrir ${p}`,
  step: (n, t) => `Étape ${n} sur ${t}`,
  optional: 'Facultatif',
  loading: 'Ouverture…',

  welcome_title: (p) => `Bienvenue dans ${p}`,
  welcome_lead: 'Quelques questions, puis vous pourrez travailler. Cela prend environ trois minutes.',
  what_title: 'Ce qu\'il fait',
  never_title: 'Ce qu\'il ne fait jamais',
  data_title: 'Où sont vos dossiers',
  data_body: 'Sur cet ordinateur, protégés par chiffrement. Rien n\'en sort, sauf si votre bureau met en place une connexion.',
  intro: {
    dpp: {
      what: 'Recevoir les dossiers de la police, examiner les preuves, décider, préparer les actes et suivre chaque affaire jusqu\'au tribunal.',
      never: 'Il ne décide jamais à votre place. Chaque décision est la vôtre, en votre nom.',
    },
    police: {
      what: 'Enregistrer les plaintes, gérer la garde à vue et les enquêtes, et transmettre des dossiers complets au parquet.',
      never: 'Il ne décide jamais qui est poursuivi ou retenu. Les agents décident ; le système tient le dossier.',
    },
    prisons: {
      what: 'Accueillir les personnes détenues, tenir chaque titre et chaque date en ordre, et libérer à temps.',
      never: 'Il ne libère ni ne retient personne de lui-même. Les agents décident ; le système vérifie les dates.',
    },
    courts: {
      what: 'Tenir le registre, conduire les audiences et produire le dossier de chaque affaire.',
      never: 'Il ne juge jamais une affaire. Le tribunal juge.',
    },
    lawyers: {
      what: 'Réunir les dossiers clients, les documents et les dates d\'audience au même endroit.',
      never: 'Il ne donne jamais de conseil juridique. C\'est vous qui le faites.',
    },
  },

  licence_title: 'Licence',
  licence_lead: 'Veuillez lire la licence. Vous pourrez la relire à tout moment dans les Réglages.',
  licence_accept: 'J\'ai lu la licence et je l\'accepte pour mon institution ou mon cabinet',
  licence_scroll: 'Faites défiler jusqu\'à la fin pour accepter',
  licence_version: (v) => `Version ${v}`,

  where_title: 'Où travaillez-vous ?',
  where_lead: 'Cela détermine les numéros de référence, l\'organisation des dossiers et les lois utilisées.',
  area_east_africa: 'Afrique de l\'Est',
  status_ready: 'Prêt',
  status_provisional: 'En confirmation',
  status_research: 'De base',
  status_hint_ready: 'Vérifié auprès de sources officielles.',
  status_hint_provisional: 'Fonctionne aujourd\'hui. Certains détails sont encore confirmés avec des praticiens.',
  status_hint_research: 'Fonctionne avec des réglages généraux. Les détails du pays suivront dans une mise à jour.',
  language_title: 'Langue',
  language_lead: 'Vous pouvez la changer à tout moment, et chaque personne peut choisir la sienne.',
  language_used_in: (c) => `Utilisée : ${c}`,
  language_other: 'Autres langues',

  model_title: 'Bureau ou siège ?',
  model_lead: 'Un bureau fait le travail quotidien. Le siège supervise les bureaux.',
  office_title: 'Un bureau',
  office_body: 'Un bureau régional ou local. Fonctionne seul dès le premier jour et peut se relier au siège plus tard.',
  hq_title: 'Siège',
  hq_body: 'Le bureau national. Approuve les bureaux qui s\'y relient et consulte leurs rapports.',
  hq_unavailable: 'Dans ce pays, cette institution n\'a pas de siège national.',
  office_name: 'Nom de ce bureau',
  office_name_placeholder: 'Par exemple, Parquet de Lyon',
  hq_name: 'Nom du siège',
  region_choose: 'Choisir…',
  region_type: 'Saisir le nom',

  protection_title: 'Quelle protection ?',
  protection_lead: 'Vous pourrez renforcer la protection plus tard. L\'abaisser nécessite un administrateur.',
  none_title: 'Sans connexion',
  none_body: 'Une seule personne, sur un ordinateur qu\'elle est seule à utiliser. L\'application s\'ouvre directement.',
  basic_title: 'Code PIN pour chacun',
  basic_body: 'Chaque personne a son propre code PIN à 6 chiffres. L\'application se verrouille après un moment d\'inactivité.',
  full_title: 'Protection complète',
  full_body: 'Un mot de passe et un code d\'une application d\'authentification sur le téléphone. Chaque action est enregistrée. Pour les bureaux de plusieurs personnes.',
  recommended: 'Recommandé',
  always_encrypted: 'Quel que soit votre choix, vos dossiers sont toujours chiffrés sur cet ordinateur.',

  look_title: 'À vos couleurs',
  look_lead: 'Votre emblème et votre couleur apparaissent sur chaque écran et sur chaque document imprimé.',
  logo: 'Emblème ou logo',
  logo_hint: 'PNG, JPG, SVG ou WebP, jusqu\'à 1 Mo.',
  logo_upload: 'Choisir une image',
  logo_default: 'Utiliser l\'emblème par défaut',
  logo_failed: 'Cette image ne peut pas être utilisée. Essayez un PNG ou JPG de moins de 1 Mo.',
  colour: 'Couleur',
  preview: 'Aperçu',
  preview_button: 'Ouvrir le dossier',

  people_title: 'Qui va l\'utiliser ?',
  people_lead: 'Commencez par vous. Vous serez l\'administrateur.',
  admin_title: 'Vous, l\'administrateur',
  admin_lead: 'L\'administrateur ajoute des personnes et modifie les réglages.',
  name: 'Nom complet',
  rank: 'Grade ou fonction',
  role: 'Rôle',
  pin: 'Code PIN',
  pin_hint: '6 chiffres. N\'utilisez pas le code de votre téléphone.',
  password: 'Mot de passe',
  password_hint: 'Au moins 12 caractères. Une courte phrase convient bien.',
  confirm: 'Saisissez-le à nouveau',
  mismatch: 'Les deux ne correspondent pas.',
  pin_invalid: 'Un code PIN compte exactement 6 chiffres.',
  password_short: 'Utilisez au moins 12 caractères.',
  name_required: 'Saisissez un nom.',
  factor_title: 'Reliez votre téléphone',
  factor_lead: 'Ouvrez une application d\'authentification (comme Google Authenticator ou Microsoft Authenticator) et scannez ce code.',
  factor_manual: 'Ou saisissez cette clé',
  factor_code: 'Code affiché sur le téléphone',
  factor_code_invalid: 'Saisissez le code à 6 chiffres du téléphone.',
  factor_failed: 'Le code n\'a pas pu être préparé. Réessayez.',
  others_title: 'D\'autres personnes ?',
  others_lead: 'Vous pourrez aussi ajouter des personnes plus tard dans les Réglages.',
  others_none: 'Sans connexion, une seule personne utilise cet ordinateur. Choisissez le code PIN ou la protection complète pour en ajouter.',
  add_person: 'Ajouter une personne',
  remove: 'Retirer',
  first_sign_in: 'Elles relient leur téléphone à leur première connexion.',

  done_title: 'Tout est prêt',
  done_lead: 'Voici ce qui a été configuré. Tout peut être modifié dans les Réglages.',
  summary_country: 'Pays',
  summary_language: 'Langue',
  summary_model: 'Type',
  summary_office: 'Bureau',
  summary_protection: 'Protection',
  summary_people: (n) => (n === 1 ? '1 personne' : `${n} personnes`),
  failed: 'La configuration n\'a pas pu être terminée.',

  signin_who: 'Qui se connecte ?',
  signin_not_you: 'Une autre personne',
  signin_submit: 'Se connecter',
  signin_busy: 'Connexion…',
  signin_code_lead: "Saisissez le code à 6 chiffres de l'application d'authentification de votre téléphone.",
  signin_enrol_lead: 'C\'est votre première connexion. Reliez votre téléphone pour terminer.',
  signin_failed: "Cela n'a pas fonctionné. Vérifiez et réessayez.",
  signin_no_people: "Personne ne peut encore se connecter. Demandez à l'administrateur.",
}

export const SETUP_MESSAGES: Record<Locale, SetupMessages> = { en, sw, fr }

/** Endonyms: each language named in itself, never translated. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  
  fr: 'Français',
}
