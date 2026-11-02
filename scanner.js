/* Pokédex TCG — skaner kart: kamera / zdjęcie + OCR (Tesseract.js, lokalnie z vendor/).
 * Odczytuje nazwę (góra karty) i numer w zestawie (dół karty, np. 025/165),
 * dopasowuje do bazy kart i pokazuje kandydatów do potwierdzenia.
 */
'use strict';

const SCAN = { stream: null, worker: null, workerP: null, busy: false, read: null, cams: [] };
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
// Wszystkie numery z tekstu — niektóre karty mają dwa (np. 30th Celebration: „034/151” i „16/30”)
function parseNumbers(text) {
  const T = String(text).toUpperCase().replace(/[|\\]/g, '/').replace(/[ \t]+/g, ' ');
  const out = [], seen = new Set();
  const add = o => { const k = `${o.num}/${o.total || ''}`; if (!seen.has(k)) { seen.add(k); out.push(o); } };
  let m;
  // podzestawy z literami: TG05/TG30, GG12/GG70, SV045/SV122, RC5/RC32, H3/H32
  const reSub = /(?:^|[^A-Z])(TG|GG|SV|RC|SH)(\d{1,3}) ?\/ ?(?:TG|GG|SV|RC|SH)?(\d{2,3})/g;
  while ((m = reSub.exec(T))) add({ num: m[1] + m[2], total: m[3] });
  // Aquapolis/Skyridge: H1/H32 (1–2 cyfry; „H” przed zwykłym numerem to znak regulacji)
  const reH = /(?:^|[^A-Z])H(\d{1,2}) ?\/ ?H?(\d{2})\b/g;
  while ((m = reH.exec(T))) add({ num: 'H' + m[1], total: m[2] });
  // zwykłe numery: 025/165 (litery przed nimi, np. „MEW EN”, są pomijane)
  const reNum = /(\d{1,3}) ?\/ ?(\d{2,3})/g;
  while ((m = reNum.exec(T))) add({ num: m[1], total: m[2] });
  const rePromo = /\b(SWSH|SVP|SV|SM|XY|BW|DP|HGSS|NP)\s?(\d{1,3})\b/g;
  if (!out.length) while ((m = rePromo.exec(T))) add({ num: m[1] + m[2], promo: m[1], digits: m[2] });
  return out;
}
const numsText = nums => nums.map(n => (n.total ? `${n.num}/${n.total}` : n.num)).join(' ');
// HP z górnego paska: „HP 60” (nowe karty) albo „60 HP” (starsze); OCR myli czasem 0 z O
function parseHP(text) {
  const T = String(text).toUpperCase().replace(/\s+/g, ' ');
  const m = T.match(/H\s?P\s?[:.]?\s?([0-9O]{2,3})\b/) || T.match(/\b([0-9O]{2,3})\s?H\s?P\b/);
  if (!m) return 0;
  const hp = parseInt(m[1].replace(/O/g, '0'), 10);
  return hp >= 10 && hp <= 400 && hp % 10 === 0 ? hp : 0;
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
    // bardzo krótkie nazwy (np. trener „N”) tylko przy dokładnym odczycie całej linii
    if (target.length <= 2) { if (line === target) return 1; continue; }
    if ((' ' + line + ' ').includes(' ' + target + ' ')) return 1;
    const words = line.split(' ').filter(Boolean);
    for (let len = Math.max(1, tw - 1); len <= tw + 1; len++) {
      for (let i = 0; i + len <= words.length; i++) {
        const cand = words.slice(i, i + len).join(' ');
        if (cand.length < 3) continue;
        const sim = 1 - lev(cand, target) / Math.max(cand.length, target.length);
        if (sim > best) best = sim;
      }
    }
  }
  return best;
}
const ocrLines = text => String(text).split(/\n+/).map(cleanName).filter(l => l.length >= 2);
// do pola „Nazwa”: najbliższa nazwa stworka, a jak nic nie pasuje — najdłuższa linia z literami
function guessName(lines) {
  let best = '', bs = 0;
  for (const pk of S.pokemon) {
    const s = nameSim(lines, pk.name);
    if (s > bs) { bs = s; best = pk.name; }
  }
  if (bs >= 0.6) return best;
  return lines.filter(l => /[a-z]{3,}/.test(l)).sort((a, b) => b.length - a.length)[0] || '';
}

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
function matchCards(nameText, nums, hp = 0) {
  const lines = ocrLines(nameText);
  const byId = new Map();
  for (const ni of nums || []) {
    const nn = normNum(ni.num);
    const total = ni.total ? parseInt(String(ni.total).replace(/^[A-Z]+/i, ''), 10) : NaN;
    for (const c of S.cards) {
      const hit = c.nn === nn ||
        (ni.promo && /promo/i.test(c.set.name) && normNum(c.num.replace(/^[a-z]+/i, '')) === normNum(ni.digits));
      if (!hit) continue;
      const totalOk = !isNaN(total) && c.set.total === total;
      const prev = byId.get(c.id);
      if (prev) prev.totalOk = prev.totalOk || totalOk; else byId.set(c.id, { c, totalOk });
    }
  }
  let out = [...byId.values()].map(x => {
    const sim = lines.length ? nameSim(lines, x.c.name) : 0;
    // numer + wielkość zestawu + nazwa razem = prawie pewne trafienie
    return { ...x, sim, score: (x.totalOk ? 2 : 0) + sim * 3 + (x.totalOk && sim >= 0.8 ? 1 : 0) };
  }).filter(x => x.totalOk || x.sim >= 0.6 || !lines.length);
  // nazwa dobrze odczytana, a numer nie pasuje (albo go brak): dołóż karty po samej nazwie
  const bestSim = out.reduce((m, x) => Math.max(m, x.sim), 0);
  if (lines.length && bestSim < 0.75) {
    const scored = [];
    for (const [name, cards] of nameIndex()) {
      const sim = nameSim(lines, name);
      if (sim >= 0.7) scored.push({ name, cards, sim });
    }
    scored.sort((a, b) => b.sim - a.sim || b.name.length - a.name.length);
    for (const { cards, sim } of scored.slice(0, 3)) {
      for (const c of cards) if (!byId.has(c.id)) out.push({ c, score: sim * 3 - 0.5, sim, nameOnly: true });
    }
  }
  // HP z karty: zgodne = mocny sygnał, niezgodne = lekka kara (OCR mógł się pomylić)
  if (hp) for (const x of out) {
    if (!x.c.hp) continue;
    x.hpOk = x.c.hp === hp;
    x.score += x.hpOk ? 1.5 : -0.5;
  }
  out.sort((a, b) => b.score - a.score || (b.c.set.date || '').localeCompare(a.c.set.date || ''));
  return out;
}

