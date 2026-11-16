# Würfellöser

Zauberwürfel scannen (Kamera oder Foto), Farben prüfen und die Lösung Zug für Zug als 3D-Animation abspielen – mit Pfeilen, Zeitleiste, Tempo-Regler, Übungsmodus und Speedcubing-Timer. Läuft komplett im Browser, ohne Server-Logik und ohne Konto.

## Schnellstart

**Variante A – sofort, ohne Installation**
`dist/index.html` doppelklicken. Die Datei enthält alles (three.js und den Solver eingebettet) und funktioniert auch offline. Nur die Schriftart kommt von Google Fonts; offline wird eine Systemschrift verwendet.

**Variante B – über localhost (empfohlen für die Live-Kamera)**
Benötigt nur Node.js (ab Version 18), kein `npm install`:

```bash
npm start
```

Dann http://localhost:5173 öffnen. Anderer Port: `PORT=8080 npm start` (Windows PowerShell: `$env:PORT=8080; npm start`).

## Kamera-Hinweis

Browser erlauben die Kamera nur in einem „sicheren Kontext“: `https://…` oder `http://localhost`. Deshalb:

- Am PC über `npm start` → Live-Kamera funktioniert.
- Beim Doppelklick (`file://`) erlaubt Chrome die Kamera in der Regel ebenfalls; andere Browser teils nicht.
- Vom Handy über die IP deines PCs (`http://192.168.…`) ist die Live-Kamera **gesperrt**, weil das kein sicherer Kontext ist. Der Foto-Modus funktioniert trotzdem (öffnet auf dem Handy direkt die Kamera-App).
- Live-Kamera auf dem Handy: die Seite über HTTPS hosten, z. B. mit GitHub Pages (Ordner `dist/` veröffentlichen).

## Selbst bauen

```bash
npm install      # holt three.js und cubejs
npm run build    # baut src/ → dist/index.html
npm test         # prüft Würfelmodell, Validierung und Farberkennung
npm run dev      # bauen und Server starten
```

## Projektstruktur

```
src/index.src.html   Markup und CSS, mit Platzhaltern für die Skripte
src/core.js          Würfelmodell: Züge, Validierung, Farbklassifizierung (auch in Node nutzbar)
src/app.js           Oberfläche: Scanner, Editor, 3D-Ansicht, Player, Üben, Timer
build.mjs            setzt alles zu einer einzigen HTML-Datei zusammen
serve.mjs            kleiner statischer Server für localhost (ohne Abhängigkeiten)
test/core.test.cjs   Tests gegen die Referenzbibliothek cubejs
dist/index.html      fertige, eigenständige App
```

## Wie es funktioniert

- **Zustand**: 54 Felder in der Kociemba-Reihenfolge U, R, F, D, L, B. Jeder Zug ist eine Permutation, die aus der 3D-Geometrie der Steine berechnet wird – dieselbe Geometrie nutzt auch die Animation.
- **Farberkennung**: Pro Feld wird der Median eines Bildausschnitts gemessen und in den CIELAB-Farbraum umgerechnet. Die Mittelsteine dienen als Referenz; die Zuordnung erfolgt mit der Ungarischen Methode so, dass jede Farbe genau neunmal vorkommt (drei Verfeinerungsrunden). Knappe Entscheidungen werden als „unsicher“ markiert.
- **Validierung**: Prüft, ob jede Ecke und Kante existiert und nur einmal vorkommt, sowie Eckverdrehung, Kantenorientierung und Permutationsparität – mit verständlichen Fehlermeldungen.
- **Lösen**: Kociemba-Zwei-Phasen-Algorithmus (cubejs) in einem Web Worker, meist höchstens 22 Züge. Die Tabellen werden beim Start einmal berechnet (rund 1–2 Sekunden).
- **3D**: three.js mit abgerundeten Steinen; ein Zug dreht die betroffenen 9 Steine um einen Pivot, danach wird der Zustand neu eingefärbt.

## Tastatur

| Bereich | Tasten |
|---|---|
| Erfassen | `1`–`6` Farbe wählen · `Leertaste`/`Enter` Seite erfassen |
| Lösung | `Leertaste` Play/Pause · `←` `→` Schritt · `Pos1` `Ende` |
| Üben | `R L U D F B` drehen, mit `Shift` gegen den Uhrzeigersinn · `Rücktaste` rückgängig |
| Timer | `Leertaste` halten bis grün, loslassen startet, beliebige Taste stoppt |

## Lizenzen

Eingebettete Bibliotheken: three.js (MIT) und cubejs (MIT) – siehe `LICENSE-THIRD-PARTY.md`.
