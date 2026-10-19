import { Quaternion, Vector3 } from "three";
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
export function solved(): Cubie[] {
  const result: Cubie[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        result.push({
          id: result.length,
          home: [x, y, z],
          position: new Vector3(x, y, z),
          rotation: new Quaternion(),
        });
      }
  return result;
}
export function moveInfo(move: string) {
  const face = axes[move[0]];
  if (!face || !/^[RLUDFB](2|')?$/.test(move))
    throw new Error(`Invalid move: ${move}`);
  const vector = new Vector3(
    face.axis === "x" ? 1 : 0,
    face.axis === "y" ? 1 : 0,
    face.axis === "z" ? 1 : 0,
  );
  return {
    ...face,
    vector,
    angle:
      (face.direction *
        (move.endsWith("2") ? 2 : move.endsWith("'") ? -1 : 1) *
        Math.PI) /
      2,
  };
}
export function applyMove(state: Cubie[], move: string): Cubie[] {
  const info = moveInfo(move),
    q = new Quaternion().setFromAxisAngle(info.vector, info.angle);
  return state.map((c) => {
    if (Math.round(c.position[info.axis]) !== info.layer)
      return {
        ...c,
        position: c.position.clone(),
        rotation: c.rotation.clone(),
      };
    const p = c.position.clone().applyQuaternion(q);
    p.set(Math.round(p.x), Math.round(p.y), Math.round(p.z));
    return { ...c, position: p, rotation: q.clone().multiply(c.rotation) };
  });
}
export function inverse(moves: string[]) {
  return [...moves]
    .reverse()
    .map((m) => (m.endsWith("2") ? m : m.endsWith("'") ? m[0] : m + "'"));
}
export function algorithmStates(moves: string[]) {
  let initial = solved();
  for (const m of inverse(moves)) initial = applyMove(initial, m);
  const states = [initial];
  for (const m of moves) states.push(applyMove(states.at(-1)!, m));
  return states;
}
