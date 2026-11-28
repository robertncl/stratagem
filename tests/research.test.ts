import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/setup';
import { TECHS, TECH_LIST } from '../src/core/data/techs';
import { UNIT_LIST } from '../src/core/data/units';
import { BUILDING_LIST } from '../src/core/data/buildings';

describe('tech tree', () => {
  it('is well formed: prerequisites exist, come from the same or an earlier era, and nothing is a dead end', () => {
    for (const t of TECH_LIST) {
      for (const r of t.prereqs) {
        expect(TECHS[r], `${t.id} needs ${r}`).toBeTruthy();
        expect(TECHS[r].era).toBeLessThanOrEqual(t.era);
      }
    }
    const last = Math.max(...TECH_LIST.map((t) => t.era));
    for (const t of TECH_LIST) {
      if (t.era === last) continue;
      const leads = TECH_LIST.some((x) => x.prereqs.includes(t.id));
      expect(leads, `${t.id} leads nowhere`).toBe(true);
    }
  });

  it('every tech unlocks something or says what it does', () => {
    for (const t of TECH_LIST) {
      const unlocks = UNIT_LIST.some((u) => u.tech === t.id) || BUILDING_LIST.some((b) => b.tech === t.id) || !!t.note;
      expect(unlocks, `${t.id} unlocks nothing`).toBe(true);
    }
  });
});

describe('research goals', () => {
  it('lists the path to a goal with prerequisites first', () => {
    const g = createGame({ seed: 7, humanNation: 'france' });
    const me = g.humanId;
    const path = g.techPath(me, 'education');
    expect(path[path.length - 1]).toBe('education');
    expect(path).not.toContain('masonry'); // France starts with it
    for (const [i, t] of path.entries()) for (const r of TECHS[t].prereqs) if (!g.hasTech(me, r)) expect(path.indexOf(r)).toBeLessThan(i);
  });

  it('works toward the goal step by step and clears it on arrival', () => {
    const g = createGame({ seed: 7, humanNation: 'france' });
    const me = g.humanId;
    const p = g.player(me);
    g.setResearchGoal(me, 'theology');
    expect(['pottery']).toContain(p.research);
    g.grantTech(me, 'pottery');
    expect(p.research).toBe('writing');
    g.grantTech(me, 'writing');
    expect(p.research).toBe('theology');
    g.grantTech(me, 'theology');
    expect(p.researchGoal).toBeNull();
    expect(p.research).toBeNull();
  });

  it('keeps current research if it is already on the way', () => {
    const g = createGame({ seed: 7, humanNation: 'france' });
    const me = g.humanId;
    g.setResearch(me, 'pottery');
    g.setResearchGoal(me, 'banking');
    expect(g.player(me).research).toBe('pottery');
  });
});
