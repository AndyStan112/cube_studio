// Store-only ZIP: media is already compressed. No dependency or base64 expansion.
export type DiagnosticFile = { name: string; blob: Blob };
const table = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function header(length: number) { const data = new Uint8Array(length); return {data, view: new DataView(data.buffer)}; }
export async function diagnosticArchive(files: DiagnosticFile[]): Promise<Blob> {
  const parts: BlobPart[] = [], directory: BlobPart[] = [];
  let offset = 0, directorySize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    let crc = 0xffffffff;
    const reader = file.blob.stream().getReader();
    while (true) {const next = await reader.read(); if (next.done) break; for (const byte of next.value) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);}
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = header(30), central = header(46);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true);
    local.view.setUint16(12, 0x21, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, file.blob.size, true); local.view.setUint32(22, file.blob.size, true); local.view.setUint16(26, name.length, true);
    central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true);
    central.view.setUint16(14, 0x21, true);
    central.view.setUint32(16, crc, true); central.view.setUint32(20, file.blob.size, true); central.view.setUint32(24, file.blob.size, true); central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true);
    parts.push(local.data, name, file.blob); directory.push(central.data, name);
    offset += 30 + name.length + file.blob.size; directorySize += 46 + name.length;
  }
  const end = header(22);end.view.setUint32(0, 0x06054b50, true);end.view.setUint16(8, files.length, true);end.view.setUint16(10, files.length, true);end.view.setUint32(12, directorySize, true);end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.data], {type: 'application/zip'});
}
