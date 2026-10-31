"""Training metadata and reset ownership, without a live database."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from bson import ObjectId
from fastapi.testclient import TestClient
from app.main import app


def test_solve_metadata_round_trip(monkeypatch):
    scramble_id, solve_id = ObjectId(), ObjectId()
    db = SimpleNamespace(
        scrambles=SimpleNamespace(find_one=AsyncMock(return_value={"moves": "R U", "event": "444"})),
        solves=SimpleNamespace(insert_one=AsyncMock(return_value=SimpleNamespace(inserted_id=solve_id))),
    )
    monkeypatch.setattr(app.state, 'db', db, raising=False)
    client = TestClient(app)
    metadata = {"session_id": "session-a", "cube": "cube-1", "cube_name": "My 4x4", "method": "Meyer", "inspection_ms": 16000}
    response = client.post('/api/solves', headers={"Authorization": "Bearer mock:demo-andy"}, json={
        "scramble_id": str(scramble_id), "time_ms": 42000, "penalty": "+2", **metadata,
    })
    assert response.status_code == 201, response.text
    assert all(response.json()[key] == value for key, value in metadata.items())
    assert response.json()['event'] == '444'
    saved = db.solves.insert_one.call_args.args[0]
    assert saved['user_id'] == 'demo-andy'
    assert saved['session_id'] == 'session-a'
    assert isinstance(saved['created_at'], datetime)
    assert saved['created_at'].tzinfo == timezone.utc

