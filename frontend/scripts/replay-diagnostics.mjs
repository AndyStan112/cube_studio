import { build } from 'esbuild';
if(!process.argv[2]) {console.error('Usage: node scripts/replay-diagnostics.mjs /path/to/report.json');process.exit(1);}
const result = await build({entryPoints:[new URL('./replay-diagnostics.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
