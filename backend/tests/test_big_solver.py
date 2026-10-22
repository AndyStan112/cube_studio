import importlib.util
import json
from pathlib import Path
import time

from fastapi import HTTPException
import pytest

from app.solver.schemas import Request, validate_request
from test_solver import client

FIXTURES = json.loads((Path(__file__).parents[2] / 'frontend/src/lib/fixtures/big-cubes.json').read_text())


def payload(size, value):
    return {'schema_version': 1, 'puzzle': {'type': 'cube', 'size': size},
            'state': {'encoding': 'cube_facelets_v1', 'face_order': list('URFDLB'), 'value': value},
            'solver': {'metric': 'OBTM', 'objective': 'solution', 'method': 'reduction', 'constraints': []}}


@pytest.mark.parametrize('fixture', FIXTURES, ids=['4x4', '5x5'])
def test_big_cube_boundary_accepts_generated_states_and_rejects_invalid(fixture):
    data = payload(fixture['size'], fixture['facelets'])
    validate_request(Request.model_validate(data))
    data['solver']['objective'] = 'optimal'
    with pytest.raises(HTTPException) as error:
        validate_request(Request.model_validate(data))
    assert error.value.detail['code'] == 'unsupported_capability'
    data['solver']['objective'] = 'solution'
    data['state']['value'] = 'U' * len(fixture['facelets'])
    with pytest.raises(HTTPException) as error:
        validate_request(Request.model_validate(data))
    assert error.value.detail['code'] == 'invalid_state'


def model():
    spec = importlib.util.spec_from_file_location('nxn_model', Path(__file__).parents[2] / 'solver/nxn/model.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_independent_verification_handles_rotations_and_rejects_false_solution():
    engine = model()
    for fixture in FIXTURES:
        size, state = fixture['size'], fixture['facelets']
        inverse = [m if m.endswith('2') else m[:-1] if m.endswith("'") else m + "'" for m in reversed(fixture['moves'])]
        result = engine.solution(state, [*inverse, 'x'], size)
        end = state
        for move in result['notation']:
            end = engine.apply(end, move, size)
        assert end == engine.solved(size)
        assert result['metric'] == 'OBTM'
        assert result['move_count'] == len(inverse)
        with pytest.raises(ValueError):
            engine.solution(state, ['U'], size)


def test_big_job_completes_without_claiming_optimality(monkeypatch):
    result = {'notation': [], 'moves': [], 'move_count': 0, 'metric': 'OBTM', 'verified': True, 'optimality': 'unproved'}
    class Worker:
        async def request(self, method, path, data=None):
            if method == 'GET':
                return {'status': 'complete', 'candidate': None, 'solution': result, 'progress': {'stage': 'verified'}}
            return {}
    c, _ = client(monkeypatch, Worker())
    with c:
        id = c.post('/api/solver/jobs', json=payload(4, ''.join(f * 16 for f in 'URFDLB'))).json()['id']
        for _ in range(30):
            state = c.get('/api/solver/jobs/' + id).json()
            if state['status'] == 'complete':
                break
            time.sleep(0.01)
        assert state['status'] == 'complete'
        assert state['puzzle_size'] == 4
        assert state['solution']['optimality'] == 'unproved'
        assert 'event: complete' in c.get('/api/solver/jobs/' + id + '/events').text

@pytest.mark.parametrize('size', [4, 5])
def test_single_flipped_wing_is_not_a_valid_big_cube(size):
    value = list(''.join(f * size * size for f in 'URFDLB'))
    upper = (size - 1) * size + 1
    front = 2 * size * size + 1
    value[upper], value[front] = value[front], value[upper]
    with pytest.raises(HTTPException) as error:
        validate_request(Request.model_validate(payload(size, ''.join(value))))
    assert error.value.detail['code'] == 'invalid_state'
