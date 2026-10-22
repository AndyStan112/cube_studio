import type { CubeSize } from "./cube";

export type CubeEvent = "333" | "444" | "555";
export const puzzles: Record<CubeEvent, { size: CubeSize; label: string; scrambleLength: number }> = {
  "333": { size: 3, label: "3×3", scrambleLength: 25 },
  "444": { size: 4, label: "4×4", scrambleLength: 40 },
  "555": { size: 5, label: "5×5", scrambleLength: 60 },
};
export const cubeEvents = Object.keys(puzzles) as CubeEvent[];
export const solveEvent = (solve: { event?: CubeEvent }): CubeEvent => solve.event ?? "333";
export const forEvent = <T extends { event?: CubeEvent }>(items: T[], event: CubeEvent): T[] =>
  items.filter(item => solveEvent(item) === event);

export function practiceMoves(event: CubeEvent): string[] {
  const axes = [["R", "L"], ["U", "D"], ["F", "B"]];
  let previous = -1;
  return Array.from({ length: puzzles[event].scrambleLength }, () => {
    const available = [0, 1, 2].filter(axis => axis !== previous);
    previous = available[Math.floor(Math.random() * available.length)];
    const face = axes[previous][Math.floor(Math.random() * 2)];
    const wide = event !== "333" && Math.random() < 0.5 ? "w" : "";
    return face + wide + ["", "'", "2"][Math.floor(Math.random() * 3)];
  });
}
