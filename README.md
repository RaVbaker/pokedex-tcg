# Pokédex TCG

Prosta strona (PWA) w stylu National Pokédex do zbierania kart Pokémon TCG i układania ich w albumie w kolejności numerów.

## Co potrafi

- **1025 stworków** w kolejności National Pokédex — każdy jako mini-karta: obrazek, nazwa, numer, typ(y), wzrost i waga, liczba kart TCG i pozycja w albumie (`s.3·7` = strona 3, kieszonka 7).
- **Strony albumu** — siatka podzielona na strony (4/9/12/16 kieszonek, ustawiane w ⚙︎), z licznikiem „mam X/9” na każdej stronie. Przy filtrze „Mam/Brakuje” puste kieszonki pokazują się jako przerywane ramki.
- **Mój album** — drugi widok: wszystkie strony albumu po kolei, stworki których nie masz są wyszarzone, a tam gdzie masz konkretną kartę, widać jej obrazek. Wyszukiwarka w tym widoku przewija do stworka (Enter = następne trafienie).
- **Szczegóły stworka** — duża karta z artworkiem; **swipe w lewo/prawo** (albo strzałki ‹ › / klawiatura) zawsze przechodzi do poprzedniego/następnego numeru Pokédex, niezależnie od filtrów.
- **Zestawy** — trzeci widok: wszystkie zestawy kart pogrupowane według serii, z paskiem kompletności (np. `87/165`, osobno karty sekretne). Filtr: wszystkie / rozpoczęte / ukończone. Po wejściu w zestaw — lista wszystkich kart w kolejności numerów (brakujące wyszarzone), tapnięcie dodaje lub usuwa egzemplarz. Liczą się też trenerzy i energie.
- **Skaner kart** (ikona w nagłówku) — kamera z ramką w kształcie karty albo zdjęcie z galerii. OCR (Tesseract.js, działa lokalnie w przeglądarce) czyta nazwę i numer w zestawie (`025/165`, `TG05/TG30`, `SWSH123`) i pokazuje pasujące karty do potwierdzenia. Po dodaniu karty skaner wraca do kamery — można szybko wprowadzić cały stos. Nazwę i numer da się poprawić ręcznie. Karty z dwoma numerami (np. 30th Celebration: `034/151` i `16/30`) są sprawdzane po obu. Przycisk **1× / 1,5× / 2× / 2,5×** (u góry) powiększa obraz: iPhone udostępnia stronie tylko jeden tylny aparat, który z bliska sam przełącza się na obiektyw makro (obraz skacze) — najlepiej trzymać telefon dalej (~25–30 cm) i ustawić 2×. Powiększenie jest natywne, jeśli przeglądarka je obsługuje, w przeciwnym razie cyfrowe; wybór jest zapamiętywany. Przycisk **Aparat** pojawia się, gdy przeglądarka udostępnia więcej niż jeden tylny aparat.
- **Ceny kart** z [PokéWallet API](https://pokewallet.io) — Cardmarket (EUR) i TCGplayer (USD) w oknie karty (warianty: normal, holo, reverse), cena przy „Moich kartach” i na kartach w widoku zestawu, wartość posiadanych kart z zestawu oraz **wycena całej kolekcji** (⚙︎ → Ceny kart; po 30 kart na kliknięcie, żeby nie wyczerpać limitu). Wymaga własnego klucza API (⚙︎ → Ceny kart → „Zapisz i sprawdź”); klucz jest trzymany tylko w localStorage przeglądarki, nie trafia do CSV. Pobrane ceny są zapisywane w przeglądarce razem z datą; ważność ustawiasz w ⚙︎ (1 / 7 / 30 dni albo bez wygasania, domyślnie 7). „Wyceń kolekcję” dociąga tylko karty bez ceny i z przeterminowaną ceną, a status pokazuje zakres dat cen. Eksport CSV zawiera kolumny `price`, `currency`, `price_date` (z zapisanych cen, bez zapytań do API). Dane: „Data by PokéWallet”.
- **Lista życzeń** — czwarta zakładka „Życzenia”. Brakującą kartę dodajesz przyciskiem ♡ w oknie karty (z Pokédexu, zestawu, skanera); serduszko widać też w widoku zestawu i na liście kart stworka. Dodanie karty do kolekcji zdejmuje ją z listy. Wartość listy liczona z zapisanych cen. Lista jest w eksporcie/imporcie CSV (kolumna `wishlist` = 1).
- **Informacje o karcie** — rzadkość z opisowym poziomem (pospolita → najrzadsza), rodzaj (Pokémon/Trener/Energia, Basic, Stage 1, ex, V…), typ energii, HP, ilustrator, znak regulacji. Szans wypadnięcia z boostera (pull rate) nie ma w danych.
- **Licznik kart** — w nagłówku: ile stworków i ile kart masz; na kafelku żółta plakietka z liczbą, gdy masz więcej niż jedną kartę danego stworka.
- **Język interfejsu**: polski lub angielski (⚙︎; domyślnie wg języka przeglądarki).
- **Karty TCG** z bazy [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data): ile kart ma stworek, w których seriach (chipy z licznikami), jakiego rodzaju (Basic, ex, V, VMAX, GX…), z numerem w zestawie, rzadkością i rokiem. Tapnięcie pokazuje dużą kartę.
- **Kolekcja** — kółko ✓ na kafelku (albo przycisk w szczegółach) oznacza stworka jako posiadanego. W szczegółach `+` przy karcie dopisuje konkretną kartę: kolekcję (zestaw + numer) i typ karty (Normal, Holo, Reverse Holo, 1st Edition…).
- **Filtry i wyszukiwanie** (✕ czyści pole): nazwa (ang.), numer (`25`, `#25`), zakres (`1-151`), typ (kilka = wszystkie naraz, np. Fire+Flying), generacja, posiadanie, kolekcja kart (zestaw) i numer w kolekcji (`25` lub `25/165`), sortowanie: nr Pokédex, nazwa, typ (grupy wg typu) lub kolejność w zestawie.
- **Zapis w localStorage** + **eksport/import CSV** (⚙︎). Eksport zawiera wszystkich 1025 stworków (`owned` 0/1) — nadaje się też jako checklista w arkuszu. Import przyjmuje separator `,` lub `;`, kolumny `dex`, `owned`, `card_id` albo `set_id` + `card_number`, `variant`.
- **PWA** — da się dodać do ekranu głównego, działa offline (dane i odwiedzone obrazki stworków są w cache).

**Strona:** https://ravbaker.github.io/pokedex-tcg/

Na telefonie: otwórz stronę w Safari → „Udostępnij → Do ekranu początkowego” (Android/Chrome: „Zainstaluj aplikację”).

## Uruchomienie lokalnie

Strona musi być serwowana przez HTTP(S) (nie `file://`), np.:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Publikacja (GitHub Pages)

Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`. Plik `.nojekyll` wyłącza przetwarzanie Jekyllem — pliki idą 1:1.

## Dane

| Plik | Źródło | Zawartość |
|---|---|---|
| `data/pokemon.json` | [PokeAPI](https://github.com/PokeAPI/pokeapi) (CSV) | `[nr, nazwa, [typy], wzrost dm, waga hg, generacja]` |
| `data/cards.json` | [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | zestawy (z symbolami) + wszystkie karty: Pokémon, trenerzy, energie |

Obrazki stworków ładują się z [PokeAPI/sprites](https://github.com/PokeAPI/sprites), obrazki kart z `images.pokemontcg.io` / `images.scrydex.com`.

Aktualizacja danych (np. po wyjściu nowego zestawu):

```sh
python3 tools/build_data.py      # pobiera źródła do .cache/ i przebudowuje data/*.json
```

Po zmianie plików podbij wersję w **dwóch miejscach**: `APP_VERSION`/`APP_DATE` w `app.js` i `VERSION` w `sw.js` (np. `6` i `v6`). Numer widać w ⚙︎ (przy tytule i w sekcji „O aplikacji”, razem z wersją działającego service workera); przycisk „Sprawdź aktualizacje” pobiera nową wersję i przeładowuje stronę.

## Pliki

```
.nojekyll             # GitHub Pages bez Jekylla
index.html            # układ strony
styles.css            # wygląd (Pokédex, karty, ciemny tryb)
app.js                # logika: dane, filtry, album, swipe, kolekcja, CSV, i18n
sets.js               # widok Zestawy (kompletność)
scanner.js            # skaner: kamera/zdjęcie + OCR + dopasowanie kart
prices.js             # ceny z PokéWallet API (klucz, cache 24 h, wycena kolekcji)
vendor/tesseract/     # Tesseract.js 7 + model OCR „eng” (lokalnie, offline; licencja Apache-2.0)
sw.js                 # service worker (offline)
manifest.webmanifest  # PWA
icons/                # ikony (tools/make_icons.py)
data/                 # dane wygenerowane przez tools/build_data.py
```

Pokémon i nazwy postaci są znakami towarowymi Nintendo / Game Freak / The Pokémon Company. To nieoficjalne, niekomercyjne narzędzie fanowskie, niezwiązane z tymi firmami.
