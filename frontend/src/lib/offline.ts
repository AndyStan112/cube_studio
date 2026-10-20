import { api, ApiError, type AlgorithmCatalog, type Scramble, type Solve } from "./api";
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch { return fallback; }
}
export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable or full. */ }
}
const catalogKey = "cube-studio-catalog-v1";
function isCatalog(value: unknown): value is AlgorithmCatalog {
  const catalog = value as AlgorithmCatalog | null;
  return !!catalog && Array.isArray(catalog.sets) && Array.isArray(catalog.algorithms)
    && catalog.sets.every(s => typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.sections))
    && catalog.algorithms.every(a => typeof a.id === "string" && typeof a.name === "string"
      && Array.isArray(a.memberships) && Array.isArray(a.variations)
      && a.variations.every(v => typeof v.id === "string" && typeof v.moves === "string"));
}
export function cachedCatalog(): AlgorithmCatalog | null {
  const value = readStored<unknown>(catalogKey, null);
  try { return isCatalog(value) ? value : null; } catch { return null; }
}
export async function refreshCatalog(): Promise<AlgorithmCatalog> {
  try {
    const value = await api<AlgorithmCatalog>("/algorithm-catalog", { signal: AbortSignal.timeout(6000) });
    if (!isCatalog(value)) throw Error("Invalid algorithm catalog response");
    writeStored(catalogKey, value);
    return value;
  } catch (error) {
    const previous = cachedCatalog();
    if (previous) return previous;
    throw error;
  }
}
export function localScramble(): Scramble {
  let previous = "";
  const moves = Array.from({ length: 25 }, () => {
    const faces = [..."URFDLB"].filter(face => face !== previous);
    previous = faces[Math.floor(Math.random() * faces.length)];
    return previous + ["", "'", "2"][Math.floor(Math.random() * 3)];
  }).join(" ");
  return { id: `local:${crypto.randomUUID()}`, moves, event: "333" };
}
export const localSolve = (scramble: Scramble, time_ms: number, penalty: Solve["penalty"]): Solve => ({
  id: `local:${crypto.randomUUID()}`, scramble: scramble.moves, time_ms, penalty, created_at: new Date().toISOString(),
});
export const solvesKey = (userId?: string) => `cube-studio-solves-v1:${userId ?? "guest"}`;
type PendingEdit = { id: string; penalty?: Solve["penalty"]; remove?: boolean };
const pendingKey = (userId: string) => `cube-studio-pending-edits-v1:${userId}`;
export function queueSolveEdit(userId: string, edit: PendingEdit) {
  const pending = readStored<PendingEdit[]>(pendingKey(userId), []);
  writeStored(pendingKey(userId), [...pending.filter(item => item.id !== edit.id), edit]);
}
export async function flushSolveEdits(userId: string) {
  const pending = readStored<PendingEdit[]>(pendingKey(userId), []);
  for (const edit of pending) {
    try {
      await api(`/solves/${encodeURIComponent(edit.id)}`, {
        method: edit.remove ? "DELETE" : "PATCH",
        ...(edit.remove ? {} : { body: JSON.stringify({ penalty: edit.penalty }) }),
        signal: AbortSignal.timeout(6000),
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404 && edit.remove)) throw error;
    }
    const current = readStored<PendingEdit[]>(pendingKey(userId), []);
    writeStored(pendingKey(userId), current.filter(item => JSON.stringify(item) !== JSON.stringify(edit)));
  }
}

export function clearSolveEdit(userId: string, id: string) {
  writeStored(pendingKey(userId), readStored<PendingEdit[]>(pendingKey(userId), []).filter(edit => edit.id !== id));
}
