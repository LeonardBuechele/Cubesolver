{
'use strict';
const C = window.CubeCore;
const T = window.THREE;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const store = {
  get(k, d) { try { const v = localStorage.getItem('wl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('wl.' + k, JSON.stringify(v)); } catch (e) { /* kein Speicher */ } }
};
const arr6 = a => (Array.isArray(a) && a.length === 6 ? a : null);
const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.5L16 9.5"/></svg>';
const ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800);
}
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast('In die Zwischenablage kopiert'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    toast(ok ? 'In die Zwischenablage kopiert' : 'Kopieren wurde blockiert – Text steht im Code-Feld');
    if (!ok) { const f = $('#codeIn'); f.value = txt; $('details.code').open = true; }
  }
}

// ================= Zustand =================
const DEMO = "R U2 F' L D2 B R' U F2 D' L2 B2 U R2 F2";
const S = {
  hex: arr6(store.get('hex')) || C.STD.map(s => s.hex),
  names: arr6(store.get('names')) || C.STD.map(s => s.n),
  facelets: null, unsure: new Set(), brush: 0, isDemo: false
};
{
  const saved = store.get('facelets');
  if (Array.isArray(saved) && saved.length === 54 && saved.every((v, i) => v >= -1 && v <= 5 && (i % 9 !== 4 || v === Math.floor(i / 9)))) S.facelets = saved;
  else { S.facelets = C.applyAll(C.SOLVED, C.parseAlg(DEMO)); S.isDemo = true; }
}
$('#logo').innerHTML = [0, 1, 5, 2, 0, 4, 3, 2, 1].map(k => `<i style="background:${C.STD[k].hex}"></i>`).join('');
$('#emptyStickers').innerHTML = [2, 0, 1, 5, 2, 3, 4, 2, 0].map((k, i) => `<rect x="${6 + (i % 3) * 25}" y="${6 + Math.floor(i / 3) * 25}" width="22" height="22" rx="4" fill="${C.STD[k].hex}"/>`).join('');

// ================= Solver (Kociemba, im Worker) =================
function setPill(ok, text) {
  const p = $('#solverPill'); p.classList.toggle('ok', !!ok);
  p.querySelector('span').textContent = text || (ok ? 'Solver bereit' : 'Solver startet…');
}
const Solver = {
  ready: false, w: null, id: 0, cbs: new Map(), fb: false, queue: [],
  init() {
    const src = $('#cubejs-src').textContent;
    const tail = "\nself.onmessage=function(e){var d=e.data;try{if(d.t==='init'){Cube.initSolver();postMessage({t:'ready'});}else if(d.t==='solve'){postMessage({t:'res',id:d.id,ok:true,v:Cube.fromString(d.s).solve()});}else if(d.t==='scr'){postMessage({t:'res',id:d.id,ok:true,v:Cube.scramble()});}}catch(err){postMessage({t:'res',id:d.id,ok:false,v:String(err&&err.message||err)});}};";
    try {
      const url = URL.createObjectURL(new Blob([src + tail], { type: 'text/javascript' }));
      this.w = new Worker(url);
      this.w.onmessage = e => this.msg(e.data);
      this.w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); this.useFallback(); };
      this.w.postMessage({ t: 'init' });
      setTimeout(() => { if (!this.ready) this.useFallback(); }, 25000);
    } catch (e) { this.useFallback(); }
  },
  msg(d) {
    if (d.t === 'ready') { this.ready = true; setPill(true); return; }
    const cb = this.cbs.get(d.id);
    if (cb) { this.cbs.delete(d.id); if (d.ok) cb.res(d.v); else cb.rej(new Error(d.v)); }
  },
  useFallback() {
    if (this.fb) return;
    this.fb = true;
    if (this.w) { try { this.w.terminate(); } catch (e) { /* egal */ } this.w = null; }
    this.queue.push(...this.cbs.values()); this.cbs.clear();
    setPill(false, 'Solver startet…');
    setTimeout(() => {
      try { window.Cube.initSolver(); this.ready = true; setPill(true); }
      catch (e) { setPill(false, 'Solver nicht verfügbar'); }
      const q = this.queue.splice(0); q.forEach(p => this.run(p));
    }, 60);
  },
  run(p) {
    try { p.res(p.t === 'solve' ? window.Cube.fromString(p.s).solve() : window.Cube.scramble()); }
    catch (e) { p.rej(e); }
  },
  call(t, s) {
    return new Promise((res, rej) => {
      const p = { t, s, res, rej };
      if (this.fb) { if (this.ready) setTimeout(() => this.run(p), 10); else this.queue.push(p); return; }
      const id = ++this.id; this.cbs.set(id, p); this.w.postMessage({ t, s, id });
    });
  },
  solve(s) { return this.call('solve', s); },
  scramble() { return this.call('scr'); }
};

