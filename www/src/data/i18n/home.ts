/** Kiswahili, French and German for src/data/home.ts. Only text; whatever is
 * missing stays English. Same order as the English lists. */
export const homeText = {
  adminNavItems: {
    sw: [{ label: 'Mashirika' }, { label: 'Vitengo vya shirika' }, { label: 'Uanachama' }, { label: 'Stahiki' }],
    fr: [{ label: 'Organisations' }, { label: "Unités d'organisation" }, { label: 'Adhésions' }, { label: 'Droits' }],
    de: [{ label: 'Organisationen' }, { label: 'Organisationseinheiten' }, { label: 'Mitgliedschaften' }, { label: 'Berechtigungen' }],
  },
  trustPoints: {
    sw: [
      { title: 'Imesimbwa ikiwa imehifadhiwa', description: 'Kila kumbukumbu imesimbwa kwa ufunguo wake, uliofungwa kando kwa kila taasisi. Hakuna kinachohifadhiwa wazi.' },
      { title: 'Imesimbwa ikisafirishwa', description: 'TLS ya kawaida kila mahali, pamoja na vikao vya moja kwa moja, bila kighairi.' },
      { title: 'Inaendana na sheria ya ulinzi wa data ya Uganda', description: 'Imeundwa kuzunguka Sheria ya Ulinzi wa Data na Faragha, 2019, si kuongezwa baadaye.' },
    ],
    fr: [
      { title: 'Chiffré au repos', description: "Chaque dossier est chiffré avec sa propre clé, enveloppée séparément pour chaque institution. Rien n'est stocké en clair." },
      { title: 'Chiffré en transit', description: 'TLS standard partout, y compris pour les audiences en direct, sans exception.' },
      { title: "Conforme à la loi ougandaise sur la protection des données", description: "Conçu autour du Data Protection and Privacy Act de 2019, et non ajouté après coup." },
    ],
    de: [
      { title: 'Im Ruhezustand verschlüsselt', description: 'Jede Akte ist mit eigenem Schlüssel verschlüsselt, pro Institution getrennt verpackt. Nichts wird im Klartext gespeichert.' },
      { title: 'Bei der Übertragung verschlüsselt', description: 'Überall Standard-TLS, auch bei Live-Verhandlungen, ohne Ausnahme.' },
      { title: 'Im Einklang mit Ugandas Datenschutzrecht', description: 'Um den Data Protection and Privacy Act von 2019 herum entworfen, nicht nachträglich angefügt.' },
    ],
  },
  homeStats: {
    sw: [
      { value: '48%', description: 'ya wafungwa wa Uganda wako rumande, wakisubiri kesi, hawajatiwa hatiani.' },
      { value: 'Saa 48', description: 'kikomo cha kikatiba cha kumfikisha mshukiwa mahakamani baada ya kukamatwa.' },
    ],
    fr: [
      { value: '48 %', description: 'de la population carcérale ougandaise est en détention provisoire, en attente de jugement, sans condamnation.' },
      { value: '48 h', description: "le délai constitutionnel pour présenter un suspect au tribunal après son arrestation." },
    ],
    de: [
      { value: '48 %', description: 'der Gefängnisinsassen Ugandas sind in Untersuchungshaft, warten auf ihren Prozess und sind nicht verurteilt.' },
      { value: '48 Std.', description: 'die verfassungsmäßige Frist, um einen Verdächtigen nach der Festnahme einem Gericht vorzuführen.' },
    ],
  },
  homeProblems: {
    sw: [
      { title: 'Kuingiza data mara kwa mara', description: 'Ukweli ule ule huandikwa upya katika mfumo mpya kila mpaka wa taasisi, kwa kila shauri.' },
      { title: 'Makabidhiano ya polepole', description: 'Shauri linalotoka polisi kwenda mashtaka hadi mahakamani mara nyingi husubiri makaratasi yafike.' },
      { title: 'Hakuna rejea ya pamoja', description: 'Hakuna aliye nje ya taasisi moja anayeweza kuthibitisha hali halisi ya shauri, hata akiwa na sababu halali ya kujua.' },
    ],
    fr: [
      { title: 'Saisies répétées', description: 'Les mêmes faits sont retapés dans un nouveau système à chaque frontière institutionnelle, pour chaque affaire.' },
      { title: 'Transmissions lentes', description: "Une affaire qui passe de la police au parquet puis au tribunal attend souvent que les papiers suivent physiquement." },
      { title: 'Aucune référence commune', description: "Personne hors d'une institution ne peut confirmer où en est vraiment une affaire, même avec une raison légitime de le savoir." },
    ],
    de: [
      { title: 'Wiederholte Dateneingabe', description: 'Dieselben Fakten werden an jeder Institutionsgrenze, für jeden Fall, neu in ein anderes System getippt.' },
      { title: 'Langsame Übergaben', description: 'Ein Fall, der von der Polizei zur Staatsanwaltschaft und zum Gericht geht, wartet oft darauf, dass die Papiere nachkommen.' },
      { title: 'Keine gemeinsame Referenz', description: 'Niemand außerhalb einer Institution kann bestätigen, wo ein Fall wirklich steht, selbst mit berechtigtem Grund.' },
    ],
  },
  caseRecords: {
    sw: { records: [{ reference: 'Rejea ya CRB', activity: 'Upelelezi' }, { reference: 'Jalada la DPP', activity: 'Uchunguzi, uamuzi' }, { reference: 'Namba ya shauri', activity: 'Mashauri' }, { reference: 'Shauri', activity: 'Uwakilishi' }, { reference: 'Kumbukumbu ya kupokelewa', activity: 'Kizuizini' }] },
    fr: { records: [{ reference: 'Référence CRB', activity: 'Enquête' }, { reference: 'Dossier DPP', activity: 'Examen, décision' }, { reference: 'Numéro de rôle', activity: 'Procédure' }, { reference: 'Affaire', activity: 'Représentation' }, { reference: "Registre d'écrou", activity: 'Détention' }] },
    de: { records: [{ reference: 'CRB-Referenz', activity: 'Ermittlung' }, { reference: 'DPP-Akte', activity: 'Prüfung, Entscheidung' }, { reference: 'Aktenzeichen', activity: 'Verfahren' }, { reference: 'Mandat', activity: 'Vertretung' }, { reference: 'Aufnahmeakte', activity: 'Haft' }] },
  },
  applicationSpotlight: {
    sw: [
      { description: 'Kupokea mashauri na upelelezi hubaki mikononi mwa Jeshi la Polisi la Uganda lenyewe, mwanzo hadi mwisho.', points: ['Shauri hupata utambulisho wake wa pamoja linapofunguliwa, kabla programu nyingine yoyote haijahusika.', 'Kumbukumbu za upelelezi, maelezo na vielelezo hubaki mali ya kituo na kitengo kilichozishughulikia.', 'Kupeleka kwa DPP hubeba utambulisho wa shauri mbele, si seti mpya ya makaratasi.'] },
      { description: 'Uchunguzi wa jalada, idhini na maamuzi ya mashtaka hubaki mali ya DPP.', points: ['Shauri lililopelekwa hufika na historia yake ya upelelezi kamili, bila kurudia jalada.', 'Maamuzi ya kuidhinisha, upelelezi zaidi au kukataa hurekodiwa dhidi ya utambulisho ule ule wa shauri.', 'Kile Polisi wanachoona kuhusu uamuzi wa DPP ni kile DPP inachochagua kuonyesha, si jalada lenyewe.'] },
    ],
    fr: [
      { description: "L'enregistrement des affaires et l'enquête restent entre les mains de la police ougandaise, du début à la fin.", points: ["Une affaire reçoit son identité partagée dès son ouverture, avant qu'une autre application n'intervienne.", "Les actes d'enquête, dépositions et preuves restent la propriété du poste et de l'unité qui les ont traités.", "La transmission au DPP porte l'identité de l'affaire, pas une nouvelle liasse de papiers."] },
      { description: "L'examen, l'autorisation des poursuites et les décisions restent la propriété du DPP.", points: ["Une affaire transmise arrive avec son historique d'enquête intact, sans dupliquer le dossier.", "Les décisions d'autorisation, de complément d'enquête ou de refus sont enregistrées sur la même identité d'affaire.", "Ce que la police voit d'une décision du DPP est ce que le DPP choisit de montrer, pas le dossier lui-même."] },
    ],
    de: [
      { description: 'Fallaufnahme und Ermittlung bleiben von Anfang bis Ende in der Hand der ugandischen Polizei.', points: ['Ein Fall erhält seine gemeinsame Identität bei der Eröffnung, bevor eine andere Anwendung beteiligt ist.', 'Ermittlungsakten, Aussagen und Beweise gehören der Wache und Einheit, die sie bearbeitet haben.', 'Die Übergabe an die DPP trägt die Fallidentität weiter, keinen neuen Papierstapel.'] },
      { description: 'Prüfung, Anklagegenehmigung und Anklageentscheidungen bleiben bei der DPP.', points: ['Ein übergebener Fall kommt mit vollständiger Ermittlungsgeschichte an, ohne die Akte zu duplizieren.', 'Genehmigungen, Nachermittlungen und Ablehnungen werden unter derselben Fallidentität erfasst.', 'Was die Polizei von einer DPP-Entscheidung sieht, bestimmt die DPP, nicht die Akte selbst.'] },
    ],
  },
  scalingChains: {
    sw: [
      { title: 'Pleadli Police, kwa mfano', steps: [{ label: 'Afisa wa polisi' }, { label: 'Kituo cha polisi' }, { label: 'Tarafa au shirika' }, { label: 'Jeshi la Polisi la Uganda' }] },
      { title: 'Pleadli Lawyers, kwa mfano', steps: [{ label: 'Wakili mmoja' }, { label: 'Kampuni ya uwakili' }] },
    ],
    fr: [
      { title: 'Pleadli Police, par exemple', steps: [{ label: 'Agent de police' }, { label: 'Poste de police' }, { label: 'Division ou organisation' }, { label: 'Police ougandaise' }] },
      { title: 'Pleadli Lawyers, par exemple', steps: [{ label: 'Avocat individuel' }, { label: "Cabinet d'avocats" }] },
    ],
    de: [
      { title: 'Pleadli Police, zum Beispiel', steps: [{ label: 'Polizeibeamter' }, { label: 'Polizeiwache' }, { label: 'Division oder Organisation' }, { label: 'Ugandische Polizei' }] },
      { title: 'Pleadli Lawyers, zum Beispiel', steps: [{ label: 'Einzelanwalt' }, { label: 'Anwaltskanzlei' }] },
    ],
  },
}
