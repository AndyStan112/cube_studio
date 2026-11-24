import asyncio
import io
import json
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from bson import ObjectId
from fastapi import FastAPI, HTTPException
from app import diagnostics


def archive(report=None, extra=None):
    target = io.BytesIO()
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_STORED) as output:
        output.writestr('report.json', json.dumps(report or {'schema': 1, 'build': {'version': 'test'}, 'events': []}))
        for name, data in (extra or {}).items():
            output.writestr(name, data)
    return target.getvalue()


def test_valid_archive_retains_frames_and_media():
    data = archive(extra={'scans/test/live.webm': b'video', 'scans/test/frame.jpg': b'frame'})
    assert diagnostics.validate_archive(io.BytesIO(data))['build']['version'] == 'test'


@pytest.mark.parametrize('data', [b'not a zip', archive({'schema': 2}), archive(extra={'../file': b'bad'}), archive(extra={'/absolute': b'bad'})])
def test_rejects_malformed_or_unsafe_archives(data):
    with pytest.raises(HTTPException) as raised:
        diagnostics.validate_archive(io.BytesIO(data))
    assert raised.value.status_code == 422


def test_rejects_archive_expansion(monkeypatch):
    monkeypatch.setattr(diagnostics, 'MAX_UPLOAD', 400)
    with pytest.raises(HTTPException):
        diagnostics.validate_archive(io.BytesIO(archive(extra={'huge': b'X' * 500})))


def setup_api(monkeypatch, quota=True, count=1):
    app = FastAPI();app.include_router(diagnostics.router)
    db = SimpleNamespace(
        diagnostic_requests=SimpleNamespace(find_one_and_update=AsyncMock(return_value={'count': count})),
        diagnostic_quota=SimpleNamespace(find_one_and_update=AsyncMock(return_value={'bytes': 0} if quota else None), update_one=AsyncMock()),
    )
    app.state.db = db
    bucket = SimpleNamespace(upload_from_stream=AsyncMock(return_value=ObjectId()))
    monkeypatch.setattr(diagnostics, 'AsyncGridFSBucket', lambda *_args, **_kwargs: bucket)
    return app, db, bucket


def post(app, data, headers=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            return await client.post('/api/diagnostics', content=data, headers=headers or {'Content-Type':'application/zip','X-Diagnostic-Client':'installation-test-001'})
    return asyncio.run(run())


def test_upload_is_guest_accessible_and_private(monkeypatch):
    app, db, bucket = setup_api(monkeypatch)
    data = archive()
    response = post(app, data)
    assert response.status_code == 201, response.text
    assert ObjectId.is_valid(response.json()['id'])
    assert response.json()['bytes'] == len(data)
    assert response.json()['retention_days'] == 30
    assert bucket.upload_from_stream.await_count == 1
    assert db.diagnostic_quota.update_one.await_args.args[1]['$inc']['bytes'] == len(data) - diagnostics.MAX_UPLOAD
    async def no_public_reads():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.get('/api/diagnostics')).status_code == 405
            assert (await client.get('/api/diagnostics/' + response.json()['id'])).status_code == 404
    asyncio.run(no_public_reads())


def test_failed_validation_releases_reserved_space(monkeypatch):
    app, db, bucket = setup_api(monkeypatch)
    assert post(app, b'invalid').status_code == 422
    assert bucket.upload_from_stream.await_count == 0
    assert db.diagnostic_quota.update_one.await_args.args[1]['$inc']['bytes'] == -diagnostics.MAX_UPLOAD


def test_storage_full_is_retryable(monkeypatch):
    app, _db, bucket = setup_api(monkeypatch, quota=False)
    assert post(app, archive()).status_code == 503
    assert bucket.upload_from_stream.await_count == 0


def test_daily_limit_is_enforced(monkeypatch):
    app, _db, bucket = setup_api(monkeypatch, count=11)
    assert post(app, archive()).status_code == 429
    assert bucket.upload_from_stream.await_count == 0


def test_invalid_content_and_identity_are_rejected_before_reservation(monkeypatch):
    app, db, _bucket = setup_api(monkeypatch)
    assert post(app, archive(), {'Content-Type':'text/plain'}).status_code == 415
    assert post(app, archive(), {'Content-Type':'application/zip'}).status_code == 422
    assert db.diagnostic_quota.find_one_and_update.await_count == 0


def test_claimed_oversize_is_rejected(monkeypatch):
    app, db, _bucket = setup_api(monkeypatch)
    assert post(app, archive(), {'Content-Type':'application/zip','X-Diagnostic-Client':'installation-test-001','Content-Length':str(diagnostics.MAX_UPLOAD + 1)}).status_code == 413
    assert db.diagnostic_quota.find_one_and_update.await_count == 0


def test_retention_deletes_expired_files_and_releases_bytes(monkeypatch):
    expired = {'_id': ObjectId(), 'length': 1234}
    async def documents():
        yield expired
    quota = SimpleNamespace(update_one=AsyncMock())
    files = SimpleNamespace(find=lambda *_args: documents())
    class Database:
        diagnostic_quota = quota
        def __getitem__(self, _name): return files
    bucket = SimpleNamespace(delete=AsyncMock())
    monkeypatch.setattr(diagnostics, 'AsyncGridFSBucket', lambda *_args, **_kwargs: bucket)
    asyncio.run(diagnostics.expire_reports(Database()))
    bucket.delete.assert_awaited_once_with(expired['_id'])
    assert quota.update_one.await_args.args[1] == {'$inc': {'bytes': -1234}}
