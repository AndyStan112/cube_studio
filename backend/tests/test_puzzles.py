from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from bson import ObjectId
from fastapi.testclient import TestClient
import pytest

from app.domain import scramble, SCRAMBLE_LENGTHS
from app.main import app, serialize_solve


@pytest.mark.parametrize('event', ['333', '444', '555'])
def test_scrambles_use_event_length_and_valid_layer_moves(event):
    import re
    axes = {face: axis for axis, faces in enumerate(['RL', 'UD', 'FB']) for face in faces}
    for _ in range(10):
        moves = scramble(event=event).split()
        assert len(moves) == SCRAMBLE_LENGTHS[event]
        for i, move in enumerate(moves):
            assert re.fullmatch(r"[RLUDFB]w?(?:2|')?", move)
            if event == '333':
                assert 'w' not in move
            if i:
                assert axes[move[0]] != axes[moves[i - 1][0]]


def test_scramble_api_and_save_inherit_puzzle_from_scramble(monkeypatch):
    scramble_id, solve_id = ObjectId(), ObjectId()
    scrambles = SimpleNamespace(insert_one=AsyncMock(return_value=SimpleNamespace(inserted_id=scramble_id)), find_one=AsyncMock())
    solves = SimpleNamespace(insert_one=AsyncMock(return_value=SimpleNamespace(inserted_id=solve_id)))
    monkeypatch.setattr(app.state, 'db', SimpleNamespace(scrambles=scrambles, solves=solves), raising=False)
    client = TestClient(app)
    headers = {'Authorization': 'Bearer mock:demo-andy'}
    for event in ['333', '444', '555']:
        response = client.post('/api/scrambles', json={'event': event})
        assert response.status_code == 201
        assert response.json()['event'] == event
        scramble_doc = scrambles.insert_one.call_args.args[0]
        assert len(scramble_doc['moves'].split()) == SCRAMBLE_LENGTHS[event]
        scrambles.find_one.return_value = {'_id': scramble_id, **scramble_doc}
        saved = client.post('/api/solves', headers=headers, json={'scramble_id': str(scramble_id), 'time_ms': 60000, 'event': '333'})
        assert saved.status_code == 201
        assert saved.json()['event'] == event
        assert solves.insert_one.call_args.args[0]['event'] == event
    assert client.post('/api/scrambles').json()['event'] == '333'
    assert client.post('/api/scrambles', json={'event': '666'}).status_code == 422
    assert client.post('/api/solves', json={'scramble_id': str(scramble_id), 'time_ms': 60000}).status_code == 401


def test_history_queries_are_user_and_event_scoped_with_legacy_default(monkeypatch):
    cursor = Mock()
    cursor.sort.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    collection = SimpleNamespace(find=Mock(return_value=cursor))
    monkeypatch.setattr(app.state, 'db', SimpleNamespace(solves=collection), raising=False)
    client = TestClient(app)
    headers = {'Authorization': 'Bearer mock:demo-andy'}
    assert client.get('/api/solves?event=444', headers=headers).json() == []
    assert collection.find.call_args.args[0] == {'user_id': 'demo-andy', 'event': '444'}
    client.get('/api/solves?event=555', headers=headers)
    assert collection.find.call_args.args[0]['event'] == '555'
    client.get('/api/solves', headers=headers)
    assert collection.find.call_args.args[0] == {'user_id': 'demo-andy', '$or': [{'event': '333'}, {'event': {'$exists': False}}]}
    assert client.get('/api/solves?event=666', headers=headers).status_code == 422
    legacy = {'_id': ObjectId(), 'scramble': 'R U', 'time_ms': 1000, 'penalty': 'none', 'created_at': datetime.now(timezone.utc)}
    assert serialize_solve(legacy)['event'] == '333'
