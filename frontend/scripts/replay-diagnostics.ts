// Usage after extracting a server archive: node diagnostic-replay.mjs PATH/report.json
import {readFileSync} from 'node:fs';
import {matchScan} from '../src/lib/cameraInput';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
for(const scan of report.scans){
 console.log('Scan',scan.id,scan.source,scan.size,scan.build);
 for(const event of scan.events){
  if(event.type!=='scan.worker.input')continue;
  const {faces,size,calibrations,neighbors}=event.data;
  console.log(event.at,'revision',event.data.revision,matchScan(faces,size,calibrations,true,neighbors));
 }
}
