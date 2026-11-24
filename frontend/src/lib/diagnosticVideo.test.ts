import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectFace } from "./cameraVision";
import { VideoScanSession } from "./videoScan";
import { scanIssue } from "./cameraInput";
import { canonicalFacePattern } from "./scanAssembly";
import type { CubeSize } from "./cube";

// Optional private-media layer; fast exact-reading/pixel tests always run.
// The directory contains the extracted diagnostic ZIP plus expectations.json.
const directory = process.env.CUBE_DIAGNOSTIC_VIDEO_DIR;
describe.skipIf(!directory)("original diagnostic camera recordings", () => {
  it("retains the annotated faces and never guesses an unresolved cube", async () => {
    const report = JSON.parse(readFileSync(join(directory!, "report.json"), "utf8"));
    const expected = JSON.parse(readFileSync(join(directory!, "expectations.json"), "utf8"));
    for (const scan of report.scans) {
      expect(expected.scans[scan.id]).toBe("needs-orientation");
      const dimensions = scan.events.find((event: {type: string}) => event.type === "scan.frame").data;
      const {width, height} = dimensions;
      const bytes = width * height * 4;
      const calibrations = scan.events.find((event: {type: string}) => event.type === "scan.start").data.calibrations;
      const session = new VideoScanSession(scan.size as CubeSize, calibrations);
      // Match the browser's sampling rate without retaining hundreds of MB of
      // decoded video in memory. Sparse sampling can miss a briefly held face.
      const decoder = spawn("ffmpeg", ["-v", "error", "-i", join(directory!, scan.media.name),
        "-t", "120", "-vf", `fps=6,scale=${width}:${height}`, "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"],
        {stdio: ["ignore", "pipe", "pipe"]});
      let pending = Buffer.alloc(0), frame = 0, stderr = "";
      decoder.stderr.on("data", chunk => {stderr += chunk.toString();});
      const finished = new Promise<number | null>((resolve, reject) => {
        decoder.on("error", reject);
        decoder.on("close", resolve);
      });
      try {
        for await (const chunk of decoder.stdout) {
          pending = Buffer.concat([pending, chunk]);
          while (pending.length >= bytes) {
            const data = new Uint8ClampedArray(pending.buffer, pending.byteOffset, bytes);
            const detection = detectFace({width, height, data}, scan.size, face => session.accepts(face));
            session.observe(detection, frame++ / 6);
            expect(session.match()).toBeNull();
            pending = Buffer.from(pending.subarray(bytes));
          }
        }
        expect(await finished, stderr).toBe(0);
        expect(pending.length).toBe(0);
      } finally {
        decoder.kill();
      }
      const faces = session.snapshot().faces;
      expect(faces).toHaveLength(6);
      for (const face of faces) expect(face.pattern).toBe(canonicalFacePattern(expected.patterns[face.identity!], scan.size));
      expect(scanIssue(faces.map(face => face.colors), scan.size, calibrations,
        faces.map(face => face.neighbors ?? [])).kind).toBe("orientation");
    }
  }, 120_000);
});
