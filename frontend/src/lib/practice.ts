import { applyMove, inverse, moveInfo, solved, type CubeSize } from "./cube";

export function parsePracticeMoves(value: string, size: CubeSize): string[] {
  const moves = value.trim().replace(/[′’]/g, "'").split(/\s+/).filter(Boolean);
  if (moves.length > 500) throw Error("Use at most 500 moves.");
  for (const move of moves) moveInfo(move, size);
  return moves;
}
export function practiceSequence(moves: string[], size: CubeSize, returning: boolean) {
  return returning
    ? { initial: moves.reduce((state, move) => applyMove(state, move), solved(size)), moves: inverse(moves) }
    : { initial: solved(size), moves };
}
