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
  neighbors?: (RGB | null)[];
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
  private evidence = new Map<string, {face: TrackedFace; time: number}[]>();
  private lastTime = -Infinity;
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
  private withContext(best: TrackedFace, observations: TrackedFace[], existing?: TrackedFace): TrackedFace {
    if (this.size % 2 === 0) return best;
    const target = best.colors.map(rgb => this.classify(rgb)).join(",");
    const votes: RGB[][] = Array.from({length: 4}, () => []);
    for (const source of [...observations, ...(existing?.pattern === best.pattern ? [existing] : [])]) {
      let turned = source.colors;
      const turns: number[] = [];
      for (let turn = 0; turn < 4; turn++) {
        if (turned.map(rgb => this.classify(rgb)).join(",") === target) turns.push(turn);
        turned = rotateColors(turned, this.size);
      }
      // A symmetric pattern cannot transfer its side evidence between images
      // without tracking camera pose. Its own selected view is still usable.
      const turn = source === best ? 0 : turns.length === 1 ? turns[0] : null;
      if (turn === null) continue;
      source.neighbors?.forEach((rgb, side) => {
        if (rgb) votes[(side + turn) % 4].push(rgb);
      });
    }
    const neighbors = votes.map(samples => {
      const groups = Array.from({length: 6}, (_, label) => samples.filter(rgb => this.classify(rgb) === label))
        .sort((a,b) => b.length - a.length);
      if (!groups[0].length || groups[0].length === groups[1].length) return null;
      return [0,1,2].map(channel => groups[0].map(rgb => rgb[channel]).sort((a,b) => a-b)[Math.floor(groups[0].length / 2)]) as RGB;
    });
    return {...best, neighbors};
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
      neighbors: detection.neighbors,
    };
    const existing = this.faces.find((face) => this.same(face, frame));
    if (time < this.lastTime) this.evidence.clear();
    this.lastTime = time;
    for (const [key, observations] of this.evidence) {
      const recent = observations.filter(observation => time - observation.time <= 1.3);
      if (recent.length) this.evidence.set(key, recent);
      else this.evidence.delete(key);
    }
    const key = `${frame.identity}:${frame.pattern}`;
    const observations = this.evidence.get(key) ?? [];
    if (!observations.length || time > observations.at(-1)!.time + 0.04) observations.push({face: frame, time});
    this.evidence.set(key, observations);
    const best = observations.reduce((a,b) => a.face.quality > b.face.quality ? a : b).face;
    this.candidate = {face: this.withContext(best, observations.map(observation => observation.face), existing), first: observations[0].time, last: time, frames: observations.length};
    const progress = Math.min(
      1,
      (time - this.candidate.first) / 0.3,
      this.candidate.frames / 3,
    );
    if (progress < 1)
      return snapshot(
        existing && existing.pattern === frame.pattern ? "known" : "holding",
        existing?.id ?? null,
        progress,
      );
    if (existing) {
      const moreContext = this.size % 2 && this.candidate.face.quality >= 0.65 &&
        this.candidate.face.neighbors?.some((rgb, side) => rgb &&
          (!existing.neighbors?.[side] || this.classify(rgb) !== this.classify(existing.neighbors[side]!)));
      if (this.candidate.face.quality > existing.quality + 0.015 ||
          moreContext || (this.size % 2 && this.candidate.face.pattern !== existing.pattern && this.candidate.face.quality >= 0.65)) {
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
          this.faces.map(face => face.neighbors ?? []),
        )[0] ?? null;
      this.resultRevision = this.revision;
    }
    return this.result;
  }
}
