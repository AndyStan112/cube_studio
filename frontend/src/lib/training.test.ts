import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMove, inverse, solved, type CubeSize } from './cube';
import { cubiesToFacelets, solvedFacelets } from './facelets';
import type { Solve } from './api';
import { clearLocalData, createSession, inspectionPenalty, readTraining, stateScramble, storeTraining, summarize } from './training';

beforeEach(() => {
  const storage: Record<string, string> = {};
  // Match the browser Storage interface, whose stored keys are enumerable.
  vi.stubGlobal('localStorage', new Proxy(storage, {
    get(target, key) {
      if (key === 'getItem') return (name: string) => target[name] ?? null;
      if (key === 'setItem') return (name: string, value: string) => { target[name] = value; };
      if (key === 'removeItem') return (name: string) => { delete target[name]; };
      return Reflect.get(target, key);
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('inspection timing', () => {
  it('applies penalties exactly at the WCA boundaries', () => {
    expect(inspectionPenalty(0)).toBe('none');
    expect(inspectionPenalty(14999)).toBe('none');
    expect(inspectionPenalty(15000)).toBe('+2');
    expect(inspectionPenalty(16999)).toBe('+2');
    expect(inspectionPenalty(17000)).toBe('DNF');
    expect(inspectionPenalty(60000)).toBe('DNF');
  });
});
describe('state scrambles', () => {
  for (const size of [3, 4, 5] as CubeSize[]) it(`recreates the exact ${size}×${size} entered state`, () => {
    const sequence = size === 3 ? ['R', 'U2', "F'", 'L2'] : ['Rw', 'U2', "Fw'", 'L2', 'x', 'Dw2'];
    const value = cubiesToFacelets(sequence.reduce((s, m) => applyMove(s, m), solved(size)));
    const generated = stateScramble(value, inverse(sequence), size);
    expect(cubiesToFacelets(generated.reduce((s, m) => applyMove(s, m), solved(size)))).toBe(value);
    expect(() => stateScramble(solvedFacelets(size), inverse(sequence), size)).toThrow('does not match');
  });
});
describe('training persistence', () => {
  it('preserves legacy history sessions and isolates accounts', () => {
    const data = readTraining();
    expect(data.sessions.map(s => s.id)).toEqual(['legacy:333', 'legacy:444', 'legacy:555']);
    data.settings.inspection = true;
    storeTraining(data, 'andy');
    expect(readTraining('andy').settings.inspection).toBe(true);
    expect(readTraining('alex').settings.inspection).toBe(false);
    expect(readTraining().settings.inspection).toBe(false);
  });
  it('uses defaults for new sessions only and ignores cubes in a different category', () => {
    const data = readTraining();
    data.cubes = [{ id: 'gan', name: 'GAN', event: '333', calibrationId: 'daylight' }];
    data.settings.defaultCube = 'gan'; data.settings.defaultMethod = 'CFOP';
    const session = createSession('333', data, 'Practice');
    expect(session).toMatchObject({ name: 'Practice', cube: 'gan', method: 'CFOP', event: '333' });
    expect(createSession('444', data).cube).toBe('');
    data.settings.defaultMethod = 'Roux';
    expect(session.method).toBe('CFOP');
  });
  it('clears only Cube Studio training data', () => {
    localStorage.setItem('cube-studio-solves-v1:guest', '[]');
    localStorage.setItem('cube-studio-camera-calibrations-v1', '[]');
    localStorage.setItem('another-app', 'retain');
    clearLocalData();
    expect(localStorage.getItem('cube-studio-solves-v1:guest')).toBeNull();
    expect(localStorage.getItem('cube-studio-camera-calibrations-v1')).toBeNull();
    expect(localStorage.getItem('another-app')).toBe('retain');
  });
});
it('comparison statistics include +2 penalties and count DNFs separately', () => {
  const solves = [
    { time_ms: 10000, penalty: 'none' },
    { time_ms: 12000, penalty: '+2' },
    { time_ms: 5000, penalty: 'DNF' },
  ] as Solve[];
  expect(summarize(solves)).toEqual({ count: 3, dnf: 1, mean: 12000, best: 10000 });
  expect(summarize([])).toEqual({ count: 0, dnf: 0, mean: null, best: null });
  expect(summarize([solves[2]]).mean).toBeNull();
});
