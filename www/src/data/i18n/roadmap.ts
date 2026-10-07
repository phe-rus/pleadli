/** Kiswahili and French for src/data/roadmap.ts: [title, note] in the
 * same order as the English list. An empty note stays empty. */
type Row = [string, string]

const sw: Row[] = [
  ['Visakinishi vya Windows vya Police, DPP, Lawyers na Prisons', 'Toleo 0.1.0, limejengwa na kuchapishwa na mtiririko wa kiotomatiki. Bado halijasainiwa kwa cheti cha msimbo.'],
  ['Masasisho ya kiotomatiki yaliyosainiwa', 'Nakala zilizosakinishwa hutafuta sasisho lililosainiwa kwa ufunguo wa Pleadli na huuliza kabla ya kusakinisha. Sasisho la kwanza bado halijafanyika.'],
  ['Mpangilio mmoja wa mwanzo: nchi, lugha, ofisi, ulinzi, rangi na nembo, watu wa kwanza', 'Unatumiwa na DPP na Lawyers. Police na Prisons zinafuata.'],
  ['Vifurushi vya nchi nane za Afrika Mashariki', 'Uganda, Kenya, Tanzania, Rwanda, Burundi, DR Congo, Sudan Kusini na Somalia: mahakama, sheria, rejea, mipaka ya muda. Baadhi ya taarifa ni za muda au kutoka vyanzo vya pili, na zimewekewa alama hivyo.'],
  ['Msaidizi: AI kwa mtoa huduma na ufunguo ambao ofisi inachagua', 'Umejengwa katika DPP na Lawyers. Muda wa mwisho daima huhesabiwa na programu, kamwe si na AI.'],
  ['Kiingereza, Kiswahili na Kifaransa', 'Kamili katika DPP na kwenye tovuti hii; skrini mpya za Lawyers zimetafsiriwa na za zamani zinamaliziwa; Police na Prisons zinafuata.'],
  ['Visakinishi vilivyosainiwa kwa cheti, checksums, Linux na macOS', 'Hadi hapo Windows huonyesha onyo la SmartScreen katika usakinishaji wa kwanza.'],
  ['Kupokea mashauri, upelelezi, kizuizini, shughuli za kituo', 'Mtiririko mkuu wa kazi ya kituo.'],
  ['Hifadhidata iliyosimbwa', 'Usimamizi ule ule wa funguo wa programu nyingine.'],
  ['Mpangilio wa mwanzo, kuingia na nafasi', 'Ifuatayo: kuhamia kwenye mpangilio wa pamoja unaotumiwa na DPP na Lawyers.'],
  ['Hifadhi ya viambatisho iliyofungwa na kumbukumbu za ukaguzi zilizounganishwa kwa hashi', ''],
  ['Ubao wa mashauri, sehemu za jalada, kalenda, kazi, takwimu', ''],
  ['Saa za kisheria za kizuizini na rumande, kwa kila nchi', 'Zinahesabiwa na programu kutokana na matukio yaliyorekodiwa.'],
  ['Nyaraka kwa kila nchi, zilizofungwa na zinazothibitishika', 'Uganda na DR Congo zimekaguliwa kwenye kivinjari halisi; vifurushi vingine vinatumia violezo vya common law au parquet.'],
  ['Karatasi za skana zinagawanywa, kupangwa na kusomwa', ''],
  ['Mawasiliano na Polisi na Mahakama', 'Muundo umewekwa, haujajengwa bado.'],
  ['Daftari, vikao, maahirisho yenye muundo, orodha ya kesi', 'Imethibitishwa kwa majaribio ya Rust na uendeshaji wa UI bila dirisha.'],
  ['Kumbukumbu ya kikao iliyosainiwa, vielelezo, maamuzi, hukumu', 'Kumbukumbu zilizosainiwa hufungwa na trigger ya hifadhidata.'],
  ['Kurekodi sauti ya kikao kwa vipande vyenye hashi', ''],
  ['Toleo la kwanza la Windows', 'Courts ndiyo programu pekee ambayo bado haijatolewa.'],
  ['Injini ya kunukuu nyuma ya kiunganishi', 'Kiunganishi kinakataa kubuni maandishi. Kinahitaji sauti halisi ya mahakamani kwanza.'],
  ['Uthibitisho kazini na hakimu halisi na karani wa mahakama', ''],
  ['Kila aina ya uwakili: aina za mashauri, hatua, ubao, ukaguzi wa mgongano', 'Peke yako au kama kampuni; matumizi huchaguliwa wakati wa kuanzisha.'],
  ['Saa za muda wa mahakama (kanuni za Uganda)', 'Kanuni za Utaratibu wa Madai, Kanuni za Mahakama ya Rufani, Sheria ya Ukomo wa Muda, notisi kwa Serikali.'],
  ['Nyaraka zilizofungwa, vifurushi vya kuwasilisha, kuhamisha kwa PDF na Word', ''],
  ['Fedha za wateja, hati za ada, hati za gharama', 'Kanuni za Hesabu zinatekelezwa; hati za gharama hupangiwa bei kwa Jedwali la Sita.'],
  ['Rejista za viapo na unotari, utekelezaji wa leseni, takwimu', ''],
  ['Kampuni kwenye mtandao mmoja wa ofisi', 'Imekaguliwa kwa nakala mbili kwenye kompyuta moja; bado haijajaribiwa kwenye kompyuta mbili halisi.'],
  ['Kuhamisha kila kumbukumbu', 'ZIP moja: JSON pamoja na jedwali kwa kila aina ya kumbukumbu.'],
  ['Notisi za kusikilizwa na amri kutoka Mahakama', ''],
  ['Kupokelewa, kizuizini, kuachiliwa, kufikishwa mahakamani', ''],
  ['Mfumo wa bila mtandao, gereza kwanza, uratibu wa Makao Makuu', 'Gereza hufanya kazi kikamilifu bila Makao Makuu.'],
  ['Mawasiliano ya gereza na Makao Makuu yaliyobanwa kwa TLS', 'Bado hayajajaribiwa kwenye kompyuta mbili halisi.'],
  ['Mpangilio wa pamoja, saa za kisheria na Msaidizi kutoka DPP', 'Kinachofuata kwa Prisons.'],
  ['Tovuti ya umma ya Pleadli Cloud na usimamizi mwepesi (tovuti hii)', 'Vipakuliwa viko hewani; lugha nne.'],
]

