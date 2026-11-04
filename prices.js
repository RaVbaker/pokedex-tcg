/* Pokédex TCG — ceny kart z PokéWallet API (https://pokewallet.io).
 * API: https://api.pokewallet.io, nagłówek X-API-Key (klucz użytkownika, trzymany tylko w localStorage).
 * Ceny pochodzą z wyszukiwania (/search) i szczegółów karty (/cards/{id}) — oba dostępne w darmowym planie.
 * Wyniki są zapisywane w przeglądarce (localStorage) razem z datą pobrania; ważność ustawia się w ⚙︎
 * (domyślnie 7 dni). Wycena kolekcji pobiera najpierw karty bez ceny, potem te z przeterminowaną.
 */
'use strict';

const PW = {
  base: 'https://api.pokewallet.io',
  keyLS: 'pokedex-tcg:pwkey',
  cacheLS: 'pokedex-tcg:prices',
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
// jak długo zapisana cena jest „świeża” (dni z ustawień; 0 = bez wygasania)
function pwTtlMs() {
  const d = +setting('pwTtl');
  return d === 0 ? Infinity : (d || 7) * 24 * 3600e3;
}

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
  if (c && !force && Date.now() - c.at < pwTtlMs()) return c;
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
  if (String(variant).startsWith('Reverse Holo')) return { want: /reverse/i };
  switch (variant) {
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
  const fresh = cached && Date.now() - cached.at < pwTtlMs();
  box.innerHTML = cached ? priceBoxHTML(card, cached) : `<p class="muted small">${t('pwLoading')}</p>`;
  if (fresh && !force) return;
  try {
    const r = await getPrice(card, { force });
    const still = $('#priceBox');
    if (still && still.dataset.card === card.id) {
      still.innerHTML = priceBoxHTML(card, r);
      if (typeof refreshVariantSelect === 'function') refreshVariantSelect(card);
    }
  } catch (e) {
    const still = $('#priceBox');
    if (still && still.dataset.card === card.id) still.innerHTML = (cached ? priceBoxHTML(card, cached) : '') + `<p class="pw-err small">${esc(e.message)}</p>`;
  }
}

// ===== Wycena kolekcji =====
function quotaText() {
  return PW.quota && (PW.quota.hour != null || PW.quota.day != null) ? ' ' + t('pwQuota', PW.quota.hour ?? '?', PW.quota.day ?? '?') : '';
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(LANG === 'pl' ? 'pl-PL' : 'en-US', { dateStyle: 'medium' });
}
function renderValueStatus(extra = '') {
  const copies = allOwnedCopies();
  const { sum, priced, cur } = valueOfCopies(copies);
  const stale = pendingCards().length;
  const cache = priceCache();
  const dates = [...new Set(copies.map(c => c.id))].map(id => cache[id]?.at).filter(Boolean);
  const range = dates.length ? ' ' + t('pwDates', fmtDate(Math.min(...dates)), fmtDate(Math.max(...dates))) : '';
  $('#pwStatus').textContent = (copies.length ? t('pwValue', fmtMoney(sum, cur), priced, copies.length, stale) + range : '') + quotaText() + (extra ? ' ' + extra : '');
}
// karty do wyceny: najpierw bez żadnej ceny, potem z ceną starszą niż ustawiona ważność
function pendingCards() {
  const cache = priceCache(), ttl = pwTtlMs(), now = Date.now();
  const ids = [...new Set(allOwnedCopies().map(c => c.id))].filter(id => S.cardById.has(id));
  const missing = ids.filter(id => !cache[id]);
  const stale = ids.filter(id => cache[id] && now - cache[id].at >= ttl).sort((a, b) => cache[a].at - cache[b].at);
  return [...missing, ...stale];
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
    $('#pwTopN').value = String(+setting('topN') || 3);
    $('#pwTtl').value = String(setting('pwTtl') ?? 7);
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
  $('#pwTopN').addEventListener('change', e => { S.store.settings.topN = +e.target.value; saveStore(); if (typeof renderSetView === 'function' && !$('#setView').hidden) renderSetView(); });
  $('#pwTtl').addEventListener('change', e => { S.store.settings.pwTtl = +e.target.value; saveStore(); renderValueStatus(); });
  $('#pwCacheClear').addEventListener('click', () => { PW.cache = {}; savePriceCache(); renderValueStatus(t('pwCacheCleared')); });
  // przycisk „Odśwież” w oknie karty
  $('#cardDlg').addEventListener('click', e => {
    const b = e.target.closest('[data-price-refresh]');
    if (!b) return;
    const card = S.cardById.get(b.dataset.priceRefresh);
    if (card) renderPriceBox(card, true);
  });
}

// ===== Ceny całego zestawu i Top 3 =====
// GET /sets (lista zestawów PokéWallet) + GET /sets/{set_id}?limit=200&page=N (karty zestawu z cenami).
// Oba endpointy są w darmowym planie (wg oficjalnego SDK). 1 zapytanie na listę zestawów (pamiętana 7 dni)
// + 1–2 na zestaw; ceny wszystkich kart trafiają do zwykłej pamięci cen (priceCache).
PW.setsLS = 'pokedex-tcg:pwsets';
PW.setMetaLS = 'pokedex-tcg:setprices';
function pwSetMeta() {
  try { return JSON.parse(localStorage.getItem(PW.setMetaLS) || '{}') || {}; } catch { return {}; }
}
function savePwSetMeta(m) { try { localStorage.setItem(PW.setMetaLS, JSON.stringify(m)); } catch { /* pełny storage */ } }
async function pwSetList() {
  try {
    const c = JSON.parse(localStorage.getItem(PW.setsLS) || 'null');
    if (c && Date.now() - c.at < 7 * 24 * 3600e3 && Array.isArray(c.sets)) return c.sets;
  } catch { /* brak */ }
  const body = await pwGet('/sets');
  const sets = (Array.isArray(body?.data) ? body.data : []).map(s => ({
    id: String(s.set_id ?? s.id ?? ''), code: s.set_code || '', name: s.name || s.set_name || '',
    lang: s.language || '', date: s.release_date || '', count: +(s.card_count ?? s.total_cards ?? 0) || 0,
  })).filter(s => s.id);
  try { localStorage.setItem(PW.setsLS, JSON.stringify({ at: Date.now(), sets })); } catch { /* pełny storage */ }
  return sets;
}
// dopasowanie naszego zestawu (pokemon-tcg-data) do zestawu PokéWallet (nazwy z TCGplayer, np. „SV: Scarlet & Violet 151”)
function matchPwSet(set, list) {
  const ourCount = (S.cardsBySet.get(set.id) || []).length;
  let best = null, bestS = 0;
  for (const s of list) {
    if (s.lang && !/^(en|eng|english)$/i.test(s.lang)) continue;
    let sc = setSim(set.name, s.name) * 3;
    if (set.code && s.code && s.code.toLowerCase() === set.code.toLowerCase()) sc += 3;
    if (set.date && s.date) {
      const days = Math.abs(Date.parse(s.date.slice(0, 10)) - Date.parse(set.date)) / 864e5;
      if (days <= 3) sc += 2; else if (days <= 45) sc += 0.5;
    }
    if (s.count && (s.count === ourCount || s.count === set.total)) sc += 1;
    if (sc > bestS) { bestS = sc; best = s; }
  }
  return bestS >= 3 ? best : null;
}
// pobierz ceny wszystkich kart zestawu i zapisz je przy naszych kartach
async function fetchSetPrices(set) {
  const pwSet = matchPwSet(set, await pwSetList());
  const meta = pwSetMeta();
  if (!pwSet) {
    meta[set.id] = { at: Date.now(), none: true };
    savePwSetMeta(meta);
    throw new PwError(404, t('topNoSet'));
  }
  const items = [];
  for (let page = 1, pages = 1; page <= pages && page <= 5; page++) {
    const body = await pwGet(`/sets/${encodeURIComponent(pwSet.id)}`, { limit: 200, page });
    if (body?.disambiguation) throw new PwError(300, t('topNoSet'));
    items.push(...(Array.isArray(body?.cards) ? body.cards : []));
    const pg = body?.pagination || {};
    pages = +pg.total_pages || (pg.total && pg.limit ? Math.ceil(pg.total / pg.limit) : 1);
  }
  // przypisz produkty PokéWallet do naszych kart: numer + nazwa (przy kilku produktach z tym samym numerem
  // — np. reverse z Poké Ball jako osobny produkt — łączymy wiersze cen)
  const ours = S.cardsBySet.get(set.id) || [];
  const byNum = new Map();
  for (const c of ours) {
    if (!byNum.has(c.nn)) byNum.set(c.nn, []);
    byNum.get(c.nn).push(c);
  }
  const cache = priceCache(), now = Date.now();
  const merged = new Map();
  for (const raw of items) {
    const e = pwTrim(raw);
    if (!e) continue;
    const cands = byNum.get(pwCardNum(e.number)) || [];
    if (!cands.length) continue;
    const c = cands.length === 1 ? cands[0]
      : cands.slice().sort((a, b) => (norm(e.name).includes(norm(b.name)) ? 1 : 0) - (norm(e.name).includes(norm(a.name)) ? 1 : 0))[0];
    const prev = merged.get(c.id);
    if (prev) { prev.tcg.push(...e.tcg); prev.cm.push(...e.cm); } else merged.set(c.id, { ...e, setName: e.setName || pwSet.name });
  }
  for (const [id, e] of merged) cache[id] = { at: now, pw: e };
  savePriceCache();
  meta[set.id] = { at: now, pwId: pwSet.id, pwName: pwSet.name, matched: merged.size };
  savePwSetMeta(meta);
  return merged.size;
}
// najwyższa cena karty w wybranym źródle (dowolny wariant); bez ceny w źródle — drugie źródło
function maxCardValue(cardId, src = priceSource()) {
  const e = priceCache()[cardId]?.pw;
  if (!e) return null;
  const best = (rows, valueOf, cur) => {
    let b = null;
    for (const r of rows) { const v = valueOf(r); if (v != null && (!b || v > b.value)) b = { value: v, cur, row: r }; }
    return b;
  };
  const cm = () => best(e.cm, cmValue, 'EUR'), tcg = () => best(e.tcg, tcgValue, 'USD');
  return (src === 'tcg' ? tcg() || cm() : cm() || tcg());
}
function topCardsOfSet(set, n = 3) {
  const src = priceSource();
  const rows = [];
  for (const c of S.cardsBySet.get(set.id) || []) {
    const v = maxCardValue(c.id, src);
    if (v) rows.push({ c, ...v });
  }
  // porównujemy w jednej walucie: najpierw karty z ceną w wybranym źródle
  const want = src === 'tcg' ? 'USD' : 'EUR';
  rows.sort((a, b) => (b.cur === want) - (a.cur === want) || b.value - a.value);
  return { top: rows.slice(0, n), priced: rows.length };
}
// „reverse_holo” → „Reverse Holo”, „Holofoil” bez zmian
const prettyVariant = v => String(v).replace(/[_-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
function setTopHTML(set) {
  if (!pwKey()) return '';
  const meta = pwSetMeta()[set.id];
  const n = +setting('topN') || 3;
  const { top, priced } = topCardsOfSet(set, n);
  const total = (S.cardsBySet.get(set.id) || []).length;
  const btn = `<button class="btn ${meta?.at ? 'ghost' : ''} small" data-set-top="${esc(set.id)}">${meta?.at ? t('pwRefresh') : t('topFetch')}</button>`;
  const rows = top.map((x, i) => `<li class="crow">
      <span class="top-rank">${i + 1}</span>
      <img class="thumb" loading="lazy" src="${esc(x.c.img)}" onerror="this.style.visibility='hidden'" alt="" data-card="${esc(x.c.id)}">
      <button class="info" data-card="${esc(x.c.id)}"><b>${esc(x.c.name)}</b><span><span class="num">${esc(x.c.num)}${set.total ? '/' + set.total : ''}</span> · ${esc(x.c.rarity || '—')}${x.row?.v ? ' · ' + esc(prettyVariant(x.row.v)) : ''}</span></button>
      <span class="top-price">${fmtMoney(x.value, x.cur)}</span>
    </li>`).join('');
  // zwijanie do jednego wiersza (wybór zapamiętany w ustawieniach)
  const collapsed = !!setting('topCollapsed');
  const chevron = `<svg class="chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="m7 10 5 5 5-5H7Z"/></svg>`;
  const head = `<button class="top-toggle" data-top-toggle aria-expanded="${!collapsed}">
      ${chevron}<span class="top-title">${t('topTitle', n)}</span>
      <small>${priced ? t('topFrom', priced, total, meta?.at ? fmtDate(meta.at) : '') : ''}</small>
    </button>`;
  if (collapsed) {
    const line = top.length
      ? top.map((x, i) => `<b>${i + 1}.</b> ${esc(x.c.name)} <span class="top-price">${fmtMoney(x.value, x.cur)}</span>`).join(' · ')
      : esc(meta?.none ? t('topNoSet') : meta?.at ? t('topNone') : t('topHint'));
    return `<section class="section set-top collapsed" id="setTop">${head}<p class="top-line">${line}</p></section>`;
  }
  return `<section class="section set-top" id="setTop">
    ${head}
    ${top.length ? `<ul class="clist">${rows}</ul>` : `<p class="muted small">${meta?.none ? t('topNoSet') : meta?.at ? t('topNone') : t('topHint')}</p>`}
    <div class="btn-row">${btn}</div>
    <p class="pw-err small" id="setTopErr" hidden></p>${PW_ATTR}
  </section>`;
}
async function loadSetTop(setId, btn) {
  const set = S.sets.find(s => s.id === setId);
  if (!set) return;
  btn.disabled = true;
  btn.textContent = t('topLoading');
  try {
    await fetchSetPrices(set);
    if (typeof renderSetView === 'function') renderSetView();
  } catch (e) {
    if (typeof renderSetView === 'function') renderSetView();
    const err = $('#setTopErr');
    if (err && e.status !== 404) { err.textContent = e.message; err.hidden = false; } // 404 = komunikat już w sekcji
  }
}
