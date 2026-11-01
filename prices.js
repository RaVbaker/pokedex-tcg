/* Pokédex TCG — ceny kart z PokéWallet API (https://pokewallet.io).
 * API: https://api.pokewallet.io, nagłówek X-API-Key (klucz użytkownika, trzymany tylko w localStorage).
 * Ceny pochodzą z wyszukiwania (/search) i szczegółów karty (/cards/{id}) — oba dostępne w darmowym planie.
 * Wyniki są zapisywane lokalnie na 24 h, żeby oszczędzać limit (~100 zapytań/h).
 */
'use strict';

const PW = {
  base: 'https://api.pokewallet.io',
  keyLS: 'pokedex-tcg:pwkey',
  cacheLS: 'pokedex-tcg:prices',
  TTL: 24 * 3600e3,
  BATCH: 30,
  cache: null,
  queue: Promise.resolve(),
  quota: null,
  valuing: false,
};

// ===== Klucz i cache =====
function pwKey() { try { return localStorage.getItem(PW.keyLS) || ''; } catch { return ''; } }
function pwStoreKey(k) {
  try { k ? localStorage.setItem(PW.keyLS, k) : localStorage.removeItem(PW.keyLS); } catch { /* prywatny tryb */ }
}
function priceCache() {
  if (!PW.cache) {
    try { PW.cache = JSON.parse(localStorage.getItem(PW.cacheLS) || '{}') || {}; } catch { PW.cache = {}; }
  }
  return PW.cache;
}
function savePriceCache() {
  try { localStorage.setItem(PW.cacheLS, JSON.stringify(PW.cache || {})); } catch { /* pełny storage */ }
}
const priceSource = () => setting('priceSrc') || 'cm';

// ===== HTTP =====
class PwError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function pwErrorText(status, msg) {
  if (status === 401) return t('pwErr401');
  if (status === 403) return t('pwErr403') + (msg || '');
  if (status === 429) return t('pwErr429');
  return `PokéWallet ${status}: ${msg || ''}`;
}
// zapytania idą po kolei (jedno na raz), żeby nie przekraczać limitu
function pwGet(path, query = {}) {
  const key = pwKey();
  if (!key) return Promise.reject(new PwError(0, t('pwNoKey')));
  const url = new URL(PW.base + path);
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, v);
  const run = async () => {
    let res;
    try {
      res = await fetch(url, { headers: { 'X-API-Key': key, 'X-PokeWallet-Client': 'pokedex-tcg' } });
    } catch {
      throw new PwError(-1, t('pwNetwork'));
    }
    const h = res.headers;
    const remH = h.get('x-ratelimit-remaining-hour'), remD = h.get('x-ratelimit-remaining-day');
    if (remH != null || remD != null) PW.quota = { hour: remH, day: remD };
    let body = null;
    try { body = await res.json(); } catch { /* pusta odpowiedź */ }
    if (!res.ok) throw new PwError(res.status, pwErrorText(res.status, body?.error || body?.message || res.statusText));
    return body;
  };
  const p = PW.queue.then(run, run);
  PW.queue = p.catch(() => {});
  return p;
}

// ===== Normalizacja odpowiedzi =====
const pwNum = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
  return null;
};
function pwTrim(r) {
  if (!r || typeof r !== 'object') return null;
  const info = r.card_info || {};
  const tcg = r.tcgplayer || null, cm = r.cardmarket || null;
  return {
    id: String(r.id || ''),
    name: info.name || '', setName: info.set_name || '', setCode: info.set_code || '', number: info.card_number || '',
    tcgUrl: tcg?.url || null, cmUrl: cm?.product_url || null,
    tcg: (Array.isArray(tcg?.prices) ? tcg.prices : []).map(p => ({
      v: p.sub_type_name || p.variant || '', market: pwNum(p.market_price), low: pwNum(p.low_price), mid: pwNum(p.mid_price), high: pwNum(p.high_price),
    })),
    cm: (Array.isArray(cm?.prices) ? cm.prices : []).map(p => ({
      v: p.variant_type || p.variant || '', trend: pwNum(p.trend), avg: pwNum(p.avg), low: pwNum(p.low), avg7: pwNum(p.avg7), avg30: pwNum(p.avg30),
    })),
  };
}

