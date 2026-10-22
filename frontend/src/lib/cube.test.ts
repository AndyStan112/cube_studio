import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { AlgorithmCatalog } from "./api";
import { Vector3 } from "three";
import { applyMove, solved, inverse, algorithmStates, moveInfo, type CubeSize } from "./cube";
import { averageOf, parseTime, type Solve } from "./api";
function signature(state: ReturnType<typeof solved>) {
  return state.map((c) => [
    c.position.toArray().map((n) => Math.round(n * 2) / 2 || 0),
    ...[
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ].map((n) =>
      new Vector3(...n)
        .applyQuaternion(c.rotation)
        .toArray()
        .map((n) => Math.round(n * 2) / 2 || 0),
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
  it("every catalog variation starts unsolved and animates to the solved state", () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL("../../../backend/app/algorithm_catalog.json", import.meta.url),
        "utf8",
      ),
    ) as AlgorithmCatalog;
    for (const algorithm of catalog.algorithms) {
      for (const variation of algorithm.variations) {
        const size = algorithm.puzzle_size ?? 3;
        const states = algorithmStates(variation.moves.split(" "), undefined, size);
        expect(
          signature(states[0]),
          `${algorithm.id}/${variation.id}`,
        ).not.toEqual(signature(solved(size)));
        expect(
          signature(states.at(-1)!),
          `${algorithm.id}/${variation.id}`,
        ).toEqual(signature(solved(size)));
      }
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
    expect(parseTime("123.45")).toBe(123450);
    expect(parseTime("2:03.45")).toBe(123450);
    expect(parseTime("86400")).toBe(86400000);
    for (const bad of [
      "0",
      "-5",
      "1:60",
      "1:123",
      "86400.001",
      "abc",
      "1.2.3",
      "",
    ])
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

function stickers(state: ReturnType<typeof solved>, size: CubeSize) {
  const result = new Map<string, number>();
  const edge = (size - 1) / 2;
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const c of state) {
    normals.forEach((normal, face) => {
      if (!normal.some((n, axis) => n !== 0 && c.home[axis] === n * edge)) return;
      const direction = new Vector3(...normal).applyQuaternion(c.rotation).toArray().map(Math.round);
      result.set(`${c.position.toArray().join()}:${direction.join()}`, face);
    });
  }
  return result;
}

describe("big cube parity", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../backend/app/algorithm_catalog.json", import.meta.url), "utf8")) as AlgorithmCatalog;
  for (const size of [3, 4, 5] as const) {
    it(`${size}×${size} turns preserve the lattice and invert correctly`, () => {
      for (const face of ["R", "L", "U", "D", "F", "B"]) {
        for (const base of [face, `${face}w`, `2${face}`, `3${face}w`]) {
          for (const suffix of ["", "'", "2"]) {
            const move = base + suffix;
            const start = solved(size);
            const turned = applyMove(start, move);
            const edge = (size - 1) / 2;
            expect(new Set(turned.map(c => c.position.toArray().join())).size).toBe(size ** 3);
            expect(turned.every(c => c.position.toArray().every(n => Math.abs(n) <= edge && Number.isInteger(n + edge)))).toBe(true);
            expect(signature(applyMove(turned, inverse([move])[0]))).toEqual(signature(start));
          }
        }
      }
    });
  }
  it("selects wide blocks and individual inner slices", () => {
    expect(moveInfo("R", 4).layers).toEqual([1.5]);
    expect(moveInfo("Rw", 4).layers).toEqual([1.5, 0.5]);
    expect(moveInfo("2R", 4).layers).toEqual([0.5]);
    expect(moveInfo("2L", 5).layers).toEqual([-1]);
    expect(moveInfo("3Rw", 5).layers).toEqual([2, 1, 0]);
    for (const move of ["4Rw", "0R", "R3", "Rww", "2Q"]) expect(() => moveInfo(move)).toThrow();
    expect(inverse(["Rw'", "2R'", "3Rw'"])).toEqual(["3Rw", "2R", "Rw"]);
  });
  for (const size of [4, 5] as const) {
    it(`${size}×${size} edge parity changes only the two top-front wings`, () => {
      const algorithm = catalog.algorithms.find(a => a.id === (size === 4 ? "4x4-oll-parity" : "5x5-edge-parity"))!;
      const setup = algorithmStates(algorithm.variations.find(v => v.id === "normal")!.moves.split(" "), undefined, size)[0];
      const expected = stickers(solved(size), size);
      const actual = stickers(setup, size);
      const changed = [...actual.keys()].filter(key => actual.get(key) !== expected.get(key)).sort();
      const edge = (size - 1) / 2;
      expect(changed).toEqual([-(edge - 1), edge - 1].flatMap(x => [
        `${x},${edge},${edge}:0,1,0`, `${x},${edge},${edge}:0,0,1`,
      ]).sort());
    });
  }
  it("4×4 PLL parity swaps the top-front and top-back edge pairs, preserving all other colors", () => {
    const algorithm = catalog.algorithms.find(a => a.id === "4x4-pll-parity")!;
    const setup = algorithmStates(algorithm.variations[0].moves.split(" "), undefined, 4)[0];
    const expected = stickers(solved(4), 4);
    const actual = stickers(setup, 4);
    const changed = [...actual.keys()].filter(key => actual.get(key) !== expected.get(key)).sort();
    expect(changed).toEqual([-0.5, 0.5].flatMap(x => [
      `${x},1.5,1.5:0,0,1`, `${x},1.5,-1.5:0,0,-1`,
    ]).sort());
  });
});

it("wide-turn parity keeps centers solved and starts with exactly one unpaired edge", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../backend/app/algorithm_catalog.json", import.meta.url), "utf8")) as AlgorithmCatalog;
  const algorithm = catalog.algorithms.find(a => a.id === "5x5-edge-parity")!;
  expect(algorithm.variations[0].moves).toMatch(/^Rw U2 x /);
  const setup = algorithmStates(algorithm.variations[0].moves.split(" "), undefined, 5)[0];
  const actual = stickers(setup, 5), expected = stickers(solved(5), 5);
  const edges = new Map<string, number[]>();
  for (const [key, color] of actual) {
    const [position, normal] = key.split(":");
    const coords = position.split(",").map(Number);
    const boundaries = coords.filter(n => Math.abs(n) === 2).length;
    if (boundaries === 1) expect(color, `center ${key}`).toBe(expected.get(key));
    if (boundaries === 2) {
      const edge = coords.map(n => Math.abs(n) === 2 ? n : "*").join() + ":" + normal;
      edges.set(edge, [...(edges.get(edge) ?? []), color]);
    }
  }
  expect([...edges].filter(([, colors]) => new Set(colors).size > 1).map(([key]) => key).sort()).toEqual([
    "*,2,2:0,0,1", "*,2,2:0,1,0",
  ]);
});

it("whole-cube rotations turn every layer, invert, and use the face-turn direction", () => {
  for (const size of [3, 4, 5] as const) {
    for (const axis of ["x", "y", "z"]) {
      for (const suffix of ["", "'", "2"]) {
        const move = axis + suffix;
        const start = solved(size);
        const turned = applyMove(start, move);
        expect(moveInfo(move, size).layers).toHaveLength(size);
        expect(turned.every(c => Math.abs(c.rotation.w) < 0.999)).toBe(true);
        expect(signature(applyMove(turned, inverse([move])[0]))).toEqual(signature(start));
      }
    }
  }
  expect(applyMove(solved(), "x").find(c => c.home.join() === "1,1,1")!.position.toArray()).toEqual([1, 1, -1]);
});