const fr: Row[] = [
  ['Installateurs Windows pour Police, DPP, Lawyers et Prisons', 'Version 0.1.0, construite et publiée par un flux de publication automatisé. Pas encore signée par certificat.'],
  ['Mises à jour automatiques signées', "Les copies installées cherchent une mise à jour signée avec la clé de Pleadli et demandent avant d'installer. La première mise à jour réelle n'a pas encore eu lieu."],
  ['Une seule configuration au premier lancement : pays, langue, bureau, protection, couleur et logo, premières personnes', 'Partagée par DPP et Lawyers. Police et Prisons suivent.'],
  ["Packs pour huit pays d'Afrique de l'Est", 'Ouganda, Kenya, Tanzanie, Rwanda, Burundi, RD Congo, Soudan du Sud et Somalie : tribunaux, lois, références, délais. Certains éléments sont provisoires ou tirés de sources secondaires, et signalés comme tels.'],
  ["L'Assistant : l'IA avec le fournisseur et la clé choisis par le bureau", "Construit dans DPP et Lawyers. Les délais sont toujours calculés par l'application, jamais par l'IA."],
  ['Anglais, kiswahili et français', 'Complet dans DPP et sur ce site ; les nouveaux écrans de Lawyers sont traduits et les anciens en cours ; Police et Prisons suivent.'],
  ['Installateurs signés par certificat, sommes de contrôle, Linux et macOS', "D'ici là, Windows affiche un avertissement SmartScreen à la première installation."],
  ['Enregistrement des affaires, enquête, garde à vue, vie du poste', 'Le cœur du travail du poste.'],
  ['Base de données chiffrée', 'Même gestion partagée des clés que les autres applications.'],
  ['Configuration au premier lancement, connexion et rôles', 'Prochaine étape : passer à la configuration partagée de DPP et Lawyers.'],
  ["Coffre scellé pour les pièces jointes et journal d'audit chaîné par hachage", ''],
  ['Tableau des affaires, sections du dossier, calendrier, tâches, statistiques', ''],
  ['Délais légaux de garde à vue et de détention provisoire, par pays', "Calculés par l'application à partir des événements enregistrés."],
  ['Documents par pays, scellés et vérifiables', "L'Ouganda et la RD Congo vérifiés dans un vrai navigateur ; les autres packs utilisent des modèles de common law ou de parquet."],
  ['Pièces scannées découpées, classées et lues', ''],
  ['Échange avec la police et les tribunaux', 'Conception arrêtée, pas encore construit.'],
  ['Registre, audiences, renvois structurés, rôle', "Vérifié par une suite de tests Rust et une exécution de l'interface sans fenêtre."],
  ["Procès-verbal d'audience signé, pièces, décisions, jugements", 'Les procès-verbaux signés sont figés par un déclencheur de la base de données.'],
  ["Enregistrement audio d'une audience par segments hachés", ''],
  ['Première version Windows', "Courts est la seule application pas encore publiée."],
  ["Moteur de transcription derrière l'interface", "L'interface refuse d'inventer du texte. Il faut d'abord de vrais enregistrements d'audience."],
  ['Validation sur le terrain avec un vrai magistrat et un greffier', ''],
  ["Tous les types d'exercice : types d'affaires, étapes, tableau, contrôle des conflits", 'Seul ou en cabinet ; usages choisis à la configuration.'],
  ['Délais de procédure (règles ougandaises)', "Code de procédure civile, règlement de la Cour d'appel, loi sur la prescription, préavis au gouvernement."],
  ['Actes scellés, liasses de dépôt, export PDF et Word', ''],
  ["Fonds des clients, notes d'honoraires, états de frais", 'Accounts Rules appliquées ; états chiffrés selon la sixième annexe.'],
  ['Registres des serments et actes notariés, conformité professionnelle, statistiques', ''],
  ['Un cabinet sur un seul réseau de bureau', 'Vérifié avec deux copies sur un ordinateur ; pas encore sur deux machines physiques.'],
  ['Export de toutes les données', 'Un ZIP : JSON et un tableur par type de données.'],
  ["Avis d'audience et ordonnances des tribunaux", ''],
  ['Écrou, détention, libération, présentation au tribunal', ''],
  ["Modèle hors ligne centré sur l'établissement, coordination du siège", 'Un établissement fonctionne entièrement sans le siège.'],
  ['Échange établissement-siège en TLS épinglé', 'Pas encore testé sur deux machines physiques.'],
  ['Configuration partagée, délais légaux et Assistant venant de DPP', 'Prochaine étape pour Prisons.'],
  ['Site public Pleadli Cloud et administration légère (ce site)', 'Téléchargements en ligne ; quatre langues.'],
]


const toItems = (rows: Row[]) => rows.map(([title, note]) => ({ title, note }))

export const roadmapText = { sw: toItems(sw), fr: toItems(fr)}

export const roadmapStatusText = {
  sw: { done: 'Imetolewa', 'in-progress': 'Inaendelea', planned: 'Imepangwa', research: 'Inahitaji utafiti' },
  fr: { done: 'Livré', 'in-progress': 'En cours', planned: 'Prévu', research: 'Recherche nécessaire' },
  
}
