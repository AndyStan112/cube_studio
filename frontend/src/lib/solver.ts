import { api, ApiError } from "./api";
import {
  FACE_ORDER,
  SOLVED_FACELETS,
  cubiesToFacelets,
  faceletsToCubies,
  validateFacelets,
} from "./facelets";
import { applyMove } from "./cube";
export type CubeTurn = {
  kind: "cube_layer_turn";
  face: "U" | "R" | "F" | "D" | "L" | "B";
  layer_start: 0;
  layer_count: 1;
  amount: 1 | 2 | -1;
};
export type Solution = {
  notation: string[];
  moves: CubeTurn[];
  move_count: number;
  metric: "HTM";
  verified: boolean;
  optimality: "global_proved" | "unproved";
};
export type Job = {
  id: string;
  input: string;
  status: string;
  candidate: Solution | null;
  solution: Solution | null;
  fallback_available: boolean;
  best_move_count: number | null;
  elapsed_ms: number;
  progress: { bound?: number; completed_bound?: number; nodes?: number };
  error: string | null;
};
export const terminal = (job: Job) =>
  ["optimal_proved", "timed_out", "cancelled", "failed"].includes(job.status);
export const solverRequest = (value: string) => ({
  schema_version: 1,
  puzzle: { type: "cube", size: 3 },
  state: { encoding: "cube_facelets_v1", face_order: [...FACE_ORDER], value },
  solver: {
    metric: "HTM",
    objective: "optimal",
    method: "unrestricted",
    constraints: [],
  },
  execution: { fallback_after_ms: 5000, continue_search: true },
});
export function verifySolution(value: string, solution: Solution) {
  validateFacelets(value);
  if (
    solution.metric !== "HTM" ||
    solution.move_count !== solution.notation.length ||
    solution.notation.some((m) => !/^[URFDLB](2|')?$/.test(m))
  )
    throw Error("Invalid solution response");
  const end = solution.notation.reduce(
    (state, m) => applyMove(state, m),
    faceletsToCubies(value),
  );
  if (cubiesToFacelets(end) !== SOLVED_FACELETS)
    throw Error("Solution does not solve the entered cube");
}
export async function createJob(value: string) {
  validateFacelets(value);
  return api<Job>("/solver/jobs", {
    method: "POST",
    body: JSON.stringify(solverRequest(value)),
    signal: AbortSignal.timeout(10000),
  });
}
export const getJob = (id: string) =>
  api<Job>(`/solver/jobs/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(6000),
  });
export const cancelJob = (id: string) =>
  api<Job>(`/solver/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(6000),
  });
export function canUseOffline(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500;
}
export class OfflineSolver {
  private worker: Worker | null = null;
  private reject: ((reason: Error) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  solve(value: string, progress: (message: string) => void): Promise<Solution> {
    this.cancel();
    return new Promise((resolve, reject) => {
      this.reject = reject;
      const finish = () => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.reject = null;
      };
      try {
        const worker = new Worker(
          new URL("./offlineSolver.worker.ts", import.meta.url),
          { type: "module" },
        );
        this.worker = worker;
        worker.onerror = () => {
          finish();
          worker.terminate();
          reject(
            Error(
              "Offline solver assets could not load. Open the app online once to install them.",
            ),
          );
        };
        worker.onmessage = (event) => {
          if (event.data.status === "complete") {
            finish();
            try {
              verifySolution(value, event.data.solution);
              resolve(event.data.solution);
            } catch (e) {
              reject(e);
            }
          } else if (event.data.status === "failed") {
            finish();
            reject(Error(event.data.message));
          } else progress(event.data.message);
        };
        this.timer = setTimeout(() => {
          this.cancel();
        }, 180000);
        worker.postMessage({ value });
      } catch (e) {
        finish();
        reject(e);
      }
    });
  }
  cancel() {
    this.worker?.terminate();
    this.worker = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.reject?.(
      Error("Offline solving cancelled or exceeded its three-minute budget."),
    );
    this.reject = null;
  }
}
