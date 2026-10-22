export type StickerFocus =
  | "all"
  | "last-layer"
  | "last-layer-corners"
  | "corner-orientation"
  | "corner-permutation";

// Face indices match the viewer's right, left, up, down, front, back order.
// Use the sticker's original piece identity so the mask follows it during moves.
export function isRelevantSticker(
  home: readonly [number, number, number],
  face: number,
  focus: StickerFocus,
  size = 3,
) {
  if (focus === "all") return true;
  const edge = (size - 1) / 2;
  if (home[1] !== edge) return false;
  if (focus === "last-layer") return true;
  const corner = Math.abs(home[0]) === edge && Math.abs(home[2]) === edge;
  if (!corner) return false;
  if (focus === "corner-orientation") return face === 2;
  if (focus === "corner-permutation") return face !== 2 && face !== 3;
  return true;
}
