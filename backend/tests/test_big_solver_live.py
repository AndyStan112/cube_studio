"""Full NxN engine/API verification; enabled with the real Compose stack."""
import importlib.util
import json
import os
from pathlib import Path
import time

import httpx
import pytest

BASE = os.getenv('CUBE_API_URL')
pytestmark = pytest.mark.skipif(not BASE, reason='Set CUBE_API_URL for live NxN integration')
ROOT = Path(__file__).parents[2]
FIXTURES = json.loads((ROOT / 'frontend/src/lib/fixtures/big-cubes.json').read_text())


@pytest.mark.parametrize('fixture', FIXTURES, ids=['4x4', '5x5'])
def test_arbitrary_state_solves_and_replays_with_independent_geometry(fixture):
    size, value = fixture['size'], fixture['facelets']
    request = {'schema_version': 1, 'puzzle': {'type': 'cube', 'size': size},
               'state': {'encoding': 'cube_facelets_v1', 'face_order': list('URFDLB'), 'value': value},
               'solver': {'metric': 'OBTM', 'objective': 'solution', 'method': 'reduction', 'constraints': []}}
    with httpx.Client(base_url=BASE, timeout=20) as client:
        response = client.post('/solver/jobs', json=request)
        assert response.status_code == 202, response.text
        id = response.json()['id']
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            response = client.get('/solver/jobs/' + id)
            response.raise_for_status()
            state = response.json()
            if state['status'] in {'complete', 'failed', 'timed_out', 'cancelled'}:
                break
            time.sleep(0.2)
        assert state['status'] == 'complete', state
        result = state['solution']
        assert result['verified'] and result['optimality'] == 'unproved'
        assert result['metric'] == 'OBTM'
        spec = importlib.util.spec_from_file_location('nxn_live_model', ROOT / 'solver/nxn/model.py')
        model = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(model)
        for move in result['notation']:
            value = model.apply(value, move, size)
        assert value == model.solved(size)
