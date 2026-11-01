/* Pokédex TCG — National Pokédex + karty Pokémon TCG
 * Dane: data/pokemon.json, data/cards.json (budowane przez tools/build_data.py)
 * Kolekcja: localStorage, eksport/import CSV.
 */
'use strict';

// ===== Stałe =====
const LS_KEY = 'pokedex-tcg:v1';
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const ART = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const TYPE_COLORS = {
  Normal: '#A8A77A', Fire: '#EE8130', Water: '#6390F0', Electric: '#F7D02C', Grass: '#7AC74C',
  Ice: '#96D9D6', Fighting: '#C22E28', Poison: '#A33EA1', Ground: '#E2BF65', Flying: '#A98FF3',
  Psychic: '#F95587', Bug: '#A6B91A', Rock: '#B6A136', Ghost: '#735797', Dragon: '#6F35FC',
  Dark: '#705746', Steel: '#B7B7CE', Fairy: '#D685AD',
};
const GENS = ['', 'I · Kanto', 'II · Johto', 'III · Hoenn', 'IV · Sinnoh', 'V · Unova', 'VI · Kalos', 'VII · Alola', 'VIII · Galar', 'IX · Paldea'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const VARIANTS = ['Normal', 'Holo', 'Reverse Holo', '1st Edition', 'Shadowless', 'Promo / Stamped', 'Inny'];
const COLS = { 4: 2, 9: 3, 12: 4, 16: 4 };
const CARD_PAGE = 60; // ile kart TCG pokazać naraz w szczegółach

// ===== Stan =====
const S = {
  pokemon: [], byId: new Map(),
  sets: [], cards: [], cardsByDex: new Map(), cardById: new Map(),
  filtered: [], cur: -1,
  store: { owned: {}, settings: {}, filters: {} },
};
const defaults = { pocket: 9, offset: 1, pages: true, hd: false };

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[♀]/g, ' f').replace(/[♂]/g, ' m');
const normNum = s => String(s).trim().toLowerCase().replace(/^0+(?=\d)/, '');
const pad = n => '#' + String(n).padStart(4, '0');
const fmt1 = v => (v / 10).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (n === 1) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// ===== Persystencja =====
function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S.store.owned = d.owned || {};
      S.store.settings = d.settings || {};
      S.store.filters = d.filters || {};
    }
  } catch (e) { console.warn('localStorage niedostępny', e); }
}
function saveStore() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S.store)); }
  catch (e) { toast('Nie udało się zapisać danych w przeglądarce'); }
}
const setting = k => (k in S.store.settings ? S.store.settings[k] : defaults[k]);

// ===== Dane =====
async function loadData() {
  const [p, c] = await Promise.all([
    fetch('data/pokemon.json').then(r => r.json()),
    fetch('data/cards.json').then(r => r.json()),
  ]);
  S.pokemon = p.map(([id, name, types, h, w, gen]) => ({ id, name, types, h, w, gen, key: norm(name) }));
  S.pokemon.forEach(pk => S.byId.set(pk.id, pk));

  S.sets = c.sets.map(([id, name, series, total, date, code], i) => ({ i, id, name, series, total, date, code }));
  S.cards = c.cards.map(r => {
    const set = S.sets[r[0]];
    const num = r[1];
    const card = {
      set, num, name: r[2],
      rarity: c.rarities[r[3]] || '',
      sub: r[4].map(i => c.subtypes[i]),
      dex: Array.isArray(r[5]) ? r[5] : [r[5]],
      id: r[6] || `${set.id}-${num}`,
      img: r[7] || `https://images.pokemontcg.io/${set.id}/${num}.png`,
      nn: normNum(num),
    };
    return card;
  });
  for (const card of S.cards) {
    S.cardById.set(card.id, card);
    for (const d of card.dex) {
      if (!S.cardsByDex.has(d)) S.cardsByDex.set(d, []);
      S.cardsByDex.get(d).push(card);
    }
  }
}
const largeImg = url => url.includes('images.pokemontcg.io') ? url.replace(/\.png$/, '_hires.png') : url.replace(/\/small$/, '/large');
const numSort = (a, b) => {
  const pa = parseInt(a.num, 10), pb = parseInt(b.num, 10);
  if (!isNaN(pa) && !isNaN(pb) && pa !== pb) return pa - pb;
  return a.num.localeCompare(b.num, 'en', { numeric: true });
};

