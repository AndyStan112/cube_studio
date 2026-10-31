import type { CubeSize } from './cube';
import { FACE_ORDER, faceletsToCubies } from './facelets';

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
export function matchScan(faces: (RGB[] | null)[], size: CubeSize, calibrations: Calibration[]): ScanMatch[] {
  if (faces.length !== 6 || faces.some(f => !f || f.length !== size * size)) return [];
  return calibrations.flatMap(calibration => {
    let score = 0;
    const letters = (faces as RGB[][]).flat().map(rgb => {
      const ranked = calibration.colors.map((c, i) => ({ i, distance: colorDistance(rgb, c) })).sort((a, b) => a.distance - b.distance);
      if (ranked[0].distance > 42 || ranked[1].distance - ranked[0].distance < 3) return '?';
      score += ranked[0].distance;
      return FACE_ORDER[ranked[0].i];
    });
    const value = letters.join('');
    try { faceletsToCubies(value, size); } catch { return []; }
    return [{ calibration, value, score: score / value.length }];
  }).sort((a, b) => a.score - b.score);
}
// The overlay uses the same centered square as this sampler. Median patches avoid sticker seams and small glare spots.
export function sampleFace(image: ImageData, size: CubeSize): RGB[] {
  const { width, height, data } = image;
  const side = Math.min(width, height) * .72;
  const left = (width - side) / 2, top = (height - side) / 2;
  const radius = Math.max(1, Math.floor(side / size * .12));
  return Array.from({ length: size * size }, (_, i) => {
    const x = Math.floor(left + (i % size + .5) * side / size);
    const y = Math.floor(top + (Math.floor(i / size) + .5) * side / size);
    const channels: number[][] = [[], [], []];
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const offset = ((y + dy) * width + x + dx) * 4;
      channels.forEach((values, c) => values.push(data[offset + c]));
    }
    return channels.map(values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]) as RGB;
  });
}
