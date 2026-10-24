"""Method goals, action invariants, parity and the HTTP method boundary."""
from pathlib import Path
import random
import sys
import time

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).parents[2] / 'solver/nxn'))
from beginner import plan, EDGES, CORNERS, HOME
from meyer import plan_meyer, pieces, cycles
from reduction import plan_reduction, FLIP_WINGS
from reduction4 import plan_reduction4
from model import solved, apply, geometry
from teaching import reduced, skeleton
from app.solver.schemas import Request, validate_request
from test_solver import client, payload, Worker

BEGINNER_IDS = ['white-cross', 'white-corners', 'middle-edges', 'yellow-cross',
                'yellow-edge-positions', 'yellow-corner-positions', 'yellow-corner-twists']


def replay(value, moves, size):
    for move in moves:
        value = apply(value, move, size)
    return value


def fixed(value, slots):
    return all(value[i] == HOME[i] for slot in slots for i in slot)


def verify_beginner_stages(value, result, size):
    stages = result['stages'][-7:]
    assert [s['id'] for s in stages] == BEGINNER_IDS
    for index, stage in enumerate(stages):
        end = replay(value, result['notation'][:stage['end']], size)
        small = end if size == 3 else skeleton(end, size)
        if index >= 0:
            assert fixed(small, EDGES[4:8])
        if index >= 1:
            assert fixed(small, CORNERS[4:])
        if index >= 2:
            assert fixed(small, EDGES[8:])
        if index >= 3:
            assert all(small[i] == 'U' for i in (1, 3, 5, 7))
        if index >= 4:
            assert fixed(small, EDGES)
        if index >= 5:
            assert all(set(small[i] for i in slot) == set(HOME[i] for i in slot) for slot in CORNERS)
        if index == 6:
            assert small == HOME
        if size != 3:
            assert reduced(end, size)
    assert replay(value, result['notation'], size) == solved(size)
    for blocks in [result['stages'], result['chunks']]:
        offset = 0
        for block in blocks:
            assert block['start'] == offset
            assert block['end'] >= offset
            offset = block['end']
        assert offset == len(result['notation'])
    assert result['optimality'] == 'unproved'


@pytest.mark.parametrize('size,planner', [(3, plan), (4, plan_meyer), (4, plan_reduction4), (5, plan_reduction)])
def test_random_solves_preserve_stage_goals(size, planner):
    randomizer = random.Random(20261024+size)
    for _ in range(12):
        scramble = [randomizer.choice(['', '2'] if size > 3 else ['']) + randomizer.choice('URFDLB') + randomizer.choice(['', "'", '2']) for _ in range(35)]
        value = replay(solved(size), scramble, size)
        result = planner(value)
        verify_beginner_stages(value, result, size)
        if planner == plan_meyer:
            assert [s['id'] for s in result['stages'][:4]] == ['meyer-opposite-centers', 'meyer-left-block', 'meyer-remaining-centers', 'meyer-remaining-wings']
            # Check block restoration at every complete action, through reduction.
            start, end = result['stages'][1]['end'], result['stages'][3]['end']
            block_stickers = [i for i, (position, normal) in enumerate(geometry(4))
                              if position[0] == -3 and position[1] <= 1]
            for chunk in result['chunks']:
                if start <= chunk['end'] <= end:
                    state = replay(value, result['notation'][:chunk['end']], 4)
                    assert all(state[i] == solved(4)[i] for i in block_stickers)
        if size == 5:
            centers_end = result['stages'][2]['end']
            edges_end = result['stages'][3]['end']
            center_indices = [j for slot in pieces(5)[1] for j in slot]
            for chunk in result['chunks']:
                if centers_end <= chunk['end'] <= edges_end:
                    state = replay(value, result['notation'][:chunk['end']], 5)
                    assert all(state[i] == solved(5)[i] for i in center_indices)


@pytest.mark.parametrize('size,planner', [(3, plan), (4, plan_meyer), (4, plan_reduction4), (5, plan_reduction)])
def test_solved_stages_are_explicitly_skipped(size, planner):
    result = planner(solved(size))
    assert result['notation'] == []
    assert all(s['skipped'] and s['verified'] and s['start'] == s['end'] == 0 for s in result['stages'])


@pytest.mark.parametrize('size,planner', [(4, plan_meyer), (4, plan_reduction4), (5, plan_reduction)])
def test_wing_parity_and_edge_swap_parity_are_big_cube_steps(size, planner):
    for moves in [FLIP_WINGS, '2R2 U2 2R2 Uw2 2R2 Uw2'.split()] if size == 4 else [FLIP_WINGS]:
        value = replay(solved(size), moves, size)
        result = planner(value)
        verify_beginner_stages(value, result, size)
        if moves == FLIP_WINGS:
            assert any('parity' in c['name'].lower() for c in result['chunks'])
        # A paired-edge swap may instead be resolved by the named wing cycles.
        # No 3×3 stage is allowed to receive an impossible parity state.


