export function describeMove(move: string) {
  const faces: Record<string, string> = {
    R: "right",
    L: "left",
    U: "upper",
    D: "bottom",
    F: "front",
    B: "back",
  };
  return `Turn the ${faces[move[0]]} face ${move.endsWith("2") ? "180°" : move.endsWith("'") ? "90° counterclockwise" : "90° clockwise"}, looking directly at that face.`;
}
