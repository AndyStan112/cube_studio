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
) {
  if (focus === "all") return true;
  if (home[1] !== 1) return false;
  if (focus === "last-layer") return true;
  const corner = Math.abs(home[0]) === 1 && Math.abs(home[2]) === 1;
  if (!corner) return false;
  if (focus === "corner-orientation") return face === 2;
  if (focus === "corner-permutation") return face !== 2 && face !== 3;
  return true;
}
