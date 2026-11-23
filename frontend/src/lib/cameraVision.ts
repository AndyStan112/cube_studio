import type { CubeSize } from "./cube";
import type { RGB } from "./cameraInput";

export type Point = { x: number; y: number };
export type FaceDetection = {
  corners: Point[];
  colors: RGB[];
  quality: number;
};
export type PixelImage = Pick<ImageData, "width" | "height" | "data">;

function pixelClass(r: number, g: number, b: number) {
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b);
  if (hi < 35) return 0;
  if (lo / hi > 0.57 && b >= r * 0.95 && g >= r * 0.95 && hi > 75) return 4;
  if (b > r * 1.7 && b > g * 1.2) return 5;
  if (g > r * 1.6 && g > b * 1.1) return 2;
  if (g > r * 0.78 && r > b * 1.8 && g > b * 1.8) return 1;
  if (r > g * 2.8 && r > b * 1.8) return 3;
  if (g > r * 0.24 && g < r * 0.78 && b < r * 0.23) return 6;
  return 0;
}
const cubePixel = (r: number, g: number, b: number) =>
  pixelClass(r, g, b) !== 0;
const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function hull(points: Point[]) {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of points) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (const p of points.slice().reverse()) {
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
// Bilinear mapping preserves moderate perspective without sampling seams.
export function facePoint(corners: Point[], u: number, v: number): Point {
  const [a, b, c, d] = corners;
  return {
    x: (1 - v) * ((1 - u) * a.x + u * b.x) + v * ((1 - u) * d.x + u * c.x),
    y: (1 - v) * ((1 - u) * a.y + u * b.y) + v * ((1 - u) * d.y + u * c.y),
  };
}
export function sampleQuad(
  image: PixelImage,
  size: CubeSize,
  corners: Point[],
): RGB[] {
  return Array.from({ length: size * size }, (_, i) => {
    const pixels: RGB[] = [];
    // Sample off-center too: printed center logos otherwise replace white with blue.
    for (const v of [-0.32, -0.24, 0.24, 0.32])
      for (const u of [-0.32, -0.24, 0.24, 0.32]) {
        const p = facePoint(
          corners,
          ((i % size) + 0.5 + u) / size,
          (Math.floor(i / size) + 0.5 + v) / size,
        );
        const x = Math.max(0, Math.min(image.width - 1, Math.round(p.x))),
          y = Math.max(0, Math.min(image.height - 1, Math.round(p.y)));
        const offset = (y * image.width + x) * 4;
        pixels.push([
          image.data[offset],
          image.data[offset + 1],
          image.data[offset + 2],
        ]);
      }
    return [0, 1, 2].map(
      (c) => pixels.map((p) => p[c]).sort((a, b) => a - b)[8],
    ) as RGB;
  });
}

/** Locate the largest plausible plastic face, independent of the alignment guide. */
export function detectFace(
  image: PixelImage,
  size: CubeSize,
): FaceDetection | null {
  const scale = Math.min(1, 240 / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale),
    height = Math.round(image.height * scale);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i =
        (Math.min(image.height - 1, Math.floor(y / scale)) * image.width +
          Math.min(image.width - 1, Math.floor(x / scale))) *
        4;
      mask[y * width + x] = pixelClass(
        image.data[i],
        image.data[i + 1],
        image.data[i + 2],
      );
    }
  // Close narrow grooves between stickers. Keep the original mask for scoring.
  let best: FaceDetection | null = null;
  let bestWeight = 0;
  for (let category = 0; category <= 6; category++) {
    const joined = new Uint8Array(mask.length);
    for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            n += +(category
              ? mask[(y + dy) * width + x + dx] === category
              : mask[(y + dy) * width + x + dx] > 0);
        joined[y * width + x] = +(n >= 3);
      }
    const visited = new Uint8Array(mask.length),
      queue = new Int32Array(mask.length);
    for (let start = 0; start < joined.length; start++) {
      if (!joined[start] || visited[start]) continue;
      let head = 0,
        tail = 1;
      queue[0] = start;
      visited[start] = 1;
      const points: Point[] = [];
      while (head < tail) {
        const at = queue[head++],
          x = at % width,
          y = Math.floor(at / width);
        if (category ? mask[at] === category : mask[at] > 0)
          points.push({ x, y });
        for (const next of [
          x > 0 ? at - 1 : -1,
          x < width - 1 ? at + 1 : -1,
          y > 0 ? at - width : -1,
          y < height - 1 ? at + width : -1,
        ]) {
          if (next >= 0 && joined[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      if (points.length < width * height * 0.025) continue;
      const outline = hull(points);
      if (outline.length < 4) continue;
      let rectangle: { corners: Point[]; area: number; ratio: number } | null =
        null;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i],
          b = outline[(i + 1) % outline.length];
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        while (angle > Math.PI / 4) angle -= Math.PI / 2;
        while (angle < -Math.PI / 4) angle += Math.PI / 2;
        const c = Math.cos(angle),
          s = Math.sin(angle);
        const xs = outline.map((p) => p.x * c + p.y * s),
          ys = outline.map((p) => -p.x * s + p.y * c);
        const l = Math.min(...xs),
          r = Math.max(...xs),
          t = Math.min(...ys),
          bottom = Math.max(...ys),
          area = (r - l) * (bottom - t);
        if (!rectangle || area < rectangle.area)
          rectangle = {
            area,
            ratio: (r - l) / (bottom - t),
            corners: [
              [l, t],
              [r, t],
              [r, bottom],
              [l, bottom],
            ].map(([x, y]) => ({
              x: (x * c - y * s) / scale,
              y: (x * s + y * c) / scale,
            })),
          };
      }
      if (
        !rectangle ||
        rectangle.ratio < 0.65 ||
        rectangle.ratio > 1.5 ||
        points.length / rectangle.area < 0.65
      )
        continue;
      const colors = sampleQuad(image, size, rectangle.corners);
      const coverage =
        colors.filter((c) => cubePixel(...c)).length / colors.length;
      if (coverage < 0.88) continue;
      const quality =
        (coverage *
          Math.min(rectangle.ratio, 1 / rectangle.ratio) *
          points.length) /
        rectangle.area;
      if (quality < 0.58) continue;
      // Prefer a full face over a smaller isolated sticker or background object.
      const weight = quality ** 3 * Math.sqrt(rectangle.area);
      if (weight > bestWeight) {
        bestWeight = weight;
        best = { corners: rectangle.corners, colors, quality };
      }
    }
  }
  return best;
}

/** Standard color scheme index in URFDLB order; brightness is deliberately absent. */
export function stickerColor([r, g, b]: RGB): number {
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b),
    delta = hi - lo;
  if (hi < 20) return -1;
  if (delta / hi < 0.36 || (b > r * 0.95 && g > r * 0.95 && lo / hi > 0.55))
    return 3;
  let hue =
    hi === r
      ? ((g - b) / delta + 6) % 6
      : hi === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  hue *= 60;
  if (hue < 12 || hue >= 345) return 2;
  if (hue < 45) return 5;
  if (hue < 85) return 0;
  if (hue < 175) return 1;
  if (hue < 285) return 4;
  return -1;
}
export type VideoFace = FaceDetection & { time: number; index: number };
export function identifyVideoFace(
  detection: FaceDetection,
  size: CubeSize,
): number {
  if (size % 2)
    return stickerColor(detection.colors[Math.floor((size * size) / 2)]);
  const votes = Array(6).fill(0) as number[];
  for (const rgb of detection.colors) {
    const i = stickerColor(rgb);
    if (i >= 0) votes[i]++;
  }
  const index = votes.indexOf(Math.max(...votes));
  // Even cubes have no fixed centers. Only solid-color faces identify themselves.
  return votes[index] >= size * size * 0.9 ? index : -1;
}
export function selectVideoFaces(
  frames: VideoFace[],
  size: CubeSize,
): { faces: (RGB[] | null)[]; times: (number | null)[] } {
  const faces: (RGB[] | null)[] = Array(6).fill(null),
    times: (number | null)[] = Array(6).fill(null);
  for (let i = 0; i < 6; i++) {
    const candidates = frames.filter((f) => f.index === i);
    // Prefer a clear frame supported by another nearby frame of the same face.
    const ranked = candidates
      .map((f) => ({
        f,
        score:
          f.quality +
          (size % 2 === 0
            ? (0.4 * f.colors.filter((c) => stickerColor(c) === i).length) /
              f.colors.length
            : 0) +
          0.08 *
            Math.min(
              3,
              candidates.filter(
                (other) => Math.abs(f.time - other.time) <= 0.6 && other !== f,
              ).length,
            ),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.f;
    if (best) {
      faces[i] = best.colors;
      times[i] = best.time;
    }
  }
  return { faces, times };
}
