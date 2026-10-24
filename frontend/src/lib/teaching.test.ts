import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/teaching-cubes.json';
import { moveDescription, verifyLesson, type LessonStage, type LessonChunk } from './teaching';
import { solverRequest, verifySolution, type Solution, type SolverMethod } from './solver';
import { applyMove, solved, type CubeSize } from './cube';
import { cubiesToFacelets, solvedFacelets } from './facelets';

function lesson(fixture: typeof fixtures[number]): Solution {
  const notation = fixture.notation;
  return {
    notation,
    // The independent verification uses the notation and viewer geometry.
    moves: [],
    method: fixture.method as SolverMethod,
    stages: fixture.stages as LessonStage[], chunks: fixture.chunks as LessonChunk[],
    metric: fixture.size === 3 ? 'HTM' : 'OBTM', move_count: notation.length,
    verified: true, optimality: 'unproved',
  };
}
describe('method-constrained teaching boundary', () => {
  for (const fixture of fixtures) it(`independently replays ${fixture.size}×${fixture.size} ${fixture.method}`, () => {
    const size = fixture.size as CubeSize;
    const value = cubiesToFacelets(fixture.scramble.reduce((s, m) => applyMove(s, m), solved(size)));
    expect(value).toBe(fixture.facelets);
    verifySolution(value, lesson(fixture), size);
  });
  it('selects the big-cube and post-reduction methods independently', () => {
    expect(solverRequest(solvedFacelets(3), 3, 'beginner').solver).toMatchObject({ method: 'beginner', objective: 'solution', metric: 'HTM' });
    expect(solverRequest(solvedFacelets(4), 4, 'meyer').solver).toMatchObject({ method: 'meyer', objective: 'solution', metric: 'OBTM', post_reduction_method: 'beginner' });
    expect(solverRequest(solvedFacelets(5), 5, 'reduction_beginner').solver).toMatchObject({ method: 'reduction_beginner', post_reduction_method: 'beginner' });
  });
  it('rejects overlapping, missing, unverified, or relabelled stages', () => {
    const original = lesson(fixtures[0]);
    for (const mutate of [
      (s: Solution) => { s.stages![1].start++; },
      (s: Solution) => { s.chunks!.pop(); },
      (s: Solution) => { s.stages = []; },
      (s: Solution) => { delete s.stages; },
      (s: Solution) => { s.stages![0].verified = false; },
      (s: Solution) => { s.stages![0].id = 'oll'; },
      (s: Solution) => { s.optimality = 'global_proved'; },
      (s: Solution) => { s.method = 'unrestricted'; },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(() => verifyLesson(changed)).toThrow();
    }
  });
  it('names outer turns, counterclockwise turns, half turns, inner slices, wide turns and rotations', () => {
    expect(moveDescription('R')).toContain('right face 90° clockwise');
    expect(moveDescription("B'")).toContain('back face 90° counterclockwise');
    expect(moveDescription('U2')).toContain('180° (a half turn)');
    expect(moveDescription('2R')).toContain('only inner layer 2');
    expect(moveDescription('3Rw2')).toContain('3 layers nearest the right face together');
    expect(moveDescription("x'")).toContain('rotate the whole cube');
  });
});
