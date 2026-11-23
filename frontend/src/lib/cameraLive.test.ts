import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { detectFace, stickerColor, type PixelImage } from "./cameraVision";
import type { RGB } from "./cameraInput";

// Actual video frame at 9.3s in the solved 3x3 recording, without UI overlays.
// Reduced chroma reproduces the orange RGB range in the failed live screenshots.
function frame(neutral: RGB = [90, 90, 90], mix = 0): PixelImage {
  const rgb = gunzipSync(
    readFileSync(
      new URL(
        "./__fixtures__/camera-live/orange-frame.rgb.gz",
        import.meta.url,
      ),
    ),
  );
  const width = 270,
    height = 480,
    data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++)
      data[i * 4 + c] = rgb[i * 3 + c] * (1 - mix) + neutral[c] * mix;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
describe("muted live-camera colors", () => {
  for (const [name, neutral, mix] of [
    ["original", [90, 90, 90], 0],
    ["muted orange", [90, 90, 90], 0.45],
    ["bluish muted orange", [90, 90, 120], 0.45],
  ] as const) {
    it(`finds the real face despite the packaging in the background: ${name}`, () => {
      const image = frame([...neutral], mix);
      const detection = detectFace(image, 3);
      expect(detection).not.toBeNull();
      expect(detection!.colors.map(stickerColor)).toEqual(Array(9).fill(5));
      const y = detection!.corners.reduce((sum, point) => sum + point.y, 0) / 4;
      expect(y).toBeGreaterThan(image.height * 0.35);
      expect(y).toBeLessThan(image.height * 0.6);
    });
  }
  it("does not turn a featureless orange surface into a cube", () => {
    const image = frame();
    for (let i = 0; i < image.data.length; i += 4)
      image.data.set([181, 98, 54, 255], i);
    expect(detectFace(image, 3)).toBeNull();
  });
});
