"""One cancellable process per NxN solve; stdout is a single verified JSON result."""
import contextlib
import importlib
import json
import os
from pathlib import Path
import re
import sys

from model import solution


def solve(value, size):
    root = Path(os.environ.get('NXN_ENGINE_ROOT', '/opt/nxn-engine'))
    sys.path.insert(0, str(root))
    module = importlib.import_module(f'rubikscubennnsolver.RubiksCube{size}{size}{size}')
    lookup = importlib.import_module('rubikscubennnsolver.LookupTable')
    graph = importlib.import_module('rubikscubennnsolver.LookupTableIDAViaGraph')
    def require_table(filename):
        if not Path(filename).is_file():
            raise RuntimeError('Solver lookup tables are missing; rebuild the solver image.')
    lookup.download_file_if_needed = require_table
    graph.download_file_if_needed = require_table
    with contextlib.redirect_stdout(sys.stderr):
        cube = getattr(module, f'RubiksCube{size}{size}{size}')(value, 'URFDLB')
        cube.sanity_check()
        cube.solve()
        # Upstream numeric prefixes describe blocks, whereas our 2R means one inner slice.
        moves = [re.sub(r'^([2-5])([URFDLB])(?!w)', r'\1\2w', move)
                 for move in (m[:-1] if m.endswith("2'") else m for m in cube.solution) if not move.startswith('COMMENT')]
    return solution(value, moves, size)


if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        if data['size'] not in (4, 5):
            raise ValueError('Unsupported cube size')
        print(json.dumps(solve(data['facelets'], data['size'])), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
        sys.exit(1)
