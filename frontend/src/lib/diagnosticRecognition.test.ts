import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { matchScan, scanIssue, suggestedCalibration, type RGB } from "./cameraInput";
import { detectFace, stickerColor, type FaceDetection, type PixelImage } from "./cameraVision";
import { VideoScanSession } from "./videoScan";
import { canonicalFacePattern } from "./scanAssembly";
import { FACE_ORDER } from "./facelets";
import corpus from "./__fixtures__/diagnostics/2026-11-24/readings.json";
import expectations from "./__fixtures__/diagnostics/2026-11-24/expectations.json";

// Full diagnostic images stay on the device holding the private corpus.
const pixelRoot = process.env.CUBE_DIAGNOSTIC_PIXEL_DIR
  ? resolve(process.env.CUBE_DIAGNOSTIC_PIXEL_DIR)
  : fileURLToPath(new URL("../../../local/diagnostic-testset/2026-11-24/", import.meta.url));
const hasPixels = corpus.pixels.every(fixture => existsSync(join(pixelRoot, fixture.file)));

function pixels(fixture: typeof corpus.pixels[number], exposure = 1): PixelImage {
  const rgb = gunzipSync(readFileSync(join(pixelRoot, fixture.file)));
  const data = new Uint8ClampedArray(fixture.width * fixture.height * 4);
  for (let i = 0; i < rgb.length / 3; i++) {
    for (let channel = 0; channel < 3; channel++) data[i * 4 + channel] = rgb[i * 3 + channel] * exposure;
    data[i * 4 + 3] = 255;
  }
  return {...fixture, data};
}
const expectedPattern = (identity: number) => canonicalFacePattern(expectations.patterns[identity], 3);

describe("uploaded diagnostics 6b05c5850b824d69d7fbb199", () => {
  for (const scan of corpus.scans) {
    it(`preserves all six real face patterns through bad recaptures: ${scan.id}`, () => {
      const session = new VideoScanSession(3);
      for (const frame of scan.frames) {
        session.observe(frame.detection as FaceDetection | null, frame.time);
        // These captures do not establish a unique pose. Never return an
        // arbitrary legal state just to make a failing recording look green.
        expect(session.match()).toBeNull();
      }
      const faces = session.snapshot().faces;
      expect(faces).toHaveLength(6);
      for (const face of faces) {
        expect(face.pattern).toBe(expectedPattern(face.identity!));
        expect(face.neighbors?.filter(Boolean).every(rgb => stickerColor(rgb!) !== 3)).toBe(true);
      }
      const issue = scanIssue(faces.map(face => face.colors), 3, [suggestedCalibration], faces.map(face => face.neighbors ?? []));
      expect(issue.kind).toBe("orientation");
      expect(issue.faces.length).toBeGreaterThan(0);
      expect(issue.faces.every(face => face >= 0 && face < 6)).toBe(true);
    });
    for (const input of scan.workerInputs) {
      it(`replays worker revision ${input.revision} and provides recovery advice: ${scan.id}`, () => {
        const faces = input.faces as RGB[][], neighbors = input.neighbors as (RGB | null)[][];
        expect(matchScan(faces, 3, [suggestedCalibration], true, neighbors)).toEqual([]);
        const issue = scanIssue(faces, 3, [suggestedCalibration], neighbors);
        expect(issue.kind).toBe(input.revision === 10 ? "colors" : "orientation");
        expect(issue.faces.length).toBeGreaterThan(0);
        if (input.revision === 10) expect(issue.faces[0]).toBe(3); // False white laptop grid.
      });
    }
  }
  for (const fixture of corpus.pixels) {
    const pattern = expectations.pixels[fixture.file as keyof typeof expectations.pixels];
    if (!pattern) continue; // The keyboard frame is tested as a negative below.
    for (const exposure of [0.7, 1, 1.1]) {
      it.skipIf(!hasPixels)(`reads real ${pattern[4]} pixels without desk side hints at exposure ${exposure}`, () => {
        const detection = detectFace(pixels(fixture, exposure), 3);
        expect(detection).not.toBeNull();
        const uncertain = expectations.uncertainCells[fixture.file as keyof typeof expectations.uncertainCells] ?? [];
        const actual = detection!.colors.map(rgb => FACE_ORDER[stickerColor(rgb)]).join("");
        if (uncertain.length) {
          // This orange corner is visibly washed out, including in the saved
          // JPEG. Test the readable cells; temporal recovery is asserted above.
          for (let cell = 0; cell < 9; cell++) if (!uncertain.includes(cell)) expect(actual[cell]).toBe(pattern[cell]);
        } else {
          expect(canonicalFacePattern(actual, 3)).toBe(canonicalFacePattern(pattern, 3));
        }
        expect(detection!.neighbors?.filter(Boolean)).toEqual([]);
      });
    }
  }
  it.skipIf(!hasPixels)("does not replace the saved white face with the real laptop grid", () => {
    const scan = corpus.scans.find(scan => scan.id.startsWith("fde91"))!;
    const session = new VideoScanSession(3);
    scan.frames.filter(frame => frame.time < 20).forEach(frame => session.observe(frame.detection as FaceDetection | null, frame.time));
    const before = structuredClone(session.snapshot().faces);
    const detection = detectFace(pixels(corpus.pixels.find(fixture => fixture.file.startsWith("fde91"))!), 3);
    for (const time of [30, 30.2, 30.4, 30.6]) session.observe(detection, time);
    expect(session.snapshot().faces).toEqual(before);
  });
  it("keeps glare-affected chromatic stickers distinct from tinted white", () => {
    expect(stickerColor([98, 168, 126])).toBe(1);
    expect(stickerColor([206, 221, 156])).toBe(0);
    expect(stickerColor([235, 84, 47])).toBe(5);
    expect(stickerColor([143, 192, 233])).toBe(3);
  });
});
