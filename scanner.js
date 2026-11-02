/* Pokédex TCG — skaner kart: kamera / zdjęcie + OCR (Tesseract.js, lokalnie z vendor/).
 * Odczytuje nazwę (góra karty) i numer w zestawie (dół karty, np. 025/165),
 * dopasowuje do bazy kart i pokazuje kandydatów do potwierdzenia.
 */
'use strict';

const SCAN = { stream: null, worker: null, workerP: null, busy: false, read: null };
const CARD_W = 1000, CARD_H = Math.round(1000 * 88 / 63);

// ===== OCR: ładowanie =====
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load ' + src));
    document.head.appendChild(s);
  });
}
async function getWorker() {
  if (SCAN.worker) return SCAN.worker;
  if (!SCAN.workerP) {
    SCAN.workerP = (async () => {
      if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
      const base = new URL('vendor/tesseract/', location.href).href;
      return Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js', corePath: base, langPath: base + 'lang', gzip: true,
        logger: m => {
          if (SCAN.busy === 'loading' && m.status && typeof m.progress === 'number') {
            scanHint(`${t('scanLoading')} ${Math.round(m.progress * 100)}%`);
          }
        },
      });
    })();
  }
  try { SCAN.worker = await SCAN.workerP; }
  catch (e) { SCAN.workerP = null; throw e; }
  return SCAN.worker;
}

// ===== Obraz: wycinanie i przygotowanie fragmentów =====
function regionCanvas(src, x, y, w, h, scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  // skala szarości + rozciągnięcie kontrastu
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const k = hi > lo ? 255 / (hi - lo) : 1;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] - lo) * k;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
async function ocr(canvas, psm, whitelist = '') {
  const w = await getWorker();
  await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: whitelist, user_defined_dpi: '300' });
  const { data } = await w.recognize(canvas);
  return data.text || '';
}

// ===== Parsowanie tekstu =====
function parseNumber(text) {
  const T = String(text).toUpperCase().replace(/[|\\]/g, '/').replace(/[ \t]+/g, ' ');
  // podzestawy z literami: TG05/TG30, GG12/GG70, SV045/SV122, RC5/RC32, H3/H32
  let m = T.match(/(?:^|[^A-Z])(TG|GG|SV|RC|SH|H)(\d{1,3}) ?\/ ?(?:TG|GG|SV|RC|SH|H)?(\d{2,3})/);
  if (m) return { num: m[1] + m[2], total: m[3] };
  // zwykły numer: 025/165 (litery przed nim, np. „MEW EN”, są pomijane)
  m = T.match(/(\d{1,3}) ?\/ ?(\d{2,3})/);
  if (m) return { num: m[1], total: m[2] };
  m = T.match(/\b(SWSH|SVP|SV|SM|XY|BW|DP|HGSS|NP)\s?(\d{1,3})\b/);
  if (m) return { num: m[1] + m[2], promo: m[1], digits: m[2] };
  return null;
}
const cleanName = s => norm(s).replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// podobieństwo nazwy karty do odczytanego tekstu (0..1); porównuje okna słów o długości nazwy
function nameSim(lines, name) {
  const target = cleanName(name);
  if (!target) return 0;
  const tw = target.split(' ').length;
  let best = 0;
  for (const line of lines) {
    if (line.includes(target)) return 1;
    const words = line.split(' ').filter(Boolean);
    for (let len = Math.max(1, tw - 1); len <= tw + 1; len++) {
      for (let i = 0; i + len <= words.length; i++) {
        const cand = words.slice(i, i + len).join(' ');
        const sim = 1 - lev(cand, target) / Math.max(cand.length, target.length);
        if (sim > best) best = sim;
      }
    }
  }
  return best;
}
const ocrLines = text => String(text).split(/\n+/).map(cleanName).filter(l => l.length >= 2);

