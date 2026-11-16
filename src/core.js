/* Würfel-Kern: Facelet-Modell, Züge, Validierung, Farbklassifizierung */
(function (root) {
  'use strict';
  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const NORMAL = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };

  // Facelet-Index -> Position des Steins und Flächennormale (Kociemba-Reihenfolge URFDLB)
  function geom(i) {
    const f = FACES[Math.floor(i / 9)], k = i % 9, r = Math.floor(k / 3), c = k % 3;
    switch (f) {
      case 'U': return { pos: [c - 1, 1, r - 1], n: NORMAL.U };
      case 'R': return { pos: [1, 1 - r, 1 - c], n: NORMAL.R };
      case 'F': return { pos: [c - 1, 1 - r, 1], n: NORMAL.F };
      case 'D': return { pos: [c - 1, -1, 1 - r], n: NORMAL.D };
      case 'L': return { pos: [-1, 1 - r, c - 1], n: NORMAL.L };
      default: return { pos: [1 - c, 1 - r, -1], n: NORMAL.B };
    }
  }
  const key = (p, n) => p.join(',') + '|' + n.join(',');
  const GEOM = [], INDEX = new Map();
  for (let i = 0; i < 54; i++) { const g = geom(i); GEOM.push(g); INDEX.set(key(g.pos, g.n), i); }
  const indexOf = (pos, n) => INDEX.get(key(pos, n));

  // +90° um die Achse (gegen den Uhrzeigersinn, von der positiven Achse aus gesehen)
  function rot90(v, axis) {
    const [x, y, z] = v;
    if (axis === 0) return [x, -z, y];
    if (axis === 1) return [z, y, -x];
    return [-y, x, z];
  }

  // Achse, Ebene, Vorzeichen einer Vierteldrehung im Uhrzeigersinn
  const DEF = { U: [1, 1, -1], D: [1, -1, 1], R: [0, 1, -1], L: [0, -1, 1], F: [2, 1, -1], B: [2, -1, 1] };
  const MOVE_RE = /^([URFDLB])(2|'|)$/;
  function parseMove(m) {
    const t = MOVE_RE.exec(m);
    if (!t) return null;
    const [axis, layer, cw] = DEF[t[1]];
    const amount = t[2] === '2' ? 2 : t[2] === "'" ? -1 : 1;
    return { face: t[1], axis, layer, amount, quarter: cw * amount, name: m };
  }

  const PERM = {};
  function perm(m) {
    if (PERM[m]) return PERM[m];
    const mv = parseMove(m);
    if (!mv) throw new Error('Ungültiger Zug: ' + m);
    const turns = ((mv.quarter % 4) + 4) % 4;
    const p = new Array(54);
    for (let i = 0; i < 54; i++) p[i] = i;
    for (let i = 0; i < 54; i++) {
      const g = GEOM[i];
      if (g.pos[mv.axis] !== mv.layer) continue;
      let pos = g.pos, n = g.n;
      for (let k = 0; k < turns; k++) { pos = rot90(pos, mv.axis); n = rot90(n, mv.axis); }
      p[indexOf(pos, n)] = i;
    }
    return (PERM[m] = p);
  }
  function apply(state, m) {
    const p = perm(m), out = new Array(54);
    for (let i = 0; i < 54; i++) out[i] = state[p[i]];
    return out;
  }
  const applyAll = (state, moves) => moves.reduce(apply, state);
  const invert = m => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'");
  const invertAll = moves => moves.slice().reverse().map(invert);

  function parseAlg(s) {
    const clean = String(s || '').replace(/[’‘´`′]/g, "'").replace(/[()\[\],;]/g, ' ').trim();
    if (!clean) return [];
    const out = [];
    for (let tok of clean.split(/\s+/)) {
      tok = tok.replace(/^([URFDLB])2'$/, '$12').replace(/^([urfdlb])/, c => c.toUpperCase());
      if (!MOVE_RE.test(tok)) return null;
      out.push(tok);
    }
    return out;
  }

  // Aufeinanderfolgende Züge derselben Seite zusammenfassen
  function simplify(moves) {
    const out = [];
    for (const m of moves) {
      const last = out[out.length - 1];
      if (last && last[0] === m[0]) {
        const q = (parseMove(last).amount + parseMove(m).amount + 8) % 4;
        out.pop();
        if (q === 1) out.push(m[0]); else if (q === 2) out.push(m[0] + '2'); else if (q === 3) out.push(m[0] + "'");
      } else out.push(m);
    }
    return out;
  }

  const SOLVED = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));
  const isSolved = st => st.every((v, i) => v === Math.floor(i / 9));
  const toString = st => st.map(v => (v < 0 ? '?' : FACES[v])).join('');
  function fromString(s) {
    s = String(s || '').trim().toUpperCase();
    if (!/^[URFDLB]{54}$/.test(s)) return null;
    const st = s.split('').map(ch => FACES.indexOf(ch));
    for (let f = 0; f < 6; f++) if (st[f * 9 + 4] !== f) return null;
    return st;
  }

  // ---------- Validierung (nach Kociembas FaceCube) ----------
  const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;
  const fi = (face, n) => face * 9 + n - 1;
  const CF = [[fi(U, 9), fi(R, 1), fi(F, 3)], [fi(U, 7), fi(F, 1), fi(L, 3)], [fi(U, 1), fi(L, 1), fi(B, 3)], [fi(U, 3), fi(B, 1), fi(R, 3)],
    [fi(D, 3), fi(F, 9), fi(R, 7)], [fi(D, 1), fi(L, 9), fi(F, 7)], [fi(D, 7), fi(B, 9), fi(L, 7)], [fi(D, 9), fi(R, 9), fi(B, 7)]];
  const CC = [[U, R, F], [U, F, L], [U, L, B], [U, B, R], [D, F, R], [D, L, F], [D, B, L], [D, R, B]];
  const EF = [[fi(U, 6), fi(R, 2)], [fi(U, 8), fi(F, 2)], [fi(U, 4), fi(L, 2)], [fi(U, 2), fi(B, 2)], [fi(D, 6), fi(R, 8)], [fi(D, 2), fi(F, 8)],
    [fi(D, 4), fi(L, 8)], [fi(D, 8), fi(B, 8)], [fi(F, 6), fi(R, 4)], [fi(F, 4), fi(L, 6)], [fi(B, 6), fi(L, 4)], [fi(B, 4), fi(R, 6)]];
  const EC = [[U, R], [U, F], [U, L], [U, B], [D, R], [D, F], [D, L], [D, B], [F, R], [F, L], [B, L], [B, R]];

  function parity(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++;
    return s % 2;
  }

  function validate(st, names) {
    names = names || FACES;
    const nm = arr => arr.map(v => names[v]).join('-');
    const unknown = [];
    st.forEach((v, i) => { if (v < 0) unknown.push(i); });
    if (unknown.length) return { ok: false, kind: 'unknown', msg: `Noch ${unknown.length} ${unknown.length === 1 ? 'Feld' : 'Felder'} ohne Farbe.`, cells: unknown };
    const cnt = [0, 0, 0, 0, 0, 0];
    st.forEach(v => cnt[v]++);
    if (cnt.some(c => c !== 9)) {
      const parts = cnt.map((c, f) => (c !== 9 ? `${names[f]} ${c}×` : null)).filter(Boolean);
      const cells = [];
      st.forEach((v, i) => { if (cnt[v] > 9 && i % 9 !== 4) cells.push(i); });
      return { ok: false, kind: 'count', msg: `Jede Farbe muss genau 9-mal vorkommen. Abweichend: ${parts.join(', ')}.`, cells, counts: cnt };
    }
    const cp = [], co = [], ep = [], eo = [];
    for (let i = 0; i < 8; i++) {
      let ori = -1;
      for (let o = 0; o < 3; o++) if (st[CF[i][o]] === U || st[CF[i][o]] === D) { ori = o; break; }
      const cols = CF[i].map(x => st[x]);
      if (ori < 0) return { ok: false, kind: 'corner', msg: `Diese Ecke gibt es nicht (${nm(cols)}). Wahrscheinlich wurde eine Farbe falsch erkannt.`, cells: CF[i] };
      const c0 = st[CF[i][ori]], c1 = st[CF[i][(ori + 1) % 3]], c2 = st[CF[i][(ori + 2) % 3]];
      const j = CC.findIndex(cc => cc[0] === c0 && cc[1] === c1 && cc[2] === c2);
      if (j < 0) return { ok: false, kind: 'corner', msg: `Diese Ecke gibt es nicht (${nm(cols)}). Wahrscheinlich wurde eine Farbe falsch erkannt.`, cells: CF[i] };
      cp.push(j); co.push(ori);
    }
    for (let i = 0; i < 12; i++) {
      const a = st[EF[i][0]], b = st[EF[i][1]];
      let j = EC.findIndex(e => e[0] === a && e[1] === b), o = 0;
      if (j < 0) { j = EC.findIndex(e => e[0] === b && e[1] === a); o = 1; }
      if (j < 0) return { ok: false, kind: 'edge', msg: `Diese Kante gibt es nicht (${nm([a, b])}). Wahrscheinlich wurde eine Farbe falsch erkannt.`, cells: EF[i] };
      ep.push(j); eo.push(o);
    }
    for (let j = 0; j < 8; j++) {
      const at = cp.map((v, i) => (v === j ? i : -1)).filter(i => i >= 0);
      if (at.length > 1) return { ok: false, kind: 'dup', msg: `Die Ecke ${nm(CC[j])} kommt ${at.length}-mal vor.`, cells: at.flatMap(i => CF[i]) };
    }
    for (let j = 0; j < 12; j++) {
      const at = ep.map((v, i) => (v === j ? i : -1)).filter(i => i >= 0);
      if (at.length > 1) return { ok: false, kind: 'dup', msg: `Die Kante ${nm(EC[j])} kommt ${at.length}-mal vor.`, cells: at.flatMap(i => EF[i]) };
    }
    if (co.reduce((a, b) => a + b, 0) % 3) return { ok: false, kind: 'twist', msg: 'Eine Ecke ist verdreht – so ist der Würfel nicht lösbar. Prüfe die Farben an den Ecken; vielleicht wurde eine Ecke beim Zusammenbauen verdreht.', cells: [] };
    if (eo.reduce((a, b) => a + b, 0) % 2) return { ok: false, kind: 'flip', msg: 'Eine Kante ist gekippt – so ist der Würfel nicht lösbar. Prüfe die Farben an den Kanten.', cells: [] };
    if (parity(cp) !== parity(ep)) return { ok: false, kind: 'parity', msg: 'Zwei Teile sind vertauscht – so ist der Würfel nicht lösbar. Prüfe, ob zwei Kanten oder Ecken falsch eingegeben sind.', cells: [] };
    return { ok: true };
  }

  // ---------- Farbe ----------
  const STD = [
    { n: 'Weiß', hex: '#f4f4f1' }, { n: 'Rot', hex: '#d0142c' }, { n: 'Grün', hex: '#00a352' },
    { n: 'Gelb', hex: '#ffd60a' }, { n: 'Orange', hex: '#ff6d0a' }, { n: 'Blau', hex: '#0a55d6' }
  ];
  function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgbToLab(rgb) {
    const lin = rgb.map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function labDist(a, b, wL) {
    const dl = (a[0] - b[0]) * (wL == null ? 0.5 : wL), da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  // Ungarische Methode, quadratische Kostenmatrix, gibt Zeile -> Spalte zurück
  function hungarian(a) {
    const n = a.length, INF = 1e18;
    const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
      do {
        used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
        for (let j = 1; j <= n; j++) if (!used[j]) {
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const ans = new Array(n);
    for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
    return ans;
  }

  // 54 RGB-Proben (Facelet-Reihenfolge) -> Seitenzuordnung, je Farbe genau 9
  function classify(samples) {
    const lab = samples.map(rgbToLab);
    let refs = [0, 1, 2, 3, 4, 5].map(f => lab[f * 9 + 4]);
    let assign = null;
    for (let iter = 0; iter < 3; iter++) {
      const cost = [];
      for (let i = 0; i < 54; i++) {
        const row = new Array(54);
        const isCenter = i % 9 === 4, own = Math.floor(i / 9);
        for (let k = 0; k < 6; k++) {
          const d = isCenter ? (k === own ? 0 : 1e6) : labDist(lab[i], refs[k]);
          for (let s = 0; s < 9; s++) row[k * 9 + s] = d;
        }
        cost.push(row);
      }
      assign = hungarian(cost).map(c => Math.floor(c / 9));
      refs = [0, 1, 2, 3, 4, 5].map(k => {
        const m = [0, 0, 0]; let n = 0;
        lab.forEach((l, i) => { if (assign[i] === k) { m[0] += l[0]; m[1] += l[1]; m[2] += l[2]; n++; } });
        return m.map(x => x / Math.max(1, n));
      });
    }
    const uncertain = [];
    lab.forEach((l, i) => {
      if (i % 9 === 4) return;
      const d = refs.map(r => labDist(l, r));
      const own = d[assign[i]];
      const other = Math.min(...d.filter((_, k) => k !== assign[i]));
      if (other - own < 9) uncertain.push(i);
    });
    return { facelets: assign, refs, uncertain };
  }

  // Cluster-Mittelwerte -> passende Standardfarbe (eindeutig)
  function mapPalette(refsLab) {
    const std = STD.map(s => rgbToLab(hexToRgb(s.hex)));
    const cost = refsLab.map(r => std.map(s => labDist(r, s, 0.35)));
    const m = hungarian(cost);
    return { hex: m.map(j => STD[j].hex), names: m.map(j => STD[j].n) };
  }

  // Schnelle Einordnung einer einzelnen Probe (Vorschau)
  function guessStd(rgb) {
    const l = rgbToLab(rgb);
    let best = 0, bd = 1e9;
    STD.forEach((s, k) => { const d = labDist(l, rgbToLab(hexToRgb(s.hex)), 0.35); if (d < bd) { bd = d; best = k; } });
    return best;
  }

  const api = { FACES, NORMAL, GEOM, indexOf, parseMove, perm, apply, applyAll, invert, invertAll, parseAlg, simplify, SOLVED, isSolved, toString, fromString, validate, STD, hexToRgb, rgbToLab, hungarian, classify, mapPalette, guessStd, CF, EF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CubeCore = api;
})(typeof self !== 'undefined' ? self : this);
