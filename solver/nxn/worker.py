"""Private worker facade: native 3×3 search plus isolated NxN reduction jobs."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(os.environ.get('NXN_ENGINE_ROOT', '/opt/nxn-engine'))
NATIVE = os.environ.get('NATIVE_SOLVER_URL', 'http://127.0.0.1:8083')
TERMINAL = {'complete', 'optimal_proved', 'timed_out', 'cancelled', 'failed'}
active = None
native = None


def forward(method, path, data=None):
    request = Request(NATIVE + path, method=method, data=json.dumps(data).encode() if data is not None else None,
                      headers={'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=3) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


def tables_ready():
    try:
        manifest = json.loads((ROOT / 'tables-ready.json').read_text())
        return bool(manifest) and all((ROOT / 'lookup-tables' / name).stat().st_size == size for name, size in manifest.items())
    except (OSError, ValueError):
        return False


class BigJob:
    def __init__(self, data, size):
        self.id = data['id']
        self.cancel = threading.Event()
        self.state = {'status': 'searching', 'candidate': None, 'solution': None, 'progress': {'stage': 'reduction'}}
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self.run, args=(data, size), daemon=True)
        self.thread.start()

    def view(self):
        with self.lock:
            return dict(self.state)

    def run(self, data, size):
        process = None
        try:
            with tempfile.TemporaryDirectory(prefix='cube-nxn-') as directory:
                work = Path(directory)
                (work / 'lookup-tables').symlink_to(ROOT / 'lookup-tables', target_is_directory=True)
                (work / 'ida_search_via_graph').symlink_to(ROOT / 'ida_search_via_graph')
                process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('run.py'))], cwd=work,
                                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                           text=True, start_new_session=True)
                process.stdin.write(json.dumps({'facelets': data['facelets'], 'size': size}))
                process.stdin.close()
                process.stdin = None
                deadline = time.monotonic() + min(300000, max(1, int(data.get('budget_ms', 300000)))) / 1000
                while True:
                    try:
                        output, _ = process.communicate(timeout=0.1)
                        break
                    except subprocess.TimeoutExpired:
                        if self.cancel.is_set() or time.monotonic() >= deadline:
                            try:
                                os.killpg(process.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                            process.communicate()
                            with self.lock:
                                self.state['status'] = 'cancelled' if self.cancel.is_set() else 'timed_out'
                            return
                result = json.loads(output)
                with self.lock:
                    if self.cancel.is_set():
                        self.state['status'] = 'cancelled'
                    elif process.returncode or 'error' in result:
                        self.state.update(status='failed', error=result.get('error', 'Reduction solver failed.'))
                    else:
                        self.state.update(status='complete', solution=result, progress={'stage': 'verified'})
        except Exception:
            with self.lock:
                self.state.update(status='failed', error='Bigger-cube solver failed. Please retry.')
        finally:
            if process and process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *_):
        pass

    def handle_request(self):
        global active
        path = self.path
        method = self.command
        if path in ('/ready', '/health') and method == 'GET':
            code, native_state = forward('GET', '/ready')
            ready = code == 200 and tables_ready()
            return (200 if ready else 503), {'ready': ready, 'sizes': [3, 4, 5], 'native': native_state}
        if path == '/jobs' and method == 'POST':
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 8192:
                return 413, {'error': 'input_too_large'}
            data = json.loads(self.rfile.read(length))
            value = data.get('facelets', '')
            if not isinstance(value, str):
                return 422, {'error': 'invalid_input'}
            size = {54: 3, 96: 4, 150: 5}.get(len(value))
            if not size or not isinstance(data.get('id'), str) or not 1 <= len(data['id']) <= 128:
                return 422, {'error': 'invalid_input'}
            if any(value.count(face) != size*size for face in 'URFDLB'):
                return 422, {'error': 'invalid_state'}
            if active:
                state = active.view() if isinstance(active, BigJob) else forward('GET', '/jobs/' + active)[1]
                if state.get('status') not in TERMINAL:
                    return 429, {'error': 'worker_busy'}
            if size == 3:
                code, body = forward('POST', path, data)
                if code == 202:
                    active = data['id']
                return code, body
            if not tables_ready():
                return 503, {'error': 'NxN lookup tables unavailable; rebuild the solver image.'}
            active = BigJob(data, size)
            return 202, {'id': data['id']}
        if path.startswith('/jobs/'):
            job_id = path[len('/jobs/'):]
            if isinstance(active, BigJob):
                if job_id != active.id:
                    return 404, {'error': 'not_found'}
                if method == 'DELETE':
                    active.cancel.set()
                    return 202, {'status': 'cancelling'}
                if method == 'GET':
                    return 200, active.view()
            else:
                return forward(method, path)
        return 404, {'error': 'not_found'}

    def respond(self):
        try:
            code, body = self.handle_request()
        except (ValueError, TypeError, KeyError):
            code, body = 422, {'error': 'invalid_input'}
        except Exception:
            code, body = 503, {'error': 'worker_unavailable'}
        encoded = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    do_GET = do_POST = do_DELETE = respond


def main():
    global native
    native = subprocess.Popen(['solver-worker'], env={**os.environ, 'SOLVER_LISTEN_ADDR': '127.0.0.1:8083'})
    server = HTTPServer(('0.0.0.0', 8081), Handler)
    server.timeout = 0.2
    stopping = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopping.set())
    try:
        while not stopping.is_set() and native.poll() is None:
            server.handle_request()
    finally:
        server.server_close()
        if isinstance(active, BigJob):
            active.cancel.set()
            active.thread.join(timeout=3)
        native.terminate()
        try:
            native.wait(timeout=5)
        except subprocess.TimeoutExpired:
            native.kill()
            native.wait()


if __name__ == '__main__':
    main()
