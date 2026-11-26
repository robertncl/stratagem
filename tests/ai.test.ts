import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { createGame } from '../src/core/setup';
import { runAI, acceptsPeace } from '../src/core/ai/ai';
import { TERRAIN } from '../src/core/data/terrain';
import { terrainAllowed } from '../src/core/rules/movement';

function checkInvariants(g: ReturnType<typeof createGame>) {
  const owners = new Map<number, number>();
  for (const u of g.s.units) {
    expect(g.player(u.owner).alive).toBe(true);
    expect(terrainAllowed(g, u.owner, u.tile)).toBe(true);
    expect(g.unitsAt(u.tile)).toContain(u);
    const o = owners.get(u.tile);
    if (o !== undefined) expect(o).toBe(u.owner);
    owners.set(u.tile, u.owner);
  }
  for (const c of g.s.cities) {
    expect(TERRAIN[g.map.tiles[c.tile].t].water).toBe(false);
    expect(g.map.tiles[c.tile].owner).toBe(c.owner);
    for (const u of g.unitsAt(c.tile)) expect(u.owner).toBe(c.owner);
  }
}

describe('AI simulation', () => {
  it('plays a long all-AI game without breaking invariants', () => {
    const g = createGame({ seed: 42, humanNation: null });
    g.ai = runAI;
    const startCities = g.s.cities.length;
    const t0 = performance.now();
    const timeline: string[] = [];
    for (let t = 0; t < 200 && !g.s.winner; t++) {
      g.endTurn();
      if (t % 10 === 0) checkInvariants(g);
      if (t % 25 === 0) {
        timeline.push(
          `T${g.s.turn}: ` +
            g.majors()
              .map((p) => `${p.nation} c${g.citiesOf(p.id).length} u${g.unitsOf(p.id).length} t${p.techs.length} g${p.gold}`)
              .join(' | '),
        );
      }
    }
    const ms = performance.now() - t0;
    checkInvariants(g);
    const wars = g.s.log.filter((e) => e.kind === 'war').length;
    const captures = g.s.log.filter((e) => e.kind === 'city' && e.text.includes('captures')).length;
    const scratch = process.env.STRATAGEM_SIM_OUT;
    if (scratch) {
      fs.writeFileSync(
        scratch,
        [...timeline, `turns=${g.s.turn} ms=${Math.round(ms)} cities=${g.s.cities.length} wars=${wars} captures=${captures} winner=${JSON.stringify(g.s.winner)}`,
          ...g.s.log.filter((e) => e.kind === 'war' || e.kind === 'wonder' || e.text.includes('captures')).map((e) => `${e.turn}: ${e.text}`)].join('\n'),
      );
    }
    expect(g.s.cities.length).toBeGreaterThan(startCities + 15);
    expect(Math.max(...g.majors().map((p) => p.techs.length))).toBeGreaterThan(12);
    expect(wars).toBeGreaterThan(0);
    expect(captures).toBeGreaterThan(0);
    expect(ms / g.s.turn).toBeLessThan(400);
  }, 120_000);

  it('evaluates peace offers', () => {
    const g = createGame({ seed: 3, humanNation: 'england' });
    const fr = g.s.players.find((p) => p.nation === 'france')!.id;
    g.declareWar(g.humanId, fr);
    expect(acceptsPeace(g, fr, g.humanId)).toBe(false); // too soon
    g.s.turn += 40;
    expect(acceptsPeace(g, fr, g.humanId)).toBe(true);
  });
});