def test_named_pure_cycles_cover_both_center_orbits_and_wings():
    assert len(cycles(1, 4)) == 4048
    assert len(cycles(1, 5)) == 8096
    for size in (4, 5):
        for kind in (1, 2):
            for sparse, core, setup in cycles(kind, size):
                assert len(sparse) == kind*3
                assert all(len({slot for slot, indices in enumerate(pieces(size)[kind]) if i in indices}) == 1 for i, _ in sparse)
                assert core


@pytest.mark.parametrize('size,method', [(3, 'beginner'), (4, 'meyer'), (4, 'reduction_beginner'), (5, 'reduction_beginner')])
def test_method_boundary_and_worker_routing(monkeypatch, size, method):
    data = payload(solved(size))
    data['puzzle']['size'] = size
    data['solver'].update(method=method, metric='HTM' if size == 3 else 'OBTM', objective='solution')
    if size > 3:
        data['solver']['post_reduction_method'] = 'beginner'
    validate_request(Request.model_validate(data))
    worker = Worker()
    c, _ = client(monkeypatch, worker)
    with c:
        response = c.post('/api/solver/jobs', json=data)
        assert response.status_code == 202
        assert response.json()['method'] == method
        for _ in range(50):
            if worker.calls:
                break
            time.sleep(.01)
        submitted = next(d for m, p, d in worker.calls if m == 'POST')
        assert submitted['method'] == method
        assert submitted['post_reduction_method'] == ('beginner' if size > 3 else None)
    if size > 3:
        data['solver']['post_reduction_method'] = 'cfop'
        with pytest.raises(HTTPException):
            validate_request(Request.model_validate(data))


def test_meyer_is_not_available_on_other_sizes():
    for size in (3, 5):
        data = payload(solved(size))
        data['puzzle']['size'] = size
        data['solver'].update(method='meyer', metric='HTM' if size == 3 else 'OBTM', objective='solution')
        with pytest.raises(HTTPException):
            validate_request(Request.model_validate(data))


def test_guided_job_process_completes_and_replays_without_nxn_tables():
    import importlib.util
    worker_path = Path(__file__).parents[2] / 'solver/nxn/worker.py'
    spec = importlib.util.spec_from_file_location('teaching_worker', worker_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    randomizer = random.Random(8)
    for size, method in [(3, 'beginner'), (4, 'meyer'), (5, 'reduction_beginner')]:
        value = replay(solved(size), [randomizer.choice('URFDLB') for _ in range(15)], size)
        job = module.BigJob({'id': 'method-process', 'facelets': value, 'method': method, 'budget_ms': 10000}, size)
        job.thread.join(timeout=12)
        assert not job.thread.is_alive()
        state = job.view()
        assert state['status'] == 'complete', state
        verify_beginner_stages(value, state['solution'], size)


def test_guided_job_process_cancels_and_observes_deadline():
    import importlib.util
    spec = importlib.util.spec_from_file_location('teaching_cancel_worker', Path(__file__).parents[2] / 'solver/nxn/worker.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    value = replay(solved(5), ['2R', 'U', '2F', 'B', '2U'], 5)
    for cancel in (False, True):
        job = module.BigJob({'id': 'cancel-test', 'facelets': value, 'method': 'reduction_beginner', 'budget_ms': 10000 if cancel else 1}, 5)
        if cancel:
            job.cancel.set()
        job.thread.join(timeout=3)
        assert not job.thread.is_alive()
        assert job.view()['status'] == ('cancelled' if cancel else 'timed_out')


def test_uniform_legal_3x3_piece_states():
    randomizer = random.Random(1007)
    for _ in range(100):
        state = list(HOME)
        corner_order = randomizer.sample(range(8), 8)
        edge_order = randomizer.sample(range(12), 12)
        def parity(order):
            return sum(a > b for i, a in enumerate(order) for b in order[i+1:]) % 2
        if parity(corner_order) != parity(edge_order):
            edge_order[:2] = edge_order[1::-1]
        for slots, order, modulus in [(CORNERS, corner_order, 3), (EDGES, edge_order, 2)]:
            orientations = [randomizer.randrange(modulus) for _ in range(len(slots)-1)]
            orientations.append(-sum(orientations) % modulus)
            for slot, identity, orientation in zip(slots, order, orientations):
                for n, home_index in enumerate(slots[identity]):
                    state[slot[(n+orientation) % modulus]] = HOME[home_index]
        value = ''.join(state)
        verify_beginner_stages(value, plan(value), 3)
