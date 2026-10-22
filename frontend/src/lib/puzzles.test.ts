import { describe, expect, it } from "vitest";
import { averageOf, type Solve } from "./api";
import { cubeEvents, forEvent, practiceMoves, puzzles } from "./puzzles";
import { applyMove } from "./cube";
import { cubiesToFacelets, solvedFacelets } from "./facelets";
import { parsePracticeMoves, practiceSequence } from "./practice";

describe("puzzle sessions", () => {
  it("keeps history and statistics separate while treating old records as 3×3", () => {
    const make = (time_ms: number, event?: Solve['event']) => ({ id: String(time_ms), time_ms, event, penalty: 'none' }) as Solve;
    const all = [make(1000), make(2000, '333'), ...[10, 20, 30, 40, 50].map(n => make(n * 1000, '444')), make(999000, '555')];
    expect(forEvent(all, '333').map(s => s.time_ms)).toEqual([1000, 2000]);
    expect(averageOf(forEvent(all, '444'), 5)).toBe(30000);
    expect(forEvent(all, '555')).toHaveLength(1);
    expect(all).toHaveLength(8);
  });
  for (const event of cubeEvents) {
    it(`generates and reverses ${event} scrambles with correct layer notation`, () => {
      const { size, scrambleLength } = puzzles[event];
      const moves = practiceMoves(event);
      expect(moves).toHaveLength(scrambleLength);
      const axes = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
      moves.forEach((move, i) => {
        expect(move).toMatch(event === '333' ? /^[RLUDFB](2|')?$/ : /^[RLUDFB]w?(2|')?$/);
        if (i) expect(axes[move[0] as keyof typeof axes]).not.toBe(axes[moves[i-1][0] as keyof typeof axes]);
      });
      const playback = practiceSequence(moves, size, true);
      const final = playback.moves.reduce((state, move) => applyMove(state, move), playback.initial);
      expect(cubiesToFacelets(final)).toBe(solvedFacelets(size));
    });
  }
  it("parses pasted moves and rejects impossible notation before replacing playback", () => {
    expect(parsePracticeMoves(" Rw\n U2  2R′ x’ ", 5)).toEqual(['Rw', 'U2', "2R'", "x'"]);
    expect(parsePracticeMoves('', 4)).toEqual([]);
    expect(() => parsePracticeMoves('5Rw', 4)).toThrow();
    expect(() => parsePracticeMoves('hello', 5)).toThrow();
    expect(() => parsePracticeMoves(Array(501).fill('R').join(' '), 5)).toThrow();
  });
});