// ===== Dopasowanie karty z naszej bazy do wyniku PokéWallet =====
const pwCardNum = s => normNum(String(s || '').split('/')[0]);
const pwCardTotal = s => { const b = String(s || '').split('/')[1]; return b ? parseInt(b.replace(/^[a-z]+/i, ''), 10) : NaN; };
const setClean = s => norm(s || '').replace(/^[a-z0-9.&' -]{1,12}:\s*/, '').replace(/\b(set|the|pokemon|tcg)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function setSim(a, b) {
  a = setClean(a); b = setClean(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))) return 0.85;
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  return [...A].filter(x => B.has(x)).length / Math.max(A.size, B.size);
}
function pwScore(card, r) {
  const info = r.card_info || {};
  if (pwCardNum(info.card_number) !== card.nn) return -1;
  let s = setSim(card.set.name, info.set_name) * 3;
  if (pwCardTotal(info.card_number) === card.set.total) s += 2;
  if (card.set.code && info.set_code && String(info.set_code).toLowerCase() === card.set.code.toLowerCase()) s += 3;
  if (norm(info.name || '').includes(norm(card.name))) s += 1;
  return s;
}
function pwPick(card, results) {
  let best = null, bestS = -1;
  for (const r of results || []) {
    const s = pwScore(card, r);
    if (s > bestS) { best = r; bestS = s; }
  }
  return bestS >= 3 ? best : null;
}

// Cena jednej karty (z cache, jeśli świeża)
async function getPrice(card, { force = false } = {}) {
  const cache = priceCache();
  const c = cache[card.id];
  if (c && !force && Date.now() - c.at < PW.TTL) return c;
  let entry = null;
  if (c?.pw?.id) {
    try { entry = pwTrim(await pwGet(`/cards/${encodeURIComponent(c.pw.id)}`)); }
    catch (e) { if (e.status !== 404) throw e; }
  }
  if (!entry) {
    const queries = [`${card.name} ${setClean(card.set.name)}`, card.name];
    for (const q of queries) {
      const body = await pwGet('/search', { q, limit: 100 });
      const best = pwPick(card, body?.results);
      if (best) { entry = pwTrim(best); break; }
    }
  }
  cache[card.id] = { at: Date.now(), pw: entry };
  savePriceCache();
  return cache[card.id];
}

// ===== Wybór ceny dla wariantu =====
function variantRe(variant) {
  switch (variant) {
    case 'Reverse Holo': return { want: /reverse/i };
    case 'Holo': return { want: /holo|foil/i, not: /reverse/i };
    case '1st Edition': return { want: /1st|first/i };
    default: return { want: /normal|unlimited|^$/i, not: /reverse|holo|foil/i };
  }
}
function pickRow(rows, variant, valueOf) {
  const priced = rows.filter(r => valueOf(r) != null);
  if (!priced.length) return null;
  if (variant) {
    const { want, not } = variantRe(variant);
    const hit = priced.find(r => want.test(r.v) && !(not && not.test(r.v)));
    if (hit) return hit;
  }
  return priced[0];
}
const cmValue = r => r.trend ?? r.avg ?? r.avg30 ?? r.low;
const tcgValue = r => r.market ?? r.mid ?? r.low;
function cardValue(cardId, variant, src = priceSource(), fallback = true) {
  const e = priceCache()[cardId]?.pw;
  if (!e) return null;
  const tryCm = () => { const r = pickRow(e.cm, variant, cmValue); return r ? { value: cmValue(r), cur: 'EUR', row: r } : null; };
  const tryTcg = () => { const r = pickRow(e.tcg, variant, tcgValue); return r ? { value: tcgValue(r), cur: 'USD', row: r } : null; };
  const first = src === 'tcg' ? tryTcg() : tryCm();
  return first || (fallback ? (src === 'tcg' ? tryCm() : tryTcg()) : null);
}
function fmtMoney(v, cur) {
  try { return new Intl.NumberFormat(LANG === 'pl' ? 'pl-PL' : 'en-US', { style: 'currency', currency: cur }).format(v); }
  catch { return `${v.toFixed(2)} ${cur}`; }
}
// mała etykieta z ceną (tylko z cache — bez zapytań)
function priceTag(cardId, variant) {
  const v = cardValue(cardId, variant);
  return v ? `<span class="price-tag">${fmtMoney(v.value, v.cur)}</span>` : '';
}
// suma wartości egzemplarzy (tylko w wybranej walucie)
function valueOfCopies(copies) {
  const src = priceSource();
  let sum = 0, priced = 0;
  for (const oc of copies) {
    const v = cardValue(oc.id, oc.v, src, false);
    if (v) { sum += v.value; priced++; }
  }
  return { sum, priced, cur: src === 'tcg' ? 'USD' : 'EUR' };
}
function allOwnedCopies() {
  return [...Object.values(S.store.owned).flatMap(o => o.cards), ...S.store.other];
}

