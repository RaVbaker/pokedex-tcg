/* Pokédex TCG — National Pokédex + karty Pokémon TCG
 * Dane: data/pokemon.json, data/cards.json (budowane przez tools/build_data.py)
 * Kolekcja: localStorage, eksport/import CSV. Interfejs: PL / EN.
 */
'use strict';

// ===== Stałe =====
// Wersja aplikacji — podbijaj razem z VERSION w sw.js przy każdej zmianie plików
const APP_VERSION = '18';
const APP_DATE = '2026-11-09';
const LS_KEY = 'pokedex-tcg:v1';
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const ART = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const TYPE_COLORS = {
  Normal: '#A8A77A', Fire: '#EE8130', Water: '#6390F0', Electric: '#F7D02C', Grass: '#7AC74C',
  Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1', Ground: '#E2BF65', Flying: '#A98FF3',
  Psychic: '#F95587', Bug: '#A6B91A', Rock: '#B6A136', Ghost: '#735797', Dragon: '#6F35FC',
  Dark: '#705746', Steel: '#B7B7CE', Fairy: '#D685AD',
};
const TYPE_ORDER = Object.keys(TYPE_COLORS);
const GENS = ['', 'I · Kanto', 'II · Johto', 'III · Hoenn', 'IV · Sinnoh', 'V · Unova', 'VI · Kalos', 'VII · Alola', 'VIII · Galar', 'IX · Paldea'];
const VARIANTS = ['Normal', 'Holo', 'Reverse Holo', 'Reverse Holo (Poké Ball)', 'Reverse Holo (Master Ball)', '1st Edition', 'Shadowless', 'Promo / Stamped', 'Other'];
const COLS = { 4: 2, 9: 3, 12: 4, 16: 4 };
const CARD_PAGE = 60; // ile kart TCG pokazać naraz w szczegółach

// ===== i18n =====
const plPlural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (n === 1) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const enPlural = (n, one, many) => (n === 1 ? one : many);
const nf = n => n.toLocaleString(LANG === 'pl' ? 'pl-PL' : 'en-US');

