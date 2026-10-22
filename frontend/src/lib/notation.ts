export function describeMove(move: string) {
  const match = /^(\d+)?([RLUDFB])(w)?(2|')?$/.exec(move);
  if (!match) return `Unknown move: ${move}`;
  const [, prefix, face, wide, suffix] = match;
  const faces: Record<string, string> = {
    R: "right", L: "left", U: "upper", D: "bottom", F: "front", B: "back",
  };
  const target = wide
    ? `outer ${prefix || "2"} layers together from the ${faces[face]} face`
    : prefix
      ? `layer ${prefix} from the ${faces[face]} face only`
      : `${faces[face]} face`;
  return `Turn the ${target} ${suffix === "2" ? "180°" : suffix === "'" ? "90° counterclockwise" : "90° clockwise"}, looking directly at that face.`;
}
