import { Matrix4, Quaternion, Vector3 } from "three";
import { solved, cubeSize, type CubeSize, type Cubie } from "./cube";
export const FACE_ORDER = "URFDLB";
export const solvedFacelets = (size: CubeSize = 3) => [...FACE_ORDER].map(f => f.repeat(size * size)).join("");
export const SOLVED_FACELETS = solvedFacelets();
export const FACE_COLORS: Record<string, string> = {
  U: "#f5d54f",
  R: "#65b99a",
  F: "#e9574e",
  D: "#f5f5eb",
  L: "#6297ed",
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
export function validateFacelets(value: string, size: CubeSize = 3) {
  if (size !== 3) {
    const area = size * size;
    if (value.length !== 6 * area || [...FACE_ORDER].some(f => [...value].filter(c => c === f).length !== area))
      throw Error(`Use exactly ${area} of each symbol U R F D L B (${6 * area} stickers).`);
    if (size === 5) {
      // Corners, midges and fixed centers form the ordinary 3×3 skeleton.
      const indices = [0, 2, 4];
      const skeleton = [...FACE_ORDER].flatMap((_, f) => indices.flatMap(r => indices.map(c => value[f * area + r * size + c]))).join("");
      validateFacelets(skeleton);
    } else {
      let twists = 0;
      const used = new Set<number>();
      const convert = (i: number) => Math.floor(i / 9) * area + Math.floor((i % 9) / 3) / 2 * (size - 1) * size + (i % 3) / 2 * (size - 1);
      for (const slot of corners) {
        const colors = slot.map(i => value[convert(i)]);
        const matches = corners.flatMap((home, piece) => [0, 1, 2].filter(o => home.every((i, n) => colors[(n + o) % 3] === SOLVED_FACELETS[i])).map(o => ({piece, o})));
        if (matches.length !== 1 || used.has(matches[0].piece)) throw Error("Invalid, mirrored, or duplicate corners.");
        used.add(matches[0].piece);
        twists += matches[0].o;
      }
      if (twists % 3) throw Error("Impossible corner twist.");
    }
    return;
  }
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
export function geometryFor(size: CubeSize = 3) {
  const edge = (size - 1) / 2;
  return [...FACE_ORDER].flatMap((face) =>
  Array.from({ length: size * size }, (_, i) => {
    const r = Math.floor(i / size),
      c = i % size;
    const coordinates: Record<string, number[]> = {
      U: [c - edge, edge, r - edge],
      R: [edge, edge - r, edge - c],
      F: [c - edge, edge - r, edge],
      D: [c - edge, -edge, edge - r],
      L: [-edge, edge - r, c - edge],
      B: [edge - c, edge - r, -edge],
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
}
export const faceletGeometry = geometryFor();
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
  const size = cubeSize(state);
  const faceletGeometry = geometryFor(size);
  const result = Array<string>(6 * size * size);
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
export function faceletsToCubies(value: string, size: CubeSize = 3): Cubie[] {
  validateFacelets(value, size);
  const faceletGeometry = geometryFor(size);
  const occupied = new Set<string>();
  return solved(size).map((c) => {
    const home = new Vector3(...c.home),
      stickers = faceletGeometry.filter((s) => near(s.position, home));
    if (!stickers.length) return c;
    for (const rotation of rotations) {
      const position = home.clone().applyQuaternion(rotation);
      const edge = (size - 1) / 2;
      position.set(...position.toArray().map(n => Math.round(n + edge) - edge) as [number, number, number]);
      const key = position.toArray().join();
      if (occupied.has(key)) continue;
      if (
        stickers.every((sticker) => {
          const normal = sticker.normal.clone().applyQuaternion(rotation);
          const index = faceletGeometry.findIndex(
            (s) => near(s.position, position) && near(s.normal, normal),
          );
          return index >= 0 && value[index] === sticker.face;
        })
      )
        {
          occupied.add(key);
          return { ...c, position, rotation: rotation.clone() };
        }
    }
    throw Error("Cannot orient cube piece");
  });
}
