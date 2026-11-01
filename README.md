# Pokédex TCG

Prosta strona (PWA) w stylu National Pokédex do zbierania kart Pokémon TCG i układania ich w albumie w kolejności numerów.

## Co potrafi

- **1025 stworków** w kolejności National Pokédex — każdy jako mini-karta: obrazek, nazwa, numer, typ(y), wzrost i waga, liczba kart TCG i pozycja w albumie (`s.3·7` = strona 3, kieszonka 7).
- **Strony albumu** — siatka podzielona na strony (4/9/12/16 kieszonek, ustawiane w ⚙︎), z licznikiem „mam X/9” na każdej stronie. Przy filtrze „Mam/Brakuje” puste kieszonki pokazują się jako przerywane ramki.
- **Szczegóły stworka** — duża karta z artworkiem; **swipe w lewo/prawo** (albo strzałki ‹ › / klawiatura) przechodzi do kolejnego stworka z bieżącej listy.
- **Karty TCG** z bazy [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data): ile kart ma stworek, w których seriach (chipy z licznikami), jakiego rodzaju (Basic, ex, V, VMAX, GX…), z numerem w zestawie, rzadkością i rokiem. Tapnięcie pokazuje dużą kartę.
- **Kolekcja** — kółko ✓ na kafelku (albo przycisk w szczegółach) oznacza stworka jako posiadanego. W szczegółach `+` przy karcie dopisuje konkretną kartę: kolekcję (zestaw + numer) i typ karty (Normal, Holo, Reverse Holo, 1st Edition…).
- **Filtry i wyszukiwanie**: nazwa (ang.), numer (`25`, `#25`), zakres (`1-151`), typ (kilka = wszystkie naraz, np. Fire+Flying), generacja, posiadanie, kolekcja kart (zestaw) i numer w kolekcji (`25` lub `25/165`), sortowanie po kolejności w zestawie.
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
| `data/cards.json` | [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | zestawy + karty Pokémon (bez trenerów i energii) |

Obrazki stworków ładują się z [PokeAPI/sprites](https://github.com/PokeAPI/sprites), obrazki kart z `images.pokemontcg.io` / `images.scrydex.com`.

Aktualizacja danych (np. po wyjściu nowego zestawu):

```sh
python3 tools/build_data.py      # pobiera źródła do .cache/ i przebudowuje data/*.json
```

Po zmianie plików podbij `VERSION` w `sw.js`, żeby telefony pobrały nową wersję.

## Pliki

```
.nojekyll             # GitHub Pages bez Jekylla
index.html            # układ strony
styles.css            # wygląd (Pokédex, karty, ciemny tryb)
app.js                # logika: dane, filtry, album, swipe, kolekcja, CSV
sw.js                 # service worker (offline)
manifest.webmanifest  # PWA
icons/                # ikony (tools/make_icons.py)
data/                 # dane wygenerowane przez tools/build_data.py
```

Pokémon i nazwy postaci są znakami towarowymi Nintendo / Game Freak / The Pokémon Company. To nieoficjalne, niekomercyjne narzędzie fanowskie, niezwiązane z tymi firmami.
