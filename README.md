# Stratagem

A turn-based 4X strategy game for the browser, set in Western Europe in 1400 AD.
Pick one of eight great powers, then explore, expand, exploit and exterminate against computer-controlled rivals and 29 independent states.

## Play

```sh
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes a static site to `dist/` that can be hosted anywhere (it uses relative paths).

## The game

- **Map.** About 4,600 hexes (~40 km each), generated from real geography: coastlines from Ireland to the Balkans and Tunis, the Alps, Pyrenees and Apennines, 26 rivers (they act as roads and add gold), forests, marshes and resources. New cities take the name of the nearest real town.
- **Nations.** England, France, Castile, Portugal, the Holy Roman Empire, Burgundy, Venice and the Kalmar Union. Each starts at its historical capital with its own trait and starting tech. Scotland, Aragon, the Papal States, the Hanseatic League, the Hafsids and two dozen more are independent states you can conquer.
- **Economy.** Cities work their best tiles, grow on food, build with production, earn gold and science, and push their borders out with culture. Gold pays unit and building upkeep and can rush-buy production.
- **Research.** 26 technologies over six eras, from Pottery to the Enlightenment. They unlock 16 units (Levy → Cuirassier), 15 buildings and 8 world wonders, including Notre-Dame, the Arsenale di Venezia and the Medici Bank.
- **War.** Combat strength takes terrain, fortification, walls, veterancy and unit matchups into account. Pikes beat horse, and siege engines double against cities. Ranged units fire without retaliation. Units can embark onto coastal waters with Sailing and onto the open ocean with Navigation.
- **Diplomacy.** Declare war, sue for peace, and accept or reject AI peace offers. Peace treaties last at least 10 turns.
- **Victory.** There are four ways to win:
  - Conquest: be the last great power standing.
  - Domination: hold every original capital.
  - Enlightenment: be first to research it.
  - Score: have the highest score in 1800 AD (turn 200).
- **Saves.** The game autosaves every turn, and there are three manual save slots in `localStorage`.

### Controls

| Input | Action |
| --- | --- |
| Left-click | Select a unit or city (click a city twice to open it) |
| Right-click, or left-click empty ground with a unit selected | Move or attack (hover to preview the path and combat odds) |
| Drag / wheel / pinch | Pan / zoom |
| `Space` / `N` | Next unit |
| `F` / `S` / `B` / `Del` | Fortify / sleep / found city / disband |
| `Enter` | End turn |
| `T` / `D` / `E` / `H` / `Esc` | Research / diplomacy / empire / help / menu |

## Code layout

```
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
src/ui/              canvas renderer, HUD, dialogs, input, saves
tests/               Vitest: map, rules, full AI-vs-AI simulation
```

```sh
npm test           # unit tests plus a ~150-turn all-AI simulation with invariant checks
npm run typecheck
```
