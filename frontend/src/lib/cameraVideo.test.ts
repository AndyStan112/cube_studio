import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectFace,
  identifyVideoFace,
  selectVideoFaces,
  type VideoFace,
} from "./cameraVision";
import { matchScan, suggestedCalibration } from "./cameraInput";
import recordings from "./__fixtures__/camera-scans";

// Personal videos stay in ignored local/. Opt in with:
// CUBE_CAMERA_VIDEO_DIR=../local npm test -- src/lib/cameraVideo.test.ts
const directory = process.env.CUBE_CAMERA_VIDEO_DIR;
const filenames = [
  "WhatsApp Video 2026-11-23 at 14.55.29.mp4",
  "WhatsApp Video 2026-11-23 at 14.55.31.mp4",
  "WhatsApp Video 2026-11-23 at 14.55.36 (1).mp4",
  "WhatsApp Video 2026-11-23 at 14.55.36.mp4",
];
describe.skipIf(!directory)(
  "handheld video recognition (requires local videos and ffmpeg)",
  () => {
    for (const [index, filename] of filenames.entries()) {
      it(`extracts the expected state from ${filename}`, () => {
        const size = index === 0 ? 4 : 3;
        const width = 240,
          height = 426,
          frameBytes = width * height * 4;
        const decoded = execFileSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            join(directory!, filename),
            "-vf",
            `fps=6,scale=${width}:${height}`,
            "-pix_fmt",
            "rgba",
            "-f",
            "rawvideo",
            "pipe:1",
          ],
          { maxBuffer: 40 * 1024 * 1024 },
        );
        const frames: VideoFace[] = [];
        for (
          let offset = 0;
          offset + frameBytes <= decoded.length;
          offset += frameBytes
        ) {
          const data = new Uint8ClampedArray(
            decoded.buffer,
            decoded.byteOffset + offset,
            frameBytes,
          );
          const detection = detectFace({ width, height, data }, size);
          if (detection)
            frames.push({
              ...detection,
              index: identifyVideoFace(detection, size),
              time: offset / frameBytes / 6,
            });
        }
        const { faces } = selectVideoFaces(frames, size);
        expect(faces.every(Boolean)).toBe(true);
        const matches = matchScan(faces, size, [suggestedCalibration], true);
        expect(matches[0]?.value).toBe(recordings[index].expected);
      }, 30000);
    }
  },
);
