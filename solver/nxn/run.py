"""One cancellable process per NxN solve; stdout is a single verified JSON result."""
import contextlib
import importlib
import json
import os
from pathlib import Path
import re
import sys

from model import solution
from beginner import plan


def solve(value, size, method=None):
    if method == 'beginner':
        if size != 3:
            raise ValueError('Beginner method requires a 3×3 state')
        return plan(value)
    if method == 'meyer':
        if size != 4:
            raise ValueError('Meyer method requires a 4×4 state')
        from meyer import plan_meyer
        return plan_meyer(value)
    if method == 'reduction_beginner':
        if size == 5:
            from reduction import plan_reduction
            return plan_reduction(value)
        if size == 4:
            # The 4×4 UI defaults to Meyer; keep classic reduction available.
            from reduction4 import plan_reduction4
            return plan_reduction4(value)
        raise ValueError('Reduction requires a 4×4 or 5×5 state')
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
        if data['size'] not in (3, 4, 5):
            raise ValueError('Unsupported cube size')
        print(json.dumps(solve(data['facelets'], data['size'], data.get('method'))), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
        sys.exit(1)
