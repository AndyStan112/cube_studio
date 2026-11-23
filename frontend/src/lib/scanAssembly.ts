import type { CubeSize } from "./cube";
import {
  cornerFaceletIndices,
  FACE_ORDER,
  faceletsToCubies,
  rotatedFaceletStates,
  SOLVED_FACELETS,
  validateFacelets,
} from "./facelets";

export function rotateFacePattern(face: string, size: CubeSize): string {
  return [...face]
    .map((_, i) => face[(size - 1 - (i % size)) * size + Math.floor(i / size)])
    .join("");
}
export function canonicalFacePattern(face: string, size: CubeSize): string {
  const turns = [face];
  for (let i = 1; i < 4; i++) turns.push(rotateFacePattern(turns[i - 1], size));
  return turns.sort()[0];
}
export function cubeOrientationKey(value: string, size: CubeSize): string {
  return rotatedFaceletStates(value, size).sort()[0];
}
function referenceOrientation(value: string, size: CubeSize): string {
  const area = size * size;
  const fit = (state: string) =>
    [...state].filter((color, i) => color === FACE_ORDER[Math.floor(i / area)])
      .length;
  return rotatedFaceletStates(value, size).sort(
    (a, b) => fit(b) - fit(a) || a.localeCompare(b),
  )[0];
}
/** Assemble even-cube faces from full sticker patterns, with no center identity. */
export function assembleEvenScan(value: string, size: CubeSize): string | null {
  const area = size * size;
  if (
    size % 2 ||
    value.length !== 6 * area ||
    [...FACE_ORDER].some(
      (color) => [...value].filter((c) => c === color).length !== area,
    )
  )
    return null;
  const images = Array.from({ length: 6 }, (_, i) =>
    value.slice(i * area, (i + 1) * area),
  );
  const variants = images.map((face) => {
    const turns = new Set<string>();
    for (let i = 0; i < 4; i++) {
      turns.add(face);
      face = rotateFacePattern(face, size);
    }
    return [...turns];
  });
  const slots = cornerFaceletIndices(size);
  const homes = cornerFaceletIndices(3).map((slot) =>
    slot.map((index) => SOLVED_FACELETS[index]),
  );
  const assigned: (string | null)[] = Array(6).fill(null);
  const used = new Set<number>([0]);
  // Remove the free whole-cube orientation. Symmetric first faces are further
  // deduplicated by the complete cube's 24 rotations at the leaves.
  assigned[0] = images[0];
  const order = [1, 2, 4, 5, 3];
  const states = new Map<string, string>();
  let branches = 0,
    exhausted = false;
  function consistent() {
    const pieces = new Set<number>();
    for (const slot of slots) {
      const colors = slot.map(
        (index) => assigned[Math.floor(index / area)]?.[index % area],
      );
      const matches = homes.flatMap((home, piece) =>
        [0, 1, 2]
          .filter((turn) =>
            home.every(
              (color, i) =>
                colors[(i + turn) % 3] === undefined ||
                colors[(i + turn) % 3] === color,
            ),
          )
          .map(() => piece),
      );
      if (!matches.length) return false;
      if (colors.every(Boolean)) {
        if (matches.length !== 1 || pieces.has(matches[0])) return false;
        pieces.add(matches[0]);
      }
    }
    return true;
  }
  function visit(depth: number) {
    if (states.size > 1 || exhausted) return;
    if (++branches > 100000) {
      exhausted = true;
      return;
    }
    if (depth === order.length) {
      const state = assigned.join("");
      try {
        validateFacelets(state, size);
        faceletsToCubies(state, size);
      } catch {
        return;
      }
      const key = cubeOrientationKey(state, size);
      if (!states.has(key)) states.set(key, referenceOrientation(state, size));
      return;
    }
    const slot = order[depth];
    for (let image = 1; image < 6; image++) {
      if (used.has(image)) continue;
      used.add(image);
      for (const face of variants[image]) {
        assigned[slot] = face;
        if (consistent()) visit(depth + 1);
      }
      assigned[slot] = null;
      used.delete(image);
    }
  }
  visit(0);
  return !exhausted && states.size === 1 ? [...states.values()][0] : null;
}
