import { describe, expect, it } from 'vitest';
// Fixtures come from the independent Python sticker model in solver/nxn/model.py.
import fixtures from './fixtures/big-cubes.json';
import { applyMove, inverse, solved, type CubeSize } from './cube';
import { cubiesToFacelets, faceletsToCubies, geometryFor, solvedFacelets, validateFacelets } from './facelets';
import { solverRequest, verifySolution, type Solution } from './solver';

describe('arbitrary big-cube input and verified solutions', () => {
  for (const fixture of fixtures) {
    const size = fixture.size as CubeSize;
    it(`${size}×${size} agrees with independent sticker permutations and reconstructs every piece`, () => {
      const state = fixture.moves.reduce((s, move) => applyMove(s, move), solved(size));
      expect(cubiesToFacelets(state)).toBe(fixture.facelets);
      const reconstructed = faceletsToCubies(fixture.facelets, size);
      expect(new Set(reconstructed.map(c => c.position.toArray().join())).size).toBe(size ** 3);
      expect(cubiesToFacelets(reconstructed)).toBe(fixture.facelets);
      const notation = inverse(fixture.moves);
      const result: Solution = { notation, moves: [], move_count: notation.length, metric: 'OBTM', verified: true, optimality: 'unproved' };
      verifySolution(fixture.facelets, result, size);
      expect(() => verifySolution(fixture.facelets, { ...result, notation: ['U'], move_count: 1 }, size)).toThrow();
      expect(solverRequest(fixture.facelets, size).solver).toMatchObject({ objective: 'solution', method: 'reduction', metric: 'OBTM' });
    });
    it(`${size}×${size} rejects invalid counts and corner twists`, () => {
      const value = [...solvedFacelets(size)];
      expect(geometryFor(size)).toHaveLength(6 * size * size);
      expect(() => validateFacelets(value.slice(1).join(''), size)).toThrow();
      const indices = [(size-1)*size+size-1, size*size, size*size*2+size-1];
      const colors = indices.map(i => value[i]);
      indices.forEach((index, i) => { value[index] = colors[(i+1)%3]; });
      expect(() => validateFacelets(value.join(''), size)).toThrow();
    });
  }
});
