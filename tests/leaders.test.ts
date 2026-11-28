import { describe, expect, it } from 'vitest';
import { MAJOR_NATIONS } from '../src/core/data/nations';
import { createGame } from '../src/core/setup';
import { leaderPortrait } from '../src/ui/render/portraits';

describe('leaders', () => {
  it('every great power has a leader with a portrait', () => {
    for (const n of MAJOR_NATIONS) {
      expect(n.leader.name).toBeTruthy();
      expect(n.leader.title).toBeTruthy();
      expect(n.leader.years).toMatch(/\d{4}–\d{4}/);
      const svg = leaderPortrait(n.id, 60);
      expect(svg).toContain('<svg');
      expect(svg).toContain(`Portrait of ${n.leader.name}`);
    }
  });

  it('players are led by their nation’s leader', () => {
    const g = createGame({ seed: 7, humanNation: 'castile' });
    expect(g.player(g.humanId).ruler).toBe('Isabella I');
  });

  it('gives each portrait its own gradient ids', () => {
    const ids = (svg: string) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const a = ids(leaderPortrait('england'));
    const b = ids(leaderPortrait('england'));
    expect(a.length).toBeGreaterThan(0);
    expect(a.filter((x) => b.includes(x))).toEqual([]);
  });
});
