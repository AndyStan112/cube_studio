import { describe, expect, it } from 'vitest';
import { diagnosticArchive } from './diagnosticArchive';
import { redactDiagnostic, logDiagnostic, beginScanDiagnostics, loadDiagnostics, diagnosticStatus } from './diagnostics';

describe('diagnostic archives', () => {
  it('writes standard ZIP entries with matching CRC, size and central directory offsets', async () => {
    const zip = await diagnosticArchive([{name:'report.json',blob:new Blob(['{"schema":1}'])},{name:'scans/face.jpg',blob:new Blob([new Uint8Array([1,2,3])])}]);
    const data = new Uint8Array(await zip.arrayBuffer()), view = new DataView(data.buffer);
    expect(view.getUint32(0,true)).toBe(0x04034b50);
    const end = data.length - 22;
    expect(view.getUint32(end,true)).toBe(0x06054b50);
    expect(view.getUint16(end+10,true)).toBe(2);
    const central = view.getUint32(end+16,true);
    expect(view.getUint32(central,true)).toBe(0x02014b50);
    expect(view.getUint32(central+16,true)).toBe(view.getUint32(14,true));
    expect(new TextDecoder().decode(data.slice(30,41))).toBe('report.json');
    expect(view.getUint32(central+24,true)).toBe(12);
  });
  it('redacts credentials, nested secrets and bearer tokens while retaining diagnostic geometry', () => {
    expect(redactDiagnostic({authorization:'secret',data:{token:'secret',colors:[10,20,30]},error: new Error('Bearer abc123 failed')})).toMatchObject({authorization:'[redacted]',data:{token:'[redacted]',colors:[10,20,30]},error:{message:'Bearer [redacted] failed'}});
  });
  it('bounds cyclic client logs', () => {
    const value: Record<string,unknown> = {};value.self=value;
    expect(JSON.stringify(redactDiagnostic(value)).length).toBeLessThan(500);
  });
  it('preserves an in-memory scan when IndexedDB is unavailable', async () => {
    logDiagnostic('test.error',{message:'failure'});
    beginScanDiagnostics('camera',3,{palette:'auto'}).phase('incomplete');
    await loadDiagnostics();
    expect(diagnosticStatus().scans).toBeGreaterThan(0);
    expect(diagnosticStatus().storageError).toContain('unavailable');
  });
});
