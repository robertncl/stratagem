# Stratagem

A turn-based 4X strategy game for the browser, set in Western Europe in 1400 AD.
Pick one of eight great powers, then explore, expand, exploit and exterminate against computer-controlled rivals and 28 independent states.

## Play

You need Node.js 20.19+ or 22.12+ (Vite 8's minimum).

```sh
npm install
npm run dev        # then open http://localhost:5173
```

The game opens at the main menu. Choose **New Game**, pick a realm, and set the options:

| Option | Effect |
| --- | --- |
| Difficulty | Changes AI yields only. Easy: AI cities produce 85% of normal yields. Hard: they produce 125%, each AI power starts with an extra Levy and Settler, and AIs are a little keener to attack you. |
| Map | *Known world* (the default) starts with the whole map charted. *Unexplored* starts it hidden. |
| Seed | Leave blank for a random game. Enter a number to get the same map and starting positions every time. |

Click **Begin the reign**. You start in your historical capital with two Levies, a Scout and a Settler. First choose a research path (`T`), then a build for your capital (click it twice), then press `Enter` to end the turn. The **End Turn** button in the bottom-right always names the next thing that needs attention.

### Building and hosting

```sh
npm run build      # type-checks, then writes a static site to dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`dist/` uses relative paths, so any static web server can host it, at any path. It has to be **served over HTTP**: opening `dist/index.html` straight from disk (`file://`) shows a blank page, because browsers block module scripts there.

## The game

- **Map.** About 4,600 hexes (58 × 80, each about 40 km across), generated from real geography: coastlines from Ireland to the Balkans and Tunis, the Alps, Pyrenees and Apennines, 26 rivers (they act as roads and add gold), forests, marshes and resources. New cities take the name of the nearest real town.
- **Nations.** England, France, Castile, Portugal, the Holy Roman Empire, Burgundy, Venice and the Kalmar Union. Each starts at its historical capital with its own trait and starting tech. Scotland, Aragon, the Papal States, the Hanseatic League, the Hafsids and two dozen more are independent states you can conquer.
- **Economy.** Cities work their best tiles, grow on food, build with production, earn gold and science, and push their borders out with culture. Gold pays unit and building upkeep and can rush-buy production.
- **Research.** 26 technologies over six eras, from Pottery to the Enlightenment. Each city beyond your fourth makes research 4% more expensive. Technologies unlock 16 units (Levy → Cuirassier), 15 buildings and 8 world wonders, including Notre-Dame, the Arsenale di Venezia and the Medici Bank.
- **War.** Combat strength takes terrain, fortification, walls, veterancy and unit matchups into account. Pikes beat horse, and siege engines double against cities. Archers and siege engines shoot two tiles without retaliation. To capture a city, kill every defender, then move a melee or mounted unit in. With Sailing, units can embark onto coastal waters, and with Navigation onto the open ocean.
- **Diplomacy.** Declare war, sue for peace, and accept or reject AI peace offers. Peace treaties last at least 10 turns.
- **Victory.** There are four ways to win:
  - Conquest: be the last great power standing.
  - Domination: hold every great power's original capital.
  - Enlightenment: be first to research it.
  - Score: have the highest score when turn 200 ends (1800 AD). Score is 8 per city, 3 per population, 5 per tech, 20 per wonder and 1 per 4 tiles of territory.

  You are eliminated, and lose, when your last city falls. Units alone don't keep you in the game.
- **Saves.** The game autosaves each time you end a turn. The menu has **Continue** (the autosave) and three manual save slots. Saves are kept in the browser's `localStorage` under keys starting with `stratagem:`, so they stay with that browser and site.

### Controls

| Input | Action |
| --- | --- |
| Left-click | Select a unit or city. Click a city twice to open it. |
| Right-click, or left-click empty ground with a unit selected | Move or attack. Hover to preview the path and combat odds. |
| Drag, or arrow keys | Pan |
| Wheel, pinch, or `+` / `−` | Zoom |
| Minimap or log entry | Click to jump there |
| `Space` / `N` | Next unit |
| `F` / `S` / `B` | Fortify / sleep / found city |
| `C` | Centre on the selected unit |
| `Del` / `Backspace` | Disband |
| `Enter` | End turn |
| `T` / `D` / `E` / `H` (or `?`) | Research / diplomacy / empire / help |
| `Esc` | Close the city panel, then deselect, then open the menu |

## Development

```sh
npm test           # unit tests plus a full all-AI game (up to 200 turns) with invariant checks
npm run typecheck
```

To save that all-AI game's timeline and war log to a file, set `STRATAGEM_SIM_OUT=/path/to/out.txt` when you run `npm test`. In the browser, `window.stratagem` holds the running `App`, and `window.stratagem.game` the current `Game`, for poking at from the console.

```
index.html           page shell: map canvas, HUD and <dialog>s
src/main.ts          entry point: wires the menu to createGame()
src/core/            pure game logic: no DOM, runs headless
  hex.ts             hex grid maths (pointy-top, odd-r offset)
  rng.ts             seeded PRNG and noise
  map/geography.ts   Western Europe in lon/lat: coasts, ranges, rivers, towns
  map/mapgen.ts      rasterises geography onto the hex grid
  data/              terrain, units, buildings, techs, nations
  rules/             movement + A*, combat, city economy
  game.ts            Game: state, caches, actions, turn cycle, victory
  setup.ts           new-game creation
  ai/ai.ts           computer players
src/ui/
  app.ts             App: input, HUD, selection, city panel, turn flow
  renderer.ts        canvas map and minimap drawing
  dialogs.ts         menu, new game, research, diplomacy, empire, help, game over
  storage.ts         localStorage save slots
  styles.css
tests/               Vitest: map, rules, full AI-vs-AI simulation
```
