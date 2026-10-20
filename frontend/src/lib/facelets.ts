import { Matrix4, Quaternion, Vector3 } from "three";
import { solved, type Cubie } from "./cube";
export const FACE_ORDER = "URFDLB";
export const SOLVED_FACELETS = [...FACE_ORDER].map((f) => f.repeat(9)).join("");
export const FACE_COLORS: Record<string, string> = {
  U: "#f5d54f",
  R: "#6297ed",
  F: "#e9574e",
  D: "#f5f5eb",
  L: "#65b99a",
  B: "#ff9c39",
};
const corners = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const edges = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
const parity = (p: number[]) =>
  p.reduce((s, a, i) => s + p.slice(i + 1).filter((b) => a > b).length, 0) % 2;
export function validateFacelets(value: string) {
  if (
    value.length !== 54 ||
    [...FACE_ORDER].some((f) => [...value].filter((c) => c === f).length !== 9)
  )
    throw Error("Use exactly nine of each symbol U R F D L B.");
  if ([...FACE_ORDER].some((f, i) => value[i * 9 + 4] !== f))
    throw Error("Centers must match the fixed URFDLB orientation.");
  const perms = [corners, edges].map((slots) => {
    const mod = slots[0].length,
      perm: number[] = [];
    let sum = 0;
    for (const slot of slots) {
      const matches: [number, number][] = [];
      slots.forEach((home, p) => {
        for (let o = 0; o < mod; o++)
          if (
            home.every(
              (idx, n) => value[slot[(n + o) % mod]] === SOLVED_FACELETS[idx],
            )
          )
            matches.push([p, o]);
      });
      if (matches.length !== 1)
        throw Error("Invalid or mirrored piece inventory.");
      perm.push(matches[0][0]);
      sum += matches[0][1];
    }
    if (new Set(perm).size !== slots.length)
      throw Error("Duplicate or missing pieces.");
    if (sum % mod) throw Error("Impossible corner twist or edge flip.");
    return perm;
  });
  if (parity(perms[0]) !== parity(perms[1]))
    throw Error("Corner and edge permutation parity differs.");
}
// Row-major views from outside each face. U's top is B; D's top is F.
export const faceletGeometry = [...FACE_ORDER].flatMap((face) =>
  Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3),
      c = i % 3;
    const coordinates: Record<string, number[]> = {
      U: [c - 1, 1, r - 1],
      R: [1, 1 - r, 1 - c],
      F: [c - 1, 1 - r, 1],
      D: [c - 1, -1, 1 - r],
      L: [-1, 1 - r, c - 1],
      B: [1 - c, 1 - r, -1],
    };
    const normals: Record<string, number[]> = {
      U: [0, 1, 0],
      R: [1, 0, 0],
      F: [0, 0, 1],
      D: [0, -1, 0],
      L: [-1, 0, 0],
      B: [0, 0, -1],
    };
    return {
      face,
      position: new Vector3(...(coordinates[face] as [number, number, number])),
      normal: new Vector3(...(normals[face] as [number, number, number])),
    };
  }),
);
const near = (a: Vector3, b: Vector3) => a.distanceToSquared(b) < 0.001;
const directions = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];
const rotations = directions.flatMap((x) =>
  directions
    .filter((y) => x.dot(y) === 0)
    .map((y) =>
      new Quaternion().setFromRotationMatrix(
        new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y)),
      ),
    ),
);
export function cubiesToFacelets(state: Cubie[]) {
  const result = Array<string>(54);
  for (const c of state)
    for (const sticker of faceletGeometry.filter((s) =>
      near(s.position, new Vector3(...c.home)),
    )) {
      const normal = sticker.normal.clone().applyQuaternion(c.rotation);
      const index = faceletGeometry.findIndex(
        (s) => near(s.position, c.position) && near(s.normal, normal),
      );
      if (index < 0) throw Error("Invalid rendered cube geometry");
      result[index] = sticker.face;
    }
  return result.join("");
}
export function faceletsToCubies(value: string): Cubie[] {
  validateFacelets(value);
  return solved().map((c) => {
    const home = new Vector3(...c.home),
      stickers = faceletGeometry.filter((s) => near(s.position, home));
    if (!stickers.length) return c;
    for (const rotation of rotations) {
      const position = home.clone().applyQuaternion(rotation).round();
      if (
        stickers.every((sticker) => {
          const normal = sticker.normal.clone().applyQuaternion(rotation);
          const index = faceletGeometry.findIndex(
            (s) => near(s.position, position) && near(s.normal, normal),
          );
          return index >= 0 && value[index] === sticker.face;
        })
      )
        return { ...c, position, rotation: rotation.clone() };
    }
    throw Error("Cannot orient cube piece");
  });
}
