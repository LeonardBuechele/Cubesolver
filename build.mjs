// Baut src/ + Bibliotheken zu einer einzigen, offline lauffähigen dist/index.html
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const here = p => new URL(p, import.meta.url);
const read = p => readFileSync(here(p), 'utf8');

if (!existsSync(here('./node_modules/three')) || !existsSync(here('./node_modules/cubejs'))) {
  console.error('Bitte zuerst "npm install" ausführen.');
  process.exit(1);
}

let three = read('./node_modules/three/build/three.min.js');
// Veraltungs-Hinweis von three.min.js entfernen (Ausdruck bleibt gültig)
three = three.replace(/^console\.warn\('Scripts "build\/three\.js"[\s\S]*?Installation'\),\n?/, 'void 0,\n');

const cube = '/* cubejs 1.3.2 – Kociemba-Zwei-Phasen-Solver. MIT-Lizenz, (c) 2013-2017 Petri Lehtinen, (c) 2018 Ludovic Fernandez */\n'
  + read('./node_modules/cubejs/lib/cube.js') + '\n' + read('./node_modules/cubejs/lib/solve.js');

let html = read('./src/index.src.html');
for (const [name, code] of [['THREE', three], ['CUBEJS', cube], ['CORE', read('./src/core.js')], ['APP', read('./src/app.js')]]) {
  if (code.toLowerCase().includes('</script')) throw new Error(`${name} enthält "</script"`);
  const marker = `/*__${name}__*/`;
  if (!html.includes(marker)) throw new Error(`Platzhalter ${marker} fehlt in src/index.src.html`);
  html = html.replace(marker, () => code); // Funktion, damit "$" im Code nicht als Muster gilt
}
mkdirSync(here('./dist'), { recursive: true });
writeFileSync(here('./dist/index.html'), html);
console.log(`dist/index.html gebaut (${Math.round(html.length / 1024)} KB)`);
