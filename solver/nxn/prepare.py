"""Fetch the pinned engine's tables at image build time, never during a solve."""
import gzip
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import shutil
import time
import zlib
from urllib.request import Request, urlopen

BASE = 'https://rubiks-cube-lookup-tables.s3.amazonaws.com/'
CHUNK = 8 * 1024 * 1024


def prepare(root):
    directory = root / 'lookup-tables'
    directory.mkdir(exist_ok=True)
    files = json.loads(Path(__file__).with_name('tables.json').read_text())
    pending = [name for name in files if not (directory / name).exists()]
    with ThreadPoolExecutor(max_workers=int(os.environ.get("NXN_DOWNLOAD_WORKERS", "12"))) as pool:
        def metadata(name):
            with urlopen(Request(BASE + name + '.gz', method='HEAD'), timeout=60) as response:
                return name, int(response.headers['Content-Length']), response.headers['ETag']
        heads = list(pool.map(metadata, pending))
        print(f'Downloading {len(heads)} tables ({sum(size for _, size, _ in heads) / 1024**2:.0f} MiB compressed)', flush=True)
        handles = {name: os.open(str(directory / (name + '.download')), os.O_CREAT | os.O_RDWR, 0o644) for name, _, _ in heads}
        def download(part):
            name, start, end, etag = part
            for attempt in range(4):
                try:
                    request = Request(BASE + name + '.gz', headers={'Range': f'bytes={start}-{end}', 'If-Match': etag})
                    with urlopen(request, timeout=90) as response:
                        if response.status != 206:
                            raise ValueError('Table host ignored byte range')
                        data = response.read(end-start+2)
                    if len(data) != end-start+1:
                        raise ValueError('Incomplete table download')
                    offset = 0
                    while offset < len(data):
                        offset += os.pwrite(handles[name], data[offset:], start + offset)
                    return
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(2**attempt)
        def downloaded(name, start, end):
            # Range writes happen only after the entire response is in memory. Sparse
            # file holes distinguish unfinished chunks across interrupted local builds.
            handle = handles[name]
            if os.fstat(handle).st_size < end + 1:
                return False
            try:
                return os.lseek(handle, start, os.SEEK_DATA) == start and os.lseek(handle, start, os.SEEK_HOLE) >= end + 1
            except OSError:
                return False
        tasks = [pool.submit(download, (name, offset, min(offset+CHUNK, size)-1, etag))
                 for name, size, etag in heads for offset in range(0, size, CHUNK)
                 if not downloaded(name, offset, min(offset+CHUNK, size)-1)]
        try:
            for count, future in enumerate(as_completed(tasks), 1):
                future.result()
                if count % 20 == 0:
                    print(f'Downloaded {count}/{len(tasks)} chunks', flush=True)
        finally:
            for handle in handles.values():
                os.close(handle)
    for name, size, _ in heads:
        target = directory / name
        compressed = directory / (name + '.download')
        temporary = target.with_suffix(target.suffix + '.tmp')
        os.truncate(compressed, size)
        try:
            with gzip.open(compressed, 'rb') as source, temporary.open('wb') as output:
                shutil.copyfileobj(source, output)
        except (OSError, EOFError, zlib.error):
            temporary.unlink(missing_ok=True)
            compressed.unlink(missing_ok=True)
            raise
        temporary.replace(target)
        compressed.unlink()
        print(f'Ready: {name}', flush=True)
    manifest = {name: (directory / name).stat().st_size for name in files}
    (root / 'tables-ready.json').write_text(json.dumps(manifest, sort_keys=True))


if __name__ == '__main__':
    prepare(Path(os.environ.get('NXN_ENGINE_ROOT', '/opt/nxn-engine')))