const I18N = {
  pl: {
    settings: 'Ustawienia', close: 'Zamknij', prev: 'Poprzedni', next: 'Następny', clear: 'Wyczyść',
    viewDex: 'Pokédex', viewAlbum: 'Mój album',
    searchPh: 'Nazwa (ang.), nr #25 lub zakres 1-151', searchPhAlbum: 'Skocz do: nazwa lub numer',
    filters: 'Filtry', type: 'Typ', ownership: 'Posiadanie', all: 'Wszystkie', owned: 'Mam', missing: 'Brakuje',
    generation: 'Generacja', setLabel: 'Kolekcja (zestaw kart)', allSets: 'Wszystkie zestawy',
    numLabel: 'Nr w kolekcji', numPh: 'np. 25 lub 25/165', sort: 'Sortowanie',
    sortDex: 'Nr Pokédex', sortName: 'Nazwa A–Z', sortType: 'Typ', sortSet: 'Kolejność w zestawie', sortAdded: 'Data dodania',
    notOwnedGroup: 'Jeszcze nie mam', noDate: 'Bez daty', albumPages: 'Strony albumu', albumAdded: 'Ostatnio dodane',
    wishNewest: 'Najnowsze', wishOldest: 'Najstarsze', wishByName: 'Nazwa', wishBySet: 'Zestaw',
    sortByValue: 'Wartość ↓', sortByNum: 'Numer', noPriceGroup: 'Bez zapisanej ceny',
    topTitle: n => `Top ${n} najdroższych w zestawie`, topN: 'Najdroższe w zestawie: ile kart', pwPageLimit: 'Kart na jedno zapytanie (limit planu PokéWallet)', pwLimitFree: '100 — darmowy plan',
    pwPlanLbl: 'Plan PokéWallet', pwPlanFree: 'Darmowy', pwPlanPro: 'Pro (albo 7-dniowy trial)',
    pwSetBudget: 'Plan darmowy: ile najrzadszych kart wyceniać w zestawie',
    topPricing: (i, n) => `Wyceniam ${i}/${n}…`, topDonePro: n => `Wyceniono cały zestaw: ${n} kart z cenami`,
    topDoneFree: (p, f) => `Wyceniono ${f} najrzadszych kart (z cenami: ${p})`,
    topProMissing: 'Brak planu Pro — wyceniam najrzadsze karty (plan darmowy).', topMore: n => `Wyceń kolejne (${n})`, topRefreshStale: n => `Odśwież nieświeże (${n})`, topAllPriced: 'Wszystko wycenione',
    topAllFresh: 'Wszystkie karty tego zestawu z PokéWallet mają już świeże ceny.',
    topFreeNote: 'Plan darmowy: lista zestawu w PokéWallet nie zawiera cen, więc wyceniane są najrzadsze karty (po 1 zapytaniu, liczba w ⚙︎). Plan Pro wycenia cały zestaw jednym zapytaniem.', topFetch: 'Pobierz ceny zestawu', topLoading: 'Pobieram ceny zestawu…',
    topFrom: (n, total, d) => `ceny ${n} z ${total} kart${d ? ` · ${d}` : ''}`, topNoSet: 'Nie znaleziono tego zestawu w PokéWallet.',
    topNone: 'Brak cen dla kart z tego zestawu.', topHint: 'Kilka zapytań (wg limitu w ⚙︎) pobierze ceny wszystkich kart z zestawu (najdroższe karty i sortowanie wg wartości).',
    valueGroup: v => `Wycenione · razem ${v}`, valueHint: 'Wartość z zapisanych cen — brakujące pobierzesz w ⚙︎ → Ceny kart → „Wyceń kolekcję”.',
    clearFilters: 'Wyczyść filtry', done: 'Gotowe', loading: 'Ładowanie danych…',
    loadError: 'Nie udało się wczytać danych. Otwórz stronę przez serwer HTTP (nie file://).',
    progress: (o, t, c) => `Mam ${o} / ${t} · ${nf(c)} ${plPlural(c, 'karta', 'karty', 'kart')}`,
    statusAll: (n, c, s) => `${n} stworków · ${nf(c)} kart TCG w ${s} zestawach`,
    statusFiltered: (n, o) => `Widoczne: ${n} · mam z nich ${o}`,
    statusAlbum: (o, t, c) => `Mój album: ${o} z ${t} stworków · ${nf(c)} ${plPlural(c, 'karta', 'karty', 'kart')}`,
    noMatch: 'Nic nie pasuje do filtrów.', notFound: 'Nie znaleziono',
    page: 'Strona', tileCards: n => `${n} kart`, tilePos: (p, s) => `s.${p}·${s}`,
    ownedAria: 'Mam', notOwnedAria: 'Nie mam', cardsOwnedAria: n => `${n} ${plPlural(n, 'karta', 'karty', 'kart')}`,
    height: 'Wzrost', weight: 'Waga', album: 'Album', posAlbum: (p, s) => `s.${p} · ${s}`,
    tcgCount: n => `${n} ${plPlural(n, 'karta', 'karty', 'kart')} TCG`,
    setsCount: n => `${n} ${plPlural(n, 'zestaw', 'zestawy', 'zestawów')}`,
    ownOn: '✓ Mam tego stworka', ownOff: 'Oznacz jako posiadany',
    myCards: 'Moje karty', myCardsHint: 'wybierz z listy poniżej (+)',
    myCardsEmpty: 'Masz tego stworka — możesz dopisać konkretną kartę: kolekcję i typ (np. Reverse Holo).',
    unknownCard: 'nieznana karta', cardType: 'Typ karty', removeCard: 'Usuń kartę',
    tcgTitle: 'Karty TCG', allSeries: 'Wszystkie serie', allKinds: 'Każdy rodzaj',
    cardFilterPh: 'Szukaj: zestaw, kod, numer, rzadkość…', noCards: 'Brak kart dla tego filtra.',
    more: n => `Pokaż więcej (${n})`, addCard: 'Dodaj kartę do kolekcji',
    series: 'Seria', no: 'Nr', released: 'Wydano',
    haveCopies: n => `Masz ${n} ${plPlural(n, 'egzemplarz', 'egzemplarze', 'egzemplarzy')}`,
    variantLabel: 'Typ karty (wariant)', addBtn: 'Dodaj do kolekcji',
    language: 'Język', binder: 'Album', pockets: 'Kieszonek na stronie', offset: 'Pierwsza strona zaczyna się od pozycji',
    pagesToggle: 'Podział na strony albumu', cardImgToggle: '„Mój album”: pokazuj obrazki moich kart',
    hdToggle: 'Duże obrazki w siatce (więcej danych)',
    dataSec: 'Dane', dataHint: 'Kolekcja zapisuje się automatycznie w tej przeglądarce (localStorage). Eksportuj CSV, żeby mieć kopię lub przenieść dane na inne urządzenie.',
    export: 'Eksport CSV', import: 'Import CSV', importMerge: 'Import dołącza do obecnych danych (odznacz, by zastąpić)',
    dataInfo: (p, c) => `Zapisane: ${p} ${plPlural(p, 'stworek', 'stworki', 'stworków')}, ${c} ${plPlural(c, 'karta', 'karty', 'kart')}.`,
    reset: 'Wyczyść całą kolekcję', sourcesSec: 'Źródła danych',
    viewWish: 'Życzenia', searchPhWish: 'Szukaj na liście życzeń',
    wishStatus: (n, v) => `Lista życzeń: ${n} ${plPlural(n, 'karta', 'karty', 'kart')}${v ? ` · wartość ok. ${v}` : ''}`,
    wishEmpty: 'Lista życzeń jest pusta. Dodaj brakującą kartę przyciskiem ♡ w oknie karty — z Pokédexu, widoku zestawu albo skanera.',
    yourCopies: 'Twoje egzemplarze (typ karty można zmienić)', wishVariantLbl: 'Lista życzeń — szukany typ karty',
    wishAdd: 'Dodaj do listy życzeń', wishIn: 'Na liście życzeń — usuń', wishAdded: 'Dodano do listy życzeń', wishRemoved: 'Usunięto z listy życzeń',
    cardAddedWish: 'Dodano kartę do kolekcji i zdjęto z listy życzeń', wishHave: 'Masz już tę kartę',
    cardKind: 'Rodzaj', rarityLbl: 'Rzadkość', illus: 'Ilustracja', regMark: 'Znak regulacji',
    tiers: { 0: '—', 1: 'pospolita', 2: 'niepospolita', 3: 'rzadka', 4: 'bardzo rzadka', 5: 'ultra rzadka', 6: 'najrzadsza (sekretna)', promo: 'promo — nie z boosterów' },
    supLabel: { 'Pokémon': 'Pokémon', Trainer: 'Trener', Energy: 'Energia' },
    noDropRate: 'Szansa wypadnięcia z boostera (pull rate) nie jest dostępna w danych — zależy od zestawu.',
    donateText: 'Podoba Ci się aplikacja? Możesz postawić autorowi kawę.',
    donateBtn: 'Wesprzyj przez Revolut',
    aboutAuthor: 'Autor: <a href="https://ravbaker.net" target="_blank" rel="noopener">Rafał „RaVbaker” Piekarski</a>',
    aboutLegal: 'Pokémon, nazwy postaci, grafiki i karty Pokémon TCG są własnością i znakami towarowymi The Pokémon Company, Nintendo, Game Freak i Creatures Inc. To nieoficjalna, niekomercyjna strona fanowska, niezwiązana z tymi firmami ani przez nie wspierana.',
    aboutSec: 'O aplikacji', version: (v, d) => `Wersja ${v} (${d})`, swVersion: v => `Wersja offline (service worker): ${v}`,
    swNone: 'Tryb offline: nieaktywny', checkUpdate: 'Sprawdź aktualizacje', updChecking: 'Sprawdzam…',
    updLatest: 'Masz najnowszą wersję.', updFound: 'Jest nowa wersja — wczytuję…', updError: 'Nie udało się sprawdzić aktualizacji.',
    sources: (s, c, last) => `Stworki: <a href="https://github.com/PokeAPI/pokeapi" target="_blank" rel="noopener">PokeAPI</a>. Karty: <a href="https://github.com/PokemonTCG/pokemon-tcg-data" target="_blank" rel="noopener">pokemon-tcg-data</a> (${s} zestawów, ${nf(c)} kart, ostatni: ${last}).`,
    confirmRemoveCards: n => `Usunąć też ${n} ${plPlural(n, 'zapisaną kartę', 'zapisane karty', 'zapisanych kart')}?`,
    exported: 'Wyeksportowano CSV', importDone: (p, c) => `Zaimportowano: ${p} nowych stworków, ${c} kart`,
    importReplace: 'Import zastąpi całą obecną kolekcję. Kontynuować?', importError: 'Błąd importu: ',
    noDexCol: 'Brak kolumny "dex"', emptyFile: 'Pusty plik',
    resetConfirm: 'Na pewno usunąć całą kolekcję? Najpierw zrób eksport CSV, jeśli chcesz mieć kopię.',
    resetDone: 'Kolekcja wyczyszczona', added: n => `Dodano: ${n}`, removed: n => `Usunięto: ${n}`,
    cardAdded: 'Dodano kartę do kolekcji', variantSaved: 'Zapisano typ karty', saveFail: 'Nie udało się zapisać danych w przeglądarce',
    viewSets: 'Zestawy', searchPhSets: 'Szukaj zestawu: nazwa, kod, seria',
    setsStatus: (st, n, c) => `Rozpoczęte zestawy: ${st} z ${n} · ${nf(c)} ${plPlural(c, 'karta', 'karty', 'kart')}`,
    setsValue: v => `wartość ${v}`, setValueShort: v => `wartość ${v}`,
    setsAll: 'Wszystkie', setsStarted: 'Rozpoczęte', setsDone: 'Ukończone', setsNone: 'Brak zestawów.',
    secret: (h, n) => `+ sekretne ${h}/${n}`, promoCount: (h, n) => `+ promo ${h}/${n}`, complete: 'Komplet!', setCards: 'Karty w zestawie',
    setFilterPh: 'Szukaj w zestawie: nazwa lub numer…', allRarities: 'Wszystkie rzadkości', clearFilter: 'Wyczyść filtr',
    showAll: 'Wszystkie', showMissing: 'Brakuje', showOwned: 'Mam', back: 'Wstecz',
    removeOne: 'Usuń 1 egz.', cardRemoved: 'Usunięto kartę', addMore: 'Dodaj kolejny',
    scan: 'Skanuj kartę', scanHint: 'Krawędzie karty dopasuj do białej ramki — nazwa i HP w górnym żółtym pasie, numer w dolnym. Gdy obraz skacze, odsuń telefon (~25–30 cm) i ustaw 2×.', scanZoneName: 'Nazwa · HP', scanZoneNum: 'Numer', scanZoom: 'Powiększenie', scanCapture: 'Zrób zdjęcie',
    scanPhoto: 'Zdjęcie', scanLoading: 'Ładowanie OCR (pierwszy raz ~10 MB)…', scanReading: 'Odczytuję tekst…',
    scanNoCamera: 'Brak dostępu do kamery — wybierz zdjęcie karty.', scanName: 'Nazwa', scanNumber: 'Numer (np. 25/165)',
    scanSearch: 'Szukaj', scanAgain: 'Skanuj ponownie', scanNone: 'Nie rozpoznano karty. Popraw nazwę lub numer i wyszukaj.',
    scanCandidates: n => `Pasujące karty (${n})`, scanResultTitle: 'Wynik skanu', scanCamera: 'Aparat', scanCamUsing: l => `Aparat: ${l}`, scanAllOf: n => `Wszystkie karty: ${n}`, scanError: 'Błąd OCR: ',
    pwSec: 'Ceny kart (PokéWallet)',
    pwHint: 'Ceny z Cardmarket (EUR) i TCGplayer (USD) przez <a href="https://pokewallet.io" target="_blank" rel="noopener">PokéWallet API</a>. Załóż konto, skopiuj klucz API (<code>pk_live_…</code>) i wklej poniżej. Klucz zostaje tylko w tej przeglądarce i nie trafia do eksportu CSV. Darmowy plan ma limit ok. 100 zapytań na godzinę. Pobrane ceny są zapisywane w tej przeglądarce razem z datą. Starsze niż ustawiony czas są oznaczane jako nieświeże (≈); nigdy nie odświeżają się same — tylko po „Wyceń kolekcję”, „Wyceń kolejne”, „Pobierz cenę” albo „Odśwież”.',
    pwTtl: 'Ceny uznawane za aktualne przez', pwTtl1: '1 dzień', pwTtl7: '7 dni', pwTtl30: '30 dni', pwTtl0: 'Zawsze aktualne',
    staleShort: 'nieświeże', pwNoPriceYet: 'brak zapisanej ceny', pwFetchPrice: 'Pobierz cenę', staleTitle: d => `Cena nieświeża (z ${d}) — odśwież przez „Wyceń kolekcję”, „Wyceń kolejne” albo „Odśwież”`,
    staleCount: n => `Nieświeże: ${n} — odświeżą się po „Wyceń kolekcję”.`,
    pwDates: (a, b) => (a === b ? `Ceny z: ${a}.` : `Ceny z: ${a} – ${b}.`),
    pwKey: 'Klucz API', pwSaveTest: 'Zapisz i sprawdź', pwRemove: 'Usuń klucz', pwSource: 'Główne źródło cen',
    pwValueBtn: 'Wyceń kolekcję', pwCacheClear: 'Wyczyść zapisane ceny', pwShowKey: 'Pokaż klucz',
    pwNoKey: 'Brak klucza API PokéWallet (⚙︎ → Ceny kart).', pwSetKeyHint: 'Ceny: dodaj klucz API PokéWallet w ⚙︎ → Ceny kart.',
    pwLoading: 'Pobieram ceny…', pwNotFound: 'Nie znaleziono tej karty w PokéWallet.', pwNoPrices: 'Brak cen dla tej karty.',
    pwPrices: 'Ceny', pwUpdated: d => `aktualizacja: ${d}`, pwRefresh: 'Odśwież', pwRefreshing: 'Odświeżam…',
    pricesUpdated: n => `Zaktualizowano ceny (${n} ${plPlural(n, 'karta', 'karty', 'kart')})`,
    pwTesting: 'Sprawdzam klucz…', pwKeyOk: 'Klucz działa ✓', pwKeyRemoved: 'Usunięto klucz.',
    pwQuota: (h, d) => `Pozostało zapytań: ${h}/h, ${d}/dzień.`,
    pwErr401: 'Nieprawidłowy klucz API.', pwErr403: 'Niedostępne w Twoim planie PokéWallet: ',
    pwErr429: 'Limit zapytań wyczerpany — spróbuj za jakiś czas.', pwNetwork: 'Brak połączenia z PokéWallet.',
    pwTimeout: 'PokéWallet nie odpowiedział w 20 s — spróbuj ponownie.',
    quotaBlockedHour: tm => `Godzinowy limit zapytań wyczerpany — odnowi się najpóźniej ok. ${tm}.`,
    quotaBlockedDay: tm => `Dzienny limit zapytań wyczerpany — odnowi się najpóźniej ok. ${tm}.`,
    quotaLeft: (h, lh, d, ld, at) => `Pozostało zapytań: ${h}/${lh} w tej godzinie, ${d}/${ld} dziś (stan z ${at}).`,
    quotaSent: (h, d) => `Z tej przeglądarki: ${h} ${plPlural(h, 'zapytanie', 'zapytania', 'zapytań')} w ostatniej godzinie, ${d} w ostatniej dobie.`,
    quotaFreePlan: 'Plan darmowy: 100 zapytań na godzinę, 1000 na dobę.', quotaUpgradeHint: 'Do tego czasu ceny nie są pobierane automatycznie; „Odśwież”, „Wyceń…” i „Zapisz i sprawdź” próbują raz — jeśli się uda (np. po wykupieniu wyższego planu), blokada znika.', pwRetryIn: m => `(za ok. ${m} min)`,
    pwNothingToValue: 'Wszystkie karty kolekcji mają świeże ceny (ważność w ustawieniu wyżej).',
    pwValuedN: n => `Wyceniono ${n} ${plPlural(n, 'kartę', 'karty', 'kart')}`,
    pwValuing: (i, n) => `Wyceniam… ${i}/${n}`,
    pwValue: (v, p, n, left) => `Wartość kolekcji: ${v} (wycenione ${p} z ${n} kart${left ? `, do wyceny jeszcze ${left} — kliknij ponownie` : ''}).`,
    pwCacheCleared: 'Usunięto zapisane ceny.',
    pwBackupHint: 'Zapisane ceny są w pamięci przeglądarki. Zrób kopię, żeby nie pobierać ich ponownie (np. na innym urządzeniu).',
    pwExport: 'Eksport cen',
    pwImport: 'Import cen',
    pwExported: n => `Wyeksportowano ceny ${n} kart.`,
    pwImported: (n, u) => `Zaimportowano ceny: ${n} nowych, ${u} zaktualizowanych.`,
    pwImportBad: 'to nie jest plik z cenami Pokédex TCG.',
    pwImportError: 'Nie udało się zaimportować cen: ',
    pwVariant: 'Wariant', pwMarket: 'Rynkowa', pwTrend: 'Trend', pwLow: 'Min', pwHigh: 'Maks', pwAvg30: 'Śr. 30 dni',
    pwOwnedValue: (v, p) => `Wartość moich kart: ${v} (wycenione: ${p})`,
    variants: { Other: 'Inny' },
  },
  en: {
    settings: 'Settings', close: 'Close', prev: 'Previous', next: 'Next', clear: 'Clear',
    viewDex: 'Pokédex', viewAlbum: 'My binder',
    searchPh: 'Name, no. #25 or range 1-151', searchPhAlbum: 'Jump to: name or number',
    filters: 'Filters', type: 'Type', ownership: 'Ownership', all: 'All', owned: 'Owned', missing: 'Missing',
    generation: 'Generation', setLabel: 'Collection (card set)', allSets: 'All sets',
    numLabel: 'No. in set', numPh: 'e.g. 25 or 25/165', sort: 'Sort',
    sortDex: 'Pokédex no.', sortName: 'Name A–Z', sortType: 'Type', sortSet: 'Set order', sortAdded: 'Date added',
    notOwnedGroup: 'Not owned yet', noDate: 'No date', albumPages: 'Binder pages', albumAdded: 'Recently added',
    wishNewest: 'Newest', wishOldest: 'Oldest', wishByName: 'Name', wishBySet: 'Set',
    sortByValue: 'Value ↓', sortByNum: 'Number', noPriceGroup: 'No saved price',
    topTitle: n => `Top ${n} most valuable in set`, topN: 'Most valuable in set: how many', pwPageLimit: 'Cards per request (PokéWallet plan limit)', pwLimitFree: '100 — free plan',
    pwPlanLbl: 'PokéWallet plan', pwPlanFree: 'Free', pwPlanPro: 'Pro (or 7-day trial)',
    pwSetBudget: 'Free plan: how many rarest cards to price per set',
    topPricing: (i, n) => `Pricing ${i}/${n}…`, topDonePro: n => `Whole set priced: ${n} cards with prices`,
    topDoneFree: (p, f) => `Priced the ${f} rarest cards (with prices: ${p})`,
    topProMissing: 'No Pro plan — pricing the rarest cards (free plan).', topMore: n => `Price next (${n})`, topRefreshStale: n => `Refresh stale (${n})`, topAllPriced: 'All priced',
    topAllFresh: 'Every card of this set from PokéWallet already has fresh prices.',
    topFreeNote: 'Free plan: the PokéWallet set listing has no prices, so the rarest cards are priced (1 request each, number in ⚙︎). The Pro plan prices the whole set in one request.', topFetch: 'Fetch set prices', topLoading: 'Fetching set prices…',
    topFrom: (n, total, d) => `prices for ${n} of ${total} cards${d ? ` · ${d}` : ''}`, topNoSet: 'This set was not found in PokéWallet.',
    topNone: 'No prices for cards in this set.', topHint: 'A few requests (per the limit in ⚙︎) fetch prices for every card in the set (most valuable cards and value sorting).',
    valueGroup: v => `Priced · total ${v}`, valueHint: 'Value from saved prices — fetch missing ones in ⚙︎ → Card prices → “Value my collection”.',
    clearFilters: 'Clear filters', done: 'Done', loading: 'Loading data…',
    loadError: 'Could not load data. Open the page through an HTTP server (not file://).',
    progress: (o, t, c) => `Have ${o} / ${t} · ${nf(c)} ${enPlural(c, 'card', 'cards')}`,
    statusAll: (n, c, s) => `${n} Pokémon · ${nf(c)} TCG cards in ${s} sets`,
    statusFiltered: (n, o) => `Showing ${n} · ${o} owned`,
    statusAlbum: (o, t, c) => `My binder: ${o} of ${t} Pokémon · ${nf(c)} ${enPlural(c, 'card', 'cards')}`,
    noMatch: 'Nothing matches the filters.', notFound: 'Not found',
    page: 'Page', tileCards: n => `${n} cards`, tilePos: (p, s) => `p.${p}·${s}`,
    ownedAria: 'Owned', notOwnedAria: 'Not owned', cardsOwnedAria: n => `${n} ${enPlural(n, 'card', 'cards')}`,
    height: 'Height', weight: 'Weight', album: 'Binder', posAlbum: (p, s) => `p.${p} · ${s}`,
    tcgCount: n => `${n} TCG ${enPlural(n, 'card', 'cards')}`,
    setsCount: n => `${n} ${enPlural(n, 'set', 'sets')}`,
    ownOn: '✓ I have this one', ownOff: 'Mark as owned',
    myCards: 'My cards', myCardsHint: 'pick from the list below (+)',
    myCardsEmpty: 'You own this Pokémon — you can add the exact card: set and type (e.g. Reverse Holo).',
    unknownCard: 'unknown card', cardType: 'Card type', removeCard: 'Remove card',
    tcgTitle: 'TCG cards', allSeries: 'All series', allKinds: 'All kinds',
    cardFilterPh: 'Search: set, code, number, rarity…', noCards: 'No cards for this filter.',
    more: n => `Show more (${n})`, addCard: 'Add card to collection',
    series: 'Series', no: 'No.', released: 'Released',
    haveCopies: n => `You have ${n} ${enPlural(n, 'copy', 'copies')}`,
    variantLabel: 'Card type (variant)', addBtn: 'Add to collection',
    language: 'Language', binder: 'Binder', pockets: 'Pockets per page', offset: 'First page starts at pocket',
    pagesToggle: 'Split into binder pages', cardImgToggle: '“My binder”: show images of my cards',
    hdToggle: 'Large images in grid (more data)',
    dataSec: 'Data', dataHint: 'Your collection is saved automatically in this browser (localStorage). Export CSV to keep a backup or move it to another device.',
    export: 'Export CSV', import: 'Import CSV', importMerge: 'Import adds to current data (uncheck to replace)',
    dataInfo: (p, c) => `Saved: ${p} Pokémon, ${c} ${enPlural(c, 'card', 'cards')}.`,
    reset: 'Clear entire collection', sourcesSec: 'Data sources',
    viewWish: 'Wishlist', searchPhWish: 'Search the wishlist',
    wishStatus: (n, v) => `Wishlist: ${n} ${enPlural(n, 'card', 'cards')}${v ? ` · about ${v}` : ''}`,
    wishEmpty: 'Your wishlist is empty. Add a missing card with the ♡ button in the card window — from the Pokédex, a set view or the scanner.',
    yourCopies: 'Your copies (card type can be changed)', wishVariantLbl: 'Wishlist — wanted card type',
    wishAdd: 'Add to wishlist', wishIn: 'On wishlist — remove', wishAdded: 'Added to wishlist', wishRemoved: 'Removed from wishlist',
    cardAddedWish: 'Card added to collection and removed from wishlist', wishHave: 'You already have this card',
    cardKind: 'Kind', rarityLbl: 'Rarity', illus: 'Illustrator', regMark: 'Regulation mark',
    tiers: { 0: '—', 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'very rare', 5: 'ultra rare', 6: 'rarest (secret)', promo: 'promo — not from boosters' },
    supLabel: { 'Pokémon': 'Pokémon', Trainer: 'Trainer', Energy: 'Energy' },
    noDropRate: 'Booster pull rates are not available in the data — they depend on the set.',
    donateText: 'Enjoying the app? You can buy the author a coffee.',
    donateBtn: 'Support via Revolut',
    aboutAuthor: 'Made by <a href="https://ravbaker.net" target="_blank" rel="noopener">Rafał “RaVbaker” Piekarski</a>',
    aboutLegal: 'Pokémon, character names, artwork and Pokémon TCG cards are property and trademarks of The Pokémon Company, Nintendo, Game Freak and Creatures Inc. This is an unofficial, non-commercial fan site, not affiliated with or endorsed by them.',
    aboutSec: 'About', version: (v, d) => `Version ${v} (${d})`, swVersion: v => `Offline version (service worker): ${v}`,
    swNone: 'Offline mode: not active', checkUpdate: 'Check for updates', updChecking: 'Checking…',
    updLatest: 'You have the latest version.', updFound: 'New version found — loading…', updError: 'Could not check for updates.',
    sources: (s, c, last) => `Pokémon: <a href="https://github.com/PokeAPI/pokeapi" target="_blank" rel="noopener">PokeAPI</a>. Cards: <a href="https://github.com/PokemonTCG/pokemon-tcg-data" target="_blank" rel="noopener">pokemon-tcg-data</a> (${s} sets, ${nf(c)} cards, latest: ${last}).`,
    confirmRemoveCards: n => `Also remove ${n} saved ${enPlural(n, 'card', 'cards')}?`,
    exported: 'CSV exported', importDone: (p, c) => `Imported: ${p} new Pokémon, ${c} cards`,
    importReplace: 'Import will replace your whole collection. Continue?', importError: 'Import error: ',
    noDexCol: 'Missing "dex" column', emptyFile: 'Empty file',
    resetConfirm: 'Really delete the whole collection? Export a CSV first if you want a backup.',
    resetDone: 'Collection cleared', added: n => `Added: ${n}`, removed: n => `Removed: ${n}`,
    cardAdded: 'Card added to collection', variantSaved: 'Card type saved', saveFail: 'Could not save data in this browser',
    viewSets: 'Sets', searchPhSets: 'Search set: name, code, series',
    setsStatus: (st, n, c) => `Started sets: ${st} of ${n} · ${nf(c)} ${enPlural(c, 'card', 'cards')}`,
    setsValue: v => `value ${v}`, setValueShort: v => `value ${v}`,
    setsAll: 'All', setsStarted: 'Started', setsDone: 'Completed', setsNone: 'No sets.',
    secret: (h, n) => `+ secret ${h}/${n}`, promoCount: (h, n) => `+ promo ${h}/${n}`, complete: 'Complete!', setCards: 'Cards in set',
    setFilterPh: 'Search this set: name or number…', allRarities: 'All rarities', clearFilter: 'Clear filter',
    showAll: 'All', showMissing: 'Missing', showOwned: 'Owned', back: 'Back',
    removeOne: 'Remove 1 copy', cardRemoved: 'Card removed', addMore: 'Add another',
    scan: 'Scan card', scanHint: 'Align the card edges with the white frame — name and HP in the top yellow band, number in the bottom one. If the image jumps, move the phone back (~25–30 cm) and set 2×.', scanZoneName: 'Name · HP', scanZoneNum: 'Number', scanZoom: 'Zoom', scanCapture: 'Capture',
    scanPhoto: 'Photo', scanLoading: 'Loading OCR (first time ~10 MB)…', scanReading: 'Reading text…',
    scanNoCamera: 'No camera access — pick a photo of the card.', scanName: 'Name', scanNumber: 'Number (e.g. 25/165)',
    scanSearch: 'Search', scanAgain: 'Scan again', scanNone: 'No card recognized. Fix the name or number and search.',
    scanCandidates: n => `Matching cards (${n})`, scanResultTitle: 'Scan result', scanCamera: 'Camera', scanCamUsing: l => `Camera: ${l}`, scanAllOf: n => `All cards: ${n}`, scanError: 'OCR error: ',
    pwSec: 'Card prices (PokéWallet)',
    pwHint: 'Cardmarket (EUR) and TCGplayer (USD) prices via the <a href="https://pokewallet.io" target="_blank" rel="noopener">PokéWallet API</a>. Create an account, copy your API key (<code>pk_live_…</code>) and paste it below. The key stays in this browser only and is not included in CSV export. The free plan allows about 100 requests per hour. Fetched prices are saved in this browser with their date. Older ones are marked stale (≈); they are never refreshed automatically — only by “Value my collection”, “Price next”, “Fetch price” or “Refresh”.',
    pwTtl: 'Prices considered current for', pwTtl1: '1 day', pwTtl7: '7 days', pwTtl30: '30 days', pwTtl0: 'Always current',
    staleShort: 'stale', pwNoPriceYet: 'no saved price', pwFetchPrice: 'Fetch price', staleTitle: d => `Stale price (from ${d}) — refresh with “Value my collection”, “Price next” or “Refresh”`,
    staleCount: n => `Stale: ${n} — refreshed by “Value my collection”.`,
    pwDates: (a, b) => (a === b ? `Prices from: ${a}.` : `Prices from: ${a} – ${b}.`),
    pwKey: 'API key', pwSaveTest: 'Save & test', pwRemove: 'Remove key', pwSource: 'Main price source',
    pwValueBtn: 'Value my collection', pwCacheClear: 'Clear saved prices', pwShowKey: 'Show key',
    pwNoKey: 'No PokéWallet API key (⚙︎ → Card prices).', pwSetKeyHint: 'Prices: add a PokéWallet API key in ⚙︎ → Card prices.',
    pwLoading: 'Loading prices…', pwNotFound: 'This card was not found in PokéWallet.', pwNoPrices: 'No prices for this card.',
    pwPrices: 'Prices', pwUpdated: d => `updated: ${d}`, pwRefresh: 'Refresh', pwRefreshing: 'Refreshing…',
    pricesUpdated: n => `Prices updated (${n} ${enPlural(n, 'card', 'cards')})`,
    pwTesting: 'Testing key…', pwKeyOk: 'Key works ✓', pwKeyRemoved: 'Key removed.',
    pwQuota: (h, d) => `Requests left: ${h}/h, ${d}/day.`,
    pwErr401: 'Invalid API key.', pwErr403: 'Not available on your PokéWallet plan: ',
    pwErr429: 'Rate limit reached — try again later.', pwNetwork: 'Could not reach PokéWallet.',
    pwTimeout: 'PokéWallet did not answer within 20 s — try again.',
    quotaBlockedHour: tm => `Hourly request limit reached — resets at the latest around ${tm}.`,
    quotaBlockedDay: tm => `Daily request limit reached — resets at the latest around ${tm}.`,
    quotaLeft: (h, lh, d, ld, at) => `Requests left: ${h}/${lh} this hour, ${d}/${ld} today (as of ${at}).`,
    quotaSent: (h, d) => `From this browser: ${h} ${enPlural(h, 'request', 'requests')} in the last hour, ${d} in the last 24 h.`,
    quotaFreePlan: 'Free plan: 100 requests per hour, 1,000 per day.', quotaUpgradeHint: 'Until then prices are not fetched automatically; “Refresh”, “Value…” and “Save & test” try once — if it works (e.g. after upgrading your plan), the block is lifted.', pwRetryIn: m => `(in about ${m} min)`,
    pwNothingToValue: 'Every card in your collection has a fresh price (validity set above).',
    pwValuedN: n => `Priced ${n} ${enPlural(n, 'card', 'cards')}`,
    pwValuing: (i, n) => `Pricing… ${i}/${n}`,
    pwValue: (v, p, n, left) => `Collection value: ${v} (${p} of ${n} cards priced${left ? `, ${left} still to price — click again` : ''}).`,
    pwCacheCleared: 'Saved prices cleared.',
    pwBackupHint: 'Saved prices live in browser storage. Back them up so you don’t have to fetch them again (e.g. on another device).',
    pwExport: 'Export prices',
    pwImport: 'Import prices',
    pwExported: n => `Exported prices of ${n} cards.`,
    pwImported: (n, u) => `Imported prices: ${n} new, ${u} updated.`,
    pwImportBad: 'not a Pokédex TCG prices file.',
    pwImportError: 'Could not import prices: ',
    pwVariant: 'Variant', pwMarket: 'Market', pwTrend: 'Trend', pwLow: 'Low', pwHigh: 'High', pwAvg30: '30-day avg',
    pwOwnedValue: (v, p) => `My cards value: ${v} (${p} priced)`,
    variants: {},
  },
};
let LANG = 'pl';
function t(key, ...args) {
  const v = I18N[LANG][key] ?? I18N.pl[key];
  return typeof v === 'function' ? v(...args) : (v ?? key);
}
const variantLabel = v => I18N[LANG].variants[v] || v;

