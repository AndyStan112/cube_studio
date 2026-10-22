from fastapi.testclient import TestClient

from app.main import app


def test_parity_catalog_and_legacy_client_compatibility():
    client = TestClient(app)
    response = client.get('/api/algorithm-catalog')
    assert response.status_code == 200
    catalog = response.json()
    sets = {item['id']: item for item in catalog['sets']}
    parity = {item['id']: item for item in catalog['algorithms'] if item['puzzle_size'] > 3}
    assert set(parity) == {'4x4-oll-parity', '4x4-pll-parity', '5x5-edge-parity'}
    for algorithm in parity.values():
        for membership in algorithm['memberships']:
            assert sets[membership['set_id']]['puzzle_size'] == algorithm['puzzle_size']
        assert algorithm['set_ids'] == [membership['set_id'] for membership in algorithm['memberships']]
        assert algorithm['variations'][0]['moves']
    legacy = client.get('/api/algorithms').json()
    assert {item['id'] for item in legacy} == {'sune', 'reverse-sune', 'j-perm', 't-perm'}
    assert all(item['set'] and item['moves'] for item in legacy)
