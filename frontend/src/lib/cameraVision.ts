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
  if (
    lo / hi > 0.7 ||
    (lo / hi > 0.57 && b >= r * 0.95 && g >= r * 0.95 && hi > 75)
  )
    return 4;
  if (b > r * 1.7 && b > g * 1.2) return 5;
  if (g > r * 1.6 && g > b * 1.1) return 2;
  if (g > r * 0.78 && r > b * 1.8 && g > b * 1.8) return 1;
  if (r > g * 2.8 && r > b * 1.8) return 3;
  if (g > r * 0.24 && g < r * 0.78 && b < r * 0.12) return 6;
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

function imagePixel(image: PixelImage, point: Point): RGB {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(point.x)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(point.y)));
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}
const brightness = (rgb: RGB) => (rgb[0] + rgb[1] + rgb[2]) / 3;
function seamEvidence(
  image: PixelImage,
  corners: Point[],
  u: number,
  v: number,
  vertical: boolean,
  size: CubeSize,
) {
  const at = (delta: number) =>
    imagePixel(
      image,
      facePoint(
        corners,
        u + (vertical ? delta / size : 0),
        v + (vertical ? 0 : delta / size),
      ),
    );
  const left = at(-0.12),
    right = at(0.12);
  const base = Math.max(20, Math.min(brightness(left), brightness(right)));
  const contrast =
    Math.hypot(...left.map((c, i) => c - right[i])) /
    Math.max(40, Math.hypot(...left), Math.hypot(...right));
  // Sticker grooves can be displaced slightly by perspective or rounded corners.
  let darkest = base;
  for (let offset = -0.065; offset <= 0.065; offset += 0.013)
    darkest = Math.min(darkest, brightness(at(offset)));
  return Math.max(
    Math.min(1, contrast / 0.25),
    Math.min(1, (base - darkest) / base / 0.22),
  );
}
function gridEvidence(image: PixelImage, corners: Point[], size: CubeSize) {
  const axes = [true, false].map((vertical) => {
    let total = 0,
      count = 0;
    for (let cut = 1; cut < size; cut++)
      for (let cell = 0; cell < size; cell++)
        for (const offset of [0.3, 0.5, 0.7]) {
          const along = (cell + offset) / size,
            across = cut / size;
          total += seamEvidence(
            image,
            corners,
            vertical ? across : along,
            vertical ? along : across,
            vertical,
            size,
          );
          count++;
        }
    return total / count;
  });
  const horizontal = Math.hypot(
    corners[1].x - corners[0].x,
    corners[1].y - corners[0].y,
  );
  const vertical = Math.hypot(
    corners[3].x - corners[0].x,
    corners[3].y - corners[0].y,
  );
  // A short, two-row crop must not pass on vertical grooves alone. For a
  // square face, glare can weaken one direction while the other stays clear.
  return Math.min(horizontal, vertical) / Math.max(horizontal, vertical) < 0.8
    ? Math.min(...axes)
    : (axes[0] + axes[1]) / 2;
}

function completeFaceCandidates(corners: Point[], ratio: number): Point[][] {
  if (ratio > 1.22) {
    const extra = ratio - 1;
    return [
      corners,
      [
        facePoint(corners, 0, -extra),
        facePoint(corners, 1, -extra),
        corners[2],
        corners[3],
      ],
      [
        corners[0],
        corners[1],
        facePoint(corners, 1, 1 + extra),
        facePoint(corners, 0, 1 + extra),
      ],
    ];
  }
  if (ratio < 1 / 1.22) {
    const extra = 1 / ratio - 1;
    return [
      corners,
      [
        facePoint(corners, -extra, 0),
        corners[1],
        corners[2],
        facePoint(corners, -extra, 1),
      ],
      [
        corners[0],
        facePoint(corners, 1 + extra, 0),
        facePoint(corners, 1 + extra, 1),
        corners[3],
      ],
    ];
  }
  return [corners];
}

