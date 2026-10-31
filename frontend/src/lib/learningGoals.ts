import { Vector3 } from 'three';
import { applyMove, inverse, moveInfo, solved, type Cubie } from './cube';
export type Home = [number, number, number];
export type Goal = 'edge' | 'cross' | 'bottom-layer' | 'f2l' | 'yellow-cross' | 'top-oriented' | 'top-corners' | 'solved' | 'left-square' | 'left-block' | 'two-blocks' | 'roux-oriented' | 'roux-lr';
export function parseLearningMoves(value: string): string[] {
  const moves = value.trim().replace(/[′’]/g, "'").split(/\s+/).filter(Boolean);
  if (!moves.length) throw Error('Enter the turns you would make.');
  if (moves.length > 100) throw Error('Try a sequence of 100 moves or fewer.');
  for (const move of moves) {
    if (!/^[URFDLBMESxyz](2|')?$/.test(move)) throw Error(`Unknown move “${move}”. Use face turns, M/E/S slices, or x/y/z rotations.`);
    moveInfo(move);
  }
  return moves;
}
export function caseState(solution: string[]) { return inverse(solution).reduce((s, m) => applyMove(s, m), solved()); }
export function atHome(c: Cubie) {
  if (c.position.distanceTo(new Vector3(...c.home)) > .01) return false;
  return c.home.every((n, axis) => !n || new Vector3(...([0, 1, 2].map(a => a === axis ? n : 0) as Home)).applyQuaternion(c.rotation).distanceTo(new Vector3(...([0, 1, 2].map(a => a === axis ? n : 0) as Home))) < .01);
}
const isEdge = (c: Cubie) => c.home.filter(n => n !== 0).length === 2;
const isCorner = (c: Cubie) => c.home.every(n => n !== 0);
const leftBlock = (c: Cubie) => c.home[0] === -1 && c.home[1] <= 0;
const rightBlock = (c: Cubie) => c.home[0] === 1 && c.home[1] <= 0;
const udStickerVertical = (c: Cubie) => Math.abs(new Vector3(0, Math.sign(c.home[1]), 0).applyQuaternion(c.rotation).y) > .99;
export function goalMet(state: Cubie[], goal: Goal, target: Home = [0, -1, 1]) {
  const all = (predicate: (c: Cubie) => boolean) => state.filter(predicate).every(atHome);
  const blocks = () => all(c => leftBlock(c) || rightBlock(c));
  switch (goal) {
    case 'edge': return all(c => c.home.every((n, i) => n === target[i]));
    case 'cross': return all(c => c.home[1] === -1 && isEdge(c));
    case 'bottom-layer': return all(c => c.home[1] === -1);
    case 'f2l': return all(c => c.home[1] <= 0);
    case 'yellow-cross': return all(c => c.home[1] <= 0) && state.filter(c => isEdge(c) && c.home[1] === 1).every(udStickerVertical);
    case 'top-oriented': return all(c => c.home[1] <= 0) && state.filter(c => isCorner(c) && c.home[1] === 1).every(c => new Vector3(0, 1, 0).applyQuaternion(c.rotation).y > .99);
    case 'top-corners': return blocks() && all(c => isCorner(c));
    case 'left-square': return all(c => leftBlock(c) && c.home[2] >= 0);
    case 'left-block': return all(leftBlock);
    case 'two-blocks': return blocks();
    case 'roux-oriented': return blocks() && all(isCorner) && state.filter(c => isEdge(c) && (c.home[1] !== 0)).every(udStickerVertical);
    case 'roux-lr': return blocks() && all(isCorner) && all(c => isEdge(c) && Math.abs(c.home[0]) === 1);
    case 'solved': return state.every(atHome);
  }
}
export function checkSkillMoves(solution: string[], answer: string, goal: Goal, target?: Home) {
  const moves = parseLearningMoves(answer);
  return goalMet(moves.reduce((s, m) => applyMove(s, m), caseState(solution)), goal, target);
}
