import { describe, expect, it } from 'vitest';
import { applyMove, solved, type CubeSize } from './cube';
import { cubiesToFacelets, FACE_ORDER, solvedFacelets } from './facelets';
import { calibrationFromFaces, isCalibration, matchScan, suggestedCalibration, type Calibration, type RGB } from './cameraInput';

function samples(value: string, size: CubeSize, profile = suggestedCalibration): RGB[][] {
  return Array.from({ length: 6 }, (_, f) => [...value.slice(f * size * size, (f + 1) * size * size)].map(letter => [...profile.colors[FACE_ORDER.indexOf(letter)]] as RGB));
}
describe('camera cube extraction', () => {
  for (const size of [3, 4, 5] as const) {
    it(`extracts a scrambled ${size}×${size} with physical validation`, () => {
      const state = ['R', 'U', "F'", ...(size > 3 ? ['Rw'] : [])].reduce((cube, move) => applyMove(cube, move), solved(size));
      const value = cubiesToFacelets(state);
      expect(matchScan(samples(value, size), size, [suggestedCalibration])[0]?.value).toBe(value);
    });
  }
  it('selects a saved cube when the suggested colors fail', () => {
    const custom: Calibration = { id: 'pastel', name: 'Pastel cube', colors: [[255, 150, 220], [100, 20, 130], [15, 180, 210], [30, 30, 30], [145, 200, 60], [240, 210, 170]] };
    const faces = samples(solvedFacelets(), 3, custom);
    expect(matchScan(faces, 3, [suggestedCalibration])).toEqual([]);
    expect(matchScan(faces, 3, [suggestedCalibration, custom])[0].calibration.id).toBe('pastel');
  });
  it('ranks valid profiles by color fit', () => {
    const offset: Calibration = { ...suggestedCalibration, id: 'offset', colors: suggestedCalibration.colors.map(rgb => rgb.map(v => v - 10) as RGB) };
    const matches = matchScan(samples(solvedFacelets(), 3), 3, [offset, suggestedCalibration]);
    expect(matches.map(m => m.calibration.id)).toEqual(['suggested', 'offset']);
  });
  it('rejects an impossible single flipped edge even with perfect colors', () => {
    const value = [...solvedFacelets()];
    [value[7], value[19]] = [value[19], value[7]];
    expect(matchScan(samples(value.join(''), 3), 3, [suggestedCalibration])).toEqual([]);
  });
  it('rejects ambiguous colors rather than forcing an assignment', () => {
    const duplicate = { ...suggestedCalibration, colors: suggestedCalibration.colors.map(() => [100, 100, 100] as RGB) };
    expect(matchScan(samples(solvedFacelets(), 3, duplicate), 3, [duplicate])).toEqual([]);
  });
  it('handles incomplete scans without accepting a default cube', () => {
    expect(matchScan([null, null, null, null, null, null], 3, [suggestedCalibration])).toEqual([]);
    expect(() => calibrationFromFaces('a', 'Cube', [null], 3)).toThrow('Capture all six faces');
  });
  it('calibrates a scrambled odd cube from its six fixed centers', () => {
    const value = cubiesToFacelets(applyMove(solved(), 'R'));
    expect(calibrationFromFaces('a', ' Cube A ', samples(value, 3), 3)).toEqual({ ...suggestedCalibration, id: 'a', name: 'Cube A' });
  });
  it('rejects repeated faces during calibration', () => {
    const face = samples(solvedFacelets(), 3)[0];
    expect(() => calibrationFromFaces('a', 'A', Array(6).fill(face), 3)).toThrow('too similar');
  });
  it('ignores malformed stored calibrations', () => {
    expect(isCalibration(suggestedCalibration)).toBe(true);
    for (const bad of [null, {}, { ...suggestedCalibration, colors: [] }, { ...suggestedCalibration, colors: Array(6).fill([NaN, 4, 5]) }]) expect(isCalibration(bad)).toBe(false);
  });
});

// Transcribed row by row from the user's failed camera review on 2026-11-23.
// All 54 stickers are correct; the six independently rotated pictures must work
// through the same extraction entry point used by live and timed captures.
const screenshotFaces = ['BBLBUFBBU', 'UUURRRRRR', 'RURUFDBBF', 'FFUUDLFFL', 'LLFLLFLLB', 'DDDDBDDRD'];
const screenshotState = 'BBBBUBUFLURRURRURRRDFUFBRUBULLFDFFUFLLFLLFLLBDDDDBDDRD';
function rotateSamples(face: RGB[], size: CubeSize, turns: number): RGB[] {
  for (let turn = 0; turn < turns; turn++) {
    face = face.map((_, i) => face[(size - 1 - i % size) * size + Math.floor(i / size)]);
  }
  return face;
}
describe('independent face rotations for every capture method', () => {
  it('extracts the exact failed screenshot without a video-only option', () => {
    const faces = samples(screenshotFaces.join(''), 3);
    expect(matchScan(faces, 3, [suggestedCalibration])[0]?.value).toBe(screenshotState);
  });
  for (let face = 0; face < 6; face++) for (let turns = 1; turns <= 3; turns++) {
    it(`recovers the screenshot with face ${FACE_ORDER[face]} rotated ${turns * 90} degrees`, () => {
      const faces = samples(screenshotFaces.join(''), 3);
      faces[face] = rotateSamples(faces[face], 3, turns);
      expect(matchScan(faces, 3, [suggestedCalibration])[0]?.value).toBe(screenshotState);
    });
  }
  for (const size of [3, 5] as const) {
    const state = ['R', 'U', "F'", 'L2', 'B', ...(size === 5 ? ['Rw', 'Uw2'] : [])]
      .reduce((cube, move) => applyMove(cube, move), solved(size));
    const value = cubiesToFacelets(state);
    for (let seed = 0; seed < 8; seed++) {
      it(`recovers simultaneous independent rotations on a scrambled ${size}x${size} (case ${seed})`, () => {
        const faces = samples(value, size).map((face, i) => rotateSamples(face, size, (seed * (i + 1) + i * i) % 4));
        expect(matchScan(faces, size, [suggestedCalibration])[0]?.value).toBe(value);
      });
    }
  }
  it('does not repair an actually misread sticker by changing the cube', () => {
    const faces = samples(screenshotFaces.join(''), 3);
    faces[0][0] = suggestedCalibration.colors[FACE_ORDER.indexOf('F')];
    expect(matchScan(faces, 3, [suggestedCalibration])).toEqual([]);
  });
});
