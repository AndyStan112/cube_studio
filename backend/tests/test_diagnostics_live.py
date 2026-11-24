"""The release integration job runs this against real MongoDB and the API."""
import io
import json
import os
import zipfile
import httpx
import pytest

BASE = os.getenv('CUBE_API_URL')
pytestmark = pytest.mark.skipif(not BASE, reason='Set CUBE_API_URL for diagnostics integration')


def test_real_diagnostic_upload():
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as archive:
        archive.writestr('report.json', json.dumps({'schema':1,'build':{'version':'ci-integration'},'events':[], 'scans':[]}))
        archive.writestr('scans/test/live.webm', b'test-video-payload')
    with httpx.Client(base_url=BASE, timeout=20) as client:
        response = client.post('/diagnostics', content=data.getvalue(), headers={'Content-Type':'application/zip','X-Diagnostic-Client':'ci-diagnostics-integration'})
        assert response.status_code == 201, response.text
        assert len(response.json()['id']) == 24
        assert response.json()['bytes'] == len(data.getvalue())
        assert client.get('/diagnostics/' + response.json()['id']).status_code == 404
        assert client.post('/diagnostics', content=b'invalid', headers={'Content-Type':'application/zip','X-Diagnostic-Client':'ci-diagnostics-integration'}).status_code == 422
