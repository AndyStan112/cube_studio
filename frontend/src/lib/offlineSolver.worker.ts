import CubeJS from "../vendor/cubejs";
import { validateFacelets } from "./facelets";
let ready = false;
self.onmessage = (event: MessageEvent<{ value: string }>) => {
  try {
    validateFacelets(event.data.value);
    if (!ready) {
      self.postMessage({
        status: "initializing",
        message: "Preparing offline solver…",
      });
      CubeJS.initSolver();
      ready = true;
    }
    self.postMessage({ status: "searching", message: "Searching offline…" });
    const cube = CubeJS.fromString(event.data.value);
    const notation = cube.isSolved() ? [] : cube.solve(22).trim().split(/\s+/);
    if (
      notation.some((m) => !/^[URFDLB](2|')?$/.test(m)) ||
      !CubeJS.fromString(event.data.value).move(notation.join(" ")).isSolved()
    )
      throw Error("Offline solution verification failed");
    self.postMessage({
      status: "complete",
      solution: {
        notation,
        moves: notation.map((m) => ({
          kind: "cube_layer_turn",
          face: m[0],
          layer_start: 0,
          layer_count: 1,
          amount: m.endsWith("2") ? 2 : m.endsWith("'") ? -1 : 1,
        })),
        move_count: notation.length,
        metric: "HTM",
        verified: true,
        optimality: "unproved",
      },
    });
  } catch (error) {
    self.postMessage({
      status: "failed",
      message: error instanceof Error ? error.message : "Offline worker failed",
    });
  }
};
