import { matchScan, type Calibration } from "./cameraInput";
import type { CubeSize } from "./cube";
import type { RGB } from "./cameraInput";
self.onmessage = (
  event: MessageEvent<{
    generation: number;
    revision: number;
    size: CubeSize;
    faces: RGB[][];
    calibrations: Calibration[];
    neighbors?: (RGB | null)[][];
  }>,
) => {
  const { generation, revision, size, faces, calibrations, neighbors } = event.data;
  try {
    const match = matchScan(faces, size, calibrations, true, neighbors)[0] ?? null;
    self.postMessage({ generation, revision, match });
  } catch {
    self.postMessage({ generation, revision, match: null });
  }
};
