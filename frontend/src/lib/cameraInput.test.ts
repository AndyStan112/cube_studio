import { describe, expect, it } from 'vitest';
import { applyMove, solved, type CubeSize } from './cube';
import { cubiesToFacelets, FACE_ORDER, solvedFacelets } from './facelets';
import { calibrationFromFaces, isCalibration, matchScan, sampleFace, suggestedCalibration, type Calibration, type RGB } from './cameraInput';

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
  it('samples portrait and landscape video and tolerates a glare pixel', () => {
    for (const [width, height] of [[240, 400], [400, 240]]) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) data.set([30, 150, 70, 255], i);
      data.set([255, 255, 255, 255], (height / 2 * width + width / 2) * 4);
      expect(sampleFace({ width, height, data } as ImageData, 3)).toEqual(Array(9).fill([30, 150, 70]));
    }
  });
});
