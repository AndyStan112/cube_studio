from fastapi.testclient import TestClient

from app.auth import Identity, get_auth_provider
from app.main import app


def test_mock_auth_has_no_password_or_registration_flow():
    client = TestClient(app)
    users = client.get('/api/auth/users').json()
    assert [user['name'] for user in users] == ['Andy', 'Alex', 'Sam']
    for user in users:
        response = client.get('/api/auth/me', headers={'Authorization': f"Bearer mock:{user['id']}"})
        assert response.json() == user
    for token in (None, 'mock:unknown', 'legacy-session', 'demo-andy'):
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        assert client.get('/api/auth/me', headers=headers).status_code == 401
    for route in ('register', 'login', 'logout'):
        assert client.post(f'/api/auth/{route}', json={}).status_code == 404


def test_auth_provider_can_be_replaced_without_changing_routes():
    class ExternalProvider:
        async def authenticate(self, token):
            return Identity('external-subject', 'External user', 'external@example.com') if token == 'verified-token' else None

    app.dependency_overrides[get_auth_provider] = lambda: ExternalProvider()
    try:
        client = TestClient(app)
        response = client.get('/api/auth/me', headers={'Authorization': 'Bearer verified-token'})
        assert response.json()['id'] == 'external-subject'
        assert client.get('/api/auth/me', headers={'Authorization': 'Bearer mock:demo-andy'}).status_code == 401
    finally:
        app.dependency_overrides.pop(get_auth_provider)