// ===== Stan =====
const S = {
  pokemon: [], byId: new Map(), maxId: 0,
  sets: [], cards: [], cardsByDex: new Map(), cardById: new Map(),
  filtered: [], cur: 0,
  store: { owned: {}, settings: {}, filters: {}, other: [], wish: [] },
  albumQ: '', albumHit: -1, setsQ: '', wishQ: '', cardsBySet: new Map(), ownedIdx: null,
};
const defaults = { pocket: 9, offset: 1, pages: true, hd: false, view: 'dex', cardImg: true, lang: '', setsShow: '', albumSort: 'pages', setSort: 'num', topN: 3, pwPageLimit: 100, pwPlan: 'free', pwSetBudget: 12, wishSort: 'new', priceSrc: 'cm', camId: '', camZoom: 1, pwTtl: 7 };

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[♀]/g, ' f').replace(/[♂]/g, ' m');
const normNum = s => String(s).trim().toLowerCase().replace(/^([a-z]*)0+(?=\d)/, '$1');
// numer karty z rozmiarem zestawu („25/165”); promki dołączone do zestawu (np. MEP107) bez „/rozmiar”
const cardNo = c => c.num + (c.set.total && !(/^promo$/i.test(c.rarity) && /[a-z]/i.test(c.num)) ? '/' + c.set.total : '');
const pad = n => '#' + String(n).padStart(4, '0');
const fmt1 = v => (v / 10).toLocaleString(LANG === 'pl' ? 'pl-PL' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ===== Persystencja =====
function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S.store.owned = d.owned || {};
      S.store.settings = d.settings || {};
      S.store.filters = d.filters || {};
      S.store.other = d.other || [];
      S.store.wish = d.wish || [];
      // zgodność wstecz: wariant "Inny" -> "Other"
      for (const o of Object.values(S.store.owned)) for (const c of o.cards || []) if (c.v === 'Inny') c.v = 'Other';
    }
  } catch (e) { console.warn('localStorage niedostępny', e); }
}
function saveStore() {
  S.ownedIdx = null;
  try { localStorage.setItem(LS_KEY, JSON.stringify(S.store)); }
  catch (e) { toast(t('saveFail')); }
}
const setting = k => (k in S.store.settings ? S.store.settings[k] : defaults[k]);
const ownedCards = id => S.store.owned[id]?.cards || [];
const totalOwnedCards = () => Object.values(S.store.owned).reduce((s, o) => s + o.cards.length, 0) + S.store.other.length;
// liczba posiadanych egzemplarzy każdej karty (id -> n), także trenerów/energii
function ownedIndex() {
  if (S.ownedIdx) return S.ownedIdx;
  const m = new Map();
  const add = c => m.set(c.id, (m.get(c.id) || 0) + 1);
  for (const o of Object.values(S.store.owned)) o.cards.forEach(add);
  S.store.other.forEach(add);
  return (S.ownedIdx = m);
}

// ===== Dane =====
async function loadData() {
  const [p, c] = await Promise.all([
    fetch('data/pokemon.json').then(r => r.json()),
    fetch('data/cards.json').then(r => r.json()),
  ]);
  S.pokemon = p.map(([id, name, types, h, w, gen]) => ({ id, name, types, h, w, gen, key: norm(name) }));
  S.pokemon.forEach(pk => S.byId.set(pk.id, pk));
  S.maxId = Math.max(...S.pokemon.map(pk => pk.id));

  S.sets = c.sets.map(([id, name, series, total, date, code, symbol, logo], i) => ({ i, id, name, series, total, date, code, symbol, logo }));
  S.cards = c.cards.map(r => {
    const set = S.sets[r[0]];
    const num = r[1];
    return {
      set, num, name: r[2],
      rarity: c.rarities[r[3]] || '',
      sub: r[4].map(i => c.subtypes[i]),
      dex: Array.isArray(r[5]) ? r[5] : (r[5] ? [r[5]] : []),
      sup: c.supertypes ? c.supertypes[r[6]] : 'Pokémon',
      hp: r[7] || 0,
      etypes: (r[8] || []).map(i => c.etypes[i]),
      artist: r[9] >= 0 ? c.artists[r[9]] : '',
      reg: r[10] || '',
      id: r[11] || `${set.id}-${num}`,
      img: r[12] || `https://images.pokemontcg.io/${set.id}/${num}.png`,
      nn: normNum(num),
    };
  });
  for (const card of S.cards) {
    S.cardById.set(card.id, card);
    if (!S.cardsBySet.has(card.set.id)) S.cardsBySet.set(card.set.id, []);
    S.cardsBySet.get(card.set.id).push(card);
    for (const d of card.dex) {
      if (!S.cardsByDex.has(d)) S.cardsByDex.set(d, []);
      S.cardsByDex.get(d).push(card);
    }
  }
}
const largeImg = url => url.includes('images.pokemontcg.io') ? url.replace(/\.png$/, '_hires.png') : url.replace(/\/small$/, '/large');
// kolejność numerów w zestawie: najpierw same liczby (1, 2, … 10, … 201), potem z prefiksem (GG01…, SV1…, TG01…)
// — porządek całkowity, bez „skakania” przy mieszaniu numerów z literami
const numKey = s => {
  const m = String(s).match(/^([A-Za-z]*)(\d+)(.*)$/);
  return m ? [m[1].toUpperCase(), +m[2], m[3]] : [String(s).toUpperCase(), Infinity, ''];
};
const numSort = (a, b) => {
  const A = numKey(a.num), B = numKey(b.num);
  return A[0].localeCompare(B[0]) || A[1] - B[1] || A[2].localeCompare(B[2]);
};