// ===== Album =====
function albumPos(id) {
  const P = +setting('pocket');
  const pos = id - 1 + (Math.max(1, +setting('offset') || 1) - 1);
  return { page: Math.floor(pos / P) + 1, slot: (pos % P) + 1 };
}

// ===== Filtry =====
const F = () => S.store.filters;
function activeFilterCount() {
  const f = F();
  return (f.types?.length || 0) + (f.owned ? 1 : 0) + (f.gen ? 1 : 0) + (f.set ? 1 : 0) + (f.num ? 1 : 0) + (f.sort && f.sort !== 'dex' ? 1 : 0);
}
function setCardsFor(pk) {
  // karty tego stworka pasujące do filtra zestawu / numeru
  const f = F();
  if (!f.set && !f.num) return null;
  const n = f.num ? normNum(String(f.num).split('/')[0]) : '';
  return (S.cardsByDex.get(pk.id) || []).filter(c => (!f.set || c.set.id === f.set) && (!n || c.nn === n));
}
function applyFilters() {
  const f = F();
  const q = (f.q || '').trim();
  let test = () => true;
  let m;
  if ((m = q.match(/^#?(\d+)\s*[-–]\s*#?(\d+)$/))) {
    const a = +m[1], b = +m[2];
    test = pk => pk.id >= Math.min(a, b) && pk.id <= Math.max(a, b);
  } else if ((m = q.match(/^#?(\d+)$/))) {
    const n = +m[1];
    test = pk => pk.id === n;
  } else if (q) {
    const k = norm(q);
    test = pk => pk.key.includes(k);
  }
  const types = f.types || [];
  const owned = S.store.owned;
  let list = S.pokemon.filter(pk =>
    test(pk) &&
    types.every(t => pk.types.includes(t)) &&
    (!f.gen || pk.gen === +f.gen) &&
    (f.owned !== 'owned' || owned[pk.id]) &&
    (f.owned !== 'missing' || !owned[pk.id])
  );
  if (f.set || f.num) {
    list = list.filter(pk => setCardsFor(pk).length);
  }
  const sort = f.sort || 'dex';
  if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'en'));
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
function tileHTML(pk) {
  const owned = S.store.owned[pk.id];
  const hd = setting('hd');
  const cards = S.cardsByDex.get(pk.id) || [];
  const sc = setCardsFor(pk);
  const { page, slot } = albumPos(pk.id);
  const foot = sc && sc.length
    ? `<b>${esc(sc.slice(0, 2).map(c => c.num).join(', '))}${sc.length > 2 ? '…' : ''}</b><span>${esc(sc[0].set.code || '')}</span>`
    : `<span>${cards.length} kart</span><span>s.${page}·${slot}</span>`;
  return `<article class="tile${owned ? ' owned' : ''}" data-id="${pk.id}" style="${typeVars(pk.types)}" tabindex="0" aria-label="${esc(pk.name)} ${pad(pk.id)}">
    <div class="tile-in">
      <div class="tile-top"><span class="tile-no">${pad(pk.id)}</span><button class="tile-check" data-toggle="${pk.id}" aria-label="${owned ? 'Mam' : 'Nie mam'}: ${esc(pk.name)}" aria-pressed="${!!owned}">✓</button></div>
      <div class="tile-img"><img loading="lazy" decoding="async" crossorigin="anonymous" alt="" src="${hd ? ART(pk.id) : SPRITE(pk.id)}"${hd ? ' class="hd"' : ''} onerror="this.onerror=null;this.className='hd';this.src='${hd ? SPRITE(pk.id) : ART(pk.id)}'"></div>
      <div class="tile-name">${esc(pk.name)}</div>
      <div class="tile-types">${pk.types.map(t => `<i style="--tc:${TYPE_COLORS[t]}">${t}</i>`).join('')}</div>
      <div class="tile-meta">${fmt1(pk.h)} m · ${fmt1(pk.w)} kg</div>
      <div class="tile-foot">${foot}</div>
    </div>
  </article>`;
}
function renderGrid() {
  applyFilters();
  const grid = $('#grid');
  const list = S.filtered;
  const ownedCount = Object.keys(S.store.owned).length;
  const total = S.pokemon.length;
  $('#progressFill').style.width = (ownedCount / total * 100).toFixed(1) + '%';
  $('#progressText').textContent = `Mam ${ownedCount} / ${total}`;
  const fc = activeFilterCount();
  $('#filterCount').hidden = !fc;
  $('#filterCount').textContent = fc;

  const visOwned = list.filter(pk => S.store.owned[pk.id]).length;
  $('#status').textContent = list.length === total
    ? `${total} stworków · ${S.cards.length.toLocaleString('pl-PL')} kart TCG w ${S.sets.length} zestawach`
    : `Widoczne: ${list.length} · mam z nich ${visOwned}`;

  if (!list.length) { grid.innerHTML = '<p class="empty">Nic nie pasuje do filtrów.</p>'; return; }

  const pagesMode = setting('pages') && (F().sort || 'dex') === 'dex';
  if (!pagesMode) {
    grid.innerHTML = `<div class="flat">${list.map(tileHTML).join('')}</div>`;
    return;
  }
  // Grupowanie na strony albumu — puste miejsca pokazane jako "duchy"
  const P = +setting('pocket');
  const offset = Math.max(1, +setting('offset') || 1) - 1;
  const inList = new Set(list.map(pk => pk.id));
  const pages = [...new Set(list.map(pk => albumPos(pk.id).page))];
  const out = [];
  for (const page of pages) {
    const startPos = (page - 1) * P;
    let cells = '', have = 0, slots = 0;
    for (let s = 0; s < P; s++) {
      const id = startPos + s - offset + 1;
      const pk = S.byId.get(id);
      if (!pk) { cells += `<div class="tile ghost" aria-hidden="true"></div>`; continue; }
      slots++;
      if (S.store.owned[id]) have++;
      cells += inList.has(id) ? tileHTML(pk) : `<div class="tile ghost" aria-hidden="true">${pad(id)}</div>`;
    }
    const firstId = Math.max(1, startPos - offset + 1), lastId = Math.min(total, startPos + P - offset);
    out.push(`<section class="page"><div class="page-head"><b>Strona ${page}</b><span>${pad(firstId)}–${pad(lastId)}</span><span class="${have === slots ? 'done' : ''}">${have}/${slots}</span></div>
      <div class="page-grid" style="--cols:${COLS[P] || 3}">${cells}</div></section>`);
  }
  grid.innerHTML = `<div class="pages">${out.join('')}</div>`;
}

// ===== Posiadanie =====
function isOwned(id) { return !!S.store.owned[id]; }
function setOwned(id, on) {
  if (on) {
    if (!S.store.owned[id]) S.store.owned[id] = { t: Date.now(), cards: [] };
  } else {
    const o = S.store.owned[id];
    if (o && o.cards.length && !confirm(`Usunąć też ${o.cards.length} ${plural(o.cards.length, 'zapisaną kartę', 'zapisane karty', 'zapisanych kart')}?`)) return false;
    delete S.store.owned[id];
  }
  saveStore();
  return true;
}
function addCard(dex, cardId, variant) {
  setOwned(dex, true);
  S.store.owned[dex].cards.push({ id: cardId, v: variant || 'Normal' });
  saveStore();
}
function ownedCountOf(dex, cardId) {
  return (S.store.owned[dex]?.cards || []).filter(c => c.id === cardId).length;
}

// ===== Szczegóły =====
const D = { series: '', sub: '', q: '', limit: CARD_PAGE };

function openDetail(idx, push = true) {
  if (idx < 0 || idx >= S.filtered.length) return;
  S.cur = idx;
  Object.assign(D, { series: '', sub: '', q: '', limit: CARD_PAGE });
  const el = $('#detail');
  const wasHidden = el.hidden;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  renderDetail();
  $('#dScroll').scrollTop = 0;
  const id = S.filtered[idx].id;
  if (push && wasHidden) history.pushState({ dex: id }, '', '#' + id);
  else history.replaceState({ dex: id }, '', '#' + id);
  // wstępnie załaduj sąsiadów
  [idx - 1, idx + 1].forEach(i => { const pk = S.filtered[i]; if (pk) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = ART(pk.id); } });
}
function closeDetail(fromPop = false) {
  const el = $('#detail');
  if (el.hidden) return;
  el.hidden = true;
  document.body.style.overflow = '';
  const id = S.filtered[S.cur]?.id;
  if (!fromPop && history.state && history.state.dex) history.back();
  renderGrid();
  if (id) {
    const t = document.querySelector(`.tile[data-id="${id}"]`);
    if (t) t.scrollIntoView({ block: 'center' });
  }
}

function renderDetail() {
  const pk = S.filtered[S.cur];
  if (!pk) return;
  const cards = S.cardsByDex.get(pk.id) || [];
  const sets = new Set(cards.map(c => c.set.id));
  const { page, slot } = albumPos(pk.id);
  const owned = S.store.owned[pk.id];
  $('#dPos').textContent = `${S.cur + 1} / ${S.filtered.length}`;
  $('#dPrev').disabled = S.cur <= 0;
  $('#dNext').disabled = S.cur >= S.filtered.length - 1;

  const html = `
    <article class="bigcard" style="${typeVars(pk.types)}">
      <div class="bigcard-in">
        <div class="bc-head"><h2 id="dName">${esc(pk.name)}</h2><span class="bc-no">${pad(pk.id)}</span></div>
        <div class="bc-art"><img src="${ART(pk.id)}" crossorigin="anonymous" alt="${esc(pk.name)}" onerror="this.onerror=null;this.src='${SPRITE(pk.id)}'"><span class="gen">Gen ${GENS[pk.gen]}</span></div>
        <div class="bc-types">${pk.types.map(t => `<i style="--tc:${TYPE_COLORS[t]}">${t}</i>`).join('')}</div>
        <dl class="bc-stats">
          <div><dt>Wzrost</dt><dd>${fmt1(pk.h)} m</dd></div>
          <div><dt>Waga</dt><dd>${fmt1(pk.w)} kg</dd></div>
          <div><dt>Album</dt><dd>s.${page} · ${slot}</dd></div>
        </dl>
        <div class="bc-foot"><span>${cards.length} ${plural(cards.length, 'karta', 'karty', 'kart')} TCG</span><span>${sets.size} ${plural(sets.size, 'zestaw', 'zestawy', 'zestawów')}</span></div>
      </div>
    </article>
    <button class="btn own-toggle${owned ? ' is-owned' : ''}" id="ownToggle">${owned ? '✓ Mam tego stworka' : 'Oznacz jako posiadany'}</button>
    ${ownedSectionHTML(pk)}
    <section class="section" id="tcgSection">${tcgSectionHTML(pk)}</section>`;
  $('#dInner').innerHTML = html;
}

function cardLine(c) {
  const year = c.set.date ? c.set.date.slice(0, 4) : '';
  const total = c.set.total ? '/' + c.set.total : '';
  return `<span><span class="num">${esc(c.num)}${total}</span> · ${esc(c.rarity || '—')}${c.sub.length ? ' · ' + esc(c.sub.join(', ')) : ''}${year ? ' · ' + year : ''}</span>`;
}
function ownedSectionHTML(pk) {
  const o = S.store.owned[pk.id];
  if (!o) return '';
  const rows = o.cards.map((oc, i) => {
    const c = S.cardById.get(oc.id);
    return `<li class="crow">
      ${c ? `<img class="thumb" loading="lazy" src="${esc(c.img)}" onerror="this.style.visibility='hidden'" alt="" data-card="${esc(c.id)}">` : '<span class="thumb"></span>'}
      <div class="info">${c ? `<b>${esc(c.set.name)}</b>${cardLine(c)}` : `<b>${esc(oc.id)}</b><span>nieznana karta</span>`}
        <select data-variant="${i}" aria-label="Typ karty">${VARIANTS.map(v => `<option${v === oc.v ? ' selected' : ''}>${v}</option>`).join('')}${VARIANTS.includes(oc.v) ? '' : `<option selected>${esc(oc.v)}</option>`}</select>
      </div>
      <button class="act rm" data-remove="${i}" aria-label="Usuń kartę">✕</button>
    </li>`;
  }).join('');
  return `<section class="section"><h3>Moje karty <small>${o.cards.length ? o.cards.length : 'wybierz z listy poniżej (+)'}</small></h3>
    ${o.cards.length ? `<ul class="clist">${rows}</ul>` : '<p class="muted small" style="margin:0">Masz tego stworka — możesz dopisać konkretną kartę: kolekcję i typ (np. Reverse Holo).</p>'}</section>`;
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
      ${have ? `<span class="have">✓${have > 1 ? have : ''}</span>` : ''}
      <button class="act" data-add="${esc(c.id)}" aria-label="Dodaj kartę do kolekcji">+</button>
    </li>`;
  }
  const chip = (kind, val, n, label) => `<button data-${kind}="${esc(val)}" aria-pressed="${D[kind] === val}">${esc(label)}<b>${n}</b></button>`;
  return `<h3>Karty TCG <small>${all.length} ${plural(all.length, 'karta', 'karty', 'kart')}</small></h3>
    <div class="summary-chips">${chip('series', '', all.length, 'Wszystkie serie')}${[...bySeries].map(([s, n]) => chip('series', s, n, s)).join('')}</div>
    ${bySub.size > 1 ? `<div class="summary-chips">${chip('sub', '', all.length, 'Każdy rodzaj')}${[...bySub].sort((a, b) => b[1] - a[1]).map(([s, n]) => chip('sub', s, n, s)).join('')}</div>` : ''}
    <input class="card-filter" id="cardFilter" type="search" placeholder="Szukaj: zestaw, kod, numer, rzadkość…" value="${esc(D.q)}" autocomplete="off">
    ${list.length ? `<ul class="clist">${rows}</ul>` : '<p class="muted">Brak kart dla tego filtra.</p>'}
    ${list.length > D.limit ? `<button class="btn ghost more" id="moreCards">Pokaż więcej (${list.length - D.limit})</button>` : ''}`;
}
function rerenderTcg() {
  const pk = S.filtered[S.cur];
  const sec = $('#tcgSection');
  const hadFocus = document.activeElement?.id === 'cardFilter';
  const pos = hadFocus ? document.activeElement.selectionStart : 0;
  sec.innerHTML = tcgSectionHTML(pk);
  if (hadFocus) { const i = $('#cardFilter'); i.focus(); i.setSelectionRange(pos, pos); }
}

// ===== Dialog karty =====
function openCardDialog(cardId) {
  const c = S.cardById.get(cardId);
  if (!c) return;
  const pk = S.filtered[S.cur];
  const dex = pk && c.dex.includes(pk.id) ? pk.id : c.dex[0];
  const have = ownedCountOf(dex, c.id);
  const guess = /holo|rare/i.test(c.rarity) && !/common|uncommon/i.test(c.rarity) ? 'Holo' : 'Normal';
  $('#cardDlgBody').innerHTML = `
    <div class="sheet-head"><h2>${esc(c.name)}</h2>
      <button class="icon-btn dark" data-close aria-label="Zamknij"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/></svg></button></div>
    <div class="card-view">
      <img class="big" src="${esc(largeImg(c.img))}" alt="${esc(c.name)}" onerror="this.onerror=null;this.src='${esc(c.img)}'">
      <div>
        <div><b>${esc(c.set.name)}</b> <span class="muted">(${esc(c.set.code || c.set.id)})</span></div>
        <div class="meta">Seria: ${esc(c.set.series)} · Nr <b>${esc(c.num)}${c.set.total ? '/' + c.set.total : ''}</b> · ${esc(c.rarity || '—')}</div>
        <div class="meta">${esc(c.sub.join(', ') || '—')} · Wydano: ${esc(c.set.date || '?')} · ID: ${esc(c.id)}</div>
        ${have ? `<div class="meta" style="color:var(--ok);font-weight:700">Masz ${have} ${plural(have, 'egzemplarz', 'egzemplarze', 'egzemplarzy')}</div>` : ''}
      </div>
      <label class="muted small" for="variantSel">Typ karty (wariant)</label>
      <div class="add-row">
        <select id="variantSel">${VARIANTS.map(v => `<option${v === guess ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn ok" id="dlgAdd" data-dex="${dex}" data-card="${esc(c.id)}">Dodaj do kolekcji</button>
      </div>
    </div>`;
  const dlg = $('#cardDlg');
  if (!dlg.open) dlg.showModal();
}

// ===== Nawigacja w szczegółach + swipe =====
function go(delta) {
  const next = S.cur + delta;
  if (next < 0 || next >= S.filtered.length) { bounce(delta); return; }
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
      const atEdge = (dx > 0 && S.cur === 0) || (dx < 0 && S.cur === S.filtered.length - 1);
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
const CSV_HEAD = ['dex', 'name', 'owned', 'card_id', 'set_id', 'set_name', 'series', 'card_number', 'set_total', 'rarity', 'card_name', 'variant', 'album_page', 'album_slot', 'added'];
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
        lines.push([...base, oc.id, c?.set.id, c?.set.name, c?.set.series, c?.num, c?.set.total, c?.rarity, c?.name, oc.v, page, slot, added].map(csvCell).join(','));
      }
    } else {
      lines.push([...base, '', '', '', '', '', '', '', '', '', page, slot, added].map(csvCell).join(','));
    }
  }
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pokedex-kolekcja-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Wyeksportowano CSV');
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
  if (!rows.length) throw new Error('Pusty plik');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  const iDex = col('dex');
  if (iDex < 0) throw new Error('Brak kolumny "dex"');
  const iOwned = col('owned'), iCard = col('card_id'), iSet = col('set_id'), iNum = col('card_number'), iVar = col('variant'), iAdded = col('added');
  const owned = merge ? structuredClone(S.store.owned) : {};
  // przy łączeniu nie dubluj kart, które już są zapisane (liczone per karta+wariant)
  const existing = new Map();
  if (merge) for (const [d, o] of Object.entries(owned)) for (const c of o.cards) {
    const key = `${d}|${c.id}|${c.v}`;
    existing.set(key, (existing.get(key) || 0) + 1);
  }
  let nPk = 0, nCards = 0;
  const perKey = new Map();
  for (const r of rows.slice(1)) {
    const dex = parseInt(r[iDex], 10);
    if (!S.byId.has(dex)) continue;
    const ownedVal = iOwned >= 0 ? String(r[iOwned]).trim().toLowerCase() : '1';
    if (['0', 'false', 'nie', 'no', ''].includes(ownedVal)) continue;
    if (!owned[dex]) {
      const t = iAdded >= 0 && r[iAdded] ? Date.parse(r[iAdded]) : NaN;
      owned[dex] = { t: isNaN(t) ? Date.now() : t, cards: [] };
      nPk++;
    }
    let cid = iCard >= 0 ? (r[iCard] || '').trim() : '';
    if (!cid && iSet >= 0 && iNum >= 0 && r[iSet] && r[iNum]) {
      const sid = r[iSet].trim(), nn = normNum(r[iNum].split('/')[0]);
      const found = (S.cardsByDex.get(dex) || []).find(c => c.set.id === sid && c.nn === nn);
      cid = found ? found.id : `${sid}-${r[iNum].trim()}`;
    }
    if (!cid) continue;
    const v = (iVar >= 0 && r[iVar] ? r[iVar].trim() : '') || 'Normal';
    // przy łączeniu: k-ty egzemplarz tej samej karty+wariantu dodaj tylko, jeśli jeszcze go nie ma
    const base = `${dex}|${cid}|${v}`;
    const k = perKey.get(base) || 0;
    perKey.set(base, k + 1);
    if (k < (existing.get(base) || 0)) continue;
    owned[dex].cards.push({ id: cid, v });
    nCards++;
  }
  S.store.owned = owned;
  saveStore();
  return { nPk, nCards };
}

// ===== UI: drobiazgi =====
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function syncFilterInputs() {
  const f = F();
  $('#q').value = f.q || '';
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
  const nc = o.reduce((s, x) => s + x.cards.length, 0);
  $('#dataInfo').textContent = `Zapisane: ${o.length} ${plural(o.length, 'stworek', 'stworki', 'stworków')}, ${nc} ${plural(nc, 'karta', 'karty', 'kart')}.`;
  $('#dataStats').textContent = `${S.sets.length} zestawów, ${S.cards.length.toLocaleString('pl-PL')} kart Pokémon, ostatni: ${S.sets[S.sets.length - 1]?.name}`;
}

function buildFilterUI() {
  $('#typeChips').innerHTML = Object.entries(TYPE_COLORS)
    .map(([t, c]) => `<button class="chip" data-type="${t}" style="--tc:${c}" aria-pressed="false">${t}</button>`).join('');
  $('#fGen').insertAdjacentHTML('beforeend', GENS.slice(1).map((g, i) => `<option value="${i + 1}">${g}</option>`).join(''));
  // zestawy pogrupowane wg serii, najnowsze na górze
  const bySeries = new Map();
  [...S.sets].reverse().forEach(s => {
    if (!bySeries.has(s.series)) bySeries.set(s.series, []);
    bySeries.get(s.series).push(s);
  });
  $('#fSet').insertAdjacentHTML('beforeend', [...bySeries].map(([series, sets]) =>
    `<optgroup label="${esc(series)}">${sets.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.code ? ' · ' + esc(s.code) : ''} (${s.date.slice(0, 4)})</option>`).join('')}</optgroup>`).join(''));
}

// ===== Zdarzenia =====
function bindEvents() {
  let qTimer;
  const setF = (k, v) => { S.store.filters[k] = v; saveStore(); renderGrid(); };
  $('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => setF('q', e.target.value), 150); });
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
        const tile = tg.closest('.tile');
        tile.classList.toggle('owned', isOwned(id));
        tg.setAttribute('aria-pressed', String(isOwned(id)));
        if (F().owned) renderGrid(); else renderProgressOnly();
      }
      return;
    }
    const tile = e.target.closest('.tile[data-id]');
    if (tile) openDetail(S.filtered.findIndex(pk => pk.id === +tile.dataset.id));
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
    if (!$('#detail').hidden && !(history.state && history.state.dex)) closeDetail(true);
  });
  $('#dInner').addEventListener('click', e => {
    const pk = S.filtered[S.cur];
    if (e.target.closest('#ownToggle')) {
      if (setOwned(pk.id, !isOwned(pk.id))) { renderDetail(); toast(isOwned(pk.id) ? `Dodano: ${pk.name}` : `Usunięto: ${pk.name}`); }
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) { openCardDialog(add.dataset.add); return; }
    const card = e.target.closest('[data-card]');
    if (card) { openCardDialog(card.dataset.card); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const o = S.store.owned[pk.id];
      o.cards.splice(+rm.dataset.remove, 1);
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
    const pk = S.filtered[S.cur];
    S.store.owned[pk.id].cards[+sel.dataset.variant].v = sel.value;
    saveStore(); toast('Zapisano typ karty');
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
      const dex = +btn.dataset.dex;
      addCard(dex, btn.dataset.card, $('#variantSel').value);
      e.currentTarget.close();
      if (!$('#detail').hidden) renderDetail();
      toast('Dodano kartę do kolekcji');
    }
  });

  // ustawienia
  const sd = $('#settingsDlg');
  $('#settingsBtn').addEventListener('click', () => {
    $('#sPocket').value = String(setting('pocket'));
    $('#sOffset').value = String(setting('offset'));
    $('#sPages').checked = !!setting('pages');
    $('#sHd').checked = !!setting('hd');
    updateDataInfo();
    sd.showModal();
  });
  sd.addEventListener('click', e => { if (e.target === sd || e.target.closest('[data-close]')) sd.close(); });
  const setS = (k, v) => { S.store.settings[k] = v; saveStore(); renderGrid(); };
  $('#sPocket').addEventListener('change', e => setS('pocket', +e.target.value));
  $('#sOffset').addEventListener('change', e => {
    const v = Math.min(+setting('pocket'), Math.max(1, parseInt(e.target.value, 10) || 1));
    e.target.value = v; setS('offset', v);
  });
  $('#sPages').addEventListener('change', e => setS('pages', e.target.checked));
  $('#sHd').addEventListener('change', e => setS('hd', e.target.checked));
  $('#exportBtn').addEventListener('click', exportCSV);
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const merge = $('#importMerge').checked;
    if (!merge && Object.keys(S.store.owned).length && !confirm('Import zastąpi całą obecną kolekcję. Kontynuować?')) return;
    try {
      const { nPk, nCards } = importCSV(await file.text(), merge);
      updateDataInfo(); renderGrid();
      toast(`Zaimportowano: ${nPk} nowych stworków, ${nCards} kart`);
    } catch (err) { alert('Błąd importu: ' + err.message); }
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Na pewno usunąć całą kolekcję? Najpierw zrób eksport CSV, jeśli chcesz mieć kopię.')) return;
    S.store.owned = {}; saveStore(); updateDataInfo(); renderGrid(); toast('Kolekcja wyczyszczona');
  });
}
function renderProgressOnly() {
  const ownedCount = Object.keys(S.store.owned).length;
  $('#progressFill').style.width = (ownedCount / S.pokemon.length * 100).toFixed(1) + '%';
  $('#progressText').textContent = `Mam ${ownedCount} / ${S.pokemon.length}`;
  // odśwież licznik strony albumu
  document.querySelectorAll('.page').forEach(pg => {
    const ids = [...pg.querySelectorAll('.tile[data-id]')].map(t => +t.dataset.id);
    const head = pg.querySelector('.page-head span:last-child');
    if (!head || !ids.length) return;
    const first = ids[0];
    const { page } = albumPos(first);
    const P = +setting('pocket'), off = Math.max(1, +setting('offset') || 1) - 1;
    let have = 0, slots = 0;
    for (let s = 0; s < P; s++) {
      const id = (page - 1) * P + s - off + 1;
      if (!S.byId.has(id)) continue;
      slots++; if (S.store.owned[id]) have++;
    }
    head.textContent = `${have}/${slots}`;
    head.className = have === slots ? 'done' : '';
  });
}

// ===== Start =====
async function main() {
  loadStore();
  try {
    await loadData();
  } catch (e) {
    $('#status').textContent = 'Nie udało się wczytać danych. Otwórz stronę przez serwer HTTP (nie file://).';
    console.error(e);
    return;
  }
  buildFilterUI();
  syncFilterInputs();
  bindEvents();
  renderGrid();
  const fromHash = parseInt(location.hash.slice(1), 10);
  if (fromHash) {
    const idx = S.filtered.findIndex(pk => pk.id === fromHash);
    if (idx >= 0) { history.replaceState(null, '', location.pathname + location.search); openDetail(idx); }
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  }
}
main();