// ================= Netz-Editor =================
const NET = [['U', 2, 1], ['L', 1, 2], ['F', 2, 2], ['R', 3, 2], ['B', 4, 2], ['D', 2, 3]];
function buildNet() {
  $('#net').innerHTML = NET.map(([f, c, r]) => {
    const fi = C.FACES.indexOf(f);
    let h = `<div class="face" style="grid-column:${c};grid-row:${r}">`;
    for (let k = 0; k < 9; k++) {
      const i = fi * 9 + k;
      h += k === 4 ? `<button class="st ctr" data-i="${i}" tabindex="-1" aria-label="Mitte ${f}"><span>${f}</span></button>`
        : `<button class="st" data-i="${i}" aria-label="Feld ${f}${k + 1}"></button>`;
    }
    return h + '</div>';
  }).join('');
}
function buildPal() {
  $('#pal').innerHTML = S.names.map((n, k) => `<button data-k="${k}" aria-pressed="${k === S.brush}" title="${n} (Taste ${k + 1})"><i style="background:${S.hex[k]}"></i><span>${n}</span><span class="cnt" data-c="${k}"></span></button>`).join('');
}
function setBrush(k) { S.brush = k; $$('#pal button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.k === k)); }
function refresh() {
  const v = C.validate(S.facelets, S.names);
  const cnt = [0, 0, 0, 0, 0, 0];
  S.facelets.forEach(c => { if (c >= 0) cnt[c]++; });
  $$('#pal .cnt').forEach(e => { const k = +e.dataset.c; e.textContent = cnt[k] + '/9'; e.classList.toggle('off', cnt[k] !== 9); });
  const bad = new Set(v.ok ? [] : v.cells);
  $$('#net .st').forEach(b => {
    const i = +b.dataset.i, c = S.facelets[i];
    b.style.background = c < 0 ? '' : S.hex[c];
    b.classList.toggle('unk', c < 0);
    b.classList.toggle('unsure', S.unsure.has(i));
    b.classList.toggle('bad', bad.has(i));
  });
  const st = $('#status'), solved = v.ok && C.isSolved(S.facelets);
  if (v.ok) {
    st.className = 'status ok';
    let msg = solved ? 'Der Würfel ist bereits gelöst. Mische ihn oder scanne einen anderen.' : 'Gültiger Würfel – bereit zum Lösen.';
    if (S.isDemo) msg = 'Beispiel-Würfel geladen. Scanne deinen eigenen oder ändere die Farben – oder sieh dir direkt die Lösung an.';
    if (S.unsure.size) msg += ` ${S.unsure.size} ${S.unsure.size === 1 ? 'Feld war' : 'Felder waren'} unsicher (gestrichelt) – kurz mit dem echten Würfel vergleichen.`;
    st.innerHTML = ICON_OK + `<span>${msg}</span>`;
  } else {
    st.className = 'status err';
    st.innerHTML = ICON_ERR + `<span>${v.msg}</span>`;
  }
  $('#solveBtn').disabled = !v.ok || solved;
  store.set('facelets', S.facelets);
}
let painting = false;
function paintCell(i) {
  if (S.facelets[i] === S.brush && !S.unsure.has(i)) return;
  S.facelets[i] = S.brush; S.unsure.delete(i); S.isDemo = false; refresh();
}
$('#net').addEventListener('pointerdown', e => {
  const b = e.target.closest('.st'); if (!b || b.classList.contains('ctr')) return;
  paintCell(+b.dataset.i); if (e.pointerType === 'mouse') painting = true;
});
$('#net').addEventListener('pointerover', e => {
  if (!painting) return;
  const b = e.target.closest('.st'); if (b && !b.classList.contains('ctr')) paintCell(+b.dataset.i);
});
$('#net').addEventListener('click', e => { const b = e.target.closest('.st'); if (b && e.detail === 0 && !b.classList.contains('ctr')) paintCell(+b.dataset.i); });
addEventListener('pointerup', () => { painting = false; });
$('#pal').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setBrush(+b.dataset.k); });
function setFacelets(st, opts) {
  S.facelets = st.slice(); S.unsure = new Set((opts && opts.unsure) || []); S.isDemo = false; refresh();
}
$('#solvedBtn').onclick = () => setFacelets(C.SOLVED);
$('#clearBtn').onclick = () => setFacelets(C.SOLVED.map((v, i) => (i % 9 === 4 ? v : -1)));
$('#randBtn').onclick = () => setFacelets(C.applyAll(C.SOLVED, randomMoves(25)));
function randomMoves(n) {
  const out = []; let last = '';
  while (out.length < n) {
    const f = 'URFDLB'[Math.floor(Math.random() * 6)];
    if (f === last) continue;
    last = f; out.push(f + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}
$('#codeLoad').onclick = () => {
  const val = $('#codeIn').value.trim();
  const st = C.fromString(val);
  if (st) { setFacelets(st); toast('Zustand übernommen'); return; }
  const alg = C.parseAlg(val);
  if (alg && alg.length) { setFacelets(C.applyAll(C.SOLVED, alg)); toast(`${alg.length} Züge auf einen gelösten Würfel angewendet`); return; }
  toast('Das ist weder ein 54-stelliger Code noch eine gültige Zugfolge');
};
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#codeLoad').click(); });
$('#codeCopy').onclick = () => copyText(C.toString(S.facelets));

$('#solveBtn').onclick = async () => {
  const v = C.validate(S.facelets, S.names);
  if (!v.ok || C.isSolved(S.facelets)) return;
  const b = $('#solveBtn'); b.disabled = true;
  b.innerHTML = `<span class="spin"></span>${Solver.ready ? 'Berechne Lösung…' : 'Solver lädt noch…'}`;
  try {
    const sol = await Solver.solve(C.toString(S.facelets));
    const moves = C.parseAlg(sol) || [];
    loadSolution(S.facelets.slice(), moves, S.hex.slice(), S.names.slice());
    location.hash = 'loesung';
  } catch (e) { toast('Die Lösung konnte nicht berechnet werden: ' + e.message); }
  finally { b.innerHTML = 'Lösung berechnen'; refresh(); }
};

// ================= Scanner =================
const ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
const SHORT = { F: 'Vorne', R: 'Rechts', B: 'Hinten', L: 'Links', U: 'Oben', D: 'Unten' };
const WORD2FACE = { Oben: 'U', Unten: 'D', Vorne: 'F', Hinten: 'B', Links: 'L', Rechts: 'R' };
const INFO = {
  F: { t: 'Vorderseite', d: 'Halte den Würfel so, wie du ihn lösen willst: Vorderseite zur Kamera, Oberseite nach oben. Tipp: Weiß oben, Grün vorne.', e: ['Oben', 'Rechts', 'Unten', 'Links'] },
  R: { t: 'Rechte Seite', d: 'Drehe den ganzen Würfel eine Vierteldrehung, bis die Seite, die eben rechts im Bild war, zur Kamera zeigt. Oben bleibt oben.', e: ['Oben', 'Hinten', 'Unten', 'Vorne'] },
  B: { t: 'Rückseite', d: 'Noch eine Vierteldrehung in dieselbe Richtung – jetzt zeigt die Rückseite zur Kamera.', e: ['Oben', 'Links', 'Unten', 'Rechts'] },
  L: { t: 'Linke Seite', d: 'Noch eine Vierteldrehung – die linke Seite zeigt zur Kamera.', e: ['Oben', 'Vorne', 'Unten', 'Hinten'] },
  U: { t: 'Oberseite', d: 'Zurück zur Vorderseite, dann den Würfel kippen, bis die Oberseite zur Kamera zeigt. Die Vorderseite liegt jetzt unten im Bild.', e: ['Hinten', 'Rechts', 'Vorne', 'Links'] },
  D: { t: 'Unterseite', d: 'Zurück zur Vorderseite, dann andersherum kippen, bis die Unterseite zur Kamera zeigt. Die Vorderseite liegt jetzt oben im Bild.', e: ['Vorne', 'Rechts', 'Hinten', 'Links'] }
};
const scan = { raw: {}, cur: 0 };
const rgbCss = c => `rgb(${c.map(Math.round).join(',')})`;
function renderStepper() {
  $('#stepper').innerHTML = ORDER.map((f, i) => {
    const raw = scan.raw[f];
    const cells = Array.from({ length: 9 }, (_, k) => `<i${raw ? ` style="background:${rgbCss(raw[k])}"` : ''}></i>`).join('');
    return `<li><button data-i="${i}"${i === scan.cur ? ' aria-current="step"' : ''} class="${raw ? 'done' : ''}"><span class="thumb">${cells}</span><span>${f} · ${SHORT[f]}${raw ? ' ✓' : ''}</span></button></li>`;
  }).join('');
}
function edgeHtml(word, cls) {
  const raw = scan.raw[WORD2FACE[word]];
  return `<span class="e ${cls}">${raw ? `<i style="background:${rgbCss(raw[4])}"></i>` : ''}${word}</span>`;
}
function renderInst() {
  const f = ORDER[scan.cur], inf = INFO[f], raw = scan.raw[f];
  const cells = Array.from({ length: 9 }, (_, k) => `<i style="background:${raw ? rgbCss(raw[k]) : (k === 4 ? '#5a5e66' : '#2a2c31')}">${k === 4 && !raw ? f : ''}</i>`).join('');
  $('#inst').innerHTML = `<div class="ifig" aria-hidden="true">${edgeHtml(inf.e[0], 't')}${edgeHtml(inf.e[3], 'l')}<div class="g">${cells}</div>${edgeHtml(inf.e[1], 'r')}${edgeHtml(inf.e[2], 'b')}</div>
    <div><b>${f} · ${inf.t} <span class="muted small">(${Object.keys(scan.raw).length}/6 erfasst)</span></b><p>${inf.d}</p></div>`;
  $('#capture').textContent = `${inf.t} erfassen`;
  const lbl = $('#gridov').querySelectorAll('.lbl');
  if (lbl.length) { lbl[0].textContent = inf.e[0]; lbl[1].textContent = inf.e[2]; }
}
$('#stepper').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  scan.cur = +b.dataset.i; renderStepper(); renderInst();
});
$('#scanReset').onclick = () => { scan.raw = {}; scan.cur = 0; renderStepper(); renderInst(); toast('Scan zurückgesetzt'); };

