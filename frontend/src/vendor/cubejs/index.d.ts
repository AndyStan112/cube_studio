export default class CubeJS {
  constructor();
  static initSolver(): void;
  static fromString(value: string): CubeJS;
  static random(): CubeJS;
  asString(): string;
  move(moves: string): CubeJS;
  solve(maxDepth?: number): string;
  isSolved(): boolean;
}
