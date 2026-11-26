// Save games in localStorage: one autosave plus three manual slots.

import { Game } from '../core/game';

const PREFIX = 'stratagem:';
export const AUTOSAVE = 'autosave';
export const SLOTS = ['slot1', 'slot2', 'slot3'];

export interface SaveInfo {
  key: string;
  nation: string;
  turn: number;
  year: number;
  savedAt: number;
}

export function save(game: Game, key: string): boolean {
  try {
    const json = game.serialize();
    localStorage.setItem(PREFIX + key, json);
    const h = game.humanId;
    const info: SaveInfo = {
      key,
      nation: h >= 0 ? game.player(h).name : 'Observer',
      turn: game.s.turn,
      year: game.year(),
      savedAt: Date.now(),
    };
    localStorage.setItem(PREFIX + key + ':info', JSON.stringify(info));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

export function load(key: string): Game | null {
  const json = localStorage.getItem(PREFIX + key);
  if (!json) return null;
  try {
    return Game.deserialize(json);
  } catch (e) {
    console.warn('Load failed', e);
    return null;
  }
}

export function info(key: string): SaveInfo | null {
  const raw = localStorage.getItem(PREFIX + key + ':info');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveInfo;
  } catch {
    return null;
  }
}

export function remove(key: string) {
  localStorage.removeItem(PREFIX + key);
  localStorage.removeItem(PREFIX + key + ':info');
}
