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
  S.store.wish.push({ id, t: Date.now() });
  saveStore();
  return true;
}
function wishButtonHTML(cardId) {
  const on = inWish(cardId);
  return `<button class="btn ghost wish-btn${on ? ' on' : ''}" id="dlgWish" data-card="${esc(cardId)}" aria-pressed="${on}">${on ? t('wishIn') : t('wishAdd')}</button>`;
}

function renderWish(grid) {
  const q = norm((S.wishQ || '').trim());
  const idx = ownedIndex();
  const all = S.store.wish
    .map(w => ({ w, c: S.cardById.get(w.id) }))
    .filter(x => x.c)
    .sort((a, b) => b.w.t - a.w.t);
  const list = all.filter(x => !q || norm(`${x.c.name} ${x.c.set.name} ${x.c.set.code} ${x.c.set.id} ${x.c.num}`).includes(q));
  // wartość listy z zapisanych cen (bez zapytań do API)
  let sum = 0, cur = null;
  if (typeof cardValue === 'function') {
    const src = priceSource();
    for (const { c } of all) {
      const v = cardValue(c.id, null, src, false);
      if (v) { sum += v.value; cur = v.cur; }
    }
  }
  $('#status').textContent = t('wishStatus', all.length, cur ? fmtMoney(sum, cur) : '');
  if (!all.length) { grid.innerHTML = `<p class="empty">${t('wishEmpty')}</p>`; return; }
  grid.innerHTML = `<div class="wish-cards">${list.map(({ c }) => {
    const have = idx.get(c.id) || 0;
    return `<button class="wcard" data-card="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(c.set.name)} ${esc(c.num)}">
      <span class="scard">
        <span class="scard-fb"><b>${esc(c.num)}</b><span>${esc(c.name)}</span></span>
        <img loading="lazy" decoding="async" alt="" src="${esc(c.img)}" onerror="this.remove()">
        <span class="scard-no">${esc(c.num)}${c.set.total ? '/' + c.set.total : ''}</span>
        ${have ? `<span class="scard-check" title="${esc(t('wishHave'))}">✓</span>` : '<span class="scard-wish" aria-hidden="true">♥</span>'}
        ${typeof priceTag === 'function' ? priceTag(c.id, null) : ''}
      </span>
      <span class="wcap"><b>${esc(c.name)}</b><small>${esc(c.set.name)} · ${esc(c.rarity || '—')}</small></span>
    </button>`;
  }).join('')}</div>`;
}

function bindWish() {
  $('#grid').addEventListener('click', e => {
    if (setting('view') !== 'wish') return;
    const c = e.target.closest('.wcard[data-card]');
    if (c) openCardDialog(c.dataset.card);
  });
  $('#cardDlg').addEventListener('click', e => {
    const b = e.target.closest('#dlgWish');
    if (!b) return;
    const added = toggleWish(b.dataset.card);
    b.outerHTML = wishButtonHTML(b.dataset.card);
    toast(added ? t('wishAdded') : t('wishRemoved'));
    afterCardChange();
  });
}
