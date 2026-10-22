import { Quaternion, Vector3 } from "three";
export type CubeSize = 3 | 4 | 5;
export type Cubie = {
  id: number;
  home: [number, number, number];
  position: Vector3;
  rotation: Quaternion;
};
const axes: Record<
  string,
  { axis: "x" | "y" | "z"; layer: number; direction: number }
> = {
  R: { axis: "x", layer: 1, direction: -1 },
  L: { axis: "x", layer: -1, direction: 1 },
  U: { axis: "y", layer: 1, direction: -1 },
  D: { axis: "y", layer: -1, direction: 1 },
  F: { axis: "z", layer: 1, direction: -1 },
  B: { axis: "z", layer: -1, direction: 1 },
};
export function solved(size: CubeSize = 3): Cubie[] {
  const result: Cubie[] = [];
  const edge = (size - 1) / 2;
  for (let x = -edge; x <= edge; x++)
    for (let y = -edge; y <= edge; y++)
      for (let z = -edge; z <= edge; z++) {
        result.push({
          id: result.length,
          home: [x, y, z],
          position: new Vector3(x, y, z),
          rotation: new Quaternion(),
        });
      }
  return result;
}
export function moveInfo(move: string, size: CubeSize = 3) {
  // A prefix alone selects one slice (2R); w selects a block (Rw, 3Rw).
  const match = /^(\d+)?([RLUDFB])(w)?(2|')?$/.exec(move);
  if (!match) throw new Error(`Invalid move: ${move}`);
  const [, prefix, name, wide, suffix] = match;
  const depth = prefix ? Number(prefix) : wide ? 2 : 1;
  if (depth < 1 || depth > size || (prefix && !wide && depth === 1))
    throw new Error(`Invalid move for ${size}×${size}: ${move}`);
  const face = axes[name];
  const edge = (size - 1) / 2;
  const layers = wide
    ? Array.from({ length: depth }, (_, i) => face.layer * (edge - i))
    : [face.layer * (edge - depth + 1)];
  const vector = new Vector3(
    face.axis === "x" ? 1 : 0,
    face.axis === "y" ? 1 : 0,
    face.axis === "z" ? 1 : 0,
  );
  return {
    ...face,
    layers,
    vector,
    angle: (face.direction * (suffix === "2" ? 2 : suffix === "'" ? -1 : 1) * Math.PI) / 2,
  };
}
export function cubeSize(state: Cubie[]): CubeSize {
  return (Math.max(...state.map((c) => c.home[0])) * 2 + 1) as CubeSize;
}
export function isInMove(c: Cubie, info: ReturnType<typeof moveInfo>) {
  return info.layers.some((layer) => Math.abs(c.position[info.axis] - layer) < 0.001);
}
export function applyMove(state: Cubie[], move: string): Cubie[] {
  const size = cubeSize(state);
  const info = moveInfo(move, size),
    q = new Quaternion().setFromAxisAngle(info.vector, info.angle);
  // Even cubes use half-integer coordinates; round back onto that lattice.
  const edge = (size - 1) / 2;
  const snap = (n: number) => Math.round(n + edge) - edge;
  return state.map((c) => {
    if (!isInMove(c, info))
      return {
        ...c,
        position: c.position.clone(),
        rotation: c.rotation.clone(),
      };
    const p = c.position.clone().applyQuaternion(q);
    p.set(snap(p.x), snap(p.y), snap(p.z));
    return { ...c, position: p, rotation: q.clone().multiply(c.rotation) };
  });
}
export function inverse(moves: string[]) {
  return [...moves]
    .reverse()
    .map((m) => (m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : m + "'"));
}
export function algorithmStates(moves: string[], initialState?: Cubie[], size: CubeSize = 3) {
  let initial = initialState ?? solved(size);
  if (!initialState)
    for (const m of inverse(moves)) initial = applyMove(initial, m);
  const states = [initial];
  for (const m of moves) states.push(applyMove(states.at(-1)!, m));
  return states;
}