// ===== Album =====
const offset0 = () => Math.max(1, +setting('offset') || 1) - 1;
function albumPos(id) {
  const P = +setting('pocket');
  const pos = id - 1 + offset0();
  return { page: Math.floor(pos / P) + 1, slot: (pos % P) + 1 };
}
function pageStats(page) {
  const P = +setting('pocket'), off = offset0();
  let have = 0, slots = 0;
  for (let s = 0; s < P; s++) {
    const id = (page - 1) * P + s - off + 1;
    if (!S.byId.has(id)) continue;
    slots++;
    if (S.store.owned[id]) have++;
  }
  return { have, slots };
}

// ===== Filtry =====
const F = () => S.store.filters;
const isAlbum = () => setting('view') === 'album';
function activeFilterCount() {
  const f = F();
  return (f.types?.length || 0) + (f.owned ? 1 : 0) + (f.gen ? 1 : 0) + (f.set ? 1 : 0) + (f.num ? 1 : 0) + (f.sort && f.sort !== 'dex' ? 1 : 0);
}
function setCardsFor(pk) {
  const f = F();
  if (!f.set && !f.num) return null;
  const n = f.num ? normNum(String(f.num).split('/')[0]) : '';
  return (S.cardsByDex.get(pk.id) || []).filter(c => (!f.set || c.set.id === f.set) && (!n || c.nn === n));
}
function queryTest(q) {
  q = (q || '').trim();
  let m;
  if ((m = q.match(/^#?(\d+)\s*[-–]\s*#?(\d+)$/))) {
    const a = +m[1], b = +m[2];
    return pk => pk.id >= Math.min(a, b) && pk.id <= Math.max(a, b);
  }
  if ((m = q.match(/^#?(\d+)$/))) { const n = +m[1]; return pk => pk.id === n; }
  if (q) { const k = norm(q); return pk => pk.key.includes(k); }
  return () => true;
}
function applyFilters() {
  const f = F();
  const test = queryTest(f.q);
  const types = f.types || [];
  const owned = S.store.owned;
  let list = S.pokemon.filter(pk =>
    test(pk) &&
    types.every(tp => pk.types.includes(tp)) &&
    (!f.gen || pk.gen === +f.gen) &&
    (f.owned !== 'owned' || owned[pk.id]) &&
    (f.owned !== 'missing' || !owned[pk.id])
  );
  if (f.set || f.num) list = list.filter(pk => setCardsFor(pk).length);
  const sort = f.sort || 'dex';
  if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (sort === 'added') {
    // posiadane od najnowszych, potem reszta wg numeru
    const at = pk => S.store.owned[pk.id]?.t || 0;
    list = [...list].sort((a, b) => (owned[b.id] ? 1 : 0) - (owned[a.id] ? 1 : 0) || at(b) - at(a) || a.id - b.id);
  }
  if (sort === 'type') {
    const ti = tp => (tp ? TYPE_ORDER.indexOf(tp) : -1);
    list = [...list].sort((a, b) => ti(a.types[0]) - ti(b.types[0]) || ti(a.types[1]) - ti(b.types[1]) || a.id - b.id);
  }
  if (sort === 'set' && f.set) {
    const first = pk => setCardsFor(pk).sort(numSort)[0];
    list = [...list].sort((a, b) => numSort(first(a), first(b)));
  }
  S.filtered = list;
}

// ===== Render: siatka =====
function typeVars(types) {
  const c1 = TYPE_COLORS[types[0]] || '#999';
  const c2 = TYPE_COLORS[types[1]] || c1;
  return `--c1:${c1};--c2:${c2}`;
}
function checkBtn(pk, owned) {
  return `<button class="tile-check" data-toggle="${pk.id}" aria-label="${owned ? t('ownedAria') : t('notOwnedAria')}: ${esc(pk.name)}" aria-pressed="${!!owned}">✓</button>`;
}
function countBadge(n) {
  return n > 1 ? `<span class="cnt" aria-label="${esc(t('cardsOwnedAria', n))}">${n}</span>` : '';
}
function tileHTML(pk, album = false, badge = '') {
  const owned = S.store.owned[pk.id];
  const mine = ownedCards(pk.id);
  const cls = `tile${owned ? ' owned' : ''}${album && !owned ? ' missing' : ''}`;
  const aria = `aria-label="${esc(pk.name)} ${pad(pk.id)}"`;

  // "Mój album": jeśli mam konkretną kartę — pokaż jej obrazek (gdy się nie załaduje, zostaje zwykły kafelek)
  const card = album && owned && mine.length && setting('cardImg') ? S.cardById.get(mine[0].id) : null;
  const overlay = card
    ? `<img class="cardimg-img" loading="lazy" decoding="async" alt="" src="${esc(card.img)}" onerror="this.closest('.tile').classList.remove('cardimg');this.remove()"><span class="cardimg-no">${pad(pk.id)}</span>`
    : '';

  const hd = setting('hd');
  const cards = S.cardsByDex.get(pk.id) || [];
  const sc = album ? null : setCardsFor(pk);
  const { page, slot } = albumPos(pk.id);
  const foot = sc && sc.length
    ? `<b>${esc(sc.slice(0, 2).map(c => c.num).join(', '))}${sc.length > 2 ? '…' : ''}</b><span>${esc(sc[0].set.code || '')}</span>`
    : `<span>${t('tileCards', cards.length)}</span><span>${t('tilePos', page, slot)}</span>`;
  return `<article class="${cls}${card ? ' cardimg' : ''}" data-id="${pk.id}" style="${typeVars(pk.types)}" tabindex="0" ${aria}>${overlay}${badge}
    <div class="tile-in">
      <div class="tile-top"><span class="tile-no">${pad(pk.id)}</span>${countBadge(mine.length)}${checkBtn(pk, owned)}</div>
      <div class="tile-img"><img loading="lazy" decoding="async" crossorigin="anonymous" alt="" src="${hd ? ART(pk.id) : SPRITE(pk.id)}"${hd ? ' class="hd"' : ''} onerror="this.onerror=null;this.className='hd';this.src='${hd ? SPRITE(pk.id) : ART(pk.id)}'"></div>
      <div class="tile-name">${esc(pk.name)}</div>
      <div class="tile-types">${pk.types.map(tp => `<i style="--tc:${TYPE_COLORS[tp]}">${tp}</i>`).join('')}</div>
      <div class="tile-meta">${fmt1(pk.h)} m · ${fmt1(pk.w)} kg</div>
      <div class="tile-foot">${foot}</div>
    </div>
  </article>`;
}
function pageHTML(page, cellFn) {
  const P = +setting('pocket'), off = offset0();
  const startPos = (page - 1) * P;
  let cells = '';
  for (let s = 0; s < P; s++) {
    const id = startPos + s - off + 1;
    const pk = S.byId.get(id);
    cells += pk ? cellFn(pk) : `<div class="tile ghost" aria-hidden="true"></div>`;
  }
  const firstId = Math.max(1, startPos - off + 1), lastId = Math.min(S.maxId, startPos + P - off);
  const { have, slots } = pageStats(page);
  return `<section class="page" data-page="${page}"><div class="page-head"><b>${t('page')} ${page}</b><span>${pad(firstId)}–${pad(lastId)}</span><span class="pg-count${have === slots ? ' done' : ''}">${have}/${slots}</span></div>
    <div class="page-grid" style="--cols:${COLS[P] || 3}">${cells}</div></section>`;
}
function renderProgress() {
  const ownedCount = Object.keys(S.store.owned).length;
  const total = S.pokemon.length;
  $('#progressFill').style.width = (ownedCount / total * 100).toFixed(1) + '%';
  $('#progressText').textContent = t('progress', ownedCount, total, totalOwnedCards());
}
function renderGrid() {
  const grid = $('#grid');
  const total = S.pokemon.length;
  const album = isAlbum();
  const view = setting('view');
  renderProgress();
  document.body.classList.toggle('album-mode', view !== 'dex');
  document.querySelectorAll('.views [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('#q').placeholder = view === 'sets' ? t('searchPhSets') : view === 'wish' ? t('searchPhWish') : album ? t('searchPhAlbum') : t('searchPh');
  const qv = view === 'sets' ? S.setsQ : view === 'wish' ? S.wishQ : album ? S.albumQ : (F().q || '');
  if ($('#q').value !== qv) $('#q').value = qv;
  $('#qClear').hidden = !$('#q').value;
  const fc = activeFilterCount();
  $('#filterCount').hidden = !fc;
  $('#filterCount').textContent = fc;

  if (view === 'sets') { renderSets(grid); return; }
  if (view === 'wish') { renderWish(grid); return; }

  if (album) {
    // Mój album: wszystkie strony, brakujące lekko wyszarzone — albo „Ostatnio dodane” wg daty
    S.filtered = S.pokemon;
    $('#status').textContent = t('statusAlbum', Object.keys(S.store.owned).length, total, totalOwnedCards());
    // sortowanie wg wartości tylko z kluczem API PokéWallet (bez klucza nie ma cen)
    const hasPrices = typeof pwKey === 'function' && !!pwKey();
    let aSort = setting('albumSort');
    if (aSort === 'value' && !hasPrices) aSort = 'pages';
    const opts = [['pages', t('albumPages')], ['added', t('albumAdded')], ...(hasPrices ? [['value', t('sortByValue')]] : [])];
    const chips = `<div class="summary-chips sets-show">${opts
      .map(([v, l]) => `<button data-album-sort="${v}" aria-pressed="${aSort === v}">${l}</button>`).join('')}</div>`;
    if (aSort === 'value') {
      // wartość stworka = suma zapisanych cen jego kart w kolekcji (wybrane źródło cen, z wariantem)
      const rows = S.pokemon.filter(pk => S.store.owned[pk.id]).map(pk => ({ pk, ...valueOfCopies(S.store.owned[pk.id].cards) }));
      const priced = rows.filter(r => r.priced).sort((a, b) => b.sum - a.sum || a.pk.id - b.pk.id);
      const rest = rows.filter(r => !r.priced);
      const total = priced.reduce((s, r) => s + r.sum, 0);
      const cur = priced[0]?.cur;
      const tile = r => {
        const st = S.store.owned[r.pk.id].cards.some(o => isStale(o.id));
        return tileHTML(r.pk, true, r.priced ? `<span class="tile-value${st ? ' stale' : ''}">${fmtMoney(r.sum, r.cur)}</span>` : '');
      };
      grid.innerHTML = chips + `<p class="muted small value-hint">${t('valueHint')}</p>`
        + (priced.length ? `<section class="group"><div class="page-head"><b>${t('valueGroup', fmtMoney(total, cur))}</b><span>${priced.length}</span></div><div class="flat">${priced.map(tile).join('')}</div></section>` : '')
        + (rest.length ? `<section class="group"><div class="page-head"><b>${t('noPriceGroup')}</b><span>${rest.length}</span></div><div class="flat">${rest.map(tile).join('')}</div></section>` : '');
      return;
    }
    if (aSort === 'added') {
      const owned = S.pokemon.filter(pk => S.store.owned[pk.id]).sort((a, b) => S.store.owned[b.id].t - S.store.owned[a.id].t || a.id - b.id);
      grid.innerHTML = chips + (owned.length ? dayGroupsHTML(owned, pk => S.store.owned[pk.id].t, pk => tileHTML(pk, true)) : `<p class="empty">${t('noMatch')}</p>`);
      return;
    }
    const lastPage = albumPos(S.maxId).page;
    const out = [];
    for (let page = 1; page <= lastPage; page++) out.push(pageHTML(page, pk => tileHTML(pk, true)));
    grid.innerHTML = chips + `<div class="pages">${out.join('')}</div>`;
    return;
  }

  applyFilters();
  const list = S.filtered;
  const visOwned = list.filter(pk => S.store.owned[pk.id]).length;
  $('#status').textContent = list.length === total ? t('statusAll', total, S.cards.length, S.sets.length) : t('statusFiltered', list.length, visOwned);
  if (!list.length) { grid.innerHTML = `<p class="empty">${t('noMatch')}</p>`; return; }

  const sort = F().sort || 'dex';
  if (sort === 'added') {
    const own = list.filter(pk => S.store.owned[pk.id]);
    const rest = list.filter(pk => !S.store.owned[pk.id]);
    grid.innerHTML = (own.length ? dayGroupsHTML(own, pk => S.store.owned[pk.id].t, pk => tileHTML(pk)) : '')
      + (rest.length ? `<section class="group"><div class="page-head"><b>${t('notOwnedGroup')}</b><span>${rest.length}</span></div>
        <div class="flat">${rest.map(pk => tileHTML(pk)).join('')}</div></section>` : '');
    return;
  }
  if (sort === 'type') {
    // grupy wg głównego typu
    const groups = new Map();
    for (const pk of list) {
      const tp = pk.types[0];
      if (!groups.has(tp)) groups.set(tp, []);
      groups.get(tp).push(pk);
    }
    grid.innerHTML = [...groups].map(([tp, pks]) => `<section class="group" style="--tc:${TYPE_COLORS[tp]}">
      <div class="page-head"><b class="type-head">${tp}</b><span>${pks.length}</span><span class="pg-count">${pks.filter(pk => S.store.owned[pk.id]).length}/${pks.length}</span></div>
      <div class="flat">${pks.map(pk => tileHTML(pk)).join('')}</div></section>`).join('');
    return;
  }
  if (!(setting('pages') && sort === 'dex')) {
    grid.innerHTML = `<div class="flat">${list.map(pk => tileHTML(pk)).join('')}</div>`;
    return;
  }
  // strony albumu — puste miejsca (niepasujące do filtra) jako "duchy"
  const inList = new Set(list.map(pk => pk.id));
  const pages = [...new Set(list.map(pk => albumPos(pk.id).page))];
  grid.innerHTML = `<div class="pages">${pages.map(page => pageHTML(page, pk =>
    inList.has(pk.id) ? tileHTML(pk) : `<div class="tile ghost" aria-hidden="true">${pad(pk.id)}</div>`)).join('')}</div>`;
}
// grupy wg dnia dodania (najnowsze najpierw); elementy muszą być już posortowane
function dayKey(ts) {
  return ts && ts > 946684800000 ? new Date(ts).toLocaleDateString(LANG === 'pl' ? 'pl-PL' : 'en-US', { dateStyle: 'long' }) : t('noDate');
}
function dayGroupsHTML(items, tsOf, cellHTML, wrapClass = 'flat') {
  const groups = new Map();
  for (const it of items) {
    const k = dayKey(tsOf(it));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups].map(([day, arr]) => `<section class="group"><div class="page-head"><b>${esc(day)}</b><span>${arr.length}</span></div>
    <div class="${wrapClass}">${arr.map(cellHTML).join('')}</div></section>`).join('');
}
function refreshTile(id) {
  const el = document.querySelector(`.tile[data-id="${id}"]`);
  const pk = S.byId.get(id);
  if (el && pk) el.outerHTML = tileHTML(pk, isAlbum());
  const pg = el && document.querySelector(`.page[data-page="${albumPos(id).page}"] .pg-count`);
  if (pg) {
    const { have, slots } = pageStats(albumPos(id).page);
    pg.textContent = `${have}/${slots}`;
    pg.classList.toggle('done', have === slots);
  }
  renderProgress();
  if (isAlbum()) $('#status').textContent = t('statusAlbum', Object.keys(S.store.owned).length, S.pokemon.length, totalOwnedCards());
}

// ===== Posiadanie =====
function isOwned(id) { return !!S.store.owned[id]; }
function setOwned(id, on) {
  if (on) {
    if (!S.store.owned[id]) S.store.owned[id] = { t: Date.now(), cards: [] };
  } else {
    const o = S.store.owned[id];
    if (o && o.cards.length && !confirm(t('confirmRemoveCards', o.cards.length))) return false;
    delete S.store.owned[id];
  }
  saveStore();
  return true;
}
// zwraca true, gdy karta zeszła przy okazji z listy życzeń
function addCard(dex, cardId, variant) {
  const fromWish = removeFromWish(cardId);
  if (!dex) { S.store.other.push({ id: cardId, v: variant || 'Normal', t: Date.now() }); saveStore(); return fromWish; }
  setOwned(dex, true);
  S.store.owned[dex].cards.push({ id: cardId, v: variant || 'Normal', t: Date.now() });
  saveStore();
  return fromWish;
}
function ownedCountOf(dex, cardId) {
  return ownedIndex().get(cardId) || 0;
}
// odśwież widoki po dodaniu/usunięciu karty
function afterCardChange() {
  if (!$('#detail').hidden) renderDetail();
  if (typeof renderSetView === 'function' && !$('#setView').hidden) renderSetView();
  if ($('#detail').hidden) renderGrid(); else renderProgress();
}
// usuń jeden egzemplarz karty (ostatnio dodany), gdziekolwiek jest zapisany
function removeOneCard(cardId) {
  const lists = [...Object.values(S.store.owned).map(o => o.cards), S.store.other];
  for (const list of lists) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].id === cardId) { list.splice(i, 1); saveStore(); return true; }
    }
  }
  return false;
}

// ===== Szczegóły (nawigacja zawsze po kolejnych numerach Pokédex) =====
const D = { series: '', sub: '', q: '', limit: CARD_PAGE };

function openDetail(id, push = true) {
  if (!S.byId.has(id)) return;
  S.cur = id;
  Object.assign(D, { series: '', sub: '', q: '', limit: CARD_PAGE });
  const el = $('#detail');
  const wasHidden = el.hidden;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  renderDetail();
  $('#dScroll').scrollTop = 0;
  if (push && wasHidden) history.pushState({ dex: id }, '', '#' + id);
  else history.replaceState({ dex: id }, '', '#' + id);
  [id - 1, id + 1].forEach(n => { if (S.byId.has(n)) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = ART(n); } });
}
function closeDetail(fromPop = false) {
  const el = $('#detail');
  if (el.hidden) return;
  el.hidden = true;
  document.body.style.overflow = '';
  const id = S.cur;
  if (!fromPop && history.state && history.state.dex) history.back();
  renderGrid();
  const tile = document.querySelector(`.tile[data-id="${id}"]`);
  if (tile) tile.scrollIntoView({ block: 'center' });
}

function renderDetail() {
  const pk = S.byId.get(S.cur);
  if (!pk) return;
  const cards = S.cardsByDex.get(pk.id) || [];
  const sets = new Set(cards.map(c => c.set.id));
  const { page, slot } = albumPos(pk.id);
  const owned = S.store.owned[pk.id];
  $('#dPos').textContent = `${pk.id} / ${S.maxId}`;
  $('#dPrev').disabled = !S.byId.has(pk.id - 1);
  $('#dNext').disabled = !S.byId.has(pk.id + 1);

  $('#dInner').innerHTML = `
    <article class="bigcard" style="${typeVars(pk.types)}">
      <div class="bigcard-in">
        <div class="bc-head"><h2 id="dName">${esc(pk.name)}</h2><span class="bc-no">${pad(pk.id)}</span></div>
        <div class="bc-art"><img src="${ART(pk.id)}" crossorigin="anonymous" alt="${esc(pk.name)}" onerror="this.onerror=null;this.src='${SPRITE(pk.id)}'"><span class="gen">Gen ${GENS[pk.gen]}</span></div>
        <div class="bc-types">${pk.types.map(tp => `<i style="--tc:${TYPE_COLORS[tp]}">${tp}</i>`).join('')}</div>
        <dl class="bc-stats">
          <div><dt>${t('height')}</dt><dd>${fmt1(pk.h)} m</dd></div>
          <div><dt>${t('weight')}</dt><dd>${fmt1(pk.w)} kg</dd></div>
          <div><dt>${t('album')}</dt><dd>${t('posAlbum', page, slot)}</dd></div>
        </dl>
        <div class="bc-foot"><span>${t('tcgCount', cards.length)}</span><span>${t('setsCount', sets.size)}</span></div>
      </div>
    </article>
    <button class="btn own-toggle${owned ? ' is-owned' : ''}" id="ownToggle">${owned ? t('ownOn') : t('ownOff')}</button>
    ${ownedSectionHTML(pk)}
    <section class="section" id="tcgSection">${tcgSectionHTML(pk)}</section>`;
}

function cardLine(c) {
  const year = c.set.date ? c.set.date.slice(0, 4) : '';
  const total = cardNo(c).slice(c.num.length);
  return `<span><span class="num">${esc(c.num)}${total}</span> · ${raritySymHTML(c.rarity)} ${esc(c.rarity || '—')}${c.sub.length ? ' · ' + esc(c.sub.join(', ')) : ''}${year ? ' · ' + year : ''}</span>`;
}
// ===== Warianty karty dostępne dla konkretnej karty =====
// 1) z zapisanych cen PokéWallet (TCGplayer zna dokładne wersje: Normal, Holofoil, Reverse Holofoil, 1st Edition…)
// 2) inaczej z zasad: rzadkość + era zestawu (dane kart nie zawierają listy wariantów)
const WOTC_1ST = new Set(['base1', 'base2', 'base3', 'base5', 'gym1', 'gym2', 'neo1', 'neo2', 'neo3', 'neo4']);
const BALL_REVERSE = new Set(['sv3pt5', 'sv8pt5']); // 151, Prismatic Evolutions: reverse z Poké Ball / Master Ball
function availableVariants(c) {
  const out = new Set();
  // 0) warianty z listy zestawu PokéWallet (card_info.variants: „Normal”, „Reverse Holofoil”…) — najdokładniejsze
  const known = typeof pwMap === 'function' ? pwMap()[c.id]?.variants : null;
  for (const v0 of known || []) {
    const v = String(v0).toLowerCase();
    if (/1st|first/.test(v)) out.add('1st Edition');
    else if (/reverse/.test(v)) out.add('Reverse Holo');
    else if (/holo|foil/.test(v)) out.add('Holo');
    else if (v) out.add('Normal');
  }
  const pw = !out.size && typeof priceCache === 'function' ? priceCache()[c.id]?.pw : null;
  if (pw) {
    for (const r of [...pw.tcg, ...pw.cm]) {
      const v = String(r.v || '').toLowerCase();
      if (/1st|first/.test(v)) out.add('1st Edition');
      else if (/reverse/.test(v)) out.add('Reverse Holo');
      else if (/holo|foil/.test(v)) out.add('Holo');
      else out.add('Normal');
    }
  }
  if (!out.size) {
    const tier = rarityTier(c.rarity);
    const date = c.set.date || '';
    const wotc = date < '2002-05';                 // przed Legendary Collection: bez reverse holo
    const sv = date >= '2023-03';                   // Scarlet & Violet+: „Rare” to karta holo
    const holoR = /holo/i.test(c.rarity) || (sv && /^rare$/i.test(c.rarity));
    if (tier === 'promo') { out.add('Normal'); out.add('Holo'); }
    else if (tier === 0) { out.add('Normal'); out.add('Holo'); if (!wotc) out.add('Reverse Holo'); }
    else if (tier >= 4) out.add('Holo');           // ex, V, GX, ilustracyjne, sekretne… — jedna wersja
    else {
      out.add(holoR ? 'Holo' : 'Normal');
      if (!wotc) out.add('Reverse Holo');
    }
    if (WOTC_1ST.has(c.set.id)) out.add('1st Edition');
    if (c.set.id === 'base1') out.add('Shadowless');
  }
  if (BALL_REVERSE.has(c.set.id) && out.has('Reverse Holo')) { out.add('Reverse Holo (Poké Ball)'); out.add('Reverse Holo (Master Ball)'); }
  if (/promo/i.test(c.set.name) || /^promo$/i.test(c.rarity)) out.add('Promo / Stamped');
  out.add('Other');
  return VARIANTS.filter(v => out.has(v));
}
// domyślny typ karty: pierwszy z góry, który ma znaną niezerową cenę (z zapisanych cen); bez cen — pierwszy z listy
function defaultVariant(c, list = availableVariants(c)) {
  const priced = typeof variantHasPrice === 'function' ? list.find(v => variantHasPrice(c.id, v)) : null;
  return priced || list[0];
}
function variantOptions(selected, card = null) {
  const list = card ? availableVariants(card) : VARIANTS;
  return list.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(variantLabel(v))}</option>`).join('')
    + (selected && !list.includes(selected) ? `<option selected>${esc(variantLabel(selected))}</option>` : '');
}
// po pobraniu cen lista wariantów może być dokładniejsza — odśwież wybór w otwartym oknie karty
function refreshVariantSelect(card) {
  const sel = $('#variantSel');
  if (!sel || $('#priceBox')?.dataset.card !== card.id) return;
  const list = availableVariants(card);
  // dopóki użytkownik sam nie wybrał typu, po pobraniu ceny ustaw typ z ceną
  const cur = list.includes(sel.value) && sel.dataset.touched ? sel.value : defaultVariant(card, list);
  sel.innerHTML = variantOptions(cur, card);
}
function ownedSectionHTML(pk) {
  const o = S.store.owned[pk.id];
  if (!o) return '';
  const rows = o.cards.map((oc, i) => {
    const c = S.cardById.get(oc.id);
    return `<li class="crow">
      ${c ? `<img class="thumb" loading="lazy" src="${esc(c.img)}" onerror="this.style.visibility='hidden'" alt="" data-card="${esc(c.id)}">` : '<span class="thumb"></span>'}
      <div class="info">${c ? `<b>${esc(c.set.name)} ${priceTag(c.id, oc.v)}</b>${cardLine(c)}` : `<b>${esc(oc.id)}</b><span>${t('unknownCard')}</span>`}
        <select data-variant="${i}" aria-label="${t('cardType')}">${variantOptions(oc.v, c)}</select>
      </div>
      <button class="act rm" data-remove="${i}" aria-label="${t('removeCard')}">✕</button>
    </li>`;
  }).join('');
  return `<section class="section"><h3>${t('myCards')} <small>${o.cards.length ? o.cards.length : t('myCardsHint')}</small></h3>
    ${o.cards.length ? `<ul class="clist">${rows}</ul>` : `<p class="muted small" style="margin:0">${t('myCardsEmpty')}</p>`}</section>`;
}
function tcgSectionHTML(pk) {
  const all = (S.cardsByDex.get(pk.id) || []).slice().sort((a, b) => (a.set.date || '').localeCompare(b.set.date || '') || a.set.i - b.set.i || numSort(a, b));
  const bySeries = new Map(), bySub = new Map();
  for (const c of all) {
    bySeries.set(c.set.series, (bySeries.get(c.set.series) || 0) + 1);
    for (const s of c.sub) bySub.set(s, (bySub.get(s) || 0) + 1);
  }
  const f = F();
  const q = norm(D.q.trim());
  const list = all.filter(c =>
    (!D.series || c.set.series === D.series) &&
    (!D.sub || c.sub.includes(D.sub)) &&
    (!q || norm(`${c.set.name} ${c.set.code} ${c.set.id} ${c.num} ${c.name} ${c.rarity}`).includes(q) || (q.includes('/') && c.nn === normNum(q.split('/')[0])))
  );
  let rows = '', lastSeries = null;
  for (const c of list.slice(0, D.limit)) {
    if (c.set.series !== lastSeries) { lastSeries = c.set.series; rows += `<li class="series">${esc(lastSeries)}</li>`; }
    const have = ownedCountOf(pk.id, c.id);
    const hl = f.set && c.set.id === f.set ? ' hl' : '';
    rows += `<li class="crow${hl}">
      <img class="thumb" loading="lazy" src="${esc(c.img)}" onerror="this.style.visibility='hidden'" alt="" data-card="${esc(c.id)}">
      <button class="info" data-card="${esc(c.id)}"><b>${esc(c.set.name)}${c.name !== pk.name ? ' — ' + esc(c.name) : ''}</b>${cardLine(c)}</button>
      ${have ? `<span class="have">✓${have > 1 ? have : ''}</span>` : inWish(c.id) ? '<span class="wish-mark" aria-hidden="true">♥</span>' : ''}
      <button class="act" data-add="${esc(c.id)}" aria-label="${t('addCard')}">+</button>
    </li>`;
  }
  const chip = (kind, val, n, label) => `<button data-${kind}="${esc(val)}" aria-pressed="${D[kind] === val}">${esc(label)}<b>${n}</b></button>`;
  return `<h3>${t('tcgTitle')} <small>${t('tcgCount', all.length)}</small></h3>
    <div class="summary-chips">${chip('series', '', all.length, t('allSeries'))}${[...bySeries].map(([s, n]) => chip('series', s, n, s)).join('')}</div>
    ${bySub.size > 1 ? `<div class="summary-chips">${chip('sub', '', all.length, t('allKinds'))}${[...bySub].sort((a, b) => b[1] - a[1]).map(([s, n]) => chip('sub', s, n, s)).join('')}</div>` : ''}
    <input class="card-filter" id="cardFilter" type="search" placeholder="${t('cardFilterPh')}" value="${esc(D.q)}" autocomplete="off">
    ${list.length ? `<ul class="clist">${rows}</ul>` : `<p class="muted">${t('noCards')}</p>`}
    ${list.length > D.limit ? `<button class="btn ghost more" id="moreCards">${t('more', list.length - D.limit)}</button>` : ''}`;
}
function rerenderTcg() {
  const pk = S.byId.get(S.cur);
  const sec = $('#tcgSection');
  const hadFocus = document.activeElement?.id === 'cardFilter';
  const pos = hadFocus ? document.activeElement.selectionStart : 0;
  sec.innerHTML = tcgSectionHTML(pk);
  if (hadFocus) { const i = $('#cardFilter'); i.focus(); i.setSelectionRange(pos, pos); }
}

// ===== Informacje o karcie (rzadkość, rodzaj, HP, energia, ilustrator) =====
const ENERGY_COLORS = {
  Grass: '#5fae3b', Fire: '#e4572e', Water: '#3d8fd6', Lightning: '#e8b923', Psychic: '#8e4fb0', Fighting: '#b0643a',
  Darkness: '#3b3f4a', Metal: '#8a96a3', Dragon: '#a88a2c', Fairy: '#d685ad', Colorless: '#a9a9a9',
};
// opisowy poziom rzadkości 1–6 (dane nie zawierają szans wypadnięcia z boostera)
function rarityTier(r) {
  if (!r) return 0;
  if (/^promo$/i.test(r)) return 'promo';
  if (/^common$/i.test(r)) return 1;
  if (/^uncommon$/i.test(r)) return 2;
  if (/^(rare|rare holo)$/i.test(r)) return 3;
  if (/secret|rainbow|hyper|special illustration|shiny ultra|shiny gx/i.test(r)) return 6;
  if (/ultra|^illustration rare|^shiny rare|ace spec|black white|futuristic|mega_attack/i.test(r)) return 5;
  return 4;
}
// symbol rzadkości tak jak nadrukowany na karcie (era Scarlet & Violet / Mega; starsze ery: ● ◆ ★)
// col: kolor symbolu na karcie (złoty / srebrny / różowy), pokazywany tam, gdzie da się pokolorować tekst
function raritySymbol(r) {
  const x = String(r || '').toLowerCase().replace(/_/g, ' ');
  if (!x) return { s: '', col: '' };
  if (x === 'common') return { s: '●', col: '' };
  if (x === 'uncommon') return { s: '◆', col: '' };
  if (x === 'double rare') return { s: '★★', col: '' };
  if (x === 'ultra rare') return { s: '★★', col: 'silver' };
  if (x === 'illustration rare') return { s: '★', col: 'gold' };
  if (x === 'special illustration rare') return { s: '★★', col: 'gold' };
  if (x === 'hyper rare' || x === 'mega hyper rare') return { s: '★★★', col: 'gold' };
  if (x === 'shiny rare') return { s: '✦', col: 'gold' };
  if (x === 'shiny ultra rare') return { s: '✦✦', col: 'gold' };
  if (x === 'ace spec rare') return { s: '★', col: 'pink' };
  if (x === 'mega attack rare') return { s: '★★', col: 'silver' };
  return { s: '★', col: '' };
}
const raritySymHTML = r => { const { s, col } = raritySymbol(r); return s ? `<span class="rsym${col ? ' ' + col : ''}" aria-hidden="true">${s}</span>` : ''; };
function cardInfoHTML(c) {
  const tier = rarityTier(c.rarity);
  const dots = typeof tier === 'number' && tier > 0
    ? `<span class="tier-dots" aria-hidden="true">${'●'.repeat(tier)}${'○'.repeat(6 - tier)}</span>` : '';
  const kind = [I18N[LANG].supLabel?.[c.sup] || c.sup, ...c.sub].filter(Boolean);
  const chip = (txt, cls = '', style = '') => `<span class="ci-chip ${cls}"${style ? ` style="${style}"` : ''}>${esc(txt)}</span>`;
  return `<div class="card-info">
    <div class="ci-row"><span class="ci-lbl">${t('rarityLbl')}</span>
      <span class="ci-val"><b>${raritySymHTML(c.rarity)} ${esc(c.rarity || '—')}</b> <span class="muted">· ${esc(t('tiers')[tier] ?? '—')}</span> ${dots}</span></div>
    <div class="ci-row"><span class="ci-lbl">${t('cardKind')}</span>
      <span class="ci-val">${kind.map(k => chip(k)).join('')}${c.etypes.map(e => chip(e, 'energy', `background:${ENERGY_COLORS[e] || '#888'}`)).join('')}${c.hp ? chip(`HP ${c.hp}`, 'hp') : ''}</span></div>
    ${c.artist ? `<div class="ci-row"><span class="ci-lbl">${t('illus')}</span><span class="ci-val">${esc(c.artist)}</span></div>` : ''}
    ${c.reg ? `<div class="ci-row"><span class="ci-lbl">${t('regMark')}</span><span class="ci-val"><span class="reg-mark">${esc(c.reg)}</span></span></div>` : ''}
    <p class="muted small ci-note">${t('noDropRate')}</p>
  </div>`;
}

// ===== Instrukcja: jak rozpoznać typ karty i rzadkość (⚙︎) =====
const GUIDE = {
  pl: {
    title: 'Jak rozpoznać typ karty i rzadkość',
    vHead: 'Typ karty (wariant)',
    vIntro: 'Przechyl kartę pod światło i zobacz, <b>co błyszczy</b>.',
    variants: [
      ['Normal', 'Nic nie błyszczy — ani ilustracja, ani reszta karty. Tak wygląda większość kart Common i Uncommon.'],
      ['Holo', 'Błyszczy (folia, tęczowy połysk) <b>sama ilustracja</b>, reszta karty jest matowa. Karty ex, V, VMAX, VSTAR, GX oraz ilustracyjne (Illustration / Special Illustration, Hyper) mają połysk lub fakturę na całej karcie i istnieją tylko w tej jednej wersji — wybierz Holo.'],
      ['Reverse Holo', 'Odwrotnie niż holo: <b>błyszczy cała karta</b> (ramka, tło pod tekstem), a ilustracja jest matowa. Od 2002 r. prawie każda zwykła karta (Common, Uncommon, Rare) ma też wersję reverse — jest jedna na booster.'],
      ['Reverse Holo (Poké Ball / Master Ball)', 'Reverse z wzorem <b>Poké Balli</b> albo <b>Master Balli</b> w folii (zamiast zwykłego połysku). Tylko w zestawach 151 i Prismatic Evolutions; Master Ball jest dużo rzadszy.'],
      ['1st Edition', 'Znaczek <b>„Edition 1”</b> w czarnym kółku po lewej stronie, pod ilustracją. Tylko stare zestawy Wizards of the Coast (1999–2002).'],
      ['Shadowless', 'Tylko Base Set: brak <b>cienia</b> przy prawej krawędzi ramki ilustracji (późniejszy druk „Unlimited” ma wyraźny cień) i brak znaczka 1st Edition.'],
      ['Promo / Stamped', 'Zamiast symbolu rzadkości czarna gwiazdka z napisem <b>PROMO</b> albo dodatkowy nadruk na ilustracji: logo zestawu, „Prerelease”, „Staff”, logo wydarzenia lub sklepu.'],
      ['Inny', 'Wszystko, co nie pasuje wyżej: błędy druku, karty jumbo, inne wersje językowe itp.'],
    ],
    rHead: 'Rzadkość — symbol przy numerze karty',
    rIntro: 'Symbol jest na dole karty, obok numeru (np. <b>199/165</b>). W nowych zestawach (od Scarlet & Violet) liczy się też jego kolor:',
    rarities: [
      ['Common', 'zwykła'], ['Uncommon', 'niezwykła'], ['Rare', 'rzadka (czarna gwiazdka)'],
      ['Double Rare', 'karty ex (czarne gwiazdki)'], ['Illustration Rare', 'ilustracja na całą kartę (złota gwiazdka)'],
      ['Ultra Rare', 'pełna karta ex / trener (srebrne gwiazdki)'], ['Special Illustration Rare', 'specjalna ilustracja (złote gwiazdki)'],
      ['Hyper Rare', 'złota karta (złote gwiazdki)'], ['Shiny Rare', 'shiny Pokémon'], ['Shiny Ultra Rare', 'shiny ex'],
      ['ACE SPEC Rare', 'karta ACE SPEC (różowa gwiazdka)'],
    ],
    rOld: 'Starsze karty (do Sword & Shield) mają tylko ● ◆ ★ — czarna ★ oznacza każdą rzadką kartę, także holo, V, VMAX i sekretne. <b>Karta sekretna</b> ma numer większy niż rozmiar zestawu, np. <b>201/165</b>.',
  },
  en: {
    title: 'How to tell card type and rarity',
    vHead: 'Card type (variant)',
    vIntro: 'Tilt the card under a light and look at <b>what shines</b>.',
    variants: [
      ['Normal', 'Nothing shines — neither the artwork nor the rest of the card. Most Common and Uncommon cards look like this.'],
      ['Holo', '<b>Only the artwork</b> is foil (rainbow shine); the rest of the card is matte. ex, V, VMAX, VSTAR, GX and illustration cards (Illustration / Special Illustration, Hyper) have shine or texture over the whole card and exist in this one version only — pick Holo.'],
      ['Reverse Holo', 'The opposite of holo: <b>the whole card shines</b> (frame, text box background) while the artwork is matte. Since 2002 almost every regular card (Common, Uncommon, Rare) also has a reverse version — one per booster pack.'],
      ['Reverse Holo (Poké Ball / Master Ball)', 'A reverse with a <b>Poké Ball</b> or <b>Master Ball</b> pattern in the foil instead of the regular shine. Only in 151 and Prismatic Evolutions; Master Ball is much rarer.'],
      ['1st Edition', 'A black circle <b>“Edition 1”</b> stamp on the left, below the artwork. Only old Wizards of the Coast sets (1999–2002).'],
      ['Shadowless', 'Base Set only: <b>no drop shadow</b> along the right edge of the artwork frame (the later “Unlimited” print has a clear shadow) and no 1st Edition stamp.'],
      ['Promo / Stamped', 'A black star with <b>PROMO</b> instead of a rarity symbol, or an extra stamp on the artwork: set logo, “Prerelease”, “Staff”, an event or store logo.'],
      ['Other', 'Anything that doesn’t fit above: misprints, jumbo cards, other languages, etc.'],
    ],
    rHead: 'Rarity — the symbol next to the card number',
    rIntro: 'The symbol is at the bottom of the card, next to the number (e.g. <b>199/165</b>). In newer sets (Scarlet & Violet onwards) its colour matters too:',
    rarities: [
      ['Common', 'common'], ['Uncommon', 'uncommon'], ['Rare', 'rare (black star)'],
      ['Double Rare', 'ex cards (black stars)'], ['Illustration Rare', 'full-art illustration (gold star)'],
      ['Ultra Rare', 'full-art ex / trainer (silver stars)'], ['Special Illustration Rare', 'special illustration (gold stars)'],
      ['Hyper Rare', 'gold card (gold stars)'], ['Shiny Rare', 'shiny Pokémon'], ['Shiny Ultra Rare', 'shiny ex'],
      ['ACE SPEC Rare', 'ACE SPEC card (pink star)'],
    ],
    rOld: 'Older cards (up to Sword & Shield) only use ● ◆ ★ — a black ★ marks any rare card, including holo, V, VMAX and secret ones. A <b>secret card</b> has a number higher than the set size, e.g. <b>201/165</b>.',
  },
};
function guideHTML() {
  const g = GUIDE[LANG] || GUIDE.pl;
  return `<h4>${g.vHead}</h4><p class="small">${g.vIntro}</p>
    <dl class="guide-list">${g.variants.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
    <h4>${g.rHead}</h4><p class="small">${g.rIntro}</p>
    <dl class="guide-list rar">${g.rarities.map(([r, d]) => `<dt>${raritySymHTML(r)} ${esc(r)}</dt><dd>${d}</dd>`).join('')}</dl>
    <p class="small">${g.rOld}</p>`;
}

// ===== Dialog karty =====
function openCardDialog(cardId) {
  const c = S.cardById.get(cardId);
  if (!c) return;
  const dex = c.dex.includes(S.cur) ? S.cur : (c.dex[0] || 0);
  const have = ownedCountOf(dex, c.id);
  const guess = defaultVariant(c);
  $('#cardDlgBody').innerHTML = `
    <div class="sheet-head">${wishButtonHTML(c.id)}<h2>${esc(c.name)}</h2>
      <button class="icon-btn dark" data-close aria-label="${t('close')}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/></svg></button></div>
    <div class="card-view">
      <img class="big" src="${esc(largeImg(c.img))}" alt="${esc(c.name)}" onerror="this.onerror=null;this.src='${esc(c.img)}'">
      <div>
        <div><b>${esc(c.set.name)}</b> <span class="muted">(${esc(c.set.code || c.set.id)})</span></div>
        <div class="meta">${t('series')}: ${esc(c.set.series)} · ${t('no')} <b>${esc(cardNo(c))}</b> · ${raritySymHTML(c.rarity)} ${esc(c.rarity || '—')}</div>
        <div class="meta">${t('released')}: ${esc(c.set.date || '?')} · ID: ${esc(c.id)}</div>
        ${have ? `<div class="meta" style="color:var(--ok);font-weight:700">${t('haveCopies', have)}</div>` : ''}
      </div>
      ${cardInfoHTML(c)}
      <div class="price-box" id="priceBox" data-card="${esc(c.id)}"></div>
      <label class="muted small" for="variantSel">${t('variantLabel')}</label>
      <div class="add-row">
        <select id="variantSel" onchange="this.dataset.touched=1">${variantOptions(guess, c)}</select>
        <button class="btn ok" id="dlgAdd" data-dex="${dex}" data-card="${esc(c.id)}">${have ? t('addMore') : t('addBtn')}</button>
      </div>
      ${copiesHTML(c)}
      ${inWish(c.id) ? wishVariantHTML(c) : ''}
    </div>`;
  const dlg = $('#cardDlg');
  if (!dlg.open) dlg.showModal();
  renderPriceBox(c);
}

// posiadane egzemplarze tej karty (zmiana wariantu / usunięcie) — klucz „dex:indeks” albo „o:indeks” (trenerzy, energie)
function copyRefs(cardId) {
  const refs = [];
  for (const [dex, o] of Object.entries(S.store.owned)) o.cards.forEach((x, i) => { if (x.id === cardId) refs.push({ k: `${dex}:${i}`, x }); });
  S.store.other.forEach((x, i) => { if (x.id === cardId) refs.push({ k: `o:${i}`, x }); });
  return refs;
}
function copyByKey(k) {
  const [a, i] = k.split(':');
  const list = a === 'o' ? S.store.other : S.store.owned[a]?.cards;
  return list ? { list, i: +i } : null;
}
function copiesHTML(c) {
  const refs = copyRefs(c.id);
  if (!refs.length) return '';
  return `<div class="copies"><div class="muted small"><b>${t('yourCopies')}</b></div>${refs.map((r, n) => `
    <div class="copy-row"><span class="muted small">${n + 1}.</span>
      <select data-copy="${r.k}" aria-label="${t('cardType')}">${variantOptions(r.x.v, c)}</select>
      ${typeof priceTag === 'function' ? priceTag(c.id, r.x.v) : ''}
      <button class="act rm" data-copy-rm="${r.k}" aria-label="${t('removeCard')}">✕</button></div>`).join('')}</div>`;
}
function wishVariantHTML(c) {
  const w = S.store.wish.find(x => x.id === c.id);
  return `<div class="copies wish-variant"><label class="muted small" for="wishVariantSel"><b>♥ ${t('wishVariantLbl')}</b></label>
    <select id="wishVariantSel" data-wish-variant="${esc(c.id)}">${variantOptions(w?.v || defaultVariant(c), c)}</select></div>`;
}

// ===== Nawigacja w szczegółach + swipe =====
function go(delta) {
  const next = S.cur + delta;
  if (!S.byId.has(next)) { bounce(delta); return; }
  const inner = $('#dInner');
  inner.classList.add('anim');
  inner.style.transform = `translateX(${-delta * 100}%)`;
  inner.style.opacity = '0';
  setTimeout(() => {
    inner.classList.remove('anim');
    inner.style.transform = `translateX(${delta * 60}%)`;
    openDetail(next, false);
    requestAnimationFrame(() => {
      inner.classList.add('anim');
      inner.style.transform = '';
      inner.style.opacity = '';
    });
  }, 160);
}
function bounce(delta) {
  const inner = $('#dInner');
  inner.classList.add('anim');
  inner.style.transform = `translateX(${-delta * 24}px)`;
  setTimeout(() => { inner.style.transform = ''; }, 140);
}
function setupSwipe() {
  const area = $('#dScroll');
  const inner = $('#dInner');
  let x0 = 0, y0 = 0, dx = 0, lock = null, t0 = 0;
  area.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('select, input')) { lock = 'none'; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; t0 = Date.now();
    inner.classList.remove('anim');
  }, { passive: true });
  area.addEventListener('touchmove', e => {
    if (lock === 'none') return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    dx = x - x0;
    const dy = y - y0;
    if (!lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (lock === 'x') {
      const atEdge = !S.byId.has(S.cur + (dx < 0 ? 1 : -1));
      inner.style.transform = `translateX(${atEdge ? dx / 4 : dx}px)`;
      inner.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, .4));
    }
  }, { passive: true });
  const end = () => {
    if (lock === 'x') {
      const fast = Math.abs(dx) > 30 && Date.now() - t0 < 250;
      if (Math.abs(dx) > 70 || fast) go(dx < 0 ? 1 : -1);
      else { inner.classList.add('anim'); inner.style.transform = ''; inner.style.opacity = ''; }
    }
    lock = null; dx = 0;
  };
  area.addEventListener('touchend', end);
  area.addEventListener('touchcancel', end);
}

// ===== CSV =====
const CSV_HEAD = ['dex', 'name', 'owned', 'card_id', 'set_id', 'set_name', 'series', 'card_number', 'set_total', 'rarity', 'card_name', 'variant', 'album_page', 'album_slot', 'added', 'price', 'currency', 'price_date', 'wishlist'];
// cena z zapisanych (bez zapytań do API): [kwota, waluta, data]
function csvPrice(cardId, variant) {
  const v = typeof cardValue === 'function' ? cardValue(cardId, variant) : null;
  const at = typeof priceCache === 'function' ? priceCache()[cardId]?.at : null;
  return v ? [v.value.toFixed(2), v.cur, at ? new Date(at).toISOString().slice(0, 10) : ''] : ['', '', ''];
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCSV() {
  const lines = [CSV_HEAD.join(',')];
  for (const pk of S.pokemon) {
    const o = S.store.owned[pk.id];
    const { page, slot } = albumPos(pk.id);
    const base = [pk.id, pk.name, o ? 1 : 0];
    const added = o ? new Date(o.t).toISOString().slice(0, 10) : '';
    if (o && o.cards.length) {
      for (const oc of o.cards) {
        const c = S.cardById.get(oc.id);
        lines.push([...base, oc.id, c?.set.id, c?.set.name, c?.set.series, c?.num, c?.set.total, c?.rarity, c?.name, oc.v, page, slot, added, ...csvPrice(oc.id, oc.v)].map(csvCell).join(','));
      }
    } else {
      lines.push([...base, '', '', '', '', '', '', '', '', '', page, slot, added].map(csvCell).join(','));
    }
  }
  for (const oc of S.store.other) {
    const c = S.cardById.get(oc.id);
    const added = oc.t ? new Date(oc.t).toISOString().slice(0, 10) : '';
    lines.push([0, c?.name || '', 1, oc.id, c?.set.id, c?.set.name, c?.set.series, c?.num, c?.set.total, c?.rarity, c?.name, oc.v, '', '', added, ...csvPrice(oc.id, oc.v)].map(csvCell).join(','));
  }
  for (const w of S.store.wish) {
    const c = S.cardById.get(w.id);
    const added = w.t ? new Date(w.t).toISOString().slice(0, 10) : '';
    lines.push([c?.dex[0] || 0, c?.name || '', 0, w.id, c?.set.id, c?.set.name, c?.set.series, c?.num, c?.set.total, c?.rarity, c?.name, w.v || '', '', '', added, ...csvPrice(w.id, w.v || null), 1].map(csvCell).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pokedex-tcg-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(t('exported'));
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
function importCSV(text, merge) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error(t('emptyFile'));
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  const iDex = col('dex');
  if (iDex < 0) throw new Error(t('noDexCol'));
  const iOwned = col('owned'), iCard = col('card_id'), iSet = col('set_id'), iNum = col('card_number'), iVar = col('variant'), iAdded = col('added'), iWish = col('wishlist');
  const wish = merge ? structuredClone(S.store.wish) : [];
  let nWish = 0;
  const owned = merge ? structuredClone(S.store.owned) : {};
  const other = merge ? structuredClone(S.store.other) : [];
  // przy łączeniu nie dubluj kart, które już są zapisane (liczone per karta+wariant; dex 0 = trener/energia)
  const existing = new Map();
  if (merge) for (const c of other) existing.set(`0|${c.id}|${c.v}`, (existing.get(`0|${c.id}|${c.v}`) || 0) + 1);
  if (merge) for (const [d, o] of Object.entries(owned)) for (const c of o.cards) {
    const key = `${d}|${c.id}|${c.v}`;
    existing.set(key, (existing.get(key) || 0) + 1);
  }
  let nPk = 0, nCards = 0;
  const perKey = new Map();
  for (const r of rows.slice(1)) {
    const dex = parseInt(r[iDex], 10) || 0;
    if (dex && !S.byId.has(dex)) continue;
    // wiersz listy życzeń
    if (iWish >= 0 && ['1', 'true', 'tak', 'yes'].includes(String(r[iWish] ?? '').trim().toLowerCase())) {
      let wid = iCard >= 0 ? (r[iCard] || '').trim() : '';
      if (!wid && iSet >= 0 && iNum >= 0 && r[iSet] && r[iNum]) {
        const sid = r[iSet].trim(), nn = normNum(r[iNum].split('/')[0]);
        wid = (S.cardsBySet.get(sid) || []).find(c => c.nn === nn)?.id || '';
      }
      if (wid && S.cardById.has(wid) && !wish.some(w => w.id === wid)) {
        const tw = iAdded >= 0 && r[iAdded] ? Date.parse(r[iAdded]) : NaN;
        wish.push({ id: wid, t: isNaN(tw) ? Date.now() : tw, ...(iVar >= 0 && r[iVar]?.trim() ? { v: r[iVar].trim() } : {}) });
        nWish++;
      }
      continue;
    }
    const ownedVal = iOwned >= 0 ? String(r[iOwned] ?? '').trim().toLowerCase() : '1';
    if (['0', 'false', 'nie', 'no', ''].includes(ownedVal)) continue;
    if (!dex) {
      // karta bez stworka (trener, energia) — tylko z identyfikatorem karty
      let cid0 = iCard >= 0 ? (r[iCard] || '').trim() : '';
      if (!cid0 && iSet >= 0 && iNum >= 0 && r[iSet] && r[iNum]) {
        const sid = r[iSet].trim(), nn = normNum(r[iNum].split('/')[0]);
        const found = (S.cardsBySet.get(sid) || []).find(c => c.nn === nn);
        cid0 = found ? found.id : '';
      }
      if (!cid0) continue;
      const v0 = (iVar >= 0 && r[iVar] ? r[iVar].trim() : '') || 'Normal';
      const key0 = `0|${cid0}|${v0}`;
      const k0 = perKey.get(key0) || 0;
      perKey.set(key0, k0 + 1);
      if (k0 < (existing.get(key0) || 0)) continue;
      const tm0 = iAdded >= 0 && r[iAdded] ? Date.parse(r[iAdded]) : NaN;
      other.push({ id: cid0, v: v0, t: isNaN(tm0) ? Date.now() : tm0 });
      nCards++;
      continue;
    }
    if (!owned[dex]) {
      const tm = iAdded >= 0 && r[iAdded] ? Date.parse(r[iAdded]) : NaN;
      owned[dex] = { t: isNaN(tm) ? Date.now() : tm, cards: [] };
      nPk++;
    }
    let cid = iCard >= 0 ? (r[iCard] || '').trim() : '';
    if (!cid && iSet >= 0 && iNum >= 0 && r[iSet] && r[iNum]) {
      const sid = r[iSet].trim(), nn = normNum(r[iNum].split('/')[0]);
      const found = (S.cardsByDex.get(dex) || []).find(c => c.set.id === sid && c.nn === nn);
      cid = found ? found.id : `${sid}-${r[iNum].trim()}`;
    }
    if (!cid) continue;
    let v = (iVar >= 0 && r[iVar] ? r[iVar].trim() : '') || 'Normal';
    if (v === 'Inny') v = 'Other';
    const base = `${dex}|${cid}|${v}`;
    const k = perKey.get(base) || 0;
    perKey.set(base, k + 1);
    if (k < (existing.get(base) || 0)) continue;
    owned[dex].cards.push({ id: cid, v });
    nCards++;
  }
  S.store.owned = owned;
  S.store.other = other;
  S.store.wish = wish;
  saveStore();
  return { nPk, nCards, nWish };
}

// ===== UI: drobiazgi =====
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function applyLang() {
  const pref = setting('lang');
  LANG = pref === 'pl' || pref === 'en' ? pref : ((navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en');
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
function syncFilterInputs() {
  const f = F();
  $('#fOwned').value = f.owned || '';
  $('#fGen').value = f.gen || '';
  $('#fSet').value = f.set || '';
  $('#fNum').value = f.num || '';
  $('#fSort').value = f.sort || 'dex';
  $('#fSort').querySelector('[value="set"]').disabled = !f.set;
  document.querySelectorAll('#typeChips .chip').forEach(ch => ch.setAttribute('aria-pressed', String((f.types || []).includes(ch.dataset.type))));
}
function updateDataInfo() {
  const o = Object.values(S.store.owned);
  $('#dataInfo').textContent = t('dataInfo', o.length, totalOwnedCards());
  $('#guideBody').innerHTML = guideHTML();
  $('#sourcesText').innerHTML = t('sources', S.sets.length, S.cards.length, esc(S.sets[S.sets.length - 1]?.name));
  askSwVersion();
  renderVersion();
}

// ===== Wersja i aktualizacje =====
let swVersion = null;
function renderVersion() {
  $('#appVersion').textContent = t('version', APP_VERSION, APP_DATE);
  $('#aboutAuthor').innerHTML = t('aboutAuthor');
  $('#guideTitle').textContent = (GUIDE[LANG] || GUIDE.pl).title;
  $('#donateText').textContent = t('donateText');
  $('#donateBtn').textContent = '☕ ' + t('donateBtn');
  $('#aboutLegal').textContent = t('aboutLegal');
  $('#setVersion').textContent = 'v' + APP_VERSION;
  $('#swVersion').textContent = swVersion ? t('swVersion', swVersion) : t('swNone');
}
function askSwVersion() {
  const ctl = navigator.serviceWorker?.controller;
  if (ctl) ctl.postMessage({ type: 'version' });
}
async function checkUpdate() {
  const st = $('#updStatus');
  st.textContent = t('updChecking');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { st.textContent = t('swNone'); return; }
    await reg.update();
    const nw = reg.installing || reg.waiting;
    if (!nw) { st.textContent = t('updLatest'); return; }
    st.textContent = t('updFound');
    // nowy service worker przejmuje stronę (skipWaiting + clients.claim) → przeładuj
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    setTimeout(() => location.reload(), 8000);
  } catch (e) {
    console.warn(e);
    st.textContent = t('updError');
  }
}
function buildFilterUI() {
  $('#typeChips').innerHTML = Object.entries(TYPE_COLORS)
    .map(([tp, c]) => `<button class="chip" data-type="${tp}" style="--tc:${c}" aria-pressed="false">${tp}</button>`).join('');
  $('#fGen').insertAdjacentHTML('beforeend', GENS.slice(1).map((g, i) => `<option value="${i + 1}">${g}</option>`).join(''));
  const bySeries = new Map();
  [...S.sets].reverse().forEach(s => {
    if (!bySeries.has(s.series)) bySeries.set(s.series, []);
    bySeries.get(s.series).push(s);
  });
  $('#fSet').insertAdjacentHTML('beforeend', [...bySeries].map(([series, sets]) =>
    `<optgroup label="${esc(series)}">${sets.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.code ? ' · ' + esc(s.code) : ''} (${s.date.slice(0, 4)})</option>`).join('')}</optgroup>`).join(''));
}
function albumJump(q, next = false) {
  if (!q.trim()) { S.albumHit = -1; return; }
  const test = queryTest(q);
  const hits = S.pokemon.filter(test);
  if (!hits.length) { toast(t('notFound')); return; }
  const cur = hits.findIndex(pk => pk.id === S.albumHit);
  const pk = next && cur >= 0 ? hits[(cur + 1) % hits.length] : hits[0];
  S.albumHit = pk.id;
  const el = document.querySelector(`.tile[data-id="${pk.id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ===== Zdarzenia =====
function bindEvents() {
  let qTimer;
  const setF = (k, v) => { S.store.filters[k] = v; saveStore(); renderGrid(); };

  // wyszukiwanie + przycisk czyszczenia
  const q = $('#q');
  q.addEventListener('input', () => {
    $('#qClear').hidden = !q.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      if (setting('view') === 'sets') { S.setsQ = q.value; renderGrid(); }
      else if (setting('view') === 'wish') { S.wishQ = q.value; renderGrid(); }
      else if (isAlbum()) { S.albumQ = q.value; albumJump(q.value); }
      else setF('q', q.value);
    }, 200);
  });
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (isAlbum()) albumJump(q.value, true);
      else q.blur();
    }
  });
  $('#qClear').addEventListener('click', () => {
    clearTimeout(qTimer);
    q.value = '';
    $('#qClear').hidden = true;
    if (setting('view') === 'sets') { S.setsQ = ''; renderGrid(); }
    else if (setting('view') === 'wish') { S.wishQ = ''; renderGrid(); }
    else if (isAlbum()) { S.albumQ = ''; S.albumHit = -1; }
    else setF('q', '');
    q.focus();
  });

  // widoki
  document.querySelector('.views').addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (!b || b.dataset.view === setting('view')) return;
    S.store.settings.view = b.dataset.view;
    saveStore();
    $('#filters').hidden = true;
    $('#filterBtn').setAttribute('aria-expanded', 'false');
    renderGrid();
    window.scrollTo(0, 0);
  });

  $('#fOwned').addEventListener('change', e => setF('owned', e.target.value));
  $('#fGen').addEventListener('change', e => setF('gen', e.target.value));
  $('#fSet').addEventListener('change', e => {
    S.store.filters.set = e.target.value;
    if (!e.target.value && F().sort === 'set') S.store.filters.sort = 'dex';
    if (e.target.value && (F().sort || 'dex') === 'dex') S.store.filters.sort = 'set';
    syncFilterInputs(); saveStore(); renderGrid();
  });
  $('#fNum').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => setF('num', e.target.value.trim()), 200); });
  $('#fSort').addEventListener('change', e => setF('sort', e.target.value));
  $('#typeChips').addEventListener('click', e => {
    const ch = e.target.closest('.chip');
    if (!ch) return;
    const types = new Set(F().types || []);
    types.has(ch.dataset.type) ? types.delete(ch.dataset.type) : types.add(ch.dataset.type);
    S.store.filters.types = [...types];
    syncFilterInputs(); saveStore(); renderGrid();
  });
  const toggleFilters = open => {
    $('#filters').hidden = !open;
    $('#filterBtn').setAttribute('aria-expanded', String(open));
  };
  $('#filterBtn').addEventListener('click', () => toggleFilters($('#filters').hidden));
  $('#closeFilters').addEventListener('click', () => toggleFilters(false));
  $('#clearFilters').addEventListener('click', () => {
    S.store.filters = { q: F().q };
    syncFilterInputs(); saveStore(); renderGrid();
  });

  // siatka
  $('#grid').addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      e.stopPropagation();
      const id = +tg.dataset.toggle;
      if (setOwned(id, !isOwned(id))) {
        if (!isAlbum() && F().owned) renderGrid(); else refreshTile(id);
      }
      return;
    }
    const setRow = e.target.closest('[data-set]');
    if (setRow) { openSet(setRow.dataset.set); return; }
    const albumSortBtn = e.target.closest('[data-album-sort]');
    if (albumSortBtn) { S.store.settings.albumSort = albumSortBtn.dataset.albumSort; saveStore(); renderGrid(); return; }
    const showBtn = e.target.closest('[data-sets-show]');
    if (showBtn) { S.store.settings.setsShow = showBtn.dataset.setsShow; saveStore(); renderGrid(); return; }
    const tile = e.target.closest('.tile[data-id]');
    if (tile) openDetail(+tile.dataset.id);
  });
  $('#grid').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.tile[data-id]')) e.target.click();
  });

  // szczegóły
  $('#dClose').addEventListener('click', () => closeDetail());
  $('#dPrev').addEventListener('click', () => go(-1));
  $('#dNext').addEventListener('click', () => go(1));
  document.addEventListener('keydown', e => {
    if ($('#detail').hidden || document.querySelector('dialog[open]')) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Escape') closeDetail();
  });
  window.addEventListener('popstate', () => {
    const st = history.state || {};
    if (!$('#detail').hidden && !st.dex) closeDetail(true);
    if (typeof closeSet === 'function' && !$('#setView').hidden && !st.set) closeSet(true);
    if (typeof closeScanner === 'function' && !$('#scanner').hidden && !st.scan) closeScanner(true);
  });
  $('#dInner').addEventListener('click', e => {
    const pk = S.byId.get(S.cur);
    if (e.target.closest('#ownToggle')) {
      if (setOwned(pk.id, !isOwned(pk.id))) { renderDetail(); toast(isOwned(pk.id) ? t('added', pk.name) : t('removed', pk.name)); }
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) { openCardDialog(add.dataset.add); return; }
    const card = e.target.closest('[data-card]');
    if (card) { openCardDialog(card.dataset.card); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      S.store.owned[pk.id].cards.splice(+rm.dataset.remove, 1);
      saveStore(); renderDetail();
      return;
    }
    const ser = e.target.closest('[data-series]');
    if (ser) { D.series = ser.dataset.series; D.limit = CARD_PAGE; rerenderTcg(); return; }
    const sub = e.target.closest('[data-sub]');
    if (sub) { D.sub = sub.dataset.sub; D.limit = CARD_PAGE; rerenderTcg(); return; }
    if (e.target.closest('#moreCards')) { D.limit += CARD_PAGE * 2; rerenderTcg(); }
  });
  $('#dInner').addEventListener('change', e => {
    const sel = e.target.closest('[data-variant]');
    if (!sel) return;
    S.store.owned[S.cur].cards[+sel.dataset.variant].v = sel.value;
    saveStore(); toast(t('variantSaved'));
  });
  $('#dInner').addEventListener('input', e => {
    if (e.target.id !== 'cardFilter') return;
    D.q = e.target.value; D.limit = CARD_PAGE; rerenderTcg();
  });
  setupSwipe();

  // dialog karty
  $('#cardDlg').addEventListener('click', e => {
    if (e.target === e.currentTarget || e.target.closest('[data-close]')) { e.currentTarget.close(); return; }
    const btn = e.target.closest('#dlgAdd');
    if (btn) {
      const fromWish = addCard(+btn.dataset.dex, btn.dataset.card, $('#variantSel').value);
      e.currentTarget.close();
      afterCardChange();
      toast(fromWish ? t('cardAddedWish') : t('cardAdded'));
      if (typeof scannerAfterAdd === 'function') scannerAfterAdd();
      return;
    }
    const crm = e.target.closest('[data-copy-rm]');
    if (crm) {
      const ref = copyByKey(crm.dataset.copyRm);
      const cardId = ref?.list[ref.i]?.id;
      if (ref) { ref.list.splice(ref.i, 1); saveStore(); }
      afterCardChange();
      toast(t('cardRemoved'));
      if (cardId) openCardDialog(cardId);
      return;
    }
    const rmb = e.target.closest('#dlgRemove');
    if (rmb) {
      removeOneCard(rmb.dataset.card);
      e.currentTarget.close();
      afterCardChange();
      toast(t('cardRemoved'));
    }
  });

  $('#scanBtn').addEventListener('click', () => openScanner());
  bindSets();
  bindScanner();
  bindPrices();
  bindWish();

  // zmiana wariantu posiadanego egzemplarza / karty z listy życzeń (w oknie karty)
  $('#cardDlg').addEventListener('change', e => {
    const cs = e.target.closest('[data-copy]');
    if (cs) {
      const ref = copyByKey(cs.dataset.copy);
      if (ref && ref.list[ref.i]) { ref.list[ref.i].v = cs.value; saveStore(); afterCardChange(); toast(t('variantSaved')); }
      const tag = cs.parentElement.querySelector('.price-tag');
      if (tag && typeof priceTag === 'function') tag.outerHTML = priceTag(ref.list[ref.i].id, cs.value) || '';
      return;
    }
    const ws = e.target.closest('[data-wish-variant]');
    if (ws) {
      const w = S.store.wish.find(x => x.id === ws.dataset.wishVariant);
      if (w) { w.v = ws.value; saveStore(); afterCardChange(); toast(t('variantSaved')); }
    }
  });

  // ustawienia
  const sd = $('#settingsDlg');
  $('#settingsBtn').addEventListener('click', () => {
    $('#sLang').value = LANG;
    $('#sPocket').value = String(setting('pocket'));
    $('#sOffset').value = String(setting('offset'));
    $('#sPages').checked = !!setting('pages');
    $('#sCardImg').checked = !!setting('cardImg');
    $('#sHd').checked = !!setting('hd');
    updateDataInfo();
    sd.showModal();
  });
  sd.addEventListener('click', e => { if (e.target === sd || e.target.closest('[data-close]')) sd.close(); });
  const setS = (k, v) => { S.store.settings[k] = v; saveStore(); renderGrid(); };
  $('#sLang').addEventListener('change', e => {
    S.store.settings.lang = e.target.value; saveStore();
    applyLang(); updateDataInfo(); renderGrid();
  });
  $('#sPocket').addEventListener('change', e => setS('pocket', +e.target.value));
  $('#sOffset').addEventListener('change', e => {
    const v = Math.min(+setting('pocket'), Math.max(1, parseInt(e.target.value, 10) || 1));
    e.target.value = v; setS('offset', v);
  });
  $('#sPages').addEventListener('change', e => setS('pages', e.target.checked));
  $('#sCardImg').addEventListener('change', e => setS('cardImg', e.target.checked));
  $('#sHd').addEventListener('change', e => setS('hd', e.target.checked));
  $('#exportBtn').addEventListener('click', exportCSV);
  $('#checkUpdBtn').addEventListener('click', checkUpdate);
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const merge = $('#importMerge').checked;
    if (!merge && Object.keys(S.store.owned).length && !confirm(t('importReplace'))) return;
    try {
      const { nPk, nCards, nWish } = importCSV(await file.text(), merge);
      updateDataInfo(); renderGrid();
      toast(t('importDone', nPk, nCards) + (nWish ? ` · ♥ ${nWish}` : ''));
    } catch (err) { alert(t('importError') + err.message); }
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm(t('resetConfirm'))) return;
    S.store.owned = {}; S.store.other = []; saveStore(); updateDataInfo(); renderGrid(); toast(t('resetDone'));
  });
}

// ===== Start =====
async function main() {
  loadStore();
  applyLang();
  try {
    await loadData();
  } catch (e) {
    $('#status').textContent = t('loadError');
    console.error(e);
    return;
  }
  buildFilterUI();
  syncFilterInputs();
  bindEvents();
  renderGrid();
  const fromHash = parseInt(location.hash.slice(1), 10);
  if (S.byId.has(fromHash)) {
    history.replaceState(null, '', location.pathname + location.search);
    openDetail(fromHash);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'version') { swVersion = e.data.version; if ($('#settingsDlg').open) renderVersion(); }
    });
    navigator.serviceWorker.addEventListener('controllerchange', askSwVersion);
    askSwVersion();
  }
}
document.addEventListener("DOMContentLoaded", main);
