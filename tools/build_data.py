#!/usr/bin/env python3
"""Buduje pliki danych dla Pokédex TCG.

Źródła (wszystko z GitHuba, bez kluczy API):
  * PokeAPI/pokeapi  – data/v2/csv  (gatunki, nazwy, typy, wzrost, waga)
  * PokemonTCG/pokemon-tcg-data – sets/en.json + cards/en/<set>.json

Użycie:
  python3 tools/build_data.py [katalog_cache]

Wynik: data/pokemon.json oraz data/cards.json (kompaktowe tablice).

Wiersz karty: [set_idx, numer, nazwa, rarity_idx, [subtype_idx], dex (0 = brak), supertype_idx, (id), (obrazek)]
Zestaw: [id, nazwa, seria, printedTotal, data, kod, symbol_url, logo_url]
"""
import csv
import io
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache")

PKAPI = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
TCG = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/"

TYPES = {  # type_id z PokeAPI -> nazwa angielska
    1: "Normal", 2: "Fighting", 3: "Flying", 4: "Poison", 5: "Ground",
    6: "Rock", 7: "Bug", 8: "Ghost", 9: "Steel", 10: "Fire", 11: "Water",
    12: "Grass", 13: "Electric", 14: "Psychic", 15: "Ice", 16: "Dragon",
    17: "Dark", 18: "Fairy",
}


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    with open(path, "rb") as f:
        return f.read()


def rows(name):
    text = fetch(PKAPI + name, name).decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def build_pokemon():
    species = {int(r["id"]): r for r in rows("pokemon_species.csv")}
    names = {}
    for r in rows("pokemon_species_names.csv"):
        if r["local_language_id"] == "9":
            names[int(r["pokemon_species_id"])] = r["name"]
    poke = {int(r["id"]): r for r in rows("pokemon.csv") if r["is_default"] == "1"}
    types = {}
    for r in rows("pokemon_types.csv"):
        types.setdefault(int(r["pokemon_id"]), []).append((int(r["slot"]), TYPES.get(int(r["type_id"]))))
    out = []
    for sid in sorted(species):
        p = poke.get(sid)
        if not p:
            continue
        t = [n for _, n in sorted(types.get(sid, [])) if n]
        out.append([
            sid,
            names.get(sid, species[sid]["identifier"].title()),
            t,
            int(p["height"] or 0),   # decymetry
            int(p["weight"] or 0),   # hektogramy
            int(species[sid]["generation_id"]),
        ])
    return out


def build_cards():
    sets = json.loads(fetch(TCG + "sets/en.json", "tcg/sets.json"))
    sets.sort(key=lambda s: (s.get("releaseDate", ""), s["id"]))

    def get(s):
        return s, json.loads(fetch(TCG + f"cards/en/{s['id']}.json", f"tcg/cards/{s['id']}.json"))

    with ThreadPoolExecutor(12) as ex:
        loaded = list(ex.map(get, sets))

    rarities, subtypes, supertypes = [], [], []
    def idx(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    out_sets, out_cards = [], []
    for si, (s, cards) in enumerate(loaded):
        imgs = s.get("images", {})
        out_sets.append([
            s["id"], s["name"], s.get("series", ""), s.get("printedTotal") or s.get("total") or 0,
            s.get("releaseDate", "").replace("/", "-"), s.get("ptcgoCode", ""),
            imgs.get("symbol", ""), imgs.get("logo", ""),
        ])
        for c in cards:
            dex = c.get("nationalPokedexNumbers") or []
            num = c["number"]
            small = c.get("images", {}).get("small", "")
            std = f"https://images.pokemontcg.io/{s['id']}/{num}.png"
            row = [
                si, num, c["name"],
                idx(rarities, c.get("rarity") or ""),
                [idx(subtypes, t) for t in c.get("subtypes", [])],
                (dex if len(dex) > 1 else dex[0]) if dex else 0,
                idx(supertypes, c.get("supertype") or ""),
            ]
            cid = c["id"] if c["id"] != f"{s['id']}-{num}" else 0
            img = small if small and small != std else 0
            if cid or img:
                row += [cid, img]
            out_cards.append(row)
    return {"sets": out_sets, "rarities": rarities, "subtypes": subtypes, "supertypes": supertypes, "cards": out_cards}


def main():
    os.makedirs(OUT, exist_ok=True)
    pokemon = build_pokemon()
    cards = build_cards()
    with open(os.path.join(OUT, "pokemon.json"), "w", encoding="utf-8") as f:
        json.dump(pokemon, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "cards.json"), "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))
    print(f"pokemon: {len(pokemon)}  sets: {len(cards['sets'])}  cards: {len(cards['cards'])}")


if __name__ == "__main__":
    main()
