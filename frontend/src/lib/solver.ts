import { verifyLesson, type LessonStage, type LessonChunk } from "./teaching";
import { api, ApiError } from "./api";
import {
  FACE_ORDER,
  SOLVED_FACELETS,
  solvedFacelets,
  cubiesToFacelets,
  faceletsToCubies,
  validateFacelets,
} from "./facelets";
import { applyMove, type CubeSize } from "./cube";
export type CubeTurn = {
  kind: "cube_layer_turn";
  face: "U" | "R" | "F" | "D" | "L" | "B";
  layer_start: number;
  layer_count: number;
  amount: 1 | 2 | -1;
};
export type SolverMethod = "unrestricted" | "reduction" | "beginner" | "reduction_beginner" | "meyer";
export type Solution = {
  method?: SolverMethod;
  stages?: LessonStage[];
  chunks?: LessonChunk[];
  post_reduction_method?: "beginner" | null;
  notation: string[];
  moves: (CubeTurn | { kind: "cube_rotation"; axis: "x" | "y" | "z"; amount: 1 | 2 | -1 })[];
  move_count: number;
  metric: "HTM" | "OBTM";
  verified: boolean;
  optimality: "global_proved" | "unproved";
};
export type Job = {
  method?: SolverMethod;
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
  ["complete", "optimal_proved", "timed_out", "cancelled", "failed"].includes(job.status);
export const solverRequest = (value: string, size: CubeSize = 3, method: SolverMethod = size === 3 ? "unrestricted" : "reduction") => ({
  schema_version: 1,
  puzzle: { type: "cube", size },
  state: { encoding: "cube_facelets_v1", face_order: [...FACE_ORDER], value },
  solver: {
    metric: size === 3 ? "HTM" : "OBTM",
    objective: method === "unrestricted" ? "optimal" : "solution",
    method,
    ...((method === "reduction_beginner" || method === "meyer") ? { post_reduction_method: "beginner" } : {}),
    constraints: [],
  },
  execution: { fallback_after_ms: 5000, continue_search: true },
});
export function verifySolution(value: string, solution: Solution, size: CubeSize = 3) {
  validateFacelets(value, size);
  verifyLesson(solution);
  if (
    solution.metric !== (size === 3 ? "HTM" : "OBTM") ||
    solution.move_count !== solution.notation.filter(m => size === 3 || !/^[xyz]/.test(m)).length ||
    solution.notation.some((m) => !(size === 3 ? /^[URFDLB](2|')?$/.test(m) : /^(?:(?:[2-5])?[URFDLB]w?|[xyz])(2|')?$/.test(m)))
  )
    throw Error("Invalid solution response");
  const end = solution.notation.reduce(
    (state, m) => applyMove(state, m),
    faceletsToCubies(value, size),
  );
  if (cubiesToFacelets(end) !== solvedFacelets(size))
    throw Error("Solution does not solve the entered cube");
}
export async function createJob(value: string, size: CubeSize = 3, method?: SolverMethod) {
  validateFacelets(value, size);
  return api<Job>("/solver/jobs", {
    method: "POST",
    body: JSON.stringify(solverRequest(value, size, method)),
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
