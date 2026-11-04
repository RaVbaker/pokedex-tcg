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
  timeout: 20000,
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
// ===== Limit zapytań =====
// Stan zapisywany w localStorage: ostatnio znane „pozostało” z nagłówków X-RateLimit-* (jeśli przeglądarka może je
// odczytać), znaczniki czasu własnych zapytań (licznik tej przeglądarki) i blokada po 429.
// Odpowiedź 429 nie ma Retry-After (wg SDK) — ma tylko limits.hourly/daily {limit, used, remaining}, więc czas
// odnowienia szacujemy: okno godzinowe → najpóźniej za 60 min, dobowe → najpóźniej za 24 h.
PW.quotaLS = 'pokedex-tcg:pwquota';
function pwQuota() {
  try { return JSON.parse(localStorage.getItem(PW.quotaLS) || '{}') || {}; } catch { return {}; }
}
function savePwQuota(q) { try { localStorage.setItem(PW.quotaLS, JSON.stringify(q)); } catch { /* pełny storage */ } }
function noteRequest() {
  const q = pwQuota(), now = Date.now();
  q.sent = (q.sent || []).filter(ts => now - ts < 24 * 3600e3);
  q.sent.push(now);
  savePwQuota(q);
}
const pwBlockedUntil = () => { const q = pwQuota(); return q.blockedUntil && q.blockedUntil > Date.now() ? q.blockedUntil : 0; };
function fmtClock(ts) {
  const d = new Date(ts), today = new Date();
  const time = d.toLocaleTimeString(LANG === 'pl' ? 'pl-PL' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString(LANG === 'pl' ? 'pl-PL' : 'en-US', { day: 'numeric', month: 'short' })} ${time}`;
}
// opis limitu do ustawień (HTML)
function quotaInfoHTML() {
  if (!pwKey()) return '';
  const q = pwQuota(), now = Date.now();
  const lines = [];
  const until = pwBlockedUntil();
  if (until) lines.push(`<b class="quota-blocked">${t(q.blockedKind === 'day' ? 'quotaBlockedDay' : 'quotaBlockedHour', fmtClock(until))}</b>`);
  if (q.hdr && now - q.hdr.at < 3600e3) {
    lines.push(t('quotaLeft', q.hdr.hour ?? '?', q.hdr.limHour ?? '?', q.hdr.day ?? '?', q.hdr.limDay ?? '?', fmtClock(q.hdr.at)));
  }
  const sent = (q.sent || []).filter(ts => now - ts < 24 * 3600e3);
  const hour = sent.filter(ts => now - ts < 3600e3).length;
  lines.push(t('quotaSent', hour, sent.length));
  if (pwPlan() === 'free') lines.push(t('quotaFreePlan'));
  return lines.join('<br>');
}
function renderQuotaInfo() {
  const el = $('#pwQuota');
  if (el) el.innerHTML = quotaInfoHTML();
}

// zapytania idą po kolei (jedno na raz), żeby nie przekraczać limitu
function pwGet(path, query = {}) {
  const key = pwKey();
  if (!key) return Promise.reject(new PwError(0, t('pwNoKey')));
  // po wyczerpaniu limitu nie wysyłamy zapytań do szacowanego czasu odnowienia
  const until = pwBlockedUntil();
  if (until) return Promise.reject(new PwError(429, t(pwQuota().blockedKind === 'day' ? 'quotaBlockedDay' : 'quotaBlockedHour', fmtClock(until))));
  const url = new URL(PW.base + path);
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, v);
  const run = async () => {
    let res;
    // limit czasu: zawieszone zapytanie blokowałoby całą kolejkę (i np. „Wyceń kolekcję” przestawał reagować)
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), PW.timeout) : null;
    try {
      // cache: 'no-store' — własną pamięć cen mamy w localStorage; bez tego „Odśwież” mógł dostać starą odpowiedź z cache przeglądarki
      noteRequest();
      res = await fetch(url, { cache: 'no-store', signal: ctrl?.signal, headers: { 'X-API-Key': key, 'X-PokeWallet-Client': 'pokedex-tcg' } });
    } catch (e) {
      throw new PwError(-1, e?.name === 'AbortError' ? t('pwTimeout') : t('pwNetwork'));
    } finally {
      if (timer) clearTimeout(timer);
    }
    const h = res.headers;
    const remH = h.get('x-ratelimit-remaining-hour'), remD = h.get('x-ratelimit-remaining-day');
    if (remH != null || remD != null) {
      PW.quota = { hour: remH, day: remD };
      const q = pwQuota();
      q.hdr = { at: Date.now(), hour: remH, day: remD, limHour: h.get('x-ratelimit-limit-hour'), limDay: h.get('x-ratelimit-limit-day') };
      savePwQuota(q);
    }
    let body = null;
    try { body = await res.json(); } catch { /* pusta odpowiedź */ }
    if (!res.ok) {
      const err = new PwError(res.status, pwErrorText(res.status, body?.error || body?.message || res.statusText));
      if (res.status === 429) {
        // które okno się skończyło: z treści odpowiedzi (limits.hourly/daily), Retry-After jeśli jednak jest
        const lim = body?.limits || {};
        const dayOut = lim.daily && +lim.daily.remaining <= 0;
        const ra = parseInt(h.get('retry-after'), 10);
        const q = pwQuota();
        q.blockedKind = dayOut ? 'day' : 'hour';
        q.blockedUntil = Date.now() + (ra > 0 ? ra * 1000 : dayOut ? 24 * 3600e3 : 3600e3);
        if (lim.hourly || lim.daily) q.hdr = { at: Date.now(), hour: lim.hourly?.remaining, limHour: lim.hourly?.limit, day: lim.daily?.remaining, limDay: lim.daily?.limit };
        savePwQuota(q);
        err.message = t(dayOut ? 'quotaBlockedDay' : 'quotaBlockedHour', fmtClock(q.blockedUntil));
      }
      if (typeof renderQuotaInfo === 'function') renderQuotaInfo();
      throw err;
    }
    if (pwQuota().blockedUntil) { const q = pwQuota(); delete q.blockedUntil; savePwQuota(q); } // limit odnowiony wcześniej
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
  // odpowiedź może być opakowana (np. { data: {...} } albo { card: {...} })
  if (!r.card_info && !r.tcgplayer && !r.cardmarket) r = r.data || r.card || r;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const info = r.card_info || { name: r.name, set_name: r.set_name, set_code: r.set_code, card_number: r.card_number };
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
  const knownId = c?.pw?.id || pwMap()[card.id]?.id;
  if (knownId) {
    try { entry = pwTrim(await pwGet(`/cards/${encodeURIComponent(knownId)}`)); }
    catch (e) { if (e.status !== 404) throw e; }
    if (entry && !entry.tcg.length && !entry.cm.length) entry = null; // pusta odpowiedź — spróbuj wyszukiwania
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
  if (!force) box.innerHTML = cached ? priceBoxHTML(card, cached) : `<p class="muted small">${t('pwLoading')}</p>`;
  if (fresh && !force) return;
  try {
    const r = await getPrice(card, { force });
    const still = $('#priceBox');
    if (still && still.dataset.card === card.id) {
      still.innerHTML = priceBoxHTML(card, r);
      if (typeof refreshVariantSelect === 'function') refreshVariantSelect(card);
    }
    return true;
  } catch (e) {
    const still = $('#priceBox');
    if (still && still.dataset.card === card.id) still.innerHTML = (cached ? priceBoxHTML(card, cached) : '') + `<p class="pw-err small">${esc(e.message)}</p>`;
    if (force) toast(e.message);
    return false;
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
  const todo = pendingCards().slice(0, PW.BATCH);
  if (!todo.length) { renderValueStatus(t('pwNothingToValue')); return; }
  PW.valuing = true;
  const btn = $('#pwValue');
  btn.disabled = true;
  let err = '', done = 0;
  try {
    for (let i = 0; i < todo.length; i++) {
      $('#pwStatus').textContent = t('pwValuing', i + 1, todo.length) + quotaText();
      btn.textContent = t('pwValuing', i + 1, todo.length);
      try { await getPrice(S.cardById.get(todo[i])); done++; }
      catch (e) { err = e.message; if ([429, 401, 403, -1, 0].includes(e.status)) break; }
    }
  } finally {
    PW.valuing = false;
    btn.disabled = false;
    btn.textContent = t('pwValueBtn');
    renderValueStatus(err);
    renderQuotaInfo();
    if (typeof afterCardChange === 'function') afterCardChange();
    toast(err ? err : t('pwValuedN', done));
  }
}

// ===== Ustawienia =====
function bindPrices() {
  $('#settingsBtn').addEventListener('click', () => {
    $('#pwKey').value = pwKey();
    $('#pwKey').type = 'password';
    $('#pwSrc').value = priceSource();
    $('#pwTopN').value = String(+setting('topN') || 3);
    $('#pwPageLimit').value = String(+setting('pwPageLimit') || 100);
    $('#pwPlan').value = pwPlan();
    $('#pwSetBudget').value = String(+setting('pwSetBudget') || 12);
    $('#pwTtl').value = String(setting('pwTtl') ?? 7);
    $('#pwHint').innerHTML = t('pwHint');
    renderValueStatus();
    renderQuotaInfo();
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
      renderQuotaInfo();
    } catch (e) {
      $('#pwStatus').textContent = e.message;
    }
  });
  $('#pwClear').addEventListener('click', () => { pwStoreKey(''); $('#pwKey').value = ''; $('#pwStatus').textContent = t('pwKeyRemoved'); });
  $('#pwSrc').addEventListener('change', e => { S.store.settings.priceSrc = e.target.value; saveStore(); renderValueStatus(); });
  $('#pwValue').addEventListener('click', valueCollection);
  $('#pwPageLimit').addEventListener('change', e => { S.store.settings.pwPageLimit = +e.target.value; saveStore(); });
  $('#pwPlan').addEventListener('change', e => { S.store.settings.pwPlan = e.target.value; saveStore(); });
  $('#pwSetBudget').addEventListener('change', e => { S.store.settings.pwSetBudget = +e.target.value; saveStore(); });
  $('#pwTopN').addEventListener('change', e => { S.store.settings.topN = +e.target.value; saveStore(); if (typeof renderSetView === 'function' && !$('#setView').hidden) renderSetView(); });
  $('#pwTtl').addEventListener('change', e => { S.store.settings.pwTtl = +e.target.value; saveStore(); renderValueStatus(); });
  $('#pwCacheClear').addEventListener('click', () => { PW.cache = {}; savePriceCache(); renderValueStatus(t('pwCacheCleared')); });
  // przycisk „Odśwież” w oknie karty
  $('#cardDlg').addEventListener('click', e => {
    const b = e.target.closest('[data-price-refresh]');
    if (!b) return;
    const card = S.cardById.get(b.dataset.priceRefresh);
    if (!card || b.disabled) return;
    b.disabled = true;
    b.textContent = t('pwRefreshing');
    renderPriceBox(card, true).then(ok => { if (ok) toast(t('pricesUpdated', 1)); });
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
// daty z PokéWallet: „8th May, 2013” albo ISO „2013-05-08”
const PW_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function pwParseDate(str) {
  const v = String(str || '');
  const m = v.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  if (m) { const mi = PW_MONTHS.indexOf(m[2].toLowerCase()); if (mi >= 0) return Date.UTC(+m[3], mi, +m[1]); }
  const iso = Date.parse(v.slice(0, 10));
  return isNaN(iso) ? NaN : iso;
}
function matchPwSet(set, list) {
  const ourCount = (S.cardsBySet.get(set.id) || []).length;
  let best = null, bestS = 0;
  for (const s of list) {
    if (s.lang && !/^(en|eng|english)$/i.test(s.lang)) continue;
    let sc = setSim(set.name, s.name) * 3;
    if (set.code && s.code && s.code.toLowerCase() === set.code.toLowerCase()) sc += 3;
    if (set.date && s.date) {
      const days = Math.abs(pwParseDate(s.date) - Date.parse(set.date)) / 864e5;
      if (days <= 3) sc += 2; else if (days <= 45) sc += 0.5;
    }
    if (s.count && (s.count === ourCount || s.count === set.total)) sc += 1;
    if (sc > bestS) { bestS = sc; best = s; }
  }
  return bestS >= 3 ? best : null;
}
// pobierz ceny wszystkich kart zestawu i zapisz je przy naszych kartach
// Ceny zestawu:
//  1) GET /sets/{id} (darmowe): identyfikatory kart PokéWallet, rzadkość i warianty — BEZ cen
//     (w liście zestawu „prices” są puste; potwierdzają to nagrane odpowiedzi w repo SDK)
//  2a) plan Pro / trial: GET /prices/{set_id} — ceny całego zestawu jednym zapytaniem
//  2b) plan darmowy: GET /cards/{id} tylko dla najrzadszych kart (limit w ⚙︎), bo to one są najdroższe
PW.mapLS = 'pokedex-tcg:pwmap';
function pwMap() { try { return JSON.parse(localStorage.getItem(PW.mapLS) || '{}') || {}; } catch { return {}; } }
function savePwMap(m) { try { localStorage.setItem(PW.mapLS, JSON.stringify(m)); } catch { /* pełny storage */ } }
const pwPlan = () => setting('pwPlan') || 'free';
// przypisanie produktu PokéWallet do naszej karty: numer + nazwa
function pwMatchOurCard(set, number, name, byNum) {
  const cands = byNum.get(pwCardNum(number)) || [];
  if (cands.length <= 1) return cands[0] || null;
  const n = norm(name || '');
  return cands.find(c => n.includes(norm(c.name))) || cands[0];
}
async function fetchSetPrices(set, onProgress = () => {}) {
  const pwSet = matchPwSet(set, await pwSetList());
  const meta = pwSetMeta();
  if (!pwSet) {
    meta[set.id] = { at: Date.now(), none: true };
    savePwSetMeta(meta);
    throw new PwError(404, t('topNoSet'));
  }
  const ours = S.cardsBySet.get(set.id) || [];
  const byNum = new Map();
  for (const c of ours) { if (!byNum.has(c.nn)) byNum.set(c.nn, []); byNum.get(c.nn).push(c); }

  // 1) lista kart zestawu → mapa id + warianty
  let limit = +setting('pwPageLimit') || 100;
  const getPage = async page => {
    try { return await pwGet(`/sets/${encodeURIComponent(pwSet.id)}`, { limit, page }); }
    catch (e) {
      if (limit > 100 && [400, 403, 422].includes(e.status)) { limit = 100; return pwGet(`/sets/${encodeURIComponent(pwSet.id)}`, { limit, page }); }
      throw e;
    }
  };
  const map = pwMap();
  for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
    const body = await getPage(page);
    if (body?.disambiguation) throw new PwError(300, t('topNoSet'));
    const list = Array.isArray(body?.cards) ? body.cards : Array.isArray(body?.data?.cards) ? body.data.cards
      : Array.isArray(body?.data) ? body.data : [];
    for (const raw of list) {
      const info = raw?.card_info || {};
      if (info.product_type && info.product_type !== 'card') continue;
      const c = pwMatchOurCard(set, info.card_number, info.name, byNum);
      if (!c || !raw.id) continue;
      map[c.id] = { id: String(raw.id), variants: Array.isArray(info.variants) ? info.variants : [] };
    }
    const pg = body?.pagination || {};
    pages = +pg.total_pages || (pg.total && pg.limit ? Math.ceil(pg.total / pg.limit) : 1);
  }
  savePwMap(map);
  const mapped = ours.filter(c => map[c.id]);
  if (!mapped.length) throw new PwError(422, t('topNone'));

  const cache = priceCache(), now = Date.now();
  let priced = 0, mode = pwPlan();
  // 2a) Pro: ceny całego zestawu jednym zapytaniem
  if (mode === 'pro') {
    try {
      const body = await pwGet(`/prices/${encodeURIComponent(pwSet.id)}`);
      const rows = Array.isArray(body?.data) ? body.data : [];
      const acc = new Map();
      for (const r of rows) {
        if (r.product_type && r.product_type !== 'card') continue;
        const c = pwMatchOurCard(set, r.card_number, r.name, byNum);
        if (!c) continue;
        const e = acc.get(c.id) || { id: String(r.id || map[c.id]?.id || ''), name: r.name || c.name, setName: pwSet.name, setCode: pwSet.code, number: r.card_number || '', tcgUrl: null, cmUrl: null, tcg: [], cm: [] };
        const v = r.variant || '';
        if (r.tcgplayer) e.tcg.push({ v: r.tcgplayer.sub_type_name || v, market: pwNum(r.tcgplayer.market_price), low: pwNum(r.tcgplayer.low_price), mid: pwNum(r.tcgplayer.mid_price), high: pwNum(r.tcgplayer.high_price) });
        if (r.cardmarket) e.cm.push({ v: r.cardmarket.variant_type || v, trend: pwNum(r.cardmarket.trend), avg: pwNum(r.cardmarket.avg), low: pwNum(r.cardmarket.low), avg7: pwNum(r.cardmarket.avg7), avg30: pwNum(r.cardmarket.avg30) });
        acc.set(c.id, e);
      }
      for (const [id, e] of acc) { cache[id] = { at: now, pw: e }; if (e.tcg.length || e.cm.length) priced++; }
      savePriceCache();
    } catch (e) {
      if (e.status !== 403) throw e;
      mode = 'free'; // brak planu Pro — dalej jak w planie darmowym
      toast(t('topProMissing'));
    }
  }
  // 2b) darmowy: tylko najrzadsze karty (najpewniej najdroższe), pomijając te ze świeżą ceną
  let fetched = 0;
  if (mode === 'free') {
    const budget = +setting('pwSetBudget') || 12;
    const ttl = pwTtlMs();
    const tierNum = c => { const tr = rarityTier(c.rarity); return typeof tr === 'number' ? tr : 0; };
    const cands = mapped
      .filter(c => !(cache[c.id]?.pw && now - cache[c.id].at < ttl))
      .sort((a, b) => tierNum(b) - tierNum(a) || numSort(b, a))
      .slice(0, budget);
    for (let i = 0; i < cands.length; i++) {
      onProgress(i + 1, cands.length);
      const c = cands[i];
      const entry = pwTrim(await pwGet(`/cards/${encodeURIComponent(map[c.id].id)}`));
      cache[c.id] = { at: Date.now(), pw: entry };
      fetched++;
      if (entry && (entry.tcg.length || entry.cm.length)) priced++;
      savePriceCache();
    }
  }
  meta[set.id] = { at: now, pwId: pwSet.id, pwName: pwSet.name, matched: mapped.length, mode, fetched };
  savePwSetMeta(meta);
  return { priced, mode, fetched, mapped: mapped.length };
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
  // plan darmowy: kolejne kliknięcie wycenia następne najrzadsze karty; Pro: odświeża cały zestaw
  const freeMode = pwPlan() === 'free';
  const label = !meta?.at || meta?.none ? t('topFetch') : freeMode ? t('topMore', +setting('pwSetBudget') || 12) : t('pwRefresh');
  const btn = `<button class="btn ${meta?.at ? 'ghost' : ''} small" data-set-top="${esc(set.id)}">${label}</button>`;
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
    ${meta?.mode === 'free' || (!meta?.mode && pwPlan() === 'free') ? `<p class="muted small">${t('topFreeNote')}</p>` : ''}
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
    const r = await fetchSetPrices(set, (i, n) => { btn.textContent = t('topPricing', i, n); });
    if (typeof renderSetView === 'function') renderSetView();
    toast(r.mode === 'pro' ? t('topDonePro', r.priced) : r.fetched ? t('topDoneFree', r.priced, r.fetched) : t('topAllFresh'));
  } catch (e) {
    if (typeof renderSetView === 'function') renderSetView();
    toast(e.message);
    const err = $('#setTopErr');
    if (err && e.status !== 404) { err.textContent = e.message; err.hidden = false; } // 404 = komunikat już w sekcji
  }
}