// ===== Dopasowanie do bazy =====
let NAME_INDEX = null;
function nameIndex() {
  if (NAME_INDEX) return NAME_INDEX;
  NAME_INDEX = new Map();
  for (const c of S.cards) {
    if (!NAME_INDEX.has(c.name)) NAME_INDEX.set(c.name, []);
    NAME_INDEX.get(c.name).push(c);
  }
  return NAME_INDEX;
}
function matchCards(nameText, numInfo) {
  const lines = ocrLines(nameText);
  let out = [];
  if (numInfo) {
    const nn = normNum(numInfo.num);
    const total = numInfo.total ? parseInt(numInfo.total.replace(/^[A-Z]+/, ''), 10) : NaN;
    let cands = S.cards.filter(c => c.nn === nn ||
      (numInfo.promo && /promo/i.test(c.set.name) && normNum(c.num.replace(/^[a-z]+/i, '')) === normNum(numInfo.digits)));
    out = cands.map(c => {
      const totalOk = !isNaN(total) && c.set.total === total;
      const sim = lines.length ? nameSim(lines, c.name) : 0;
      return { c, score: (totalOk ? 2 : 0) + sim * 3, sim, totalOk };
    }).filter(x => x.totalOk || x.sim >= 0.6 || !lines.length);
  }
  // bez numeru (albo nic nie pasuje): dopasuj samą nazwę
  if (!out.length && lines.length) {
    const scored = [];
    for (const [name, cards] of nameIndex()) {
      const sim = nameSim(lines, name);
      if (sim >= 0.7) scored.push({ name, cards, sim });
    }
    scored.sort((a, b) => b.sim - a.sim || b.name.length - a.name.length);
    const top = scored.slice(0, 3);
    for (const { cards, sim } of top) {
      for (const c of cards) out.push({ c, score: sim * 3, sim, nameOnly: true });
    }
  }
  out.sort((a, b) => b.score - a.score || (b.c.set.date || '').localeCompare(a.c.set.date || ''));
  return out;
}

// ===== UI =====
function scanHint(text) { $('#scanHint').textContent = text; }
async function startCamera() {
  const video = $('#scanVideo');
  $('#scanShot').disabled = false;
  if (!navigator.mediaDevices?.getUserMedia) { noCamera(); return; }
  try {
    SCAN.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
    if ($('#scanner').hidden) { stopCamera(); return; }
    video.srcObject = SCAN.stream;
    await video.play().catch(() => {});
    scanHint(t('scanHint'));
  } catch (e) {
    console.warn('camera', e);
    noCamera();
  }
}
function noCamera() {
  $('#scanShot').disabled = true;
  scanHint(t('scanNoCamera'));
}
function stopCamera() {
  if (SCAN.stream) SCAN.stream.getTracks().forEach(tr => tr.stop());
  SCAN.stream = null;
  $('#scanVideo').srcObject = null;
}
function openScanner() {
  const el = $('#scanner');
  if (!el.hidden) return;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  history.pushState({ scan: 1 }, '', '#scan');
  resetScanner();
  startCamera();
  getWorker().catch(() => {}); // wczytaj OCR w tle
}
function closeScanner(fromPop = false) {
  const el = $('#scanner');
  if (el.hidden) return;
  el.hidden = true;
  stopCamera();
  document.body.style.overflow = '';
  if (!fromPop && history.state && history.state.scan) history.back();
}
function resetScanner() {
  $('#scanResult').hidden = true;
  $('#scanResult').innerHTML = '';
  $('#scanControls').hidden = false;
  scanHint(SCAN.stream || !$('#scanShot').disabled ? t('scanHint') : t('scanNoCamera'));
}
// po dodaniu karty z wyników: wróć do kamery, gotowe do kolejnej
function scannerAfterAdd() {
  if (!$('#scanner').hidden && !$('#scanResult').hidden) resetScanner();
}

// zdjęcie z kamery: wytnij obszar ramki
function captureFromVideo() {
  const v = $('#scanVideo');
  if (!v.videoWidth) return null;
  const vr = v.getBoundingClientRect(), fr = $('#scanFrame').getBoundingClientRect();
  const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
  const ox = vr.left + (vr.width - v.videoWidth * scale) / 2;
  const oy = vr.top + (vr.height - v.videoHeight * scale) / 2;
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  c.getContext('2d').drawImage(v, (fr.left - ox) / scale, (fr.top - oy) / scale, fr.width / scale, fr.height / scale, 0, 0, CARD_W, CARD_H);
  return c;
}
// zdjęcie z pliku: karta = środek zdjęcia przycięty do proporcji karty
async function captureFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const ar = 63 / 88;
    let sw = iw, sh = ih;
    if (iw / ih > ar) sw = ih * ar; else sh = iw / ar;
    const card = document.createElement('canvas');
    card.width = CARD_W; card.height = CARD_H;
    card.getContext('2d').drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, CARD_W, CARD_H);
    // całe zdjęcie (zmniejszone) na wypadek, gdy karta nie wypełnia kadru
    const full = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(iw, ih));
    full.width = Math.round(iw * k); full.height = Math.round(ih * k);
    full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
    return { card, full };
  } finally { URL.revokeObjectURL(url); }
}

