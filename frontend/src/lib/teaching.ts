import type { Solution } from './solver';

export type LessonStage = {
  id: string;
  title: string;
  explanation: string;
  checkpoint: string;
  start: number;
  end: number;
  skipped: boolean;
  verified: boolean;
};
export type LessonChunk = {
  name: string;
  explanation: string;
  start: number;
  end: number;
};
const faces: Record<string, string> = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
export function moveDescription(move: string) {
  const direction = move.endsWith('2') ? '180° (a half turn)' : move.endsWith("'") ? '90° counterclockwise' : '90° clockwise';
  const rotation = /^[xyz]/.test(move);
  if (rotation) return `${move}: rotate the whole cube ${direction} around the ${ { x: 'right–left', y: 'top–bottom', z: 'front–back' }[move[0]]} axis, looking from the ${ { x: 'right', y: 'top', z: 'front' }[move[0]]} side.`;
  const match = /^([2-5])?([URFDLB])(w)?/.exec(move);
  if (!match) return move;
  const [, prefix, face, wide] = match;
  const layer = wide ? `the ${prefix ?? '2'} layers nearest the ${faces[face]} face together` : prefix ? `only inner layer ${prefix}, counting from the ${faces[face]} face` : `the ${faces[face]} face`;
  return `${move}: turn ${layer} ${direction}, looking directly at the ${faces[face]} face from outside the cube.`;
}

export function verifyLesson(solution: Solution) {
  const guided = ['beginner', 'reduction_beginner', 'meyer'].includes(solution.method ?? '');
  if (!solution.stages) {
    if (guided) throw Error('Missing teaching stages');
    return;
  }
  if (!solution.stages.length || !Array.isArray(solution.chunks)) throw Error('Missing teaching boundaries');
  if (!guided || solution.optimality !== 'unproved')
    throw Error('Invalid teaching method response');
  for (const blocks of [solution.stages, solution.chunks ?? []]) {
    let offset = 0;
    for (const block of blocks) {
      if (!Number.isInteger(block.start) || !Number.isInteger(block.end) || block.start !== offset || block.end < block.start || block.end > solution.notation.length)
        throw Error('Invalid lesson boundaries');
      offset = block.end;
    }
    if (offset !== solution.notation.length) throw Error('Incomplete lesson boundaries');
  }
  if (solution.stages.some(s => !s.verified || s.skipped !== (s.start === s.end)))
    throw Error('Unverified lesson checkpoint');
  const beginnerIds = 'white-cross,white-corners,middle-edges,yellow-cross,yellow-edge-positions,yellow-corner-positions,yellow-corner-twists';
  const prefix = solution.method === 'meyer' ? 'meyer-opposite-centers,meyer-left-block,meyer-remaining-centers,meyer-remaining-wings,' : solution.method === 'reduction_beginner' ? 'reduction-white-center,reduction-opposite-center,reduction-remaining-centers,reduction-edge-pairing,' : '';
  if (solution.stages.map(s => s.id).join(',') !== prefix + beginnerIds) throw Error('Unexpected method stages');
  if (solution.stages.some(s => !s.title || !s.explanation || !s.checkpoint) || solution.chunks!.some(c => !c.name || !c.explanation || c.start === c.end || !solution.stages!.some(s => c.start >= s.start && c.end <= s.end)))
    throw Error('Invalid teaching action');
}
