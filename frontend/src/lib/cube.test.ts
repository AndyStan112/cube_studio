import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { applyMove, solved, inverse, algorithmStates } from "./cube";
import { averageOf, parseTime, type Solve } from "./api";
function signature(state: ReturnType<typeof solved>) {
  return state.map((c) => [
    c.position.toArray().map((n) => Math.round(n) || 0),
    ...[
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ].map((n) =>
      new Vector3(...n)
        .applyQuaternion(c.rotation)
        .toArray()
        .map((n) => Math.round(n) || 0),
    ),
  ]);
}
describe("cube permutations", () => {
  it("each face followed by its inverse restores all pieces and orientations", () => {
    for (const face of ["R", "L", "U", "D", "F", "B"])
      for (const suffix of ["", "'", "2"]) {
        const m = face + suffix;
        expect(
          signature(applyMove(applyMove(solved(), m), inverse([m])[0])),
        ).toEqual(signature(solved()));
      }
  });
  it("Sune and reverse Sune solve their corresponding starting cases", () => {
    for (const sequence of ["R U R' U R U2 R'", "R U2 R' U' R U' R'"]) {
      const states = algorithmStates(sequence.split(" "));
      expect(signature(states[0])).not.toEqual(signature(solved()));
      expect(signature(states.at(-1)!)).toEqual(signature(solved()));
    }
  });
  it("R is clockwise looking at the right face", () => {
    const c = applyMove(solved(), "R").find(
      (c) => c.home.join(",") === "1,1,1",
    )!;
    expect(c.position.toArray()).toEqual([1, 1, -1]);
  });
});
describe("solve timing", () => {
  it("parses seconds and minute notation without accepting invalid input", () => {
    expect(parseTime("24.53")).toBe(24530);
    expect(parseTime("1:02.45")).toBe(62450);
    for (const bad of ["0", "-5", "1:60", "abc", "1.2.3", ""])
      expect(parseTime(bad)).toBeNull();
  });
  const solve = (time_ms: number, penalty: Solve["penalty"] = "none") =>
    ({ time_ms, penalty }) as Solve;
  it("trims best and worst and handles DNF in averages", () => {
    expect(
      averageOf(
        [solve(10000), solve(20000), solve(30000), solve(40000), solve(50000)],
        5,
      ),
    ).toBe(30000);
    expect(
      averageOf(
        [
          solve(10000),
          solve(20000),
          solve(30000),
          solve(40000),
          solve(1, "DNF"),
        ],
        5,
      ),
    ).toBe(30000);
    expect(
      averageOf(
        [solve(1, "DNF"), solve(1, "DNF"), solve(1), solve(2), solve(3)],
        5,
      ),
    ).toBe(Infinity);
    expect(averageOf([], 5)).toBeNull();
  });
});