const VP = { mode: null, stream: null, video: null, img: null, raf: 0, grid: { x: 0.5, y: 0.5, s: 0.64 }, samples: null, last: 0, blocked: false };
const vpC = $('#vpCanvas'), vctx = vpC.getContext('2d', { willReadFrequently: true });
$('#gridov').innerHTML = '<span class="lbl t"></span>' + Array.from({ length: 9 }, () => '<div><i></i></div>').join('') + '<span class="lbl b"></span>';
VP.blocked = (() => {
  try {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return true;
    const pol = document.permissionsPolicy || document.featurePolicy;
    return !!(pol && pol.allowsFeature && !pol.allowsFeature('camera'));
  } catch (e) { return false; }
})();
function sizeVp() {
  const r = vpC.getBoundingClientRect(); if (!r.width) return;
  const w = Math.round(r.width * Math.min(devicePixelRatio || 1, 2));
  if (vpC.width !== w) { vpC.width = w; vpC.height = w; }
  drawSource(); placeGrid();
}
new ResizeObserver(sizeVp).observe($('#vp'));
function drawCover(src, sw, sh) {
  const W = vpC.width, s = Math.max(W / sw, W / sh), dw = sw * s, dh = sh * s;
  vctx.drawImage(src, (W - dw) / 2, (W - dh) / 2, dw, dh);
}
function drawSource() {
  if (VP.mode === 'live' && VP.video && VP.video.readyState >= 2 && VP.video.videoWidth) drawCover(VP.video, VP.video.videoWidth, VP.video.videoHeight);
  else if (VP.mode === 'photo' && VP.img) drawCover(VP.img, VP.img.naturalWidth, VP.img.naturalHeight);
}
const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
function sampleGrid() {
  const W = vpC.width; if (!W) return null;
  const g = VP.grid, size = g.s * W, x0 = g.x * W - size / 2, y0 = g.y * W - size / 2, cell = size / 3;
  const ix = Math.max(0, Math.floor(x0)), iy = Math.max(0, Math.floor(y0));
  const iw = Math.min(W - ix, Math.ceil(size)), ih = Math.min(W - iy, Math.ceil(size));
  if (iw < 6 || ih < 6) return null;
  const data = vctx.getImageData(ix, iy, iw, ih).data, out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const cx = x0 + (c + 0.5) * cell - ix, cy = y0 + (r + 0.5) * cell - iy, h = cell * 0.26;
    const step = Math.max(1, Math.floor(h / 7)), R = [], G = [], B = [];
    for (let y = Math.round(cy - h); y <= cy + h; y += step) for (let x = Math.round(cx - h); x <= cx + h; x += step) {
      if (x < 0 || y < 0 || x >= iw || y >= ih) continue;
      const o = (y * iw + x) * 4; R.push(data[o]); G.push(data[o + 1]); B.push(data[o + 2]);
    }
    out.push(R.length ? [med(R), med(G), med(B)] : [0, 0, 0]);
  }
  return out;
}
function placeGrid() {
  const g = VP.grid, o = $('#gridov');
  o.style.left = g.x * 100 + '%'; o.style.top = g.y * 100 + '%'; o.style.width = g.s * 100 + '%';
}
function showDots() {
  const dots = $$('#gridov i');
  dots.forEach((d, k) => { d.style.background = VP.samples ? rgbCss(VP.samples[k]) : 'transparent'; });
}
function setMode() {
  const m = VP.mode;
  $('#mLive').setAttribute('aria-pressed', m === 'live');
  $('#mPhoto').setAttribute('aria-pressed', m === 'photo');
  $('#vpEmpty').hidden = !!m;
  $('#gridov').classList.toggle('hide', !m);
  $('#capture').disabled = !m;
  $('#newPhoto').hidden = m !== 'photo';
  if (!m) {
    vctx.clearRect(0, 0, vpC.width, vpC.height);
    const done = Object.keys(scan.raw).length;
    const next = INFO[ORDER[scan.cur]].t;
    $('#vpEmptyText').textContent = VP.blocked
      ? `Die Live-Kamera ist in dieser Ansicht gesperrt – fotografiere einfach jede Seite. Auf dem Handy öffnet „Foto aufnehmen“ direkt die Kamera.${done ? ` Als Nächstes: ${next}.` : ''}`
      : (done ? `Als Nächstes: ${next}. Starte die Kamera oder mach ein Foto.` : 'Starte die Kamera oder fotografiere die Seite. Die Seite sollte das Raster ausfüllen.');
    $('#startLive').className = VP.blocked ? 'btn' : 'btn primary';
    $('#takePhoto').className = VP.blocked ? 'btn primary' : 'btn';
    $('#takePhoto').textContent = done ? `Foto: ${next}` : 'Foto aufnehmen';
  }
}
function vpMsg(msg) {
  const m = $('#vpMsg'); m.textContent = msg; m.classList.add('on');
  clearTimeout(vpMsg.t); vpMsg.t = setTimeout(() => m.classList.remove('on'), 7000);
}
function stopLive() {
  cancelAnimationFrame(VP.raf);
  if (VP.stream) { VP.stream.getTracks().forEach(t => t.stop()); VP.stream = null; }
  if (VP.mode === 'live') { VP.mode = null; setMode(); }
}
function liveLoop(t) {
  if (VP.mode !== 'live') return;
  VP.raf = requestAnimationFrame(liveLoop);
  drawSource();
  if (t - VP.last > 130) { VP.last = t; VP.samples = sampleGrid(); showDots(); }
}
async function startLive() {
  stopLive();
  if (VP.blocked) {
    vpMsg('Die Live-Kamera ist in dieser eingebetteten Ansicht gesperrt. Nutze „Foto aufnehmen“ – das Ergebnis ist genauso gut.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    VP.stream = stream;
    const v = VP.video || (VP.video = document.createElement('video'));
    v.setAttribute('playsinline', ''); v.muted = true; v.srcObject = stream;
    await v.play();
    VP.mode = 'live'; VP.img = null; setMode(); sizeVp();
    VP.raf = requestAnimationFrame(liveLoop);
  } catch (err) {
    VP.blocked = !!(err && (err.name === 'NotAllowedError' || err.name === 'SecurityError'));
    VP.mode = null; setMode();
    vpMsg(VP.blocked ? 'Kamerazugriff verweigert oder hier gesperrt. Nutze „Foto aufnehmen“ – auf dem Handy öffnet das direkt die Kamera.' : 'Kamera konnte nicht gestartet werden. Nutze „Foto aufnehmen“.');
  }
}
async function loadPhoto(file) {
  stopLive();
  const img = new Image(); img.src = URL.createObjectURL(file);
  try { await img.decode(); } catch (e) { toast('Das Bild konnte nicht geladen werden'); return; }
  VP.img = img; VP.mode = 'photo'; setMode(); sizeVp();
  VP.samples = sampleGrid(); showDots();
  vpMsg('Zieh das Raster über die Seite und passe die Größe mit dem Regler an.');
}
$('#startLive').onclick = startLive;
$('#mLive').onclick = startLive;
const pickPhoto = () => $('#fileIn').click();
$('#takePhoto').onclick = pickPhoto; $('#mPhoto').onclick = pickPhoto; $('#newPhoto').onclick = pickPhoto;
$('#fileIn').onchange = e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadPhoto(f); };
$('#gridSize').oninput = e => {
  const g = VP.grid; g.s = e.target.value / 100;
  g.x = clamp(g.x, g.s / 2, 1 - g.s / 2); g.y = clamp(g.y, g.s / 2, 1 - g.s / 2);
  placeGrid(); if (VP.mode === 'photo') { drawSource(); VP.samples = sampleGrid(); showDots(); }
};
{
  let drag = null;
  const ov = $('#gridov');
  ov.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, gx: VP.grid.x, gy: VP.grid.y }; ov.setPointerCapture(e.pointerId); ov.style.cursor = 'grabbing'; });
  ov.addEventListener('pointermove', e => {
    if (!drag) return;
    const W = $('#vp').clientWidth, g = VP.grid;
    g.x = clamp(drag.gx + (e.clientX - drag.x) / W, g.s / 2, 1 - g.s / 2);
    g.y = clamp(drag.gy + (e.clientY - drag.y) / W, g.s / 2, 1 - g.s / 2);
    placeGrid();
    if (VP.mode === 'photo') { VP.samples = sampleGrid(); showDots(); }
  });
  const end = () => { drag = null; ov.style.cursor = ''; };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
}
function capture() {
  if (!VP.mode) return;
  drawSource();
  const s = sampleGrid(); if (!s) return;
  const f = ORDER[scan.cur];
  const lab = C.rgbToLab(s[4]);
  const twin = ORDER.find(o => o !== f && scan.raw[o] && Math.hypot(...C.rgbToLab(scan.raw[o][4]).map((v, i) => (v - lab[i]) * (i ? 1 : 0.5))) < 12);
  scan.raw[f] = s;
  const vp = $('#vp'); vp.classList.remove('flash'); void vp.offsetWidth; vp.classList.add('flash');
  if (twin) toast(`Achtung: Die Mitte sieht aus wie bei ${INFO[twin].t} – richtige Seite?`);
  else toast(`${INFO[f].t} erfasst`);
  let next = -1;
  for (let k = 1; k <= 6; k++) { const j = (scan.cur + k) % 6; if (!scan.raw[ORDER[j]]) { next = j; break; } }
  if (VP.mode === 'photo') { VP.img = null; VP.mode = null; }
  if (next < 0) { scan.cur = 0; finalizeScan(); } else scan.cur = next;
  setMode(); renderStepper(); renderInst();
}
$('#capture').onclick = capture;
function finalizeScan() {
  const samples = [];
  C.FACES.forEach(f => scan.raw[f].forEach(rgb => samples.push(rgb)));
  const r = C.classify(samples), pal = C.mapPalette(r.refs);
  S.hex = pal.hex; S.names = pal.names;
  store.set('hex', S.hex); store.set('names', S.names);
  buildPal();
  setFacelets(r.facelets, { unsure: r.uncertain });
  stopLive();
  const v = C.validate(S.facelets, S.names);
  toast(v.ok ? 'Alle Seiten erfasst – der Würfel ist gültig' : 'Alle Seiten erfasst – bitte die markierten Felder prüfen');
  if (innerWidth < 900) $('#net').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
}

