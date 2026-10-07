# Lawyers: the shared paper words (read from DPP's catalogue, so there is one
# wording), then the criminal register (the client's CTMS brief).
# key -> (en, sw, de, fr), the order build.py writes.
import json, os
_dpp = os.path.join(os.path.dirname(__file__), '..', '..', 'dpp', 'messages')
_cat = {l: json.load(open(os.path.join(_dpp, f'{l}.json')))['paper'] for l in ['en', 'sw', 'de', 'fr']}

def _flat(o, prefix=''):
    for k, v in o.items():
        if isinstance(v, dict):
            yield from _flat(v, f'{prefix}{k}.')
        else:
            yield f'{prefix}{k}'

S = {f'paper.{k}': tuple(eval('_cat[l]' + ''.join(f'[{p!r}]' for p in k.split('.'))) for l in ['en', 'sw', 'de', 'fr']) for k in _flat(_cat['en'])}

S.update({
"seal.draw": ('Sign here', 'Saini hapa', 'Hier unterschreiben', 'Signer ici'),
"seal.pad_hint": ('Sign with a pen, a finger or the mouse', 'Saini kwa kalamu, kidole au kipanya', 'Mit Stift, Finger oder Maus unterschreiben', 'Signez avec un stylet, le doigt ou la souris'),
"seal.pad_clear": ('Clear', 'Futa', 'Löschen', 'Effacer'),
"seal.pad_done": ('Use this signature', 'Tumia saini hii', 'Diese Unterschrift verwenden', 'Utiliser cette signature'),
"verify.paper_hint": ('A paper printed from the app carries only a code: type it alone to check it.', 'Karatasi iliyochapishwa kutoka programu ina msimbo tu: andika msimbo pekee ili kuihakiki.', 'Ein aus der App gedrucktes Papier trägt nur einen Code: Geben Sie ihn allein ein, um es zu prüfen.', "Un document imprimé depuis l'application porte seulement un code : saisissez-le seul pour le vérifier."),
"verify.paper_genuine": ('Genuine. This paper was printed by {by} on {date}. Compare it word for word with the wording below.', 'Halisi. Karatasi hii ilichapishwa na {by} tarehe {date}. Linganisha neno kwa neno na maneno yaliyo hapa chini.', 'Echt. Dieses Papier wurde von {by} am {date} gedruckt. Vergleichen Sie es Wort für Wort mit dem Wortlaut unten.', 'Authentique. Ce document a été imprimé par {by} le {date}. Comparez-le mot pour mot avec le texte ci-dessous.'),
"verify.someone": ('someone in this office', 'mtu wa ofisi hii', 'jemandem in dieser Stelle', 'une personne de ce bureau'),
"document.draft": ("Draft", "Rasimu", "Entwurf", "Projet"),
"document.drafted": ("Drafted", "Rasimu iliandaliwa", "Entworfen", "Rédigé"),
"document.filed_label": ("Filed", "Imewasilishwa", "Eingereicht", "Déposé"),
"document.sha_label": ("SHA-256 of the text as filed", "SHA-256 ya maandishi yalivyowasilishwa", "SHA-256 des eingereichten Textes", "SHA-256 du texte déposé"),
"nav.criminal": ("Criminal register", "Rejista ya jinai", "Strafregister", "Registre pénal"),
"criminal.title": ("Criminal register", "Rejista ya jinai", "Strafregister", "Registre pénal"),
"criminal.lead": ("Every criminal matter of the practice: stage, custody, days on remand, adjournments and the next date.", "Kila shauri la jinai la ofisi: hatua, kizuizini, siku za rumande, kuahirishwa na tarehe ijayo.", "Jedes Strafmandat der Kanzlei: Stand, Haft, Tage in Untersuchungshaft, Vertagungen und der nächste Termin.", "Chaque dossier pénal du cabinet : étape, détention, jours de détention provisoire, renvois et prochaine date."),
"criminal.table": ("Table", "Jedwali", "Tabelle", "Tableau"),
"criminal.cards": ("Cards", "Kadi", "Karten", "Cartes"),
"criminal.new": ("New case", "Kesi mpya", "Neuer Fall", "Nouvelle affaire"),
"criminal.export": ("Save as Excel", "Hifadhi kama Excel", "Als Excel speichern", "Enregistrer en Excel"),
"criminal.print": ("Print the list", "Chapisha orodha", "Liste drucken", "Imprimer la liste"),
"criminal.all": ("All cases", "Kesi zote", "Alle Fälle", "Toutes les affaires"),
"criminal.search": ("Search case, accused, charge", "Tafuta kesi, mshtakiwa, shtaka", "Fall, Beschuldigte, Anklage suchen", "Rechercher affaire, accusé, charge"),
"criminal.year": ("Year", "Mwaka", "Jahr", "Année"),
"criminal.all_years": ("All years", "Miaka yote", "Alle Jahre", "Toutes les années"),
"criminal.charge": ("Charge", "Shtaka", "Anklage", "Charge"),
"criminal.all_charges": ("All charges", "Mashtaka yote", "Alle Anklagen", "Toutes les charges"),
"criminal.custody": ("Custody", "Kizuizini", "Haft", "Détention"),
"criminal.all_custody": ("All", "Zote", "Alle", "Toutes"),
"criminal.showing": ("Showing {count} cases", "Inaonyesha kesi {count}", "{count} Fälle angezeigt", "{count} affaires affichées"),
"criminal.col.case": ("Case no.", "Namba ya kesi", "Aktenzeichen", "N° d'affaire"),
"criminal.col.accused": ("Accused", "Mshtakiwa", "Beschuldigte", "Accusé"),
"criminal.col.stage": ("Stage", "Hatua", "Stand", "Étape"),
"criminal.col.remand": ("Remand", "Rumande", "U-Haft", "Détention provisoire"),
"criminal.col.adj": ("Adj.", "Kuahir.", "Vert.", "Renv."),
"criminal.col.next": ("Next hearing", "Usikilizaji ujao", "Nächster Termin", "Prochaine audience"),
"criminal.open": ("Open", "Fungua", "Öffnen", "Ouvrir"),
"criminal.uganda_v": ("Uganda v.", "Uganda dhidi ya", "Uganda gegen", "Ouganda c."),
"criminal.at_liberty": ("At liberty", "Yuko huru", "Auf freiem Fuß", "En liberté"),
"criminal.remanded": ("Remanded", "Rumande", "In U-Haft", "En détention provisoire"),
"criminal.serving": ("Serving", "Anatumikia kifungo", "In Strafhaft", "Purge une peine"),
"criminal.days": ("{days}d / {limit}d", "siku {days} / {limit}", "{days} T. / {limit} T.", "{days} j / {limit} j"),
"criminal.days_on_remand": ("{days} days on remand", "siku {days} rumande", "{days} Tage in U-Haft", "{days} jours de détention provisoire"),
"criminal.committed_days": ("Committed: {days} days on remand", "Amepelekwa: siku {days} rumande", "Überwiesen: {days} Tage in U-Haft", "Renvoyé : {days} jours de détention"),
"criminal.no_date": ("Remand date not recorded", "Tarehe ya rumande haijarekodiwa", "Haftdatum nicht erfasst", "Date de détention non renseignée"),
"criminal.none": ("No date", "Hakuna tarehe", "Kein Termin", "Pas de date"),
"criminal.empty": ("No criminal matters yet. Open one with New case.", "Bado hakuna mashauri ya jinai. Fungua moja kwa Kesi mpya.", "Noch keine Strafmandate. Legen Sie eines mit Neuer Fall an.", "Aucun dossier pénal pour l'instant. Ouvrez-en un avec Nouvelle affaire."),
"criminal.panel.details": ("Case details", "Maelezo ya kesi", "Falldetails", "Détails de l'affaire"),
"criminal.panel.tracker": ("Remand tracker", "Kifuatiliaji cha rumande", "U-Haft-Verlauf", "Suivi de la détention"),
"criminal.panel.history": ("Trial history", "Historia ya kesi", "Verfahrensverlauf", "Historique du procès"),
"criminal.panel.filed": ("Opened", "Ilifunguliwa", "Angelegt", "Ouvert"),
"criminal.panel.court": ("Court", "Mahakama", "Gericht", "Tribunal"),
"criminal.panel.adjournments": ("{count} adjournments", "kuahirishwa {count}", "{count} Vertagungen", "{count} renvois"),
"criminal.panel.remanded_on": ("Remanded on", "Alipelekwa rumande", "In U-Haft seit", "Placé en détention le"),
"criminal.panel.committed_on": ("Committed for trial on", "Alipelekwa kwa kesi tarehe", "Zur Hauptverhandlung überwiesen am", "Renvoyé en jugement le"),
"criminal.panel.save_dates": ("Save dates", "Hifadhi tarehe", "Daten speichern", "Enregistrer les dates"),
"criminal.panel.limit_high": ("Limit: 180 days before committal for an offence triable only by the High Court (Constitution, Art. 23(6)(c)). Taken from the court level recorded on the matter.", "Kikomo: siku 180 kabla ya kupelekwa kwa kosa linalosikilizwa na Mahakama Kuu pekee (Katiba, Ibara 23(6)(c)). Kimetokana na ngazi ya mahakama iliyorekodiwa kwenye shauri.", "Grenze: 180 Tage vor der Überweisung bei einer nur vor dem High Court verhandelbaren Straftat (Verfassung, Art. 23(6)(c)). Aus der im Mandat erfassten Gerichtsebene.", "Limite : 180 jours avant le renvoi pour une infraction jugée seulement par la High Court (Constitution, art. 23(6)(c)). Déduite du niveau de juridiction indiqué au dossier."),
"criminal.panel.limit_lower": ("Limit: 60 days before committal for an offence triable by a subordinate court and the High Court (Constitution, Art. 23(6)(b)). Taken from the court level recorded on the matter.", "Kikomo: siku 60 kabla ya kupelekwa kwa kosa linalosikilizwa na mahakama ya chini na Mahakama Kuu (Katiba, Ibara 23(6)(b)). Kimetokana na ngazi ya mahakama iliyorekodiwa kwenye shauri.", "Grenze: 60 Tage vor der Überweisung bei einer vor einem Untergericht und dem High Court verhandelbaren Straftat (Verfassung, Art. 23(6)(b)). Aus der im Mandat erfassten Gerichtsebene.", "Limite : 60 jours avant le renvoi pour une infraction jugée par une juridiction inférieure et la High Court (Constitution, art. 23(6)(b)). Déduite du niveau de juridiction indiqué au dossier."),
"criminal.panel.committed_note": ("Committed: the Art. 23(6) clock has stopped. The days on remand still count toward any sentence (Art. 23(8)).", "Amepelekwa: saa ya Ibara 23(6) imesimama. Siku za rumande bado zinahesabiwa katika adhabu yoyote (Ibara 23(8)).", "Überwiesen: Die Frist nach Art. 23(6) läuft nicht mehr. Die Tage in U-Haft werden auf eine Strafe angerechnet (Art. 23(8)).", "Renvoyé : le délai de l'art. 23(6) est arrêté. Les jours de détention restent déduits de toute peine (art. 23(8))."),
"criminal.alert.over": ("On remand {days} days, past the {limit}-day limit before committal. Apply for bail now.", "Rumande siku {days}, zaidi ya kikomo cha siku {limit} kabla ya kupelekwa. Omba dhamana sasa.", "{days} Tage in U-Haft, über der Grenze von {limit} Tagen vor der Überweisung. Jetzt Freilassung beantragen.", "{days} jours de détention, au-delà de la limite de {limit} jours avant le renvoi. Demandez la liberté sous caution maintenant."),
"criminal.alert.near": ("On remand {days} days, close to the {limit}-day limit before committal. Prepare a bail application.", "Rumande siku {days}, karibu na kikomo cha siku {limit} kabla ya kupelekwa. Andaa ombi la dhamana.", "{days} Tage in U-Haft, nahe der Grenze von {limit} Tagen vor der Überweisung. Freilassungsantrag vorbereiten.", "{days} jours de détention, proche de la limite de {limit} jours avant le renvoi. Préparez une demande de liberté sous caution."),
"criminal.panel.no_hearings": ("No hearings recorded yet.", "Bado hakuna usikilizaji uliorekodiwa.", "Noch keine Termine erfasst.", "Aucune audience enregistrée."),
"criminal.panel.open_matter": ("Open the matter", "Fungua shauri", "Mandat öffnen", "Ouvrir le dossier"),
"criminal.panel.saved": ("Dates saved", "Tarehe zimehifadhiwa", "Daten gespeichert", "Dates enregistrées"),
})
