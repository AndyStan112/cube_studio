import type { CubeSize } from "./cube";
import { FACE_ORDER, faceletsToCubies, validateFacelets } from "./facelets";
import { stickerColor } from "./cameraVision";
import { assembleEvenScan } from "./scanAssembly";

export type RGB = [number, number, number];
export type Calibration = { id: string; name: string; colors: RGB[] };
export type ScanMatch = {
  calibration: Calibration;
  value: string;
  score: number;
};
export const calibrationKey = "cube-studio-camera-calibrations-v1";
export const suggestedCalibration: Calibration = {
  id: "suggested",
  name: "Suggested · standard cube",
  colors: [
    [240, 215, 35],
    [30, 155, 75],
    [195, 35, 40],
    [235, 235, 225],
    [35, 75, 185],
    [245, 120, 20],
  ],
};
export function isCalibration(value: unknown): value is Calibration {
  const p = value as Calibration | null;
  return (
    !!p &&
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    Array.isArray(p.colors) &&
    p.colors.length === 6 &&
    p.colors.every(
      (c) =>
        Array.isArray(c) &&
        c.length === 3 &&
        c.every((n) => Number.isFinite(n) && n >= 0 && n <= 255),
    )
  );
}
// CIELAB keeps orange/red and white/yellow separable across brightness changes.
function lab(rgb: RGB) {
  const [r, g, b] = rgb.map((v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function colorDistance(a: RGB, b: RGB) {
  const x = lab(a),
    y = lab(b);
  return Math.hypot(...x.map((v, i) => v - y[i]));
}
export function calibrationFromFaces(
  id: string,
  name: string,
  faces: (RGB[] | null)[],
  size: CubeSize,
): Calibration {
  if (faces.length !== 6 || faces.some((f) => !f || f.length !== size * size))
    throw Error("Capture all six faces first.");
  // Odd cubes have fixed centers. Even cubes must be solved for calibration.
  const colors = (faces as RGB[][]).map((face) =>
    size % 2
      ? face[Math.floor(face.length / 2)]
      : ([0, 1, 2].map(
          (channel) =>
            face.reduce((sum, c) => sum + c[channel], 0) / face.length,
        ) as RGB),
  );
  if (
    colors.some((a, i) =>
      colors.some((b, j) => j > i && colorDistance(a, b) < 18),
    )
  )
    throw Error(
      "Two calibration colors look too similar. Check face order and lighting, then recapture.",
    );
  return { id, name: name.trim() || "My cube", colors };
}
export function matchScan(
  faces: (RGB[] | null)[],
  size: CubeSize,
  calibrations: Calibration[],
  unorderedEvenFaces = false,
): ScanMatch[] {
  if (faces.length !== 6 || faces.some((f) => !f || f.length !== size * size))
    return [];
  return calibrations
    .flatMap((calibration) => {
      const scanFaces = orderFacesByCenter(faces as RGB[][], size, calibration);
      if (!scanFaces) return [];
      let palette = calibration.colors;
      let adaptive = false;
      if (
        calibration.id === "suggested" ||
        calibration.colors.every((color, i) => stickerColor(color) === i)
      ) {
        const groups: RGB[][] = Array.from({ length: 6 }, () => []);
        for (const rgb of scanFaces.flat()) {
          const index = stickerColor(rgb);
          if (index >= 0) groups[index].push(rgb);
        }
        const area = size * size;
        const centersAgree =
          size % 2 === 0 ||
          scanFaces.every(
            (face, i) => stickerColor(face![Math.floor(area / 2)]) === i,
          );
        // Learn the observed palette only when every color has enough evidence.
        // Counts and physical constraints are still checked after classification.
        if (
          centersAgree &&
          groups.every(
            (group) => group.length >= area * 0.7 && group.length <= area * 1.3,
          )
        ) {
          palette = groups.map(
            (group) =>
              [0, 1, 2].map(
                (channel) =>
                  group.map((rgb) => rgb[channel]).sort((a, b) => a - b)[
                    Math.floor(group.length / 2)
                  ],
              ) as RGB,
          );
          adaptive = true;
        }
      }
      const readings = scanFaces.flat().map((rgb) => {
        const ranked = palette
          .map((color, i) => ({
            i,
            distance: adaptive
              ? chromaticDistance(rgb, color)
              : colorDistance(rgb, color),
          }))
          .sort((a, b) => a.distance - b.distance);
        if (ranked[0].distance > 42) return [];
        // Only close alternatives are eligible. Confident readings stay fixed.
        return ranked.filter(
          (candidate) =>
            candidate.distance <= 42 &&
            candidate.distance - ranked[0].distance < 3,
        );
      });
      const resolved = resolveColorReadings(readings, size, unorderedEvenFaces);
      if (!resolved) return [];
      // Preserve profile ranking when two standard palettes learn the same scan.
      const profileFit = adaptive
        ? palette.reduce(
            (sum, color, i) =>
              sum + chromaticDistance(color, calibration.colors[i]),
            0,
          ) /
          (palette.length * 100)
        : 0;
      return [
        {
          calibration,
          value: resolved.value,
          score: resolved.score + profileFit,
        },
      ];
    })
    .sort((a, b) => a.score - b.score);
}
function orderFacesByCenter(
  faces: RGB[][],
  size: CubeSize,
  calibration: Calibration,
): RGB[][] | null {
  if (size % 2 === 0) return faces;
  const ordered: RGB[][] = Array(6);
  for (const face of faces) {
    const center = face[Math.floor((size * size) / 2)];
    let index = stickerColor(center);
    if (calibration.id !== "suggested") {
      const ranked = calibration.colors
        .map((color, i) => ({ i, distance: colorDistance(center, color) }))
        .sort((a, b) => a.distance - b.distance);
      if (
        ranked[0].distance > 42 ||
        ranked[1].distance - ranked[0].distance < 3
      )
        return null;
      index = ranked[0].i;
    }
    if (index < 0 || ordered[index]) return null;
    ordered[index] = face;
  }
  return ordered;
}

type ColorChoice = { i: number; distance: number };
function resolveColorReadings(
  readings: ColorChoice[][],
  size: CubeSize,
  unorderedEvenFaces = false,
): { value: string; score: number } | null {
  const area = size * size;
  const choices = readings.map((reading, index) =>
    size % 2 && index % area === Math.floor(area / 2)
      ? reading.filter((choice) => choice.i === Math.floor(index / area))
      : reading,
  );
  if (choices.some((reading) => !reading.length)) return null;
  const counts = Array<number>(6).fill(0);
  const letters = Array<string>(6 * area);
  const uncertain: number[] = [];
  let fixedScore = 0;
  choices.forEach((reading, index) => {
    if (reading.length === 1) {
      const choice = reading[0];
      counts[choice.i]++;
      letters[index] = FACE_ORDER[choice.i];
      fixedScore += choice.distance;
    } else uncertain.push(index);
  });
  if (counts.some((count) => count > area)) return null;
  let result: { value: string; score: number } | null = null;
  let ambiguous = false,
    attempts = 0,
    branches = 0,
    exhausted = false;
  function visit(position: number, score: number) {
    if (ambiguous || exhausted) return;
    if (++branches > 8192) {
      exhausted = true;
      return;
    }
    // A color cannot be recovered by changing an unrelated, confident sticker.
    for (let color = 0; color < 6; color++) {
      if (
        counts[color] > area ||
        counts[color] +
          uncertain
            .slice(position)
            .filter((index) =>
              choices[index].some((choice) => choice.i === color),
            ).length <
          area
      )
        return;
    }
    if (position === uncertain.length) {
      if (++attempts > 64) {
        exhausted = true;
        return;
      }
      const value = unorderedEvenFaces && size % 2 === 0 ? assembleEvenScan(letters.join(""), size) : orientScan(letters.join(""), size);
      if (!value) return;
      try {
        faceletsToCubies(value, size);
      } catch {
        return;
      }
      if (result && result.value !== value) ambiguous = true;
      else result = { value, score: score / letters.length };
      return;
    }
    const index = uncertain[position];
    for (const choice of choices[index]) {
      letters[index] = FACE_ORDER[choice.i];
      counts[choice.i]++;
      visit(position + 1, score + choice.distance);
      counts[choice.i]--;
    }
  }
  visit(0, fixedScore);
  return ambiguous || exhausted ? null : result;
}

// Normalize exposure before comparing chroma; a shaded orange remains orange.
function chromaticDistance(a: RGB, b: RGB) {
  const normalize = (rgb: RGB) =>
    rgb.map((v) => (v / Math.max(...rgb, 1)) * 220) as RGB;
  return colorDistance(normalize(a), normalize(b));
}
function rotateFace(face: string, size: CubeSize) {
  return [...face]
    .map((_, i) => face[(size - 1 - (i % size)) * size + Math.floor(i / size)])
    .join("");
}
/** Keep a valid recorded orientation; otherwise recover only an unambiguous roll. */
export function orientScan(value: string, size: CubeSize): string | null {
  if (value.includes("?") || value.length !== 6 * size * size) return null;
  try {
    validateFacelets(value, size);
    return value;
  } catch {
    /* Try face rotations. */
  }
  const variants = Array.from({ length: 6 }, (_, i) => {
    let face = value.slice(i * size * size, (i + 1) * size * size);
    const turns = new Set<string>();
    for (let j = 0; j < 4; j++) {
      turns.add(face);
      face = rotateFace(face, size);
    }
    return [...turns];
  });
  const valid = new Set<string>();
  function visit(index: number, prefix: string) {
    if (valid.size > 1) return;
    if (index === 6) {
      try {
        validateFacelets(prefix, size);
        valid.add(prefix);
      } catch {
        /* Invalid physical orientation. */
      }
      return;
    }
    for (const face of variants[index]) visit(index + 1, prefix + face);
  }
  visit(0, "");
  return valid.size === 1 ? [...valid][0] : null;
}
