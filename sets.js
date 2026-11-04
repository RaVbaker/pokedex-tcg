/* Pokédex TCG — widok „Zestawy”: kompletność zestawów kart.
 * Korzysta z globali z app.js (S, t, esc, norm, setting, saveStore, ownedIndex, numSort, openCardDialog…).
 */
'use strict';

const SETV = { id: null, show: 'all' };

// Kompletność zestawu: karty „zwykłe” (numer ≤ printedTotal) i sekretne (powyżej lub z literami)
function setProgress(set) {
  const cards = S.cardsBySet.get(set.id) || [];
  const idx = ownedIndex();
  let base = 0, baseHave = 0, secret = 0, secretHave = 0;
  for (const c of cards) {
    const n = parseInt(c.num, 10);
    const isBase = /^\d+$/.test(c.num) && n <= set.total;
    const have = idx.has(c.id);
    if (isBase) { base++; if (have) baseHave++; } else { secret++; if (have) secretHave++; }
  }
  // gdy zestaw nie ma numeracji „x/total” (promki) albo karty mają oryginalne numery z innych zestawów
  // (np. Classic Collection: 58, 101… przy rozmiarze 30), wszystko liczymy jako zwykłe
  if (!base || secret > base) { base += secret; baseHave += secretHave; secret = 0; secretHave = 0; }
  return { base, baseHave, secret, secretHave, all: cards.length, allHave: baseHave + secretHave };
}

function setSymbol(set) {
  return set.symbol ? `<img class="set-sym" loading="lazy" alt="" src="${esc(set.symbol)}" onerror="this.style.visibility='hidden'">` : '<span class="set-sym"></span>';
}

function renderSets(grid) {
  const q = norm((S.setsQ || '').trim());
  const show = setting('setsShow') || '';
  const rows = [];
  let started = 0;
  const bySeries = new Map();
  for (const set of [...S.sets].reverse()) {
    const pr = setProgress(set);
    if (pr.allHave) started++;
    if (q && !norm(`${set.name} ${set.code} ${set.id} ${set.series}`).includes(q)) continue;
    if (show === 'started' && !pr.allHave) continue;
    if (show === 'done' && pr.baseHave < pr.base) continue;
    if (!bySeries.has(set.series)) bySeries.set(set.series, []);
    bySeries.get(set.series).push({ set, pr });
  }
  $('#status').textContent = t('setsStatus', started, S.sets.length, totalOwnedCards());

  const chip = (val, label) => `<button data-sets-show="${val}" aria-pressed="${show === val}">${label}</button>`;
  rows.push(`<div class="summary-chips sets-show">${chip('', t('setsAll'))}${chip('started', t('setsStarted'))}${chip('done', t('setsDone'))}</div>`);
  if (!bySeries.size) rows.push(`<p class="empty">${t('setsNone')}</p>`);
  for (const [series, items] of bySeries) {
    rows.push(`<section class="group"><div class="page-head"><b>${esc(series)}</b><span>${items.length}</span></div><div class="set-list">`);
    for (const { set, pr } of items) {
      const pct = pr.base ? Math.round(pr.baseHave / pr.base * 100) : 0;
      const done = pr.base && pr.baseHave >= pr.base;
      rows.push(`<button class="set-row${pr.allHave ? ' started' : ''}${done ? ' done' : ''}" data-set="${esc(set.id)}">
        ${setSymbol(set)}
        <span class="set-main">
          <b>${esc(set.name)}</b>
          <small>${esc(set.code || set.id)} · ${esc((set.date || '').slice(0, 4))}</small>
          <span class="set-bar"><span style="width:${pct}%"></span></span>
        </span>
        <span class="set-count"><b>${pr.baseHave}/${pr.base}</b>${pr.secret ? `<span class="set-secret">${t('secret', pr.secretHave, pr.secret)}</span>` : ''}${done ? `<small class="ok">✓ ${t('complete')}</small>` : `<small>${pct}%</small>`}</span>
      </button>`);
    }
    rows.push(`</div></section>`);
  }
  grid.innerHTML = rows.join('');
}

// wartość posiadanych kart z zestawu (tylko z zapisanych cen)
function setValueLine(set) {
  const ids = new Set((S.cardsBySet.get(set.id) || []).map(c => c.id));
  const copies = allOwnedCopies().filter(c => ids.has(c.id));
  const { sum, priced, cur } = valueOfCopies(copies);
  return priced ? `<div class="muted small">${t('pwOwnedValue', fmtMoney(sum, cur), priced)}</div>` : '';
}

