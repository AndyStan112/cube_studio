import type { CubeSize } from "./cube";
import {
  colorDistance,
  matchScan,
  suggestedCalibration,
  type Calibration,
  type RGB,
  type ScanMatch,
} from "./cameraInput";
import { stickerColor, type FaceDetection } from "./cameraVision";
import { canonicalFacePattern } from "./scanAssembly";
import { FACE_ORDER } from "./facelets";

export type TrackedFace = {
  id: string;
  colors: RGB[];
  pattern: string;
  quality: number;
  time: number;
  identity: number | null;
};
export type VideoScanSnapshot = {
  faces: TrackedFace[];
  current: string | null;
  progress: number;
  status:
    "searching" | "holding" | "recognized" | "known" | "extra" | "unclear";
  revision: number;
};
function rotateColors(colors: RGB[], size: CubeSize): RGB[] {
  return colors.map(
    (_, i) => colors[(size - 1 - (i % size)) * size + Math.floor(i / size)],
  );
}
function closeColors(a: RGB[], b: RGB[], size: CubeSize) {
  let turned = b;
  for (let turn = 0; turn < 4; turn++) {
    let sum = 0,
      compatible = true;
    for (let i = 0; i < a.length; i++) {
      const x = a[i],
        y = turned[i],
        sx = Math.max(1, ...x),
        sy = Math.max(1, ...y);
      const distance = Math.hypot(
        x[0] / sx - y[0] / sy,
        x[1] / sx - y[1] / sy,
        x[2] / sx - y[2] / sy,
      );
      sum += distance;
      if (distance >= 0.14 || sum >= 0.035 * a.length) {
        compatible = false;
        break;
      }
    }
    if (compatible) return true;
    turned = rotateColors(turned, size);
  }
  return false;
}
/** Continuous video evidence, shared by camera streams and uploaded recordings. */
export class VideoScanSession {
  private faces: TrackedFace[] = [];
  private candidate: {
    face: TrackedFace;
    first: number;
    last: number;
    frames: number;
  } | null = null;
  private revision = 0;
  private resultRevision = -1;
  private result: ScanMatch | null = null;
  constructor(
    readonly size: CubeSize,
    readonly calibrations: Calibration[] = [suggestedCalibration],
  ) {}
  private classify(rgb: RGB): number {
    const profile = this.calibrations[0];
    if (
      !profile ||
      profile.id === "suggested" ||
      profile.colors.every((color, i) => stickerColor(color) === i)
    )
      return stickerColor(rgb);
    const ranked = profile.colors
      .map((color, i) => ({ i, distance: colorDistance(rgb, color) }))
      .sort((a, b) => a.distance - b.distance);
    return ranked[0].distance <= 42 &&
      ranked[1].distance - ranked[0].distance >= 3
      ? ranked[0].i
      : -1;
  }
  private same(a: TrackedFace, b: TrackedFace) {
    return this.size % 2
      ? a.identity === b.identity
      : a.pattern === b.pattern || closeColors(a.colors, b.colors, this.size);
  }
  accepts(detection: FaceDetection): boolean {
    if (this.size % 2) return true;
    const labels = detection.colors.map((rgb) => this.classify(rgb));
    if (labels.some((label) => label < 0)) return false;
    const pattern = canonicalFacePattern(
      labels.map((label) => FACE_ORDER[label]).join(""),
      this.size,
    );
    if (
      this.faces.some(
        (face) =>
          face.pattern === pattern ||
          closeColors(face.colors, detection.colors, this.size),
      )
    )
      return true;
    const counts = Array<number>(6).fill(0);
    for (const face of this.faces)
      for (const color of face.pattern) counts[FACE_ORDER.indexOf(color)]++;
    for (const label of labels) counts[label]++;
    return counts.every((count) => count <= this.size * this.size);
  }
  observe(detection: FaceDetection | null, time: number): VideoScanSnapshot {
    const snapshot = (
      status: VideoScanSnapshot["status"],
      current: string | null = null,
      progress = 0,
    ): VideoScanSnapshot => ({
      faces: this.faces.slice(),
      current,
      progress,
      status,
      revision: this.revision,
    });
    if (!detection || detection.quality < 0.5) {
      if (this.candidate && time - this.candidate.last > 0.6)
        this.candidate = null;
      return snapshot("searching");
    }
    const labels = detection.colors.map((rgb) => this.classify(rgb));
    if (labels.some((i) => i < 0)) return snapshot("searching");
    const identity =
      this.size % 2 ? labels[Math.floor(labels.length / 2)] : null;
    const pattern = canonicalFacePattern(
      labels.map((i) => FACE_ORDER[i]).join(""),
      this.size,
    );
    const frame: TrackedFace = {
      id: identity === null ? pattern : FACE_ORDER[identity],
      colors: detection.colors,
      pattern,
      quality: detection.quality,
      time,
      identity,
    };
    const existing = this.faces.find((face) => this.same(face, frame));
    if (
      !this.candidate ||
      !(
        this.same(this.candidate.face, frame) &&
        (this.candidate.face.pattern === frame.pattern ||
          closeColors(this.candidate.face.colors, frame.colors, this.size))
      ) ||
      time - this.candidate.last > 0.6 ||
      time < this.candidate.last
    ) {
      this.candidate = { face: frame, first: time, last: time, frames: 1 };
    } else if (time > this.candidate.last + 0.04) {
      this.candidate.frames++;
      this.candidate.last = time;
      if (frame.quality > this.candidate.face.quality)
        this.candidate.face = frame;
    }
    const progress = Math.min(
      1,
      (time - this.candidate.first) / 0.3,
      this.candidate.frames / 3,
    );
    if (progress < 1)
      return snapshot(
        existing ? "known" : "holding",
        existing?.id ?? null,
        progress,
      );
    if (existing) {
      if (this.candidate.face.quality > existing.quality + 0.015) {
        Object.assign(existing, this.candidate.face, { id: existing.id });
        this.revision++;
      }
      return snapshot("known", existing.id, 1);
    }
    if (this.faces.length === 6) return snapshot("extra");
    if (this.size % 2 === 0) {
      const counts = Array<number>(6).fill(0);
      for (const face of [...this.faces, this.candidate.face]) {
        for (const color of face.pattern) counts[FACE_ORDER.indexOf(color)]++;
      }
      // A finger or a partial view must not become a second copy of a face:
      // distinct physical sides cannot consume more than N² of any color.
      if (counts.some((count) => count > this.size * this.size)) {
        return snapshot("unclear");
      }
    }
    const accepted = { ...this.candidate.face };
    this.faces.push(accepted);
    this.revision++;
    return snapshot("recognized", accepted.id, 1);
  }
  snapshot(): VideoScanSnapshot {
    return {
      faces: this.faces.slice(),
      current: null,
      progress: 0,
      status: "searching",
      revision: this.revision,
    };
  }
  match(): ScanMatch | null {
    if (this.faces.length !== 6) return null;
    if (this.resultRevision !== this.revision) {
      this.result =
        matchScan(
          this.faces.map((face) => face.colors),
          this.size,
          this.calibrations,
          true,
        )[0] ?? null;
      this.resultRevision = this.revision;
    }
    return this.result;
  }
}
