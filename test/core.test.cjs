// Prüft das Würfelmodell gegen cubejs: Züge, Validierung, Lösungen und Farberkennung
const C = require('../src/core.js');
const Cube = require('cubejs');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FEHLER:', msg); } };

for (const m of ['U', 'R', 'F', 'D', 'L', 'B', "U'", 'R2', "F'", 'D2', "L'", 'B2']) {
  const c = new Cube(); c.move(m);
  ok(C.toString(C.apply(C.SOLVED, m)) === c.asString(), 'Einzelzug ' + m);
}
const all = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap(f => [f, f + "'", f + '2']);
for (let t = 0; t < 200; t++) {
  const seq = Array.from({ length: 25 }, () => all[Math.floor(Math.random() * 18)]);
  const c = new Cube(); c.move(seq.join(' '));
  ok(C.toString(C.applyAll(C.SOLVED, seq)) === c.asString(), 'Zugfolge ' + seq.join(' '));
}
console.log('✓ Züge stimmen mit cubejs überein');

ok(C.validate(C.SOLVED).ok, 'gelöster Würfel gültig');
Cube.initSolver();
for (let t = 0; t < 30; t++) {
  const c = Cube.random(), st = C.fromString(c.asString());
  ok(C.validate(st).ok, 'Zufallszustand gültig');
  if (t < 8) ok(C.isSolved(C.applyAll(st, C.parseAlg(c.solve()))), 'Lösung löst den Würfel');
}
{ const st = C.SOLVED.slice(); const [a, b, c] = C.CF[0]; [st[a], st[b], st[c]] = [st[b], st[c], st[a]]; ok(C.validate(st).kind === 'twist', 'verdrehte Ecke erkannt'); }
{ const st = C.SOLVED.slice(); const [a, b] = C.EF[0]; [st[a], st[b]] = [st[b], st[a]]; ok(C.validate(st).kind === 'flip', 'gekippte Kante erkannt'); }
{
  const st = C.SOLVED.slice(), e1 = C.EF[0], e2 = C.EF[1];
  const t0 = st[e1[0]], t1 = st[e1[1]]; st[e1[0]] = st[e2[0]]; st[e1[1]] = st[e2[1]]; st[e2[0]] = t0; st[e2[1]] = t1;
  ok(C.validate(st).kind === 'parity', 'Paritätsfehler erkannt');
}
console.log('✓ Validierung und Lösungen geprüft');

const cam = { 0: [200, 205, 210], 1: [170, 30, 40], 2: [20, 150, 80], 3: [210, 200, 40], 4: [230, 100, 30], 5: [20, 70, 170] };
let wrong = 0;
for (let t = 0; t < 50; t++) {
  const st = C.fromString(Cube.random().asString());
  const light = Array.from({ length: 6 }, () => 0.7 + Math.random() * 0.5);
  const samples = st.map((v, i) => cam[v].map(x => Math.max(0, Math.min(255, x * light[Math.floor(i / 9)] + (Math.random() - 0.5) * 30))));
  wrong += C.classify(samples).facelets.filter((v, i) => v !== st[i]).length;
}
ok(wrong / 2700 < 0.02, `Farberkennung zu ungenau (${wrong} von 2700 falsch)`);
console.log(`✓ Farberkennung: ${wrong} von 2700 verrauschten Feldern falsch`);

if (fails) { console.log(`\n${fails} Test(s) fehlgeschlagen`); process.exit(1); }
console.log('\nAlle Tests bestanden.');