// ===== UI =====
function scanHint(text) { $('#scanHint').textContent = text; }
// Wybór aparatu: iPhone z kilkoma obiektywami domyślnie daje „wirtualny” aparat, który sam przełącza
// obiektywy (szeroki ↔ ultraszeroki) przy bliskim kadrze — obraz skacze. Pojedynczy „Tylny aparat” jest stabilny.
const CAM_VIRTUAL = /triple|dual|potrójn|podwójn|dreifach|dual-?weitwinkel/i;
const CAM_PLAIN = /^(back camera|tylny aparat|aparat tylny|kamera tylna|tylna kamera|rückkamera|caméra arrière)$/i;
async function listCameras() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); }
  catch { return []; }
}
const CAM_FRONT = /front|przedni|przód|facetime|vorder|avant|frontal/i;
const ZOOMS = [1, 1.5, 2, 2.5];
async function openStream(camId) {
  // wysoka rozdzielczość: przy powiększeniu (zwłaszcza cyfrowym) karta ma więcej pikseli do OCR
  const size = { width: { ideal: 3840 }, height: { ideal: 2160 } };
  return navigator.mediaDevices.getUserMedia({
    video: camId ? { deviceId: { exact: camId }, ...size } : { facingMode: { ideal: 'environment' }, ...size }, audio: false,
  });
}
async function startCamera() {
  const video = $('#scanVideo');
  $('#scanShot').disabled = false;
  if (!navigator.mediaDevices?.getUserMedia) { noCamera(); return; }
  try {
    const saved = setting('camId');
    try { SCAN.stream = await openStream(saved); }
    catch (e) {
      if (!saved) throw e;
      S.store.settings.camId = ''; saveStore();
      SCAN.stream = await openStream('');
    }
    // etykiety aparatów są dostępne dopiero po udzieleniu zgody
    SCAN.cams = (await listCameras()).filter(d => !CAM_FRONT.test(d.label));
    const track = SCAN.stream.getVideoTracks()[0];
    if (!saved && track && CAM_VIRTUAL.test(track.label)) {
      const plain = SCAN.cams.find(d => CAM_PLAIN.test(d.label.trim()));
      if (plain) {
        SCAN.stream.getTracks().forEach(tr => tr.stop());
        try { SCAN.stream = await openStream(plain.deviceId); } catch { SCAN.stream = await openStream(''); }
      }
    }
    if ($('#scanner').hidden) { stopCamera(); return; }
    const tr = SCAN.stream.getVideoTracks()[0];
    tr?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    $('#scanCam').hidden = SCAN.cams.length < 2;
    video.srcObject = SCAN.stream;
    SCAN.zoomBase = null;
    applyZoom(+setting('camZoom') || 1);
    await video.play().catch(() => {});
    scanHint(t('scanHint'));
  } catch (e) {
    console.warn('camera', e);
    noCamera();
  }
}
async function switchCamera() {
  if (!SCAN.cams.length) SCAN.cams = (await listCameras()).filter(d => !CAM_FRONT.test(d.label));
  if (SCAN.cams.length < 2) return;
  const curId = SCAN.stream?.getVideoTracks()[0]?.getSettings?.().deviceId;
  const i = SCAN.cams.findIndex(d => d.deviceId === curId);
  const next = SCAN.cams[(i + 1) % SCAN.cams.length];
  stopCamera();
  S.store.settings.camId = next.deviceId; saveStore();
  await startCamera();
  const label = SCAN.stream?.getVideoTracks()[0]?.label || next.label;
  if (label) toast(t('scanCamUsing', label));
}
function noCamera() {
  $('#scanShot').disabled = true;
  scanHint(t('scanNoCamera'));
}
// Powiększenie: natywne (zoom aparatu), a gdy przeglądarka go nie daje — cyfrowe (powiększony podgląd).
// Telefon trzymany dalej (~25–30 cm) + 2× = iPhone nie przełącza się na obiektyw makro.
function applyZoom(z) {
  const video = $('#scanVideo');
  const tr = SCAN.stream?.getVideoTracks()[0];
  const caps = tr?.getCapabilities?.() || {};
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    if (SCAN.zoomBase == null) SCAN.zoomBase = tr.getSettings?.().zoom || caps.zoom.min || 1;
    const target = Math.min(caps.zoom.max, Math.max(caps.zoom.min, SCAN.zoomBase * z));
    tr.applyConstraints({ advanced: [{ zoom: target }] }).catch(() => {});
    video.style.transform = '';
  } else {
    video.style.transform = z > 1 ? `scale(${z})` : '';
  }
  SCAN.zoom = z;
  $('#scanZoom').textContent = `${String(z).replace('.', LANG === 'pl' ? ',' : '.')}×`;
}
function cycleZoom() {
  const i = ZOOMS.indexOf(SCAN.zoom || 1);
  const z = ZOOMS[(i + 1) % ZOOMS.length];
  S.store.settings.camZoom = z; saveStore();
  applyZoom(z);
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
// Wykrywanie karty na zdjęciu: tło szacowane z obrzeża kadru, karta = największy zwarty obszar
// pikseli wyraźnie innych niż tło (rzuty na wiersze i kolumny). Zwraca null, gdy wynik nie wygląda na kartę.
function detectCard(img, iw, ih) {
  const k = Math.min(1, 360 / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * k)), h = Math.max(2, Math.round(ih * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  let n = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
    const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  r /= n; g /= n; b /= n;
  const rows = new Float32Array(h), cols = new Float32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const dist = Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);
    if (dist > 90) { rows[y]++; cols[x]++; }
  }
  // najdłuższy ciąg wierszy/kolumn, w których „karta” zajmuje sporą część
  const run = (arr, len, other) => {
    let best = null, start = -1, gap = 0;
    const lim = Math.max(1, Math.round(len * 0.02));
    for (let i = 0; i <= len; i++) {
      const on = i < len && arr[i] > other * 0.25;
      if (on) { if (start < 0) start = i; gap = 0; }
      else if (start >= 0 && (++gap > lim || i === len)) {
        const end = i - gap;
        if (!best || end - start > best[1] - best[0]) best = [start, end];
        start = -1; gap = 0;
      }
    }
    return best;
  };
  const ry = run(rows, h, w), rx = run(cols, w, h);
  if (!ry || !rx) return null;
  const bw = rx[1] - rx[0] + 1, bh = ry[1] - ry[0] + 1;
  const ratio = bw / bh;
  // karta: proporcje ~0.716, sensowna wielkość, nie cały kadr (wtedy tło = karta i wynik jest przypadkowy)
  if (ratio < 0.6 || ratio > 0.85 || bw * bh < w * h * 0.12 || (bw > w * 0.97 && bh > h * 0.97)) return null;
  return { x: rx[0] / k, y: ry[0] / k, w: bw / k, h: bh / k };
}