// ================= 3D-Würfel =================
function roundedBox(w, r, s) {
  const segs = s * 2 + 1, g = new T.BoxGeometry(1, 1, 1, segs, segs, segs);
  const pos = g.attributes.position, nor = g.attributes.normal, half = 0.5 / segs, box = w / 2 - r;
  const p = new T.Vector3(), o = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    o.set(Math.sign(p.x) * Math.max(0, Math.abs(p.x) - half), Math.sign(p.y) * Math.max(0, Math.abs(p.y) - half), Math.sign(p.z) * Math.max(0, Math.abs(p.z) - half)).normalize();
    pos.setXYZ(i, Math.sign(p.x) * box + o.x * r, Math.sign(p.y) * box + o.y * r, Math.sign(p.z) * box + o.z * r);
    nor.setXYZ(i, o.x, o.y, o.z);
  }
  return g;
}
function rrShape(w, r) {
  const s = new T.Shape(), h = w / 2;
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r); s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}
function textTex(txt, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = `800 ${size || 78}px Archivo, system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = 'rgba(10,11,13,.85)'; x.lineJoin = 'round'; x.strokeText(txt, 64, 68);
  x.fillStyle = '#fff'; x.fillText(txt, 64, 68);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const PRESET = { U: [32, 27], F: [32, 27], R: [32, 27], L: [-32, 27], B: [148, 24], D: [32, -28] };
const AXN = ['x', 'y', 'z'];
class CubeView {
  constructor() {
    const r = this.r = new T.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setClearColor(0x000000, 0);
    this.canvas = r.domElement; this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('aria-label', '3D-Würfel – ziehen zum Drehen der Ansicht, Doppelklick setzt sie zurück');
    const sc = this.scene = new T.Scene();
    this.cam = new T.PerspectiveCamera(30, 1, 0.1, 100); sc.add(this.cam);
    sc.add(new T.HemisphereLight(0xffffff, 0xb4b8bf, 1.35));
    const key = new T.DirectionalLight(0xffffff, 1.9); key.position.set(2, 3, 4); this.cam.add(key);
    const rim = new T.DirectionalLight(0xffffff, 0.45); rim.position.set(-4, -2, -3); sc.add(rim);
    this.root = new T.Group(); sc.add(this.root);
    this.cube = new T.Group(); this.root.add(this.cube);
    const bodyGeo = roundedBox(0.975, 0.11, 3);
    const bodyMat = new T.MeshStandardMaterial({ color: 0x121316, roughness: 0.68, metalness: 0.05 });
    const stGeo = new T.ExtrudeGeometry(rrShape(0.8, 0.12), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
    this.cubies = []; this.stickers = new Array(54); this.labels = [];
    const Z = new T.Vector3(0, 0, 1);
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const g = new T.Group(); g.userData.home = [x, y, z]; g.position.set(x, y, z);
      g.add(new T.Mesh(bodyGeo, bodyMat));
      const nz = [x, y, z].filter(Boolean).length;
      for (const n of DIRS) {
        if (n[0] * x + n[1] * y + n[2] * z !== 1) continue;
        const i = C.indexOf([x, y, z], n);
        const m = new T.Mesh(stGeo, new T.MeshStandardMaterial({ color: 0x777777, roughness: 0.32, metalness: 0 }));
        m.quaternion.setFromUnitVectors(Z, new T.Vector3(...n));
        m.position.set(...n).multiplyScalar(0.478);
        g.add(m); this.stickers[i] = m;
        if (nz === 1) {
          const face = C.FACES[Math.floor(i / 9)];
          const zA = new T.Vector3(...n), yA = face === 'U' ? new T.Vector3(0, 0, -1) : face === 'D' ? new T.Vector3(0, 0, 1) : new T.Vector3(0, 1, 0);
          const xA = new T.Vector3().crossVectors(yA, zA);
          const lab = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), new T.MeshBasicMaterial({ map: textTex(face), transparent: true, depthWrite: false }));
          lab.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(xA, yA, zA));
          lab.position.set(...n).multiplyScalar(0.508); lab.visible = false;
          g.add(lab); this.labels.push(lab);
        }
      }
      this.cube.add(g); this.cubies.push(g);
    }
    this.buildArrow();
    this.state = C.SOLVED.slice(); this.hex = S.hex;
    this.view = { az: 32, el: 27 }; this.tgt = { az: 32, el: 27 }; this.follow = true;
    this.anim = null; this.pend = null; this.lift = { axis: 0, layer: 0, on: false, amt: 0 };
    this.spinA = null; this.visible = false; this.dirty = true; this.lt = 0;
    this.paint(); this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  buildArrow() {
    const mk = (sweep, start) => {
      const g = new T.Group(), pts = [], R = 1.0, a0 = start * Math.PI / 180, a1 = a0 - sweep * Math.PI / 180;
      for (let i = 0; i <= 48; i++) { const a = a0 + (a1 - a0) * i / 48; pts.push(new T.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
      const curve = new T.CatmullRomCurve3(pts);
      const white = new T.MeshBasicMaterial({ color: 0xffffff }), dark = new T.MeshBasicMaterial({ color: 0x0d0e10, side: T.BackSide });
      g.add(new T.Mesh(new T.TubeGeometry(curve, 64, 0.055, 10, false), white));
      g.add(new T.Mesh(new T.TubeGeometry(curve, 64, 0.085, 10, false), dark));
      const tip = new T.Vector3(R * Math.cos(a1), R * Math.sin(a1), 0), dir = new T.Vector3(Math.sin(a1), -Math.cos(a1), 0);
      const rotZ = Math.atan2(dir.y, dir.x) - Math.PI / 2;
      [[0.19, 0.4, -0.03, 0.08, white], [0.27, 0.52, -0.09, 0.15, dark]].forEach(([w, h, b, depth, mat]) => {
        const sh = new T.Shape(); sh.moveTo(-w, b); sh.lineTo(w, b); sh.lineTo(0, h); sh.lineTo(-w, b);
        const geo = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); geo.translate(0, 0, -depth / 2);
        const head = new T.Mesh(geo, mat);
        head.rotation.z = rotZ; head.position.copy(tip);
        g.add(head);
      });
      g.userData.tail = new T.Vector3(R * Math.cos(a0), R * Math.sin(a0), 0);
      return g;
    };
    this.arrow = new T.Group(); this.orient = new T.Group(); this.mirror = new T.Group(); this.spinner = new T.Group();
    this.arrow.add(this.orient); this.orient.add(this.mirror); this.mirror.add(this.spinner);
    this.aQuarter = mk(115, 147.5); this.aHalf = mk(275, 227.5);
    this.spinner.add(this.aQuarter, this.aHalf);
    const sm = new T.SpriteMaterial({ map: textTex('2×', 64), transparent: true });
    this.twoX = new T.Sprite(sm); this.twoX.scale.setScalar(0.75); this.twoX.position.set(0, 0, 0.62);
    this.arrow.add(this.twoX);
    this.arrow.visible = false; this.phi = null; this._v = new T.Vector3(); this.root.add(this.arrow);
  }
  bindPointer() {
    let d = null;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', e => { d = { x: e.clientX, y: e.clientY, az: this.tgt.az, el: this.tgt.el }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!d) return;
      this.tgt.az = d.az - (e.clientX - d.x) * 0.45;
      this.tgt.el = clamp(d.el + (e.clientY - d.y) * 0.4, -80, 80);
      this.view.az = this.tgt.az; this.view.el = this.tgt.el; this.dirty = true;
    });
    const end = () => { d = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', () => this.resetView());
  }
  mount(el) { if (this.canvas.parentNode !== el) el.appendChild(this.canvas); this.tag = el.querySelector('.viewtag'); this.tagTxt = null; this.visible = true; this.resize(); this.dirty = true; }
  updTag() {
    if (!this.tag) return;
    const az = ((this.view.az % 360) + 540) % 360 - 180, A = Math.abs(az);
    const side = A <= 55 ? '' : A >= 125 ? 'hinten' : az > 0 ? 'rechts' : 'links';
    const txt = this.view.el < -12 ? `Ansicht von unten${side ? ' / ' + side : ''}` : side ? `Ansicht von ${side}` : '';
    if (txt === this.tagTxt) return;
    this.tagTxt = txt;
    if (txt) this.tag.textContent = txt + ' – deinen Würfel nicht mitdrehen';
    this.tag.classList.toggle('on', !!txt);
  }
  unmount() { this.visible = false; }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    const v = this.cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(v / 2) * this.cam.aspect);
    this.dist = (this.cam.aspect < 0.95 ? 3.15 : 2.85) / Math.sin(Math.min(v, hf) / 2);
    this.cam.updateProjectionMatrix(); this.dirty = true;
  }
  camDir(v) {
    const a = v.az * Math.PI / 180, e = v.el * Math.PI / 180;
    return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  }
  ensureFace(face) {
    if (!this.follow) return;
    const n = C.NORMAL[face], d = this.camDir(this.tgt);
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0.3) return;
    this.tgt.az = PRESET[face][0]; this.tgt.el = PRESET[face][1];
  }
  resetView() { this.tgt.az = 32; this.tgt.el = 27; this.dirty = true; }
  setLabels(on) { this.labels.forEach(l => { l.visible = on; }); this.dirty = true; }
  paint() {
    this.stickers.forEach((m, i) => { const v = this.state[i]; m.material.color.set(v < 0 ? '#55585e' : this.hex[v]); });
    this.dirty = true;
  }
  setState(st) {
    this.state = st.slice();
    this.cubies.forEach(c => { c.position.set(...c.userData.home); c.quaternion.identity(); });
    this.paint(); this.applyLift();
  }
  setPending(m) {
    this.pend = m || null;
    const mv = m ? C.parseMove(m) : null;
    if (!mv) { this.lift.on = false; this.arrow.visible = false; this.dirty = true; return; }
    if (this.lift.axis !== mv.axis || this.lift.layer !== mv.layer) { this.lift.amt = 0; this.applyLift(); }
    this.lift.axis = mv.axis; this.lift.layer = mv.layer; this.lift.on = true;
    const n = new T.Vector3(...C.NORMAL[mv.face]);
    this.arrow.position.copy(n).multiplyScalar(1.72);
    if (!this.arrowFace || this.arrowFace !== mv.face) this.phi = null;
    this.arrowFace = mv.face;
    this.arrow.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
    const half = Math.abs(mv.amount) === 2;
    this.mirror.scale.x = mv.amount === -1 ? -1 : 1;
    this.aQuarter.visible = !half; this.aHalf.visible = half;
    this.twoX.visible = half;
    this.arrow.visible = !this.anim; this.dirty = true;
  }
  applyLift() {
    if (this.anim) return;
    const L = this.lift;
    this.cubies.forEach(c => {
      const h = c.userData.home; c.position.set(h[0], h[1], h[2]);
      if (L.amt > 0 && h[L.axis] === L.layer) c.position.setComponent(L.axis, h[L.axis] + L.layer * L.amt);
    });
    this.dirty = true;
  }
  turn(m, dur, after) {
    this.finish();
    const mv = C.parseMove(m);
    if (!mv || RM || dur <= 0 || !this.visible) { this.setState(after); this.setPending(this.pend); return Promise.resolve(); }
    this.arrow.visible = false;
    const pivot = new T.Group(); this.cube.add(pivot);
    const sel = this.cubies.filter(c => c.userData.home[mv.axis] === mv.layer);
    sel.forEach(c => pivot.attach(c));
    return new Promise(res => {
      this.anim = { pivot, sel, ax: AXN[mv.axis], total: mv.quarter * Math.PI / 2, t0: performance.now(), dur: dur * (Math.abs(mv.amount) === 2 ? 1.45 : 1), after, res };
      this.dirty = true;
    });
  }
  finish() {
    const a = this.anim; if (!a) return;
    this.anim = null;
    a.sel.forEach(c => this.cube.attach(c)); this.cube.remove(a.pivot);
    this.lift.amt = 0; this.setState(a.after);
    this.setPending(this.pend);
    a.res();
  }
  celebrate() { if (!RM) this.spinA = { t0: performance.now(), dur: 1500 }; }
  loop(t) {
    requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const dt = Math.min(0.05, (t - (this.lt || t)) / 1000); this.lt = t;
    let act = false;
    const daz = ((this.tgt.az - this.view.az + 540) % 360) - 180, del = this.tgt.el - this.view.el;
    if (Math.abs(daz) > 0.05 || Math.abs(del) > 0.05) { const k = 1 - Math.pow(0.004, dt); this.view.az += daz * k; this.view.el += del * k; act = true; }
    if (this.anim) {
      const a = this.anim, p = (t - a.t0) / a.dur;
      if (p >= 1) this.finish(); else a.pivot.rotation[a.ax] = a.total * ease(Math.max(0, p));
      act = true;
    } else {
      const L = this.lift, target = L.on ? 0.085 : 0;
      if (Math.abs(L.amt - target) > 1e-4) { L.amt += (target - L.amt) * (1 - Math.pow(0.0004, dt)); if (Math.abs(L.amt - target) < 2e-4) L.amt = target; this.applyLift(); act = true; }
    }
    if (this.arrow.visible) {
      this.spinner.rotation.z = -0.2 * (0.5 - 0.5 * Math.cos(t / 1000 * 3.4));
      const d = this.camDir(this.view);
      this._v.set(d[0], d[1], d[2]).applyQuaternion(this.arrow.quaternion.clone().invert());
      const want = Math.hypot(this._v.x, this._v.y) > 0.25 ? Math.atan2(this._v.y, this._v.x) - Math.PI / 2 : 0;
      if (this.phi == null) this.phi = want;
      else this.phi += (((want - this.phi) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * (1 - Math.pow(0.002, dt));
      this.orient.rotation.z = this.phi;
      act = true;
    }
    if (this.spinA) {
      const p = (t - this.spinA.t0) / this.spinA.dur;
      if (p >= 1) { this.root.rotation.y = 0; this.root.scale.setScalar(1); this.spinA = null; }
      else { this.root.rotation.y = ease(p) * Math.PI * 2; this.root.scale.setScalar(1 + 0.07 * Math.sin(p * Math.PI)); }
      act = true;
    }
    if (act || this.dirty) {
      const d = this.camDir(this.view), D = this.dist || 12;
      this.cam.position.set(d[0] * D, d[1] * D, d[2] * D); this.cam.lookAt(0, 0, 0);
      this.r.render(this.scene, this.cam); this.dirty = false; this.updTag();
    }
  }
}
let view = null;
try { view = new CubeView(); }
catch (e) { view = null; }
function miniNet(el, st, hex) {
  el.innerHTML = NET.map(([f, c, r]) => {
    const fi = C.FACES.indexOf(f);
    return `<div class="mf" style="grid-column:${c};grid-row:${r}">${Array.from({ length: 9 }, (_, k) => `<i style="background:${st[fi * 9 + k] < 0 ? '#555' : hex[st[fi * 9 + k]]}"></i>`).join('')}</div>`;
  }).join('');
}
function fallbackStage(stage, st, hex) {
  let fb = stage.querySelector('.fallback');
  if (!fb) { fb = document.createElement('div'); fb.className = 'fallback'; fb.innerHTML = '<div><div class="minnet" style="width:min(80vw,360px)"></div><p class="muted small" style="text-align:center">3D wird von diesem Browser nicht unterstützt – hier die Netzansicht.</p></div>'; stage.appendChild(fb); }
  miniNet(fb.querySelector('.minnet'), st, hex);
}

// ================= Lösungs-Player =================
const FACE_DE = { U: 'Obere Seite', D: 'Untere Seite', R: 'Rechte Seite', L: 'Linke Seite', F: 'Vorderseite', B: 'Rückseite' };
const TIP = {
  U: ['Von vorne gesehen wandert die oberste Reihe nach links.', 'Von vorne gesehen wandert die oberste Reihe nach rechts.'],
  D: ['Von vorne gesehen wandert die unterste Reihe nach rechts.', 'Von vorne gesehen wandert die unterste Reihe nach links.'],
  R: ['Die rechte Spalte wandert vorne nach oben.', 'Die rechte Spalte wandert vorne nach unten.'],
  L: ['Die linke Spalte wandert vorne nach unten.', 'Die linke Spalte wandert vorne nach oben.'],
  F: ['Die Vorderseite dreht wie ein Uhrzeiger – oben wandert nach rechts.', 'Die Vorderseite dreht gegen den Uhrzeiger – oben wandert nach links.'],
  B: ['Von vorne gesehen wandert die oberste Reihe der Rückseite nach links.', 'Von vorne gesehen wandert die oberste Reihe der Rückseite nach rechts.']
};
function moveText(m, names) {
  const mv = C.parseMove(m), f = mv.face, fi = C.FACES.indexOf(f);
  const dir = mv.amount === 2 ? 'halbe Drehung (180°)' : mv.amount === 1 ? '¼ im Uhrzeigersinn' : '¼ gegen den Uhrzeigersinn';
  const tip = mv.amount === 2 ? 'Zweimal in dieselbe Richtung drehen – welche, ist egal.' : TIP[f][mv.amount === 1 ? 0 : 1];
  return { desc: `${FACE_DE[f]} (Mitte ${names[fi]}) · ${dir}`, tip, fi };
}
const P = { start: null, moves: [], states: [], idx: 0, playing: false, tok: 0, hex: S.hex, names: S.names, labels: false };
let curView = null;
const speed = () => +$('#speed').value;
const dur = () => 520 / speed();
const gap = () => ($('#pauseEach').checked ? 900 : 170) / speed();
function loadSolution(start, moves, hex, names) {
  P.start = start.slice(); P.moves = moves.slice(); P.hex = hex.slice(); P.names = names.slice();
  P.states = [P.start];
  P.moves.forEach((m, i) => P.states.push(C.apply(P.states[i], m)));
  P.idx = 0; pause();
  if (!C.isSolved(P.states[P.states.length - 1])) toast('Hinweis: Die Lösung prüft sich nicht – bitte melde den Zustands-Code.');
  store.set('sol', { start: P.start, moves: P.moves, hex: P.hex, names: P.names });
  $('#solEmpty').hidden = true; $('#solMain').hidden = false;
  $('#holdHint').innerHTML = `Halte <span class="lg">deinen Würfel </span>so: <span class="chip"><i style="background:${P.hex[0]}"></i>${P.names[0]} oben</span><span class="chip"><i style="background:${P.hex[2]}"></i>${P.names[2]} vorne</span>`;
  $('#tlHead').textContent = `Alle Züge (${P.moves.length})`;
  $('#tl').innerHTML = P.moves.map((m, i) => `<button data-i="${i}" title="Zu Zug ${i + 1} springen"><i style="background:${P.hex[C.FACES.indexOf(m[0])]}"></i>${m}</button>`).join('');
  if (curView === 'loesung') showPlayer();
  updUI();
}
function showPlayer() {
  if (view) {
    view.mount($('#stageSolve')); view.hex = P.hex; view.setLabels(P.labels);
    view.setState(P.states[P.idx]); view.setPending(P.moves[P.idx]); view.resetView();
    if (P.moves[P.idx]) view.ensureFace(P.moves[P.idx][0]);
  } else fallbackStage($('#stageSolve'), P.states[P.idx], P.hex);
}
function updUI() {
  const n = P.moves.length, i = P.idx, m = P.moves[i];
  const big = $('#mvBig');
  if (m) {
    const t = moveText(m, P.names);
    $('#stepLbl').textContent = 'Nächster Zug'; $('#stepCnt').textContent = `Zug ${i + 1} von ${n}`;
    big.textContent = m; $('#mvFace').style.background = P.hex[t.fi]; $('#mvFace').style.visibility = 'visible';
    $('#mvDesc').textContent = t.desc; $('#mvTip').textContent = t.tip;
  } else {
    $('#stepLbl').textContent = n ? 'Fertig' : 'Kein Zug nötig'; $('#stepCnt').textContent = `${n} von ${n}`;
    big.textContent = 'Gelöst'; $('#mvFace').style.visibility = 'hidden';
    $('#mvDesc').textContent = 'Alle Seiten sind einfarbig.'; $('#mvTip').textContent = 'Mit ← oder dem Anfang-Knopf kannst du zurückspulen.';
  }
  big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
  $('#bar').style.width = (n ? (i / n) * 100 : 100) + '%';
  const tl = $('#tl');
  [...tl.children].forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('cur', k === i); });
  const cur = tl.children[i];
  if (cur) { const top = cur.offsetTop - tl.offsetTop; if (top < tl.scrollTop || top > tl.scrollTop + tl.clientHeight - 44) tl.scrollTop = top - 50; }
  $('#cPrev').disabled = $('#cFirst').disabled = i === 0;
  $('#cNext').disabled = $('#cLast').disabled = i >= n;
  $('#playIco').innerHTML = P.playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  $('#cPlay').setAttribute('aria-label', P.playing ? 'Pause' : 'Abspielen');
}
function stepFwd() {
  if (P.idx >= P.moves.length) return Promise.resolve();
  const m = P.moves[P.idx]; P.idx++;
  const tok = P.tok;
  let pr;
  if (view) { pr = view.turn(m, dur(), P.states[P.idx]); view.setPending(P.moves[P.idx]); }
  else { fallbackStage($('#stageSolve'), P.states[P.idx], P.hex); pr = sleep(dur()); }
  updUI();
  if (P.idx === P.moves.length) pr.then(() => { if (P.idx === P.moves.length) { view && view.celebrate(); confetti(P.hex); toast('Gelöst! Gut gemacht.'); } });
  return pr.then(() => { if (view && tok === P.tok && P.moves[P.idx]) view.ensureFace(P.moves[P.idx][0]); });
}
function stepBack() {
  if (P.idx <= 0) return Promise.resolve();
  P.idx--;
  const m = C.invert(P.moves[P.idx]);
  let pr;
  if (view) { pr = view.turn(m, dur(), P.states[P.idx]); view.setPending(P.moves[P.idx]); view.ensureFace(P.moves[P.idx][0]); }
  else { fallbackStage($('#stageSolve'), P.states[P.idx], P.hex); pr = Promise.resolve(); }
  updUI();
  return pr;
}
function jump(i) {
  pause();
  P.idx = clamp(i, 0, P.moves.length);
  if (view) { view.finish(); view.setState(P.states[P.idx]); view.setPending(P.moves[P.idx]); if (P.moves[P.idx]) view.ensureFace(P.moves[P.idx][0]); }
  else fallbackStage($('#stageSolve'), P.states[P.idx], P.hex);
  updUI();
}
function pause() { if (P.playing) { P.playing = false; } P.tok++; updUI(); }
async function play() {
  if (!P.moves.length) return;
  if (P.idx >= P.moves.length) { jump(0); await sleep(350); }
  P.playing = true; const tok = ++P.tok; updUI();
  while (P.playing && tok === P.tok && P.idx < P.moves.length) {
    await stepFwd();
    if (!P.playing || tok !== P.tok) return;
    if (P.idx < P.moves.length) await sleep(gap());
  }
  if (tok === P.tok) { P.playing = false; updUI(); }
}
const togglePlay = () => (P.playing ? pause() : play());
$('#cPlay').onclick = togglePlay;
$('#cNext').onclick = () => { pause(); stepFwd(); };
$('#cPrev').onclick = () => { pause(); stepBack(); };
$('#cFirst').onclick = () => jump(0);
$('#cLast').onclick = () => jump(P.moves.length);
$('#tl').addEventListener('click', e => { const b = e.target.closest('button'); if (b) jump(+b.dataset.i); });
$('#speed').oninput = e => { $('#speedOut').textContent = (+e.target.value).toString().replace('.', ',') + '×'; store.set('speed', +e.target.value); };
$('#pauseEach').onchange = e => store.set('pauseEach', e.target.checked);
{
  const sp = store.get('speed', 1); $('#speed').value = sp; $('#speedOut').textContent = String(sp).replace('.', ',') + '×';
  $('#pauseEach').checked = store.get('pauseEach', true);
}
const tog = (btn, fn) => { btn.onclick = () => { const on = btn.getAttribute('aria-pressed') !== 'true'; btn.setAttribute('aria-pressed', on); fn(on); }; };
tog($('#tFollow'), on => { if (view) { view.follow = on; if (on && P.moves[P.idx]) view.ensureFace(P.moves[P.idx][0]); } });
tog($('#tLabels'), on => { P.labels = on; if (view) view.setLabels(on); });
$('#tView').onclick = () => view && view.resetView();
$('#copySol').onclick = () => copyText(P.moves.join(' '));
$('#demoBtn').onclick = async () => {
  const st = C.applyAll(C.SOLVED, C.parseAlg(DEMO));
  const sol = await Solver.solve(C.toString(st));
  loadSolution(st, C.parseAlg(sol), C.STD.map(s => s.hex), C.STD.map(s => s.n));
  showPlayer();
};

// ================= Üben =================
const PR = { state: C.SOLVED.slice(), hist: [], tok: 0, labels: false };
function buildPad() {
  $('#pad').innerHTML = ['R', 'L', 'U', 'D', 'F', 'B'].map(f => {
    const fi = C.FACES.indexOf(f);
    return `<span class="fl"><i style="background:${S.hex[fi]}"></i>${f} · ${SHORT[f]}</span>` + [f, f + "'", f + '2'].map(m => `<button data-m="${m}" title="${moveText(m, S.names).desc}">${m}</button>`).join('');
  }).join('');
}
function renderHist() {
  const h = PR.hist;
  $('#pHist').innerHTML = h.length ? h.slice(-40).map(m => `<span>${m}</span>`).join('') + (h.length > 40 ? '<span>…</span>' : '') : '<span>–</span>';
}
function practiceMove(m, d) {
  PR.tok++;
  PR.hist.push(m); PR.state = C.apply(PR.state, m);
  if (view) view.turn(m, d == null ? 240 : d, PR.state); else fallbackStage($('#stagePractice'), PR.state, S.hex);
  renderHist();
  if (C.isSolved(PR.state) && PR.hist.length > 4) { toast('Gelöst!'); view && view.celebrate(); }
}
$('#pad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) practiceMove(b.dataset.m); });
$('#pUndo').onclick = () => {
  const m = PR.hist.pop(); if (!m) return;
  PR.state = C.apply(PR.state, C.invert(m));
  if (view) view.turn(C.invert(m), 240, PR.state); else fallbackStage($('#stagePractice'), PR.state, S.hex);
  renderHist();
};
$('#pReset').onclick = () => { PR.tok++; PR.hist = []; PR.state = C.SOLVED.slice(); if (view) { view.finish(); view.setState(PR.state); } else fallbackStage($('#stagePractice'), PR.state, S.hex); renderHist(); };
$('#pScramble').onclick = async () => {
  const b = $('#pScramble'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Mische…';
  try {
    const moves = C.parseAlg(await Solver.scramble()) || randomMoves(20);
    const tok = ++PR.tok;
    PR.hist = []; renderHist();
    for (const m of moves) {
      if (tok !== PR.tok) return;
      PR.state = C.apply(PR.state, m);
      if (view && curView === 'ueben') await view.turn(m, 85, PR.state);
    }
    if (view) view.setState(PR.state); else fallbackStage($('#stagePractice'), PR.state, S.hex);
    toast(`Gemischt: ${moves.join(' ')}`);
  } finally { b.disabled = false; b.textContent = 'Mischen'; }
};
$('#pSolve').onclick = async () => {
  if (C.isSolved(PR.state)) { toast('Der Würfel ist schon gelöst – erst mischen'); return; }
  const sol = await Solver.solve(C.toString(PR.state));
  loadSolution(PR.state, C.parseAlg(sol), S.hex, S.names);
  location.hash = 'loesung';
};
$('#pEdit').onclick = () => { setFacelets(PR.state); location.hash = 'erfassen'; toast('Zustand in den Editor übernommen'); };
tog($('#pLabels'), on => { PR.labels = on; if (view) view.setLabels(on); });
$('#pView').onclick = () => view && view.resetView();

// ================= Timer =================
const TM = { st: 'idle', t0: 0, raf: 0, holdT: 0, insp0: 0, inspHad: false, times: store.get('times', []), scr: null };
if (!Array.isArray(TM.times)) TM.times = [];
const fmt = ms => {
  if (ms === Infinity || ms == null) return 'DNF';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0');
};
const eff = t => (t.pen === 'dnf' ? Infinity : t.ms + (t.pen === 2 ? 2000 : 0));
function avg(list, n) {
  if (list.length < n) return null;
  const v = list.slice(0, n).map(eff).sort((a, b) => a - b);
  const trim = Math.max(1, Math.round(n * 0.05));
  const mid = v.slice(trim, n - trim);
  return mid.some(x => x === Infinity) ? Infinity : mid.reduce((a, b) => a + b, 0) / mid.length;
}
function renderTimes() {
  const L = TM.times, valid = L.map(eff).filter(x => x !== Infinity);
  const best = valid.length ? Math.min(...valid) : null;
  const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  const cell = (v, l) => `<div><b>${v == null ? '–' : fmt(v)}</b><span>${l}</span></div>`;
  $('#tStats').innerHTML = cell(best, 'Bestzeit') + cell(avg(L, 5), 'Ø 5') + cell(avg(L, 12), 'Ø 12') + cell(mean, 'Mittelwert') + `<div><b>${L.length}</b><span>Versuche</span></div>`;
  $('#tList').innerHTML = L.map((t, i) => `<li title="${t.scr || ''}"><span class="n">${L.length - i}.</span><b>${fmt(eff(t))}${t.pen === 2 ? '+' : ''}</b><button data-a="p2" data-i="${i}" aria-label="Plus 2">+2</button><button data-a="dnf" data-i="${i}" aria-label="DNF">DNF</button><button data-a="del" data-i="${i}" aria-label="Löschen">✕</button></li>`).join('');
  store.set('times', L.slice(0, 500));
}
$('#tList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const t = TM.times[+b.dataset.i]; if (!t) return;
  if (b.dataset.a === 'del') TM.times.splice(+b.dataset.i, 1);
  else if (b.dataset.a === 'p2') t.pen = t.pen === 2 ? 0 : 2;
  else t.pen = t.pen === 'dnf' ? 0 : 'dnf';
  renderTimes();
});
$('#tClear').onclick = () => {
  if (!TM.times.length) return;
  const b = $('#tClear');
  if (b.dataset.sure) { TM.times = []; renderTimes(); b.textContent = 'Alle löschen'; delete b.dataset.sure; toast('Zeiten gelöscht'); }
  else { b.dataset.sure = 1; b.textContent = 'Wirklich alle löschen?'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Alle löschen'; }, 3500); }
};
async function newScramble() {
  $('#scrAlg').innerHTML = '<span class="muted">Mischfolge wird erzeugt…</span>';
  try { TM.scr = (await Solver.scramble()).trim(); }
  catch (e) { TM.scr = randomMoves(20).join(' '); }
  $('#scrAlg').textContent = TM.scr;
  miniNet($('#scrNet'), C.applyAll(C.SOLVED, C.parseAlg(TM.scr) || []), C.STD.map(s => s.hex));
}
$('#scrNew').onclick = newScramble;
$('#scrSolve').onclick = async () => {
  if (!TM.scr) return;
  const st = C.applyAll(C.SOLVED, C.parseAlg(TM.scr));
  loadSolution(st, C.parseAlg(await Solver.solve(C.toString(st))), C.STD.map(s => s.hex), C.STD.map(s => s.n));
  location.hash = 'loesung';
};
$('#insp').checked = store.get('insp', false);
$('#insp').onchange = e => store.set('insp', e.target.checked);
function tSet(st) {
  TM.st = st;
  const f = $('#tface');
  f.className = 'tface' + (st === 'hold' ? ' hold' : st === 'ready' ? ' ready' : st === 'insp' || st === 'inspHold' ? ' insp' : '');
  if (st === 'inspHold') f.classList.add('hold');
  $('#tHint').textContent = st === 'running' ? 'Beliebige Taste oder Tippen stoppt.' : st === 'insp' ? 'Inspektion läuft – halten, wenn du bereit bist.' : st === 'ready' ? 'Loslassen zum Starten' : 'Leertaste (oder hier) halten, bis die Zeit grün wird – loslassen startet.';
}
function tFrame() {
  if (TM.st === 'running') { $('#tTime').textContent = fmt(performance.now() - TM.t0); TM.raf = requestAnimationFrame(tFrame); }
  else if (TM.st === 'insp' || TM.st === 'inspHold' || (TM.st === 'ready' && TM.inspHad) || (TM.st === 'hold' && TM.inspHad)) {
    const left = 15 - (performance.now() - TM.insp0) / 1000;
    $('#tTime').textContent = left > 0 ? Math.ceil(left) : left > -2 ? '+2' : 'DNF';
    TM.raf = requestAnimationFrame(tFrame);
  }
}
function tDown() {
  if (TM.st === 'running') { tStop(); return; }
  if (TM.st === 'idle' || TM.st === 'insp') {
    const wasInsp = TM.st === 'insp';
    tSet('hold'); if (!wasInsp) $('#tTime').textContent = '0.00';
    clearTimeout(TM.holdT);
    TM.holdT = setTimeout(() => { if (TM.st === 'hold') tSet('ready'); }, 300);
  }
}
function tUp() {
  if (TM.st === 'ready') { tStart(); return; }
  if (TM.st === 'hold') {
    clearTimeout(TM.holdT);
    if (TM.inspHad) { tSet('insp'); return; }
    if ($('#insp').checked) { TM.inspHad = true; TM.insp0 = performance.now(); tSet('insp'); cancelAnimationFrame(TM.raf); tFrame(); }
    else tSet('idle');
  }
}
function tStart() {
  TM.pen = 0;
  if (TM.inspHad) { const over = (performance.now() - TM.insp0) / 1000 - 15; if (over > 2) TM.pen = 'dnf'; else if (over > 0) TM.pen = 2; }
  TM.t0 = performance.now(); tSet('running'); cancelAnimationFrame(TM.raf); tFrame();
}
function tStop() {
  const ms = performance.now() - TM.t0;
  cancelAnimationFrame(TM.raf); TM.inspHad = false;
  TM.times.unshift({ ms: Math.round(ms), pen: TM.pen || 0, scr: TM.scr, at: Date.now() });
  $('#tTime').textContent = fmt(eff(TM.times[0])) + (TM.pen === 2 ? '+' : '');
  tSet('idle'); renderTimes(); newScramble();
  const valid = TM.times.slice(1).map(eff).filter(x => x !== Infinity);
  if (valid.length && eff(TM.times[0]) < Math.min(...valid)) { toast('Neue Bestzeit!'); confetti(C.STD.map(s => s.hex)); }
}
{
  const f = $('#tface');
  f.addEventListener('pointerdown', e => { e.preventDefault(); tDown(); });
  f.addEventListener('pointerup', e => { e.preventDefault(); tUp(); });
  f.addEventListener('pointercancel', () => { if (TM.st === 'hold' || TM.st === 'ready') tSet(TM.inspHad ? 'insp' : 'idle'); });
}

// ================= Konfetti =================
function confetti(cols) {
  if (RM) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * d; cv.height = innerHeight * d;
  const parts = Array.from({ length: 170 }, () => ({
    x: innerWidth * (0.25 + Math.random() * 0.5), y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 14, vy: -8 - Math.random() * 11,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, s: 7 + Math.random() * 7, c: cols[Math.floor(Math.random() * 6)]
  }));
  const t0 = performance.now();
  (function fr(t) {
    const p = (t - t0) / 2400;
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (p >= 1) return;
    for (const q of parts) {
      q.vy += 0.35; q.vx *= 0.985; q.x += q.vx; q.y += q.vy; q.r += q.vr;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1 - p) * 2.5); ctx.translate(q.x, q.y); ctx.rotate(q.r);
      ctx.fillStyle = q.c; ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s * 0.8); ctx.restore();
    }
    requestAnimationFrame(fr);
  })(t0);
}

// ================= Navigation & Tastatur =================
const VIEWS = ['erfassen', 'loesung', 'ueben', 'timer'];
function route() {
  let v = location.hash.slice(1);
  if (!VIEWS.includes(v)) v = 'erfassen';
  if (v === curView) return;
  const prev = curView; curView = v;
  VIEWS.forEach(x => $('#v-' + x).classList.toggle('on', x === v));
  $$('.tabs a').forEach(a => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (prev === 'erfassen') stopLive();
  if (prev === 'loesung') pause();
  if (prev === 'timer' && TM.st !== 'running') { tSet('idle'); TM.inspHad = false; }
  if (v === 'loesung' && P.moves.length) showPlayer();
  else if (v === 'ueben') {
    buildPad();
    if (view) { view.mount($('#stagePractice')); view.hex = S.hex; view.setLabels(PR.labels); view.finish(); view.setState(PR.state); view.setPending(null); view.resetView(); }
    else fallbackStage($('#stagePractice'), PR.state, S.hex);
  } else if (view) view.unmount();
  if (v === 'timer' && !TM.scr) newScramble();
  if (v === 'erfassen') { sizeVp(); setMode(); }
  if (prev) scrollTo({ top: 0, behavior: 'auto' });
}
addEventListener('hashchange', route);
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onBtn = e.target.closest && e.target.closest('button,a,summary');
  if (curView === 'timer') {
    if (onBtn && e.code === 'Space') e.target.blur();
    if (TM.st === 'running' && !['Shift', 'Tab'].includes(e.key)) { e.preventDefault(); tStop(); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) tDown(); }
    return;
  }
  if (curView === 'loesung' && P.moves.length) {
    if (e.code === 'Space' && !onBtn) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); stepFwd(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); stepBack(); }
    else if (e.key === 'Home') { e.preventDefault(); jump(0); }
    else if (e.key === 'End') { e.preventDefault(); jump(P.moves.length); }
    return;
  }
  if (curView === 'ueben') {
    const k = e.key.toUpperCase();
    if (k.length === 1 && 'RLUDFB'.includes(k)) { e.preventDefault(); practiceMove(k + (e.shiftKey ? "'" : '')); }
    else if (e.key === 'Backspace') { e.preventDefault(); $('#pUndo').click(); }
    return;
  }
  if (curView === 'erfassen') {
    if (/^[1-6]$/.test(e.key)) setBrush(+e.key - 1);
    else if ((e.code === 'Space' || e.key === 'Enter') && VP.mode && !onBtn) { e.preventDefault(); capture(); }
  }
});
addEventListener('keyup', e => { if (curView === 'timer' && e.code === 'Space') { e.preventDefault(); tUp(); } });

// ================= Start =================
buildNet(); buildPal(); refresh(); renderStepper(); renderInst(); setMode(); renderTimes(); renderHist();
Solver.init();
{
  const sol = store.get('sol');
  if (sol && Array.isArray(sol.moves) && Array.isArray(sol.start) && sol.start.length === 54 && arr6(sol.hex) && arr6(sol.names)) {
    try { loadSolution(sol.start, sol.moves.filter(m => C.parseMove(m)), sol.hex, sol.names); } catch (e) { /* ignorieren */ }
  }
}
route();
window.__app = { C, S, P, PR, view, Solver, loadSolution, jump, stepFwd, stepBack, scan, VP, capture, finalizeScan };
}
