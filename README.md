# Stratagem

A turn-based 4X strategy game for the browser, set in Western Europe from 1400 AD to the Space Age.
Pick one of eight great powers, then explore, expand, exploit and exterminate against computer-controlled rivals and 29 independent states.

## Play

You need Node.js 20.19+ or 22.12+ (Vite 8's minimum).

```sh
npm install
npm run dev        # then open http://localhost:5173
```

The game opens at the main menu. New to the game? Choose **Tutorial**. It starts a game as France on easy, and a coach card walks you through your first turns: choosing research, setting production, exploring with the Scout, fortifying, ending the turn, and founding a second city on a marked site. Then it covers city focus, faith, war and diplomacy, and the ways to win. Each task step moves on by itself once you've done it. You can skip a step or close the coach at any time.

Otherwise, choose **New Game**, pick a realm, and set the options:

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
- **Economy.** Each citizen works one tile within two hexes of its city, on land the city has claimed. Cities pick the tiles themselves, guided by a focus you set in the city panel (balanced, food, production or gold), and give up output for food rather than starve when they can. Opening a city outlines its worked tiles on the map and shows each tile's yields. Cities grow on food, build with production, earn gold and science, and push their borders out with culture. Gold pays unit and building upkeep and can rush-buy production.
- **Research.** 51 technologies over eleven eras: from Pottery through the medieval eras, the Renaissance, the Reformation and the Enlightenment (reached around turn 140 in an all-AI game), then the Industrial, Modern, Atomic and Information eras to the Space Age (Space Flight, Satellites, Robotics, Fusion), reached around turn 280–300. Satellites chart the whole map. On the research screen (`T`), click an available technology to study it, or a locked one to make it your **goal**: research then picks each step on the way by itself, and the screen numbers the path. Hover a technology to light up everything it still needs and what it leads to. Each city beyond your fourth makes research 4% more expensive. Technologies unlock 27 units, 26 buildings, 14 world wonders and 4 national projects:
  - **Units.** Each line is replaced by its successor: Levy → Spearman → Pikeman (or Swordsman → Man-at-Arms) → Musketeer → Rifleman → Infantry → Mechanized Infantry; Horseman → Knight → Cuirassier → Cavalry → Tank → Modern Armor; Archer → Crossbowman → Gatling Gun → Machine Gun; Catapult → Trebuchet → Cannon → Artillery → Rocket Artillery (range 3). Plus Scouts, Settlers and Missionaries.
  - **Modern buildings.** Public School, Factory, Railway Station, Hospital, Power Plant, Stock Exchange, Broadcast Tower, Supermarket, Research Lab, Nuclear Plant and Spaceport.
  - **Wonders.** From Cluny Abbey, Notre-Dame and the Medici Bank to the Royal Society, Crystal Palace, Eiffel Tower, Curie Institute, CERN and the International Space Station.
  - **National projects.** Built once per realm and kept even if the city falls: the Apollo Program and the colony ship's three parts.
- **War.** Combat strength takes terrain, fortification, walls, veterancy and unit matchups into account. Pikes beat horse, and siege engines double against cities. Archers and siege engines shoot two tiles without retaliation. To capture a city, kill every defender, then move a melee or mounted unit in. With Sailing, units can embark onto coastal waters, and with Navigation onto the open ocean.
- **Faith.** Every city follows Catholicism (+2 culture), Islam (+2 science) or, once the first great power learns Printing Press and starts the Reformation in its capital, Protestantism (+2 gold). Your state religion is your capital's; cities of another faith are in dissent (−20% production) and resist longer when conquered. Cities press their faith on others within 6 tiles, more so when large or with a Temple, Cluny Abbey, Notre-Dame or El Escorial, and a city that is outweighed converts. Rome and Tunis are holy cities: +3 gold, +2 culture, extra pressure, and they never convert. With Theology, cities train **Missionaries**, which convert a city of another faith next to them at once (`P`). AIs are readier to make war on realms of another faith.
- **Diplomacy.** Declare war, sue for peace, and accept or reject AI peace offers. Peace treaties last at least 10 turns.
- **Victory.** There are four ways to win:
  - Conquest: be the last great power standing.
  - Domination: hold every great power's original capital.
  - Space: with Space Flight, build the Apollo Program, then a Spaceport (needs a Factory), then the colony ship's Launch Booster (Space Flight), Orbital Habitat (Robotics) and Fusion Drive (Fusion) in Spaceport cities. The ship launches when the last part is done and lands 10 turns later; the first to land wins. If your capital falls during the flight, the ship is lost and its parts must be built again.
  - Score: have the highest score when turn 325 ends (2050 AD). Score is 8 per city, 3 per population, 5 per tech, 20 per wonder and 1 per 4 tiles of territory.

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
| `P` | Preach (Missionary) |
| `C` | Centre on the selected unit |
| `Del` / `Backspace` | Disband |
| `Enter` | End turn |
| `T` / `D` / `E` / `H` (or `?`) | Research / diplomacy / empire / help |
| `Esc` | Close the city panel, then deselect, then open the menu |

## Development

```sh
npm test           # unit tests plus a full all-AI game (up to 200 turns of the 325) with invariant checks
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
  data/              terrain, units, buildings, techs, nations, religions
  rules/             movement + A*, combat, city economy, religion
  game.ts            Game: state, caches, actions, turn cycle, victory
  setup.ts           new-game creation
  ai/ai.ts           computer players
src/ui/
  app.ts             App: input, HUD, selection, city panel, turn flow
  renderer.ts        canvas map and minimap drawing
  render/            terrain textures, flat icons, and three/: 3D models
                     (three.js, loaded lazily) baked into sprites for the map
  dialogs.ts         menu, new game, research, diplomacy, empire, help, game over
  tutorial.ts        the guided first game's coach card and its steps
  storage.ts         localStorage save slots
  styles.css
tests/               Vitest: map, rules, full AI-vs-AI simulation
```
