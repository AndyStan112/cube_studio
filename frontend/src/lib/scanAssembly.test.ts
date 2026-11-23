import { describe, expect, it } from "vitest";
import { applyMove, solved } from "./cube";
import { cubiesToFacelets, faceletsToCubies, solvedFacelets } from "./facelets";
import {
  assembleEvenScan,
  cubeOrientationKey,
  rotateFacePattern,
} from "./scanAssembly";
function permute(value: string, seed: number) {
  return [4, 1, 5, 0, 3, 2]
    .map((face, i) => {
      let pattern = value.slice(face * 16, (face + 1) * 16);
      for (let j = 0; j < (i + seed) % 4; j++)
        pattern = rotateFacePattern(pattern, 4);
      return pattern;
    })
    .join("");
}
describe("unordered even-face reconstruction", () => {
  it("deduplicates whole-cube rotations of the solved cube", () => {
    expect(assembleEvenScan(permute(solvedFacelets(4), 2), 4)).toBe(
      solvedFacelets(4),
    );
  });
  for (let seed = 0; seed < 12; seed++)
    it(`assembles a scrambled 4x4 with mixed centers (case ${seed})`, () => {
      const moves = [
        "Rw",
        "U2",
        "Lw'",
        "F",
        "B2",
        "Uw",
        "R2",
        "D",
        "Fw",
        "L",
        "D'",
        "Bw2",
      ];
      const value = cubiesToFacelets(
        moves
          .slice(seed % 4)
          .concat(moves.slice(0, seed % 4))
          .reduce((state, move) => applyMove(state, move), solved(4)),
      );
      const assembled = assembleEvenScan(permute(value, seed), 4);
      expect(assembled).not.toBeNull();
      expect(() => faceletsToCubies(assembled!, 4)).not.toThrow();
      expect(cubeOrientationKey(assembled!, 4)).toBe(
        cubeOrientationKey(value, 4),
      );
    });
  it("rejects a mirrored single corner even with the correct color counts", () => {
    const value = [...solvedFacelets(4)];
    [value[15], value[16]] = [value[16], value[15]];
    expect(assembleEvenScan(permute(value.join(""), 0), 4)).toBeNull();
  });
  it("keeps an intrinsically ambiguous center-pattern arrangement unconfirmed", () => {
    const value = [...solvedFacelets(4)];
    [value[5], value[21]] = [value[21], value[5]];
    expect(() => faceletsToCubies(value.join(""), 4)).not.toThrow();
    expect(assembleEvenScan(permute(value.join(""), 0), 4)).toBeNull();
  });
});
