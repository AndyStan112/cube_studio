// Accepts either an extracted report.json or an imported corpus/readings.json.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { matchScan, scanIssue } from '../src/lib/cameraInput';
import { VideoScanSession } from '../src/lib/videoScan';
import { canonicalFacePattern } from '../src/lib/scanAssembly';
import type { CubeSize } from '../src/lib/cube';
import type { FaceDetection } from '../src/lib/cameraVision';

const path = process.argv[2];
const report = JSON.parse(readFileSync(path, 'utf8'));
const expectationsPath = process.argv[3] ?? join(dirname(path), 'expectations.json');
const expectations = existsSync(expectationsPath) ? JSON.parse(readFileSync(expectationsPath, 'utf8')) : null;
let failures = 0;
for (const scan of report.scans) {
  const inputs = scan.workerInputs ?? scan.events.filter((event: {type: string}) => event.type === 'scan.worker.input').map((event: {data: unknown}) => event.data);
  const frames = scan.frames ?? scan.events.filter((event: {type: string}) => event.type === 'scan.frame').map((event: {data: unknown}) => event.data);
  const calibrations = scan.calibrations ?? scan.events.find((event: {type: string}) => event.type === 'scan.start').data.calibrations;
  const session = new VideoScanSession(scan.size as CubeSize, calibrations);
  const outcome = expectations?.scans?.[scan.id];
  const expectedValue = typeof outcome === 'string' && /^[URFDLB]+$/.test(outcome) && outcome.length === 6 * scan.size * scan.size ? outcome : null;
  const unexpectedMatches: {time: number; value: string}[] = [];
  for (const frame of frames) {
    session.observe(frame.detection as FaceDetection | null, frame.time);
    const match = session.match();
    if (match && (outcome === 'needs-orientation' || outcome === 'needs-colors' || (expectedValue && match.value !== expectedValue)))
      unexpectedMatches.push({time: frame.time, value: session.match()!.value});
  }
  const faces = session.snapshot().faces;
  const match = session.match();
  const issue = faces.length === 6 && !match
    ? scanIssue(faces.map(face => face.colors), scan.size, calibrations, faces.map(face => face.neighbors ?? [])) : null;
  const errors: string[] = [];
  if (expectations && !['needs-orientation', 'needs-colors'].includes(outcome) && !expectedValue)
    errors.push('Missing or unsupported expected outcome for this scan');
  if (outcome === 'needs-orientation' || outcome === 'needs-colors') {
    if (unexpectedMatches.length || match) errors.push('Accepted an unresolved cube');
    if (faces.length !== 6 || issue?.kind !== (outcome === 'needs-orientation' ? 'orientation' : 'colors')) errors.push('Lost faces or requested the wrong recovery action');
    for (const face of expectations.patterns ? faces : []) {
      if (face.identity !== null && face.pattern !== canonicalFacePattern(expectations.patterns[face.identity], scan.size))
        errors.push(`Wrong saved face ${face.id}`);
    }
  }
  if (expectedValue && (unexpectedMatches.length || match?.value !== expectedValue)) errors.push('Did not recover the annotated cube state');
  failures += errors.length;
  console.log(JSON.stringify({scan: scan.id, source: scan.source, frames: frames.length,
    workerRequests: inputs.length, faces: faces.map(face => ({id: face.id, pattern: face.pattern})),
    match: match?.value ?? null, issue, ...(expectations ? {errors} : {})}));
  for (const input of inputs) {
    const result = matchScan(input.faces, input.size, input.calibrations, true, input.neighbors);
    console.log(JSON.stringify({revision: input.revision, match: result[0]?.value ?? null,
      issue: result.length ? null : scanIssue(input.faces, input.size, input.calibrations, input.neighbors)}));
  }
}
if (!expectations) console.log('No expectations.json found; replay only, no regression verdict.');
process.exitCode = failures ? 1 : 0;
