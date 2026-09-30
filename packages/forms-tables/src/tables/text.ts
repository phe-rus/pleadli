/**
 * The table's own words in every language the apps ship. The table follows the
 * page's language (`<html lang>`, which each app sets on every switch), so no
 * app has to pass labels in. Display only.
 */
type Words = {
  columns: string
  filters: string
  showAll: string
  clearAll: string
  clear: string
  selected: (n: number) => string
  page: (n: number, of: number) => string
  noResults: string
  search: string
  selectAll: string
  selectRow: string
  rowActions: string
  rowsPerPage: string
}

const words: Record<string, Words> = {
  en: { columns: 'Columns', filters: 'Filters', showAll: 'Show all', clearAll: 'Clear all', clear: 'Clear', selected: (n) => `${n} selected`, page: (n, of) => `Page ${n} of ${of}`, noResults: 'No results.', search: 'Search…', selectAll: 'Select all', selectRow: 'Select row', rowActions: 'Row actions', rowsPerPage: 'Rows per page' },
  sw: { columns: 'Safu', filters: 'Vichujio', showAll: 'Onyesha zote', clearAll: 'Futa vyote', clear: 'Futa', selected: (n) => `${n} vimechaguliwa`, page: (n, of) => `Ukurasa ${n} kati ya ${of}`, noResults: 'Hakuna matokeo.', search: 'Tafuta…', selectAll: 'Chagua zote', selectRow: 'Chagua safu', rowActions: 'Vitendo vya safu', rowsPerPage: 'Safu kwa kila ukurasa' },
  de: { columns: 'Spalten', filters: 'Filter', showAll: 'Alle zeigen', clearAll: 'Alle löschen', clear: 'Löschen', selected: (n) => `${n} ausgewählt`, page: (n, of) => `Seite ${n} von ${of}`, noResults: 'Keine Ergebnisse.', search: 'Suchen…', selectAll: 'Alle auswählen', selectRow: 'Zeile auswählen', rowActions: 'Zeilenaktionen', rowsPerPage: 'Zeilen pro Seite' },
  fr: { columns: 'Colonnes', filters: 'Filtres', showAll: 'Tout afficher', clearAll: 'Tout effacer', clear: 'Effacer', selected: (n) => `${n} sélectionné(s)`, page: (n, of) => `Page ${n} sur ${of}`, noResults: 'Aucun résultat.', search: 'Rechercher…', selectAll: 'Tout sélectionner', selectRow: 'Sélectionner la ligne', rowActions: 'Actions sur la ligne', rowsPerPage: 'Lignes par page' },
}

export function tableText(): Words {
  const lang = typeof document === 'undefined' ? 'en' : document.documentElement.lang.slice(0, 2)
  return words[lang] ?? words.en
}
