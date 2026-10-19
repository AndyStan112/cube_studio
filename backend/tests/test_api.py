"""Live-stack integration tests. Set CUBE_API_URL to enable."""
import os
import uuid
import httpx
import pytest

BASE = os.getenv("CUBE_API_URL")
pytestmark = pytest.mark.skipif(not BASE, reason="Set CUBE_API_URL for live MongoDB/API integration")

def test_accounts_and_solve_ownership():
    with httpx.Client(base_url=BASE, timeout=20) as client:
        suffix = uuid.uuid4().hex
        account = {"name": "Integration test", "email": f"cube-{suffix}@example.com", "password": "test-password-123"}
        response = client.post('/auth/register', json=account)
        assert response.status_code == 201, response.text
        token = response.json()['token']
        headers = {"Authorization": f"Bearer {token}"}
        assert client.post('/auth/register', json=account).status_code == 409
        assert client.post('/auth/login', json={**account, "password": "wrong-password"}).status_code == 401
        login = client.post('/auth/login', json=account)
        assert login.status_code == 200
        assert client.get('/auth/me', headers=headers).json()['email'] == account['email']
        assert client.get('/solves').status_code == 401
        scramble = client.post('/scrambles').json()
        assert len(scramble['moves'].split()) == 25
        solve_data = {"scramble_id": scramble['id'], "time_ms": 24530, "penalty": "none"}
        assert client.post('/solves', json={**solve_data, "time_ms": -1}, headers=headers).status_code == 422
        assert client.post('/solves', json={**solve_data, "scramble_id": "invalid"}, headers=headers).status_code == 422
        response = client.post('/solves', json=solve_data, headers=headers)
        assert response.status_code == 201, response.text
        solve = response.json()
        assert solve['scramble'] == scramble['moves']
        assert client.get('/solves', headers=headers).json()[0]['id'] == solve['id']
        second = client.post('/auth/register', json={**account, "email": f"other-{suffix}@example.com"}).json()
        other = {"Authorization": f"Bearer {second['token']}"}
        assert client.get('/solves', headers=other).json() == []
        assert client.patch(f"/solves/{solve['id']}", json={"penalty": "+2"}, headers=other).status_code == 404
        assert client.delete(f"/solves/{solve['id']}", headers=other).status_code == 404
        assert client.patch(f"/solves/{solve['id']}", json={"penalty": "+2"}, headers=headers).status_code == 200
        assert client.get('/solves', headers=headers).json()[0]['penalty'] == '+2'
        assert client.delete(f"/solves/{solve['id']}", headers=headers).status_code == 204
        assert client.get('/solves', headers=headers).json() == []
        assert client.post('/auth/logout', headers=headers).status_code == 204
        assert client.get('/auth/me', headers=headers).status_code == 401
        assert len(client.get('/algorithms').json()) == 2
