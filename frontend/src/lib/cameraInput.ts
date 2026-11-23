import type { CubeSize } from './cube';
import { FACE_ORDER, faceletsToCubies, validateFacelets } from './facelets';
import { stickerColor } from './cameraVision';

export type RGB = [number, number, number];
export type Calibration = { id: string; name: string; colors: RGB[] };
export type ScanMatch = { calibration: Calibration; value: string; score: number };
export const calibrationKey = 'cube-studio-camera-calibrations-v1';
export const suggestedCalibration: Calibration = {
  id: 'suggested', name: 'Suggested · standard cube',
  colors: [[240, 215, 35], [30, 155, 75], [195, 35, 40], [235, 235, 225], [35, 75, 185], [245, 120, 20]],
};
export function isCalibration(value: unknown): value is Calibration {
  const p = value as Calibration | null;
  return !!p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.colors)
    && p.colors.length === 6 && p.colors.every(c => Array.isArray(c) && c.length === 3 && c.every(n => Number.isFinite(n) && n >= 0 && n <= 255));
}
// CIELAB keeps orange/red and white/yellow separable across brightness changes.
function lab(rgb: RGB) {
  const [r, g, b] = rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  const f = (v: number) => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const x = f((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
  const y = f(.2126729 * r + .7151522 * g + .072175 * b);
  const z = f((.0193339 * r + .119192 * g + .9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function colorDistance(a: RGB, b: RGB) {
  const x = lab(a), y = lab(b);
  return Math.hypot(...x.map((v, i) => v - y[i]));
}
export function calibrationFromFaces(id: string, name: string, faces: (RGB[] | null)[], size: CubeSize): Calibration {
  if (faces.length !== 6 || faces.some(f => !f || f.length !== size * size)) throw Error('Capture all six faces first.');
  // Odd cubes have fixed centers. Even cubes must be solved for calibration.
  const colors = (faces as RGB[][]).map(face => size % 2 ? face[Math.floor(face.length / 2)] :
    [0, 1, 2].map(channel => face.reduce((sum, c) => sum + c[channel], 0) / face.length) as RGB);
  if (colors.some((a, i) => colors.some((b, j) => j > i && colorDistance(a, b) < 18)))
    throw Error('Two calibration colors look too similar. Check face order and lighting, then recapture.');
  return { id, name: name.trim() || 'My cube', colors };
}
export function matchScan(faces: (RGB[] | null)[], size: CubeSize, calibrations: Calibration[], allowFaceRotation = false): ScanMatch[] {
  if (faces.length !== 6 || faces.some(f => !f || f.length !== size * size)) return [];
  return calibrations.flatMap(calibration => {
    let palette = calibration.colors;
    let adaptive = false;
    if (calibration.id === 'suggested') {
      const groups: RGB[][] = Array.from({ length: 6 }, () => []);
      for (const rgb of (faces as RGB[][]).flat()) {
        const index = stickerColor(rgb);
        if (index >= 0) groups[index].push(rgb);
      }
      const area = size * size;
      const centersAgree = size % 2 === 0 || faces.every((face, i) => stickerColor(face![Math.floor(area / 2)]) === i);
      // Learn the observed palette only when every color has enough evidence.
      // Counts and physical constraints are still checked after classification.
      if (centersAgree && groups.every(group => group.length >= area * .7 && group.length <= area * 1.3)) {
        palette = groups.map(group => [0, 1, 2].map(channel =>
          group.map(rgb => rgb[channel]).sort((a, b) => a - b)[Math.floor(group.length / 2)]) as RGB);
        adaptive = true;
      }
    }
    let score = 0;
    const letters = (faces as RGB[][]).flat().map(rgb => {
      const ranked = palette.map((c, i) => ({ i, distance: adaptive ? chromaticDistance(rgb, c) : colorDistance(rgb, c) })).sort((a, b) => a.distance - b.distance);
      if (ranked[0].distance > 42 || ranked[1].distance - ranked[0].distance < 3) return '?';
      score += ranked[0].distance;
      return FACE_ORDER[ranked[0].i];
    });
    let value = letters.join('');
    if (allowFaceRotation) {
      const oriented = orientScan(value, size);
      if (!oriented) return [];
      value = oriented;
    }
    try { faceletsToCubies(value, size); } catch { return []; }
    return [{ calibration, value, score: score / value.length }];
  }).sort((a, b) => a.score - b.score);
}
// Normalize exposure before comparing chroma; a shaded orange remains orange.
function chromaticDistance(a: RGB, b: RGB) {
  const normalize = (rgb: RGB) => rgb.map(v => v / Math.max(...rgb, 1) * 220) as RGB;
  return colorDistance(normalize(a), normalize(b));
}
function rotateFace(face: string, size: CubeSize) {
  return [...face].map((_, i) => face[(size - 1 - i % size) * size + Math.floor(i / size)]).join('');
}
/** Keep a valid recorded orientation; otherwise recover only an unambiguous roll. */
export function orientScan(value: string, size: CubeSize): string | null {
  if (value.includes('?') || value.length !== 6 * size * size) return null;
  try { validateFacelets(value, size); return value; } catch { /* Try face rotations. */ }
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
      try { validateFacelets(prefix, size); valid.add(prefix); } catch { /* Invalid physical orientation. */ }
      return;
    }
    for (const face of variants[index]) visit(index + 1, prefix + face);
  }
  visit(0, '');
  return valid.size === 1 ? [...valid][0] : null;
}
