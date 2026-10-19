"""Live-stack integration tests. Set CUBE_API_URL to enable."""
import os
import httpx
import pytest

BASE = os.getenv("CUBE_API_URL")
pytestmark = pytest.mark.skipif(not BASE, reason="Set CUBE_API_URL for live MongoDB/API integration")

def test_accounts_and_solve_ownership():
    with httpx.Client(base_url=BASE, timeout=20) as client:
        users = client.get('/auth/users').json()
        assert len(users) == 3
        account, second = users[:2]
        headers = {"Authorization": f"Bearer mock:{account['id']}"}
        other = {"Authorization": f"Bearer mock:{second['id']}"}
        assert client.post('/auth/register', json={}).status_code == 404
        assert client.post('/auth/login', json={}).status_code == 404
        assert client.get('/auth/me', headers={"Authorization": "Bearer mock:unknown"}).status_code == 401
        assert client.get('/auth/me', headers={"Authorization": "Bearer old-session-token"}).status_code == 401
        assert client.get('/auth/me', headers=headers).json() == account
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
        assert all(item['id'] != solve['id'] for item in client.get('/solves', headers=other).json())
        assert client.patch(f"/solves/{solve['id']}", json={"penalty": "+2"}, headers=other).status_code == 404
        assert client.delete(f"/solves/{solve['id']}", headers=other).status_code == 404
        assert client.patch(f"/solves/{solve['id']}", json={"penalty": "+2"}, headers=headers).status_code == 200
        assert client.get('/solves', headers=headers).json()[0]['penalty'] == '+2'
        assert client.delete(f"/solves/{solve['id']}", headers=headers).status_code == 204
        assert all(item['id'] != solve['id'] for item in client.get('/solves', headers=headers).json())
        assert client.get('/auth/me').status_code == 401
        catalog = client.get('/algorithm-catalog').json()
        assert len(catalog['sets']) == 3
        assert len(catalog['algorithms']) == 4
        sune = next(item for item in catalog['algorithms'] if item['id'] == 'sune')
        assert '2-look-cmll' in sune['set_ids']
        j_perm = next(item for item in catalog['algorithms'] if item['id'] == 'j-perm')
        assert {item['id'] for item in j_perm['variations']} == {'normal', 'lefty', 'righty'}
        legacy = client.get('/algorithms').json()
        assert len(legacy) == 4
        assert all(item['set'] and item['moves'] for item in legacy)