async function captureFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const ar = 63 / 88;
    // najpierw spróbuj znaleźć kartę na tle; jak się nie uda — środek zdjęcia w proporcjach karty
    let box = detectCard(img, iw, ih);
    if (!box) {
      let sw = iw, sh = ih;
      if (iw / ih > ar) sw = ih * ar; else sh = iw / ar;
      box = { x: (iw - sw) / 2, y: (ih - sh) / 2, w: sw, h: sh };
    }
    const card = document.createElement('canvas');
    card.width = CARD_W; card.height = CARD_H;
    card.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, CARD_W, CARD_H);
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
    // pasy z zapasem — kadr z ręki rzadko jest idealnie wyrównany (zgodne z żółtymi pasami .zone w styles.css)
    // górny pas na całą szerokość: nazwa po lewej, HP po prawej
    const nameText = await ocr(regionCanvas(card, W * 0.02, H * 0.005, W * 0.96, H * 0.135, 1.6), 11);
    let hp = parseHP(nameText);
    const numText = await ocr(regionCanvas(card, 0, H * 0.83, W, H * 0.17, 2.0), 11, '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    let nums = parseNumbers(numText);
    let names = nameText;
    let results = matchCards(names, nums, hp);
    // zapas: OCR całej karty / całego zdjęcia
    if (!results.length || (results[0].sim < 0.75 && !results[0].totalOk)) {
      const src = full || card;
      const scale = Math.min(2, 1600 / Math.max(src.width, src.height) * 1.2);
      const allText = await ocr(regionCanvas(src, 0, 0, src.width, src.height, scale), 3);
      const more = parseNumbers(allText).filter(n => !nums.some(m => m.num === n.num && m.total === n.total));
      nums = [...nums, ...more];
      names = nameText + '\n' + allText;
      hp = hp || parseHP(allText);
      const r2 = matchCards(names, nums, hp);
      if (r2.length && (!results.length || r2[0].score > results[0].score)) results = r2;
    }
    const best = results[0];
    SCAN.read = {
      name: best && best.sim >= 0.6 ? best.c.name : guessName(ocrLines(names)),
      num: best && best.totalOk ? `${best.c.num}/${best.c.set.total}` : numsText(nums),
      hp: hp || '',
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
    <div class="scan-res-head"><b>${t('scanResultTitle')}</b><button class="icon-btn dark scan-again" aria-label="${t('scanAgain')}" title="${t('scanAgain')}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 4a8 8 0 0 1 7.4 5H17v2h6V5h-2v2.3A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Zm8 8a8 8 0 0 1-15.4 3H7v-2H1v6h2v-2.3A10 10 0 0 0 22 12h-2Z"/></svg></button></div>
    <div class="scan-read">
      <img src="${r.thumb}" alt="">
      <form class="scan-form" id="scanForm">
        <label>${t('scanName')}<input id="scanName" value="${esc(r.name)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <div class="scan-form-row">
          <label>${t('scanNumber')}<input id="scanNum" value="${esc(r.num)}" autocomplete="off" autocapitalize="characters"></label>
          <label class="hp">HP<input id="scanHp" value="${esc(r.hp || '')}" inputmode="numeric" autocomplete="off" placeholder="—"></label>
        </div>
        <button class="btn small" type="submit">${t('scanSearch')}</button>
      </form>
    </div>
    ${top.length ? `<h3>${t('scanCandidates', results.length)}</h3><ul class="clist">${top.map((x, i) => {
      const c = x.c, have = idx.get(c.id) || 0;
      return `<li class="crow${i === 0 ? ' hl' : ''}">
        <img class="thumb" loading="lazy" src="${esc(c.img)}" onerror="this.style.visibility='hidden'" alt="" data-card="${esc(c.id)}">
        <button class="info" data-card="${esc(c.id)}"><b>${esc(c.name)}</b><span>${esc(c.set.name)} · <span class="num">${esc(c.num)}${c.set.total ? '/' + c.set.total : ''}</span>${c.hp ? ` · <span class="${x.hpOk ? 'hp-ok' : ''}">HP ${c.hp}</span>` : ''} · ${esc(c.rarity || '—')} · ${esc((c.set.date || '').slice(0, 4))}</span></button>
        ${have ? `<span class="have">✓${have > 1 ? have : ''}</span>` : ''}
        <button class="act" data-card="${esc(c.id)}" aria-label="${t('addCard')}">+</button>
      </li>`;
    }).join('')}</ul>` : `<p class="muted">${t('scanNone')}</p>`}
    <div class="btn-row">
      ${dexOf ? `<button class="btn ghost" id="scanDex" data-dex="${dexOf}">${t('scanAllOf', esc(S.byId.get(dexOf)?.name || ''))}</button>` : ''}
      <button class="btn scan-again" id="scanAgain">${t('scanAgain')}</button>
    </div>`;
  $('#scanResult').hidden = false;
  scanHint('');
}

function bindScanner() {
  $('#scanClose').addEventListener('click', () => closeScanner());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#scanner').hidden && !document.querySelector('dialog[open]')) closeScanner();
  });
  $('#scanCam').addEventListener('click', () => switchCamera());
  $('#scanZoom').addEventListener('click', () => cycleZoom());
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
    if (e.target.closest('.scan-again')) { resetScanner(); return; }
    const dx = e.target.closest('#scanDex');
    if (dx) { closeScanner(); setTimeout(() => openDetail(+dx.dataset.dex), 50); return; }
    const c = e.target.closest('[data-card]');
    if (c) openCardDialog(c.dataset.card);
  });
  $('#scanResult').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#scanName').value, num = $('#scanNum').value;
    const hp = parseInt($('#scanHp').value, 10) || 0;
    SCAN.read = { ...SCAN.read, name, num, hp: hp || '' };
    const parsed = parseNumbers(num);
    showResults(matchCards(name, parsed.length ? parsed : num.trim().split(/\s+/).filter(Boolean).map(n => ({ num: n })), hp));
  });
}
