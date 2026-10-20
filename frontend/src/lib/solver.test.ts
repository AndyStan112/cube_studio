import { describe, it, expect, vi } from "vitest";
import CubeJS from "../vendor/cubejs";
import { applyMove, solved, inverse, algorithmStates } from "./cube";
import {
  FACE_COLORS,
  FACE_ORDER,
  SOLVED_FACELETS,
  cubiesToFacelets,
  faceletsToCubies,
  validateFacelets,
} from "./facelets";
import {
  OfflineSolver,
  canUseOffline,
  solverRequest,
  verifySolution,
  type Solution,
} from "./solver";
import { ApiError } from "./api";
const solution = (notation: string[]): Solution => ({
  notation,
  moves: notation.map((m) => ({
    kind: "cube_layer_turn",
    face: m[0] as "U",
    layer_start: 0,
    layer_count: 1,
    amount: m.endsWith("2") ? 2 : m.endsWith("'") ? -1 : 1,
  })),
  move_count: notation.length,
  metric: "HTM",
  verified: true,
  optimality: "unproved",
});
describe("canonical cube boundary and arbitrary playback", () => {
  it("keeps the viewer color scheme and solved identity", () => {
    expect(cubiesToFacelets(solved())).toBe(SOLVED_FACELETS);
    expect(cubiesToFacelets(faceletsToCubies(SOLVED_FACELETS))).toBe(
      SOLVED_FACELETS,
    );
    expect(FACE_COLORS.U).toBe("#f5d54f");
    expect(FACE_COLORS.F).toBe("#e9574e");
  });
  it("matches independent cubejs indexing on every face and multi-turn state", () => {
    for (const face of FACE_ORDER)
      for (const suffix of ["", "2", "'"]) {
        const m = face + suffix;
        expect(cubiesToFacelets(applyMove(solved(), m))).toBe(
          new CubeJS().move(m).asString(),
        );
      }
    const moves = "R U F2 B' L D2 R' F".split(" ");
    const state = moves.reduce((c, m) => applyMove(c, m), solved());
    const value = cubiesToFacelets(state);
    expect(value).toBe(new CubeJS().move(moves.join(" ")).asString());
    expect(cubiesToFacelets(faceletsToCubies(value))).toBe(value);
    const states = algorithmStates(inverse(moves), faceletsToCubies(value));
    expect(cubiesToFacelets(states[0])).toBe(value);
    expect(cubiesToFacelets(states.at(-1)!)).toBe(SOLVED_FACELETS);
    verifySolution(value, solution(inverse(moves)));
  });
  it("round trips uniformly sampled valid states", () => {
    for (let i = 0; i < 30; i++) {
      const value = CubeJS.random().asString();
      validateFacelets(value);
      expect(cubiesToFacelets(faceletsToCubies(value))).toBe(value);
    }
  });
  it("rejects impossible states, inventory, counts, centers, and false solutions", () => {
    const flip = [...SOLVED_FACELETS];
    [flip[5], flip[10]] = [flip[10], flip[5]];
    const twist = [...SOLVED_FACELETS];
    [twist[8], twist[9], twist[20]] = [twist[20], twist[8], twist[9]];
    const swap = [...SOLVED_FACELETS];
    [swap[10], swap[19]] = [swap[19], swap[10]];
    const duplicate = [...SOLVED_FACELETS];
    [duplicate[19], duplicate[16]] = [duplicate[16], duplicate[19]];
    const mirrored = [...SOLVED_FACELETS];
    [mirrored[9], mirrored[20]] = [mirrored[20], mirrored[9]];
    for (const value of [
      duplicate.join(""),
      mirrored.join(""),
      "U".repeat(54),
      SOLVED_FACELETS.slice(1),
      flip.join(""),
      twist.join(""),
      swap.join(""),
    ])
      expect(() => validateFacelets(value)).toThrow();
    expect(() =>
      verifySolution(new CubeJS().move("R").asString(), solution(["U"])),
    ).toThrow();
  });
  it("uses puzzle-specific request and move semantics", () => {
    expect(solverRequest(SOLVED_FACELETS).solver.metric).toBe("HTM");
    expect(solution(["R2"]).moves[0]).toEqual({
      kind: "cube_layer_turn",
      face: "R",
      layer_start: 0,
      layer_count: 1,
      amount: 2,
    });
  });
});
describe("offline two-phase", () => {
  it("solves random states with verified unproved results", () => {
    CubeJS.initSolver();
    for (let i = 0; i < 4; i++) {
      const value = CubeJS.random().asString();
      const result = solution(
        CubeJS.fromString(value).solve(22).trim().split(/\s+/),
      );
      verifySolution(value, result);
      expect(result.optimality).toBe("unproved");
    }
  }, 30000);
  it("does not bypass invalid requests or rate limits", () => {
    expect(canUseOffline(new ApiError("invalid", 422))).toBe(false);
    expect(canUseOffline(new ApiError("busy", 429))).toBe(false);
    expect(canUseOffline(new ApiError("unavailable", 503))).toBe(true);
    expect(canUseOffline(Error("network"))).toBe(true);
  });
  it("handles missing worker assets and cancellation", async () => {
    class MockWorker {
      onerror: (() => void) | null = null;
      onmessage: ((e: unknown) => void) | null = null;
      terminate = vi.fn();
      postMessage() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Worker", MockWorker);
    const solver = new OfflineSolver();
    await expect(solver.solve(SOLVED_FACELETS, () => {})).rejects.toThrow(
      "assets",
    );
    class WaitingWorker extends MockWorker {
      postMessage() {}
    }
    vi.stubGlobal("Worker", WaitingWorker);
    const pending = solver.solve(SOLVED_FACELETS, () => {});
    solver.cancel();
    await expect(pending).rejects.toThrow("cancelled");
    vi.unstubAllGlobals();
  });
});