// Long, evenly spaced sticker boundaries propose full grids even when a hand or
// similarly colored desk joins the cube's color mask.
function edgeGridCandidates(image: PixelImage, size: CubeSize): Point[][] {
  const scale = Math.min(1, 240 / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale),
    height = Math.round(image.height * scale);
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rgb = imagePixel(image, { x: x / scale, y: y / scale });
      pixels.set(rgb, (y * width + x) * 3);
    }
  const edges: {
    x: number;
    y: number;
    gx: number;
    gy: number;
    weight: number;
  }[] = [];
  const directions = new Float64Array(90);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      let gx = 0,
        gy = 0,
        strength = 0;
      const at = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const dx = pixels[at + 3 + channel] - pixels[at - 3 + channel];
        const dy =
          pixels[at + width * 3 + channel] - pixels[at - width * 3 + channel];
        const magnitude = dx * dx + dy * dy;
        if (magnitude > strength) {
          gx = dx;
          gy = dy;
          strength = magnitude;
        }
      }
      if (strength < 20 * 20) continue;
      const weight = Math.sqrt(strength);
      let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
      angle = ((Math.round(angle) % 90) + 90) % 90;
      for (let delta = -3; delta <= 3; delta++)
        directions[(angle + delta + 90) % 90] += weight;
      edges.push({ x, y, gx: gx / weight, gy: gy / weight, weight });
    }
  const angles: number[] = [];
  for (const { i } of Array.from(directions, (value, i) => ({ value, i })).sort(
    (a, b) => b.value - a.value,
  )) {
    if (
      angles.every(
        (angle) => Math.min(Math.abs(angle - i), 90 - Math.abs(angle - i)) >= 6,
      )
    )
      angles.push(i);
    if (angles.length === 3) break;
  }
  const diagonal = Math.ceil(Math.hypot(width, height));
  const minimum = Math.min(width, height) * 0.2,
    maximum = Math.min(width, height) * 0.95;
  function lattices(histogram: Float64Array) {
    const peaks: number[] = [];
    for (const { at, value } of Array.from(histogram, (value, at) => ({
      value,
      at,
    })).sort((a, b) => b.value - a.value)) {
      if (value < 100) break;
      if (peaks.every((p) => Math.abs(p - at) > 3)) peaks.push(at);
      if (peaks.length === 22) break;
    }
    const support = (position: number) => {
      let value = 0;
      for (let delta = -2; delta <= 2; delta++)
        value = Math.max(value, histogram[Math.round(position) + delta] || 0);
      return value;
    };
    const result: { start: number; end: number; score: number }[] = [];
    for (const start of peaks)
      for (const end of peaks) {
        const span = end - start;
        if (span < minimum || span > maximum) continue;
        const strengths = Array.from({ length: size + 1 }, (_, i) =>
          support(start + (span * i) / size),
        );
        if (strengths.slice(1, -1).some((value) => value < 150)) continue;
        const score =
          strengths.reduce((sum, value) => sum + Math.sqrt(value), 0) /
          strengths.length;
        result.push({ start: start - diagonal, end: end - diagonal, score });
      }
    return result.sort((a, b) => b.score - a.score).slice(0, 10);
  }
  const candidates: Point[][] = [];
  for (const degrees of angles) {
    const angle = ((degrees > 45 ? degrees - 90 : degrees) * Math.PI) / 180;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const horizontal = new Float64Array(diagonal * 2 + 1),
      vertical = new Float64Array(diagonal * 2 + 1);
    for (const edge of edges) {
      if (Math.abs(edge.gx * c + edge.gy * s) > 0.95)
        horizontal[Math.round(edge.x * c + edge.y * s) + diagonal] +=
          edge.weight;
      if (Math.abs(-edge.gx * s + edge.gy * c) > 0.95)
        vertical[Math.round(-edge.x * s + edge.y * c) + diagonal] +=
          edge.weight;
    }
    for (const x of lattices(horizontal))
      for (const y of lattices(vertical)) {
        const ratio = (x.end - x.start) / (y.end - y.start);
        if (ratio < 0.72 || ratio > 1.38) continue;
        candidates.push(
          [
            [x.start, y.start],
            [x.end, y.start],
            [x.end, y.end],
            [x.start, y.end],
          ].map(([u, v]) => ({
            x: (u * c - v * s) / scale,
            y: (u * s + v * c) / scale,
          })),
        );
      }
  }
  return candidates;
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
  function consider(corners: Point[], occupiedPixels?: number) {
    if (
      corners.some(
        (p) => p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height,
      )
    )
      return;
    const colors = sampleQuad(image, size, corners);
    const coverage =
      colors.filter((color) => cubePixel(...color)).length / colors.length;
    if (coverage < 0.88) return;
    const grid = gridEvidence(image, corners, size);
    if (grid < (occupiedPixels === undefined ? 0.45 : 0.35)) return;
    const area =
      Math.abs(cross(corners[0], corners[1], corners[3])) * scale * scale;
    const horizontal = Math.hypot(
      corners[1].x - corners[0].x,
      corners[1].y - corners[0].y,
    );
    const vertical = Math.hypot(
      corners[3].x - corners[0].x,
      corners[3].y - corners[0].y,
    );
    const aspect =
      Math.min(horizontal, vertical) / Math.max(horizontal, vertical);
    const occupancy =
      occupiedPixels === undefined ? 1 : Math.min(1, occupiedPixels / area);
    const quality = coverage * aspect * (0.5 + 0.5 * grid) * occupancy;
    if (quality < 0.45) return;
    const weight = quality ** 2 * Math.sqrt(area);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = { corners, colors, quality };
    }
  }
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
      for (const corners of completeFaceCandidates(
        rectangle.corners,
        rectangle.ratio,
      ))
        consider(corners, points.length);
    }
  }
  for (const corners of edgeGridCandidates(image, size)) consider(corners);
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
function patternAgreement(a: RGB[], b: RGB[], size: CubeSize) {
  const first = a.map(stickerColor);
  let second = b.map(stickerColor),
    best = 0;
  for (let turn = 0; turn < 4; turn++) {
    best = Math.max(
      best,
      first.filter((color, i) => color === second[i]).length / first.length,
    );
    second = second.map(
      (_, i) => second[(size - 1 - (i % size)) * size + Math.floor(i / size)],
    );
  }
  return best;
}
export function selectVideoFaces(
  frames: VideoFace[],
  size: CubeSize,
): { faces: (RGB[] | null)[]; times: (number | null)[] } {
  const faces: (RGB[] | null)[] = Array(6).fill(null),
    times: (number | null)[] = Array(6).fill(null);
  for (let i = 0; i < 6; i++) {
    const candidates = frames.filter((f) => f.index === i);
    // Count support from the same sticker pattern, not just the center color:
    // transition frames can contain a row from the adjacent visible face.
    const ranked = candidates
      .map((f) => {
        const nearby = candidates.filter(
          (other) => Math.abs(f.time - other.time) <= 0.6 && other !== f,
        );
        const agreement = nearby.length
          ? nearby.reduce(
              (sum, other) =>
                sum + patternAgreement(f.colors, other.colors, size),
              0,
            ) / nearby.length
          : 0;
        const solid =
          size % 2 === 0
            ? (0.4 *
                f.colors.filter((color) => stickerColor(color) === i).length) /
              f.colors.length
            : 0;
        return {
          f,
          score:
            f.quality +
            solid +
            0.08 * Math.min(3, nearby.length) +
            0.35 * agreement,
        };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.f;
    if (best) {
      faces[i] = best.colors;
      times[i] = best.time;
    }
  }
  return { faces, times };
}
