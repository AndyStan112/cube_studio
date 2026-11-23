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
import { VideoScanSession } from "./videoScan";
import { cubeOrientationKey } from "./scanAssembly";

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
        // Match the browser sampler: max 800px, not a lower-resolution proxy.
        const width = 450,
          height = 800,
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
          { maxBuffer: 128 * 1024 * 1024 },
        );
        const frames: VideoFace[] = [];
        const session = new VideoScanSession(size);
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
          const detection = detectFace({ width, height, data }, size, (face) =>
            session.accepts(face),
          );
          session.observe(detection, offset / frameBytes / 6);
          if (detection)
            frames.push({
              ...detection,
              index: identifyVideoFace(detection, size),
              time: offset / frameBytes / 6,
            });
        }
        const { faces } = selectVideoFaces(frames, size);
        expect(faces.every(Boolean)).toBe(true);
        const matches = matchScan(faces, size, [suggestedCalibration]);
        expect(matches[0]?.value).toBe(recordings[index].expected);
        expect(session.snapshot().faces).toHaveLength(6);
        const tracked = session.match();
        expect(tracked).not.toBeNull();
        expect(
          size % 2 ? tracked!.value : cubeOrientationKey(tracked!.value, size),
        ).toBe(
          size % 2
            ? recordings[index].expected
            : cubeOrientationKey(recordings[index].expected, size),
        );
      }, 30000);
    }
  },
);
