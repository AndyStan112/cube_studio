import { effective, type Scramble, type Solve } from './api';
import { applyMove, inverse, solved, type CubeSize } from './cube';
import { cubiesToFacelets } from './facelets';
import { readStored, writeStored } from './offline';
import type { CubeEvent } from './puzzles';
import type { Representation } from './solverInput';

export type TrainingSession = { id: string; name: string; event: CubeEvent; cube: string; method: string; created_at: string };
export type CubeProfile = { id: string; name: string; event: CubeEvent; calibrationId: string };
export type Settings = { inspection: boolean; defaultCube: string; defaultMethod: string; representation: Representation; transparent: boolean; playbackMs: number };
export type SavedScramble = Scramble & { name: string; created_at: string };
export type TrainingData = { sessions: TrainingSession[]; active: Partial<Record<CubeEvent, string>>; cubes: CubeProfile[]; methods: string[]; settings: Settings; scrambles: SavedScramble[] };
export const defaults: Settings = { inspection: false, defaultCube: '', defaultMethod: 'Beginner', representation: 'camera', transparent: false, playbackMs: 800 };
export const trainingKey = (id?: string) => `cube-studio-training-v1:${id ?? 'guest'}`;
export function readTraining(id?: string): TrainingData {
  const stored = readStored<Partial<TrainingData>>(trainingKey(id), {});
  return { sessions: (['333', '444', '555'] as CubeEvent[]).map(event => ({ id: `legacy:${event}`, name: 'Previous solves', event, cube: '', method: 'Beginner', created_at: new Date().toISOString() })), active: {}, cubes: [], methods: ['Beginner', 'CFOP', 'Roux', 'ZZ', 'Reduction', 'Meyer'], scrambles: [], ...stored, settings: { ...defaults, ...stored.settings } };
}
export function storeTraining(data: TrainingData, id?: string) { writeStored(trainingKey(id), data); }
export function createSession(event: CubeEvent, data: TrainingData, name?: string): TrainingSession {
  const cube = data.cubes.find(c => c.id === data.settings.defaultCube && c.event === event);
  return { id: crypto.randomUUID(), name: name?.trim() || `Session ${data.sessions.filter(s => s.event === event).length + 1}`, event, cube: cube?.id ?? '', method: data.settings.defaultMethod, created_at: new Date().toISOString() };
}
export const inspectionPenalty = (ms: number): Solve['penalty'] => ms >= 17000 ? 'DNF' : ms >= 15000 ? '+2' : 'none';
export function stateScramble(value: string, solution: string[], size: CubeSize): string[] {
  const moves = inverse(solution);
  const result = moves.reduce((state, move) => applyMove(state, move), solved(size));
  if (cubiesToFacelets(result) !== value) throw Error('The generated scramble does not match this cube state.');
  return moves;
}
export function summarize(solves: Solve[]) {
  const times = solves.map(effective).filter(Number.isFinite);
  return { count: solves.length, dnf: solves.length - times.length, mean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, best: times.length ? Math.min(...times) : null };
}
export function clearLocalData() {
  for (const key of Object.keys(localStorage)) if (key.startsWith('cube-studio-') || key === 'cube-mock-token' || key === 'cube-mock-user') localStorage.removeItem(key);
}
