import { describe, expect, it } from "vitest";
import {
  detectFace,
  identifyVideoFace,
  sampleQuad,
  selectVideoFaces,
  stickerColor,
  type PixelImage,
  type Point,
} from "./cameraVision";
import { matchScan, suggestedCalibration, type RGB } from "./cameraInput";
import type { CubeSize } from "./cube";
import recordings from "./__fixtures__/camera-scans";

// These measured samples include fluorescent yellow, blue-tinted white, center
// logos and shadows from the four handheld recordings supplied on 2026-11-23.
describe("recorded cube colors", () => {
  for (const recording of recordings) {
    for (const exposure of [0.45, 0.7, 1, 1.1]) {
      it(`recognizes ${recording.name} at exposure ${exposure}`, () => {
        const faces = recording.faces.map((face) =>
          face.map((rgb) => rgb.map((v) => Math.min(255, v * exposure)) as RGB),
        );
        const result = matchScan(
          faces,
          recording.size as CubeSize,
          [suggestedCalibration],
          true,
        );
        expect(result[0]?.value).toBe(recording.expected);
      });
    }
  }
  it("keeps an impossible edge flip invalid when rotations are allowed", () => {
    const recording = recordings[2];
    const faces = structuredClone(recording.faces) as RGB[][];
    [faces[0][7], faces[2][1]] = [faces[2][1], faces[0][7]];
    expect(matchScan(faces, 3, [suggestedCalibration], true)).toEqual([]);
  });
});

function scene(
  size: CubeSize,
  angle = 0,
): { image: PixelImage; corners: Point[]; colors: RGB[] } {
  const width = 240,
    height = 320,
    data = new Uint8ClampedArray(width * height * 4);
  const colors = Array.from(
    { length: size * size },
    (_, i) => suggestedCalibration.colors[i % 6],
  );
  // Off-center face, with narrow dark grooves, against a wood-colored background.
  const side = 104,
    cx = 85,
    cy = 175,
    c = Math.cos(angle),
    s = Math.sin(angle);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = ((x - cx) * c + (y - cy) * s) / side + 0.5,
        v = (-(x - cx) * s + (y - cy) * c) / side + 0.5;
      let rgb: RGB = [145, 112, 86];
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        rgb = colors[Math.floor(v * size) * size + Math.floor(u * size)];
        if ((u * size) % 1 < 0.025 || (v * size) % 1 < 0.025)
          rgb = [15, 15, 15];
      }
      data.set([...rgb, 255], (y * width + x) * 4);
    }
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([x, y]) => ({
    x: cx + side * (x * c - y * s),
    y: cy + side * (x * s + y * c),
  }));
  return { image: { width, height, data }, corners, colors };
}
describe("face localization and sampling", () => {
  for (const size of [3, 4, 5] as const)
    for (const angle of [0, -0.2, 0.25]) {
      it(`locates an off-center tilted ${size}x${size} face (${angle})`, () => {
        const { image, colors } = scene(size, angle);
        const detection = detectFace(image, size);
        expect(detection).not.toBeNull();
        expect(detection!.colors.map(stickerColor)).toEqual(
          colors.map(stickerColor),
        );
      });
    }
  it("does not sample the desk when there is no face", () => {
    const { image } = scene(3);
    for (let i = 0; i < image.data.length; i += 4)
      image.data.set([145, 112, 86, 255], i);
    expect(detectFace(image, 3)).toBeNull();
  });
  it("samples around a printed center logo", () => {
    const { image, corners } = scene(3);
    // White center with a blue printed logo over the central third.
    for (let y = 160; y <= 190; y++)
      for (let x = 70; x <= 100; x++)
        image.data.set([155, 195, 225, 255], (y * image.width + x) * 4);
    for (let y = 170; y <= 180; y++)
      for (let x = 80; x <= 90; x++)
        image.data.set([5, 70, 180, 255], (y * image.width + x) * 4);
    expect(stickerColor(sampleQuad(image, 3, corners)[4])).toBe(3);
  });
  it("does not identify scrambled even faces from a majority color", () => {
    expect(
      identifyVideoFace(
        { corners: [], quality: 1, colors: scene(4).colors },
        4,
      ),
    ).toBe(-1);
  });
  it("keeps missing video faces empty", () => {
    const { image } = scene(3);
    const detection = detectFace(image, 3)!;
    const selected = selectVideoFaces([{ ...detection, index: 1, time: 2 }], 3);
    expect(selected.faces.filter(Boolean)).toHaveLength(1);
    expect(selected.times).toEqual([null, 2, null, null, null, null]);
  });
});
