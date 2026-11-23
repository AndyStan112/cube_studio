import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import photos from "./__fixtures__/camera-photos";
import { detectFace, stickerColor, type PixelImage } from "./cameraVision";
import {
  calibrationFromFaces,
  matchScan,
  suggestedCalibration,
  type RGB,
} from "./cameraInput";
import { FACE_ORDER } from "./facelets";

const expected = "UURUUUUUURRDRRFRRFFFFFFFLLFDDDDDDBBLLLLLLLUBBBBBDBBDRR";
function loadPhoto(photo: (typeof photos)[number], exposure = 1): PixelImage {
  const rgb = gunzipSync(
    readFileSync(
      new URL(`./__fixtures__/camera-photos/${photo.file}`, import.meta.url),
    ),
  );
  const data = new Uint8ClampedArray(photo.width * photo.height * 4);
  for (let pixel = 0; pixel < photo.width * photo.height; pixel++) {
    for (let channel = 0; channel < 3; channel++)
      data[pixel * 4 + channel] = rgb[pixel * 3 + channel] * exposure;
    data[pixel * 4 + 3] = 255;
  }
  return { width: photo.width, height: photo.height, data };
}
function rotateImage(image: PixelImage): PixelImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4;
      const to = (x * image.height + image.height - 1 - y) * 4;
      data.set(image.data.subarray(from, from + 4), to);
    }
  return { width: image.height, height: image.width, data };
}
describe("real warm-lit photos from the failed scan", () => {
  for (const photo of photos) {
    it(`reads every sticker of the ${photo.expected[4]} photo, including its outer rows`, () => {
      const detection = detectFace(loadPhoto(photo), 3);
      expect(detection).not.toBeNull();
      expect(
        detection!.colors.map((rgb) => FACE_ORDER[stickerColor(rgb)]).join(""),
      ).toBe(photo.expected);
    });
  }
  for (const exposure of [0.7, 1, 1.15]) {
    it(`extracts the physically valid state from all six actual photos at exposure ${exposure}`, () => {
      const faces: (RGB[] | null)[] = Array(6).fill(null);
      for (const photo of photos) {
        const detection = detectFace(loadPhoto(photo, exposure), 3);
        expect(detection).not.toBeNull();
        const index = stickerColor(detection!.colors[4]);
        expect(FACE_ORDER[index]).toBe(photo.expected[4]);
        faces[index] = detection!.colors;
      }
      expect(matchScan(faces, 3, [suggestedCalibration])[0]?.value).toBe(
        expected,
      );
    });
  }
  it("accepts these six photos in their original sent order, identifying faces from centers", () => {
    const faces = photos.map(
      (photo) => detectFace(loadPhoto(photo), 3)!.colors,
    );
    expect(matchScan(faces, 3, [suggestedCalibration])[0]?.value).toBe(
      expected,
    );
  });

  it("does not hide a confidently wrong sticker while resolving the close orange/red readings", () => {
    const faces: RGB[][] = Array(6);
    for (const photo of photos)
      faces[FACE_ORDER.indexOf(photo.expected[4])] = detectFace(
        loadPhoto(photo),
        3,
      )!.colors;
    faces[0][1] = faces[2][4];
    expect(matchScan(faces, 3, [suggestedCalibration])).toEqual([]);
  });
  for (let offset = 0; offset < 4; offset++) {
    it(`extracts the same state after independently rotating the real photo pixels (case ${offset})`, () => {
      const faces: RGB[][] = [];
      for (const [i, photo] of photos.entries()) {
        let image = loadPhoto(photo);
        for (let turn = 0; turn < (i + offset) % 4; turn++)
          image = rotateImage(image);
        const detection = detectFace(image, 3);
        expect(detection).not.toBeNull();
        faces.push(detection!.colors);
      }
      expect(matchScan(faces, 3, [suggestedCalibration])[0]?.value).toBe(
        expected,
      );
    });
  }
  for (const exposure of [0.7, 1, 1.15]) {
    it(`also handles the shadowed stickers with an explicitly saved calibration (exposure ${exposure})`, () => {
      const training: RGB[][] = Array(6),
        scan: RGB[][] = Array(6);
      for (const photo of photos) {
        const index = FACE_ORDER.indexOf(photo.expected[4]);
        training[index] = detectFace(loadPhoto(photo), 3)!.colors;
        scan[index] = detectFace(loadPhoto(photo, exposure), 3)!.colors;
      }
      const calibration = calibrationFromFaces(
        "room",
        "Warm room",
        training,
        3,
      );
      expect(matchScan(scan, 3, [calibration])[0]?.value).toBe(expected);
    });
  }
});
