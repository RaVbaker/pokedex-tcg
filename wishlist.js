/* Pokédex TCG — lista życzeń (karty, których jeszcze nie mam).
 * Zapis: S.store.wish = [{ id, t }] w localStorage, eksport/import w CSV (kolumna wishlist = 1).
 * Dodanie karty do kolekcji automatycznie zdejmuje ją z listy (addCard w app.js).
 */
'use strict';

const inWish = id => S.store.wish.some(w => w.id === id);
function removeFromWish(id) {
  const i = S.store.wish.findIndex(w => w.id === id);
  if (i < 0) return false;
  S.store.wish.splice(i, 1);
  saveStore();
  return true;
}
// zwraca true, gdy karta została dodana
function toggleWish(id) {
  if (removeFromWish(id)) return false;
  const c = S.cardById.get(id);
  S.store.wish.push({ id, t: Date.now(), ...(c && typeof defaultVariant === 'function' ? { v: defaultVariant(c) } : {}) });
  saveStore();
  return true;
}
// serduszko w nagłówku okna karty (puste = dodaj, pełne = na liście)
function wishButtonHTML(cardId) {
  const on = inWish(cardId);
  const path = on
    ? 'M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z'
    : 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3Zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05Z';
  return `<button class="icon-btn dark wish-head${on ? ' on' : ''}" id="dlgWish" data-card="${esc(cardId)}" aria-pressed="${on}" aria-label="${esc(on ? t('wishIn') : t('wishAdd'))}" title="${esc(on ? t('wishIn') : t('wishAdd'))}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg></button>`;
}

function renderWish(grid) {
  const q = norm((S.wishQ || '').trim());
  const idx = ownedIndex();
  const all = S.store.wish
    .map(w => ({ w, c: S.cardById.get(w.id) }))
    .filter(x => x.c);
  const ws = setting('wishSort') || 'new';
  const cmp = {
    new: (a, b) => b.w.t - a.w.t,
    old: (a, b) => a.w.t - b.w.t,
    name: (a, b) => a.c.name.localeCompare(b.c.name, 'en') || (b.c.set.date || '').localeCompare(a.c.set.date || ''),
    set: (a, b) => (b.c.set.date || '').localeCompare(a.c.set.date || '') || a.c.set.i - b.c.set.i || numSort(a.c, b.c),
  }[ws] || ((a, b) => b.w.t - a.w.t);
  all.sort(cmp);
  const list = all.filter(x => !q || norm(`${x.c.name} ${x.c.set.name} ${x.c.set.code} ${x.c.set.id} ${x.c.num}`).includes(q));
  // wartość listy z zapisanych cen (bez zapytań do API)
  let sum = 0, cur = null;
  if (typeof cardValue === 'function') {
    const src = priceSource();
    for (const { c } of all) {
      const w = S.store.wish.find(x => x.id === c.id);
      const v = cardValue(c.id, w?.v || null, src, false);
      if (v) { sum += v.value; cur = v.cur; }
    }
  }
  $('#status').textContent = t('wishStatus', all.length, cur ? fmtMoney(sum, cur) : '');
  if (!all.length) { grid.innerHTML = `<p class="empty">${t('wishEmpty')}</p>`; return; }
  const chips = `<div class="summary-chips sets-show">${[['new', t('wishNewest')], ['old', t('wishOldest')], ['name', t('wishByName')], ['set', t('wishBySet')]]
    .map(([v, l]) => `<button data-wish-sort="${v}" aria-pressed="${ws === v}">${l}</button>`).join('')}</div>`;
  const cell = ({ c, w }) => {
    const have = idx.get(c.id) || 0;
    return `<button class="wcard" data-card="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(c.set.name)} ${esc(c.num)}">
      <span class="scard">
        <span class="scard-fb"><b>${esc(c.num)}</b><span>${esc(c.name)}</span></span>
        <img loading="lazy" decoding="async" alt="" src="${esc(c.img)}" onerror="this.remove()">
        <span class="scard-no">${esc(c.num)}${c.set.total ? '/' + c.set.total : ''}</span>
        ${have ? `<span class="scard-check" title="${esc(t('wishHave'))}">✓</span>` : '<span class="scard-wish" aria-hidden="true">♥</span>'}
        ${typeof priceTag === 'function' ? priceTag(c.id, w.v || null) : ''}
      </span>
      <span class="wcap"><b>${esc(c.name)}</b><small>${esc(c.set.name)} · ${raritySymHTML(c.rarity)} ${esc(c.rarity || '—')}</small>${w.v ? `<small class="wvar">${esc(variantLabel(w.v))}</small>` : ''}</span>
    </button>`;
  };
  // wg daty: grupy dni dodania; wg nazwy/zestawu: jedna siatka
  grid.innerHTML = chips + (ws === 'new' || ws === 'old'
    ? dayGroupsHTML(list, x => x.w.t, cell, 'wish-cards')
    : `<div class="wish-cards">${list.map(cell).join('')}</div>`);
}

function bindWish() {
  $('#grid').addEventListener('click', e => {
    if (setting('view') !== 'wish') return;
    const sb = e.target.closest('[data-wish-sort]');
    if (sb) { S.store.settings.wishSort = sb.dataset.wishSort; saveStore(); renderGrid(); return; }
    const c = e.target.closest('.wcard[data-card]');
    if (c) openCardDialog(c.dataset.card);
  });
  $('#cardDlg').addEventListener('click', e => {
    const b = e.target.closest('#dlgWish');
    if (!b) return;
    const added = toggleWish(b.dataset.card);
    openCardDialog(b.dataset.card); // odśwież okno (wybór szukanego typu karty)
    toast(added ? t('wishAdded') : t('wishRemoved'));
    afterCardChange();
  });
}
