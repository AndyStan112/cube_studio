import { describe, expect, it } from "vitest";
import { VideoScanSession } from "./videoScan";
import { suggestedCalibration, matchScan, type RGB } from "./cameraInput";
import { applyMove, solved, type CubeSize } from "./cube";
import {
  cubiesToFacelets,
  FACE_ORDER,
  solvedFacelets,
  validateFacelets,
} from "./facelets";
import { cubeOrientationKey, rotateFacePattern } from "./scanAssembly";
const colors = (pattern: string) =>
  [...pattern].map((c) => suggestedCalibration.colors[FACE_ORDER.indexOf(c)]);
function present(session: VideoScanSession, pattern: string, time: number) {
  let result = session.snapshot();
  for (let i = 0; i < 4; i++)
    result = session.observe(
      { corners: [], colors: colors(pattern), quality: 0.9 },
      time + i * 0.17,
    );
  return result;
}
describe("continuous video scan", () => {
  it("does not check off a single unstable frame", () => {
    const session = new VideoScanSession(3);
    expect(
      session.observe(
        { corners: [], colors: colors("U".repeat(9)), quality: 0.9 },
        0,
      ).faces,
    ).toHaveLength(0);
    expect(
      present(session, "R".repeat(9), 0.2).faces.map((face) => face.id),
    ).toEqual(["R"]);
  });
  it("ignores duplicate camera timestamps", () => {
    const session = new VideoScanSession(3);
    for (let i = 0; i < 10; i++)
      session.observe(
        { corners: [], colors: colors("U".repeat(9)), quality: 0.9 },
        0,
      );
    expect(session.snapshot().faces).toHaveLength(0);
  });
  it("identifies odd faces in any order and reports the six fixed identities", () => {
    const session = new VideoScanSession(3);
    [..."BDFURL"].forEach((c, i) => present(session, c.repeat(9), i));
    expect(new Set(session.snapshot().faces.map((face) => face.id)).size).toBe(
      6,
    );
    expect(session.match()?.value).toBe(solvedFacelets());
  });
  it("uses the entire even face pattern, including stickers outside the centers", () => {
    const session = new VideoScanSession(4);
    const a = "URFD" + "URFD" + "URFD" + "URFD";
    const b = "BRFD" + "URFD" + "URFD" + "URFD";
    expect(present(session, a, 0).faces).toHaveLength(1);
    expect(present(session, rotateFacePattern(a, 4), 1).faces).toHaveLength(1);
    expect(present(session, b, 2).faces).toHaveLength(2);
    expect(
      session.snapshot().faces.every((face) => face.identity === null),
    ).toBe(true);
  });
  it("does not check off an occluded face as a new even side when color inventory makes that impossible", () => {
    const session = new VideoScanSession(4);
    present(session, "L".repeat(16), 0);
    const observation = present(session, "L".repeat(15) + "D", 1);
    expect(observation.faces).toHaveLength(1);
    expect(observation.status).toBe("unclear");
  });
  for (const size of [3, 4, 5] as const) {
    it(`recognizes and validates a scrambled ${size}x${size} from arbitrary order and rotations`, () => {
      const value = cubiesToFacelets(
        ["R", "U", "F'", ...(size > 3 ? ["Rw"] : [])].reduce(
          (cube, move) => applyMove(cube, move),
          solved(size),
        ),
      );
      const session = new VideoScanSession(size);
      [4, 1, 5, 0, 3, 2].forEach((f, i) => {
        let pattern = value.slice(f * size * size, (f + 1) * size * size);
        for (let r = 0; r < i % 4; r++)
          pattern = rotateFacePattern(pattern, size);
        present(session, pattern, i);
      });
      expect(session.snapshot().faces).toHaveLength(6);
      const result = session.match();
      expect(result).not.toBeNull();
      expect(() => validateFacelets(result!.value, size)).not.toThrow();
      expect(
        size % 2 ? result!.value : cubeOrientationKey(result!.value, size),
      ).toBe(size % 2 ? value : cubeOrientationKey(value, size));
    });
  }
  it("keeps identical even patterns uncounted rather than inventing a new side", () => {
    const session = new VideoScanSession(4);
    for (let i = 0; i < 8; i++) present(session, "U".repeat(16), i);
    expect(session.snapshot().faces).toHaveLength(1);
    expect(session.match()).toBeNull();
  });
});
