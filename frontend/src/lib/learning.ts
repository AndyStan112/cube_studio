import type { CubeEvent } from './puzzles';
import { readStored, writeStored } from './offline';

export type SkillProgress = { lesson: boolean; drills: number; passed: boolean; passedAt?: string };
export type XPContext = { method?: string; methodId?: string; event?: CubeEvent; sessionId?: string; cubeId?: string; manual?: boolean };
export type XPEvent = XPContext & { id: string; source: 'lesson' | 'drill' | 'test' | 'timer' | 'legacy'; amount: number; createdAt: string; skillId?: string; solveId?: string; repeat: boolean };
export type LearningProgress = { ledger: XPEvent[]; xp: number; skills: Record<string, SkillProgress>; rewardedSolves: string[] };
export type LearningAction = ({ type: 'lesson' | 'drill' | 'test'; skill: string } | { type: 'solve'; id: string; dnf: boolean }) & XPContext;
export const emptyLearning = (): LearningProgress => ({ ledger: [], xp: 0, skills: {}, rewardedSolves: [] });
export const learningKey = (userId?: string) => `cube-studio-learning-v1:${userId ?? 'guest'}`;
export const blankSkill = (): SkillProgress => ({ lesson: false, drills: 0, passed: false });
export function readLearning(userId?: string): LearningProgress {
  const value = readStored<LearningProgress | null>(learningKey(userId), null);
  if (!value || !Number.isSafeInteger(value.xp) || value.xp < 0 || !value.skills || !Array.isArray(value.rewardedSolves)) return emptyLearning();
  const ledger = Array.isArray(value.ledger) ? value.ledger : value.xp ? [{ id: 'legacy-import', source: 'legacy' as const, amount: value.xp, createdAt: new Date().toISOString(), repeat: false }] : [];
  return { ...value, ledger };
}
export function storeLearning(progress: LearningProgress, userId?: string) { writeStored(learningKey(userId), progress); }
// Gentle exponential growth with a linear early-game component. See docs/learning.md.
export const levelCost = (level: number) => Math.round(100 * 1.07 ** (Math.max(1, level) - 1) + 15 * (Math.max(1, level) - 1));
export function levelInfo(xp: number) {
  let level = 1, remaining = Math.max(0, Math.floor(xp));
  while (remaining >= levelCost(level)) { remaining -= levelCost(level); level++; }
  return { level, current: remaining, needed: levelCost(level), fraction: remaining / levelCost(level) };
}
export const drillReward = (completed: number) => Math.max(5, Math.round(20 / Math.sqrt(completed + 1)));
export function earnLearning(progress: LearningProgress, action: LearningAction): { progress: LearningProgress; earned: number } {
  const { method, event, sessionId, cubeId, manual } = action;
  const methodId = action.methodId ?? (method && ['beginner','roux','cfop','zz','reduction','meyer'].includes(method.toLowerCase()) ? method.toLowerCase() : undefined);
  const record = (amount: number, source: XPEvent['source'], repeat: boolean, extra: Partial<XPEvent> = {}): XPEvent => ({ id: crypto.randomUUID(), source, amount, createdAt: new Date().toISOString(), repeat, method, methodId, event, sessionId, cubeId, manual, ...extra });
  if (action.type === 'solve') {
    if (action.dnf || progress.rewardedSolves.includes(action.id)) return { progress, earned: 0 };
    return { progress: { ...progress, xp: progress.xp + 10, ledger: [...progress.ledger, record(10, 'timer', false, { solveId: action.id })], rewardedSolves: [...progress.rewardedSolves, action.id] }, earned: 10 };
  }
  const previous = progress.skills[action.skill] ?? blankSkill();
  let earned = 0, skill = { ...previous };
  if (action.type === 'lesson' && !previous.lesson) { earned = 25; skill.lesson = true; }
  if (action.type === 'drill' && previous.lesson) { earned = drillReward(previous.drills); skill.drills++; }
  if (action.type === 'test' && previous.lesson && previous.drills > 0 && !previous.passed) { earned = 150; skill.passed = true; skill.passedAt = new Date().toISOString(); }
  if (!earned) return { progress, earned: 0 };
  return { progress: { ...progress, xp: progress.xp + earned, ledger: [...progress.ledger, record(earned, action.type, action.type === 'drill' && previous.drills > 0, { skillId: action.skill })], skills: { ...progress.skills, [action.skill]: skill } }, earned };
}
