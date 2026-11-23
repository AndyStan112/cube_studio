import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { applyMove, solved } from "./cube";
import { cubiesToFacelets, FACE_ORDER, rotatedFaceletStates } from "./facelets";
import { detectFace, stickerColor, type FaceDetection, type PixelImage } from "./cameraVision";
import { matchScan, orientScan, suggestedCalibration, type RGB } from "./cameraInput";
import { VideoScanSession } from "./videoScan";
import observations from "./__fixtures__/camera-middle-slice/detections.json";

// Green front, yellow up, then M' U. Restore the fixed color reference after
// moving the centers, independently of the camera's order or roll.
const moved = ["y", "M'", "U"].reduce((cube, move) => applyMove(cube, move), solved(3));
const expected = rotatedFaceletStates(cubiesToFacelets(moved), 3).find(value =>
  [...FACE_ORDER].every((color, i) => value[i * 9 + 4] === color))!;
const patterns = ["FLLFUUFLL", "URUURUURU", "FFFFFFRDR", "RRBDDBRRB", "DDDLLLDDD", "LULBBBBBB"];
const color = (letter: string) => suggestedCalibration.colors[FACE_ORDER.indexOf(letter)];
function frame(face: string, exposure = 1): PixelImage {
  const rgb = gunzipSync(readFileSync(new URL(`./__fixtures__/camera-middle-slice/face-${face}.rgb.gz`, import.meta.url)));
  const data = new Uint8ClampedArray(450 * 800 * 4);
  for (let i = 0; i < 450 * 800; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = rgb[i * 3 + c] * exposure;
    data[i * 4 + 3] = 255;
  }
  return {width: 450, height: 800, data};
}
function rotate(image: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    data.set(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
      (x * image.height + image.height - 1 - y) * 4);
  }
  return {width: image.height, height: image.width, data};
}
describe("the actual M' U recording", () => {
  it("does not invent an orientation from six ambiguous face patterns alone", () => {
    expect(orientScan(patterns.join(""), 3)).toBeNull();
  });
  it("uses neighboring sticker evidence to recover the exact scramble", () => {
    const neighbors: (RGB | null)[][] = patterns.map(() => [null, null, null, null]);
    neighbors[0][2] = color("B"); neighbors[3][2] = color("B");
    expect(matchScan(patterns.map(face => [...face].map(color)), 3, [suggestedCalibration], true, neighbors)[0]?.value).toBe(expected);
  });
  it("does not choose a legal state from a single neighboring patch", () => {
    const neighbors: (RGB | null)[][] = patterns.map(() => [null, null, null, null]);
    neighbors[0][2] = color("B");
    expect(orientScan(patterns.join(""), 3, neighbors)).toBeNull();
  });
  it("tracks all six actual faces through brief bad crops and never emits the other legal state", () => {
    const session = new VideoScanSession(3);
    let checked = 0;
    for (const observation of observations) {
      session.observe(observation.detection as FaceDetection | null, observation.time);
      const match = session.match();
      if (match) {expect(match.value).toBe(expected); checked++;}
    }
    expect(session.snapshot().faces).toHaveLength(6);
    expect(checked).toBeGreaterThan(0);
  });
  for (const exposure of [0.7, 1, 1.15]) for (const offset of [0, 1, 2, 3]) {
    it(`reads the real pixels and neighboring sides at exposure ${exposure}, independent rolls ${offset}`, () => {
      const faces: FaceDetection[] = [];
      for (const [i, face] of [...FACE_ORDER].entries()) {
        let image = frame(face, exposure);
        for (let turn = 0; turn < (i + offset) % 4; turn++) image = rotate(image);
        const detection = detectFace(image, 3);
        expect(detection).not.toBeNull();
        expect(stickerColor(detection!.colors[4])).toBe(i);
        faces.push(detection!);
      }
      expect(matchScan(faces.map(face => face.colors), 3, [suggestedCalibration], true,
        faces.map(face => face.neighbors ?? []))[0]?.value).toBe(expected);
    });
  }
});