async function runScan(card, full = null) {
  if (SCAN.busy) return;
  $('#scanControls').hidden = true;
  try {
    SCAN.busy = 'loading';
    scanHint(t('scanLoading'));
    await getWorker();
    SCAN.busy = 'reading';
    scanHint(t('scanReading'));
    const W = card.width, H = card.height;
    const nameText = await ocr(regionCanvas(card, W * 0.03, H * 0.015, W * 0.80, H * 0.11, 1.6), 11);
    const numText = await ocr(regionCanvas(card, 0, H * 0.855, W, H * 0.135, 2.2), 11, '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    let numInfo = parseNumber(numText);
    let names = nameText;
    let results = matchCards(names, numInfo);
    // zapas: OCR całej karty / całego zdjęcia
    if (!results.length || (results[0].sim < 0.75 && !results[0].totalOk)) {
      const src = full || card;
      const scale = Math.min(2, 1600 / Math.max(src.width, src.height) * 1.2);
      const allText = await ocr(regionCanvas(src, 0, 0, src.width, src.height, scale), 3);
      numInfo = numInfo || parseNumber(allText);
      names = nameText + '\n' + allText;
      const r2 = matchCards(names, numInfo);
      if (r2.length && (!results.length || r2[0].score > results[0].score)) results = r2;
    }
    const firstLine = ocrLines(nameText)[0] || '';
    const best = results[0];
    SCAN.read = {
      name: best && best.sim >= 0.6 ? best.c.name : firstLine,
      num: numInfo ? (numInfo.total ? `${numInfo.num}/${numInfo.total}` : numInfo.num) : '',
      thumb: card.toDataURL('image/jpeg', 0.6),
    };
    showResults(results);
  } catch (e) {
    console.error(e);
    SCAN.read = { name: '', num: '', thumb: card.toDataURL('image/jpeg', 0.6) };
    showResults([]);
    toast(t('scanError') + (e.message || e));
  } finally {
    SCAN.busy = false;
  }
}

function showResults(results) {
  const r = SCAN.read;
  const top = results.slice(0, 12);
  const idx = ownedIndex();
  const dexOf = top.find(x => x.nameOnly && x.c.dex[0])?.c.dex[0];
  $('#scanResult').innerHTML = `
    <div class="scan-read">
      <img src="${r.thumb}" alt="">
      <form class="scan-form" id="scanForm">
        <label>${t('scanName')}<input id="scanName" value="${esc(r.name)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label>${t('scanNumber')}<input id="scanNum" value="${esc(r.num)}" autocomplete="off" autocapitalize="characters"></label>
        <button class="btn small" type="submit">${t('scanSearch')}</button>
      </form>
    </div>
    ${top.length ? `<h3>${t('scanCandidates', results.length)}</h3><ul class="clist">${top.map((x, i) => {
      const c = x.c, have = idx.get(c.id) || 0;
      return `<li class="crow${i === 0 ? ' hl' : ''}">
        <img class="thumb" loading="lazy" src="${esc(c.img)}" onerror="this.style.visibility='hidden'" alt="" data-card="${esc(c.id)}">
        <button class="info" data-card="${esc(c.id)}"><b>${esc(c.name)}</b><span>${esc(c.set.name)} · <span class="num">${esc(c.num)}${c.set.total ? '/' + c.set.total : ''}</span> · ${esc(c.rarity || '—')} · ${esc((c.set.date || '').slice(0, 4))}</span></button>
        ${have ? `<span class="have">✓${have > 1 ? have : ''}</span>` : ''}
        <button class="act" data-card="${esc(c.id)}" aria-label="${t('addCard')}">+</button>
      </li>`;
    }).join('')}</ul>` : `<p class="muted">${t('scanNone')}</p>`}
    <div class="btn-row">
      ${dexOf ? `<button class="btn ghost" id="scanDex" data-dex="${dexOf}">${t('scanAllOf', esc(S.byId.get(dexOf)?.name || ''))}</button>` : ''}
      <button class="btn" id="scanAgain">${t('scanAgain')}</button>
    </div>`;
  $('#scanResult').hidden = false;
  scanHint('');
}

function bindScanner() {
  $('#scanClose').addEventListener('click', () => closeScanner());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#scanner').hidden && !document.querySelector('dialog[open]')) closeScanner();
  });
  $('#scanShot').addEventListener('click', () => {
    const card = captureFromVideo();
    if (card) runScan(card);
  });
  $('#scanFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const { card, full } = await captureFromFile(f);
    runScan(card, full);
  });
  $('#scanResult').addEventListener('click', e => {
    if (e.target.closest('#scanAgain')) { resetScanner(); return; }
    const dx = e.target.closest('#scanDex');
    if (dx) { closeScanner(); setTimeout(() => openDetail(+dx.dataset.dex), 50); return; }
    const c = e.target.closest('[data-card]');
    if (c) openCardDialog(c.dataset.card);
  });
  $('#scanResult').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#scanName').value, num = $('#scanNum').value;
    SCAN.read = { ...SCAN.read, name, num };
    showResults(matchCards(name, parseNumber(num.toUpperCase()) || (num.trim() ? { num: num.trim() } : null)));
  });
}
