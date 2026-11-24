import { matchScan, scanIssue, type Calibration } from "./cameraInput";
import type { CubeSize } from "./cube";
import type { RGB } from "./cameraInput";
declare const __APP_VERSION__: string;
const workerBuild = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development';
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
  const started = performance.now();
  const { generation, revision, size, faces, calibrations, neighbors } = event.data;
  try {
    const match = matchScan(faces, size, calibrations, true, neighbors)[0] ?? null;
    const issue = match ? null : scanIssue(faces, size, calibrations, neighbors);
    self.postMessage({ generation, revision, match, issue, workerBuild, workerUrl: self.location.href, elapsedMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ generation, revision, match: null, workerBuild, workerUrl: self.location.href, elapsedMs: performance.now() - started, error: error instanceof Error ? {name:error.name,message:error.message,stack:error.stack} : String(error) });
  }
};