// ===== Widok jednego zestawu =====
function openSet(id, push = true) {
  const set = S.sets.find(s => s.id === id);
  if (!set) return;
  SETV.id = id;
  SETV.show = 'all';
  const el = $('#setView');
  const wasHidden = el.hidden;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  renderSetView();
  $('#setScroll').scrollTop = 0;
  if (push && wasHidden) history.pushState({ set: id }, '', '#set-' + id);
}
function closeSet(fromPop = false) {
  const el = $('#setView');
  if (el.hidden) return;
  el.hidden = true;
  document.body.style.overflow = '';
  if (!fromPop && history.state && history.state.set) history.back();
  renderGrid();
}
function renderSetView() {
  const set = S.sets.find(s => s.id === SETV.id);
  if (!set) return;
  const pr = setProgress(set);
  const idx = ownedIndex();
  const cards = (S.cardsBySet.get(set.id) || []).slice().sort(numSort);
  let list = cards.filter(c => SETV.show === 'all' || (SETV.show === 'owned') === idx.has(c.id));
  // sortowanie wg wartości (malejąco) — tylko z kluczem API; bez ceny na końcu wg numeru
  const hasPrices = typeof pwKey === 'function' && !!pwKey();
  const sortVal = hasPrices && setting('setSort') === 'value';
  const valOf = c => {
    const mine = idx.get(c.id) ? allOwnedCopies().filter(o => o.id === c.id) : [];
    const vals = (mine.length ? mine.map(o => cardValue(c.id, o.v)) : [cardValue(c.id, null)]).filter(Boolean);
    return vals.length ? Math.max(...vals.map(v => v.value)) : -1;
  };
  if (sortVal) {
    const v = new Map(list.map(c => [c.id, valOf(c)]));
    list = list.slice().sort((a, b) => v.get(b.id) - v.get(a.id) || numSort(a, b));
  }
  const sortChips = hasPrices
    ? `<div class="summary-chips">${[['num', t('sortByNum')], ['value', t('sortByValue')]].map(([val, l]) =>
      `<button data-set-sort="${val}" aria-pressed="${(sortVal ? 'value' : 'num') === val}">${l}</button>`).join('')}</div>` : '';
  const pct = pr.base ? Math.round(pr.baseHave / pr.base * 100) : 0;
  $('#setTitle').textContent = set.name;
  const chip = (val, label, n) => `<button data-show="${val}" aria-pressed="${SETV.show === val}">${label}<b>${n}</b></button>`;
  $('#setInner').innerHTML = `
    <div class="set-hero">
      ${set.logo ? `<img class="set-logo" alt="${esc(set.name)}" src="${esc(set.logo)}" onerror="this.remove()">` : ''}
      <div class="set-hero-info">
        <h2>${setSymbol(set)} ${esc(set.name)}</h2>
        <div class="muted">${esc(set.series)} · ${esc(set.code || set.id)} · ${esc(set.date || '')}</div>
        <div class="set-bar big"><span style="width:${pct}%"></span></div>
        <div class="set-hero-count"><b>${pr.baseHave}/${pr.base}</b> (${pct}%)${pr.secret ? `<span class="set-secret big">${t('secret', pr.secretHave, pr.secret)}</span>` : ''}</div>
        ${setValueLine(set)}
      </div>
    </div>
    <div class="summary-chips">${chip('all', t('showAll'), cards.length)}${chip('missing', t('showMissing'), cards.length - pr.allHave)}${chip('owned', t('showOwned'), pr.allHave)}</div>
    ${sortChips}${sortVal ? `<p class="muted small value-hint">${t('valueHint')}</p>` : ''}
    <div class="set-cards">${list.map(c => {
      const n = idx.get(c.id) || 0;
      const secret = pr.secret > 0 && !(/^\d+$/.test(c.num) && parseInt(c.num, 10) <= set.total);
      return `<button class="scard${n ? ' have' : inWish(c.id) ? ' wish' : ''}" data-card="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(c.num)}">
        <span class="scard-fb"><b>${esc(c.num)}</b><span>${esc(c.name)}</span></span>
        <img loading="lazy" decoding="async" alt="" src="${esc(c.img)}" onerror="this.remove()">
        <span class="scard-no${secret ? ' secret' : ''}">${esc(c.num)}</span>${priceTag(c.id, null)}
        ${n ? `<span class="scard-check">${n > 1 ? n : '✓'}</span>` : inWish(c.id) ? '<span class="scard-wish" aria-hidden="true">♥</span>' : ''}
      </button>`;
    }).join('')}</div>`;
}
function bindSets() {
  $('#setClose').addEventListener('click', () => closeSet());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#setView').hidden && $('#scanner').hidden && !document.querySelector('dialog[open]')) closeSet();
  });
  $('#setInner').addEventListener('click', e => {
    const sh = e.target.closest('[data-show]');
    if (sh) { SETV.show = sh.dataset.show; renderSetView(); return; }
    const ss = e.target.closest('[data-set-sort]');
    if (ss) { S.store.settings.setSort = ss.dataset.setSort; saveStore(); renderSetView(); return; }
    const c = e.target.closest('[data-card]');
    if (c) openCardDialog(c.dataset.card);
  });
}