// ===== Okno karty: blok cen =====
const PW_ATTR = '<a class="pw-attr" href="https://pokewallet.io" target="_blank" rel="noopener">Data by PokéWallet</a>';
function priceBoxHTML(card, c) {
  const e = c?.pw;
  const when = c?.at ? new Date(c.at).toLocaleString(LANG === 'pl' ? 'pl-PL' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const head = `<div class="pw-head"><b>${t('pwPrices')}</b><span class="muted small">${when ? t('pwUpdated', when) : ''}</span>
    <button class="btn ghost small" data-price-refresh="${esc(card.id)}">${t('pwRefresh')}</button></div>`;
  if (!e) return `${head}<p class="muted small">${t('pwNotFound')}</p>${PW_ATTR}`;
  const m = (v, cur) => (v == null ? '—' : fmtMoney(v, cur));
  const cmRows = e.cm.filter(r => cmValue(r) != null);
  const tcgRows = e.tcg.filter(r => tcgValue(r) != null);
  const cmT = cmRows.length ? `<table class="pw-table"><caption>${e.cmUrl ? `<a href="${esc(e.cmUrl)}" target="_blank" rel="noopener">Cardmarket</a>` : 'Cardmarket'} (EUR)</caption>
    <tr><th>${t('pwVariant')}</th><th>${t('pwTrend')}</th><th>${t('pwAvg30')}</th><th>${t('pwLow')}</th></tr>
    ${cmRows.map(r => `<tr><td>${esc(r.v || 'normal')}</td><td><b>${m(r.trend, 'EUR')}</b></td><td>${m(r.avg30, 'EUR')}</td><td>${m(r.low, 'EUR')}</td></tr>`).join('')}</table>` : '';
  const tcgT = tcgRows.length ? `<table class="pw-table"><caption>${e.tcgUrl ? `<a href="${esc(e.tcgUrl)}" target="_blank" rel="noopener">TCGplayer</a>` : 'TCGplayer'} (USD)</caption>
    <tr><th>${t('pwVariant')}</th><th>${t('pwMarket')}</th><th>${t('pwLow')}</th><th>${t('pwHigh')}</th></tr>
    ${tcgRows.map(r => `<tr><td>${esc(r.v || 'Normal')}</td><td><b>${m(r.market, 'USD')}</b></td><td>${m(r.low, 'USD')}</td><td>${m(r.high, 'USD')}</td></tr>`).join('')}</table>` : '';
  const order = priceSource() === 'tcg' ? tcgT + cmT : cmT + tcgT;
  return `${head}${order || `<p class="muted small">${t('pwNoPrices')}</p>`}
    <p class="muted small pw-match">${esc(e.name)} · ${esc(e.setName)} · ${esc(e.number)}</p>${PW_ATTR}`;
}
async function renderPriceBox(card, force = false) {
  const box = $('#priceBox');
  if (!box || box.dataset.card !== card.id) return;
  if (!pwKey()) { box.innerHTML = `<p class="muted small">${t('pwSetKeyHint')}</p>`; return; }
  const cached = priceCache()[card.id];
  const fresh = cached && Date.now() - cached.at < PW.TTL;
  box.innerHTML = cached ? priceBoxHTML(card, cached) : `<p class="muted small">${t('pwLoading')}</p>`;
  if (fresh && !force) return;
  try {
    const r = await getPrice(card, { force });
    const still = $('#priceBox');
    if (still && still.dataset.card === card.id) still.innerHTML = priceBoxHTML(card, r);
  } catch (e) {
    const still = $('#priceBox');
    if (still && still.dataset.card === card.id) still.innerHTML = (cached ? priceBoxHTML(card, cached) : '') + `<p class="pw-err small">${esc(e.message)}</p>`;
  }
}

// ===== Wycena kolekcji =====
function quotaText() {
  return PW.quota && (PW.quota.hour != null || PW.quota.day != null) ? ' ' + t('pwQuota', PW.quota.hour ?? '?', PW.quota.day ?? '?') : '';
}
function renderValueStatus(extra = '') {
  const copies = allOwnedCopies();
  const { sum, priced, cur } = valueOfCopies(copies);
  const stale = pendingCards().length;
  $('#pwStatus').textContent = (copies.length ? t('pwValue', fmtMoney(sum, cur), priced, copies.length, stale) : '') + quotaText() + (extra ? ' ' + extra : '');
}
function pendingCards() {
  const cache = priceCache();
  const ids = [...new Set(allOwnedCopies().map(c => c.id))];
  return ids.filter(id => S.cardById.has(id) && !(cache[id] && Date.now() - cache[id].at < PW.TTL));
}
async function valueCollection() {
  if (PW.valuing) return;
  if (!pwKey()) { $('#pwStatus').textContent = t('pwNoKey'); return; }
  PW.valuing = true;
  const todo = pendingCards().slice(0, PW.BATCH);
  let err = '';
  try {
    for (let i = 0; i < todo.length; i++) {
      $('#pwStatus').textContent = t('pwValuing', i + 1, todo.length) + quotaText();
      try { await getPrice(S.cardById.get(todo[i])); }
      catch (e) { err = e.message; if (e.status === 429 || e.status === 401 || e.status === -1 || e.status === 0) break; }
    }
  } finally {
    PW.valuing = false;
    renderValueStatus(err);
    if (typeof afterCardChange === 'function') afterCardChange();
  }
}

// ===== Ustawienia =====
function bindPrices() {
  $('#settingsBtn').addEventListener('click', () => {
    $('#pwKey').value = pwKey();
    $('#pwKey').type = 'password';
    $('#pwSrc').value = priceSource();
    $('#pwHint').innerHTML = t('pwHint');
    renderValueStatus();
  });
  $('#pwShow').addEventListener('click', () => { const i = $('#pwKey'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#pwSave').addEventListener('click', async () => {
    const k = $('#pwKey').value.trim();
    pwStoreKey(k);
    if (!k) { $('#pwStatus').textContent = ''; return; }
    $('#pwStatus').textContent = t('pwTesting');
    try {
      await pwGet('/search', { q: 'pikachu', limit: 1 });
      $('#pwStatus').textContent = t('pwKeyOk') + quotaText();
    } catch (e) {
      $('#pwStatus').textContent = e.message;
    }
  });
  $('#pwClear').addEventListener('click', () => { pwStoreKey(''); $('#pwKey').value = ''; $('#pwStatus').textContent = t('pwKeyRemoved'); });
  $('#pwSrc').addEventListener('change', e => { S.store.settings.priceSrc = e.target.value; saveStore(); renderValueStatus(); });
  $('#pwValue').addEventListener('click', valueCollection);
  $('#pwCacheClear').addEventListener('click', () => { PW.cache = {}; savePriceCache(); renderValueStatus(t('pwCacheCleared')); });
  // przycisk „Odśwież” w oknie karty
  $('#cardDlg').addEventListener('click', e => {
    const b = e.target.closest('[data-price-refresh]');
    if (!b) return;
    const card = S.cardById.get(b.dataset.priceRefresh);
    if (card) renderPriceBox(card, true);
  });
}
