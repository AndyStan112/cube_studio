"""Private diagnostic archives. Ingestion is public; retrieval requires server access."""
import asyncio
import hashlib
import json
import logging
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from gridfs import AsyncGridFSBucket
from pymongo import ReturnDocument

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])
MAX_UPLOAD = 64 * 1024 * 1024
MAX_STORAGE = 1024 * 1024 * 1024
RETENTION_DAYS = 30
BUCKET = "diagnostic_archives"


def validate_archive(file):
    """Inspect without extracting. Bound expanded sizes as well as wire size."""
    try:
        with zipfile.ZipFile(file) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if not entries or len(entries) > 256 or len(set(names)) != len(names):
                raise ValueError("Invalid diagnostic archive entries")
            if "report.json" not in names or any(
                name.startswith("/") or ".." in name.split("/") or "\\" in name
                for name in names
            ):
                raise ValueError("Invalid diagnostic archive paths")
            if sum(entry.file_size for entry in entries) > MAX_UPLOAD:
                raise ValueError("Diagnostic archive expands beyond 64 MB")
            report_entry = archive.getinfo("report.json")
            if report_entry.file_size > 8 * 1024 * 1024:
                raise ValueError("Diagnostic log is too large")
            report = json.loads(archive.read(report_entry))
            if not isinstance(report, dict) or report.get("schema") != 1:
                raise ValueError("Unsupported diagnostic report format")
            if not isinstance(report.get("build"), dict) or not isinstance(report.get("events"), list):
                raise ValueError("Missing diagnostic build information or events")
            # Verify checksums through bounded streaming, including media members.
            for entry in entries:
                with archive.open(entry) as member:
                    while member.read(256 * 1024):
                        pass
            return report
    except (zipfile.BadZipFile, RuntimeError, KeyError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        raise HTTPException(422, str(error)[:180]) from error


async def expire_reports(db):
    files = db[f"{BUCKET}.files"]
    bucket = AsyncGridFSBucket(db, bucket_name=BUCKET)
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    async for file in files.find({"uploadDate": {"$lt": cutoff}}, {"_id": 1, "length": 1}):
        await bucket.delete(file["_id"])
        await db.diagnostic_quota.update_one({"_id": "storage"}, {"$inc": {"bytes": -file["length"]}})


async def cleanup(db):
    await expire_reports(db)
    # Startup reconciliation also releases reservations left by an interrupted pod.
    total = 0
    async for file in db[f"{BUCKET}.files"].find({}, {"length": 1}):
        total += file["length"]
    await db.diagnostic_quota.update_one({"_id": "storage"}, {"$set": {"bytes": total}}, upsert=True)


async def initialize(db):
    await db[f"{BUCKET}.files"].create_index("uploadDate")
    await db.diagnostic_requests.create_index("expires_at", expireAfterSeconds=0)
    await cleanup(db)


async def retention_loop(db):
    while True:
        await asyncio.sleep(3600)
        try:
            await expire_reports(db)
        except Exception:
            logging.getLogger(__name__).exception("Diagnostic retention cleanup failed")


@router.post("", status_code=201)
async def upload(request: Request):
    if request.headers.get("content-type", "").split(";")[0] != "application/zip":
        raise HTTPException(415, "Send a diagnostic ZIP archive")
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_UPLOAD):
        raise HTTPException(413, "Diagnostics must be smaller than 64 MB")
    installation = request.headers.get("x-diagnostic-client", "")
    if not 16 <= len(installation) <= 80 or not all(c.isalnum() or c == "-" for c in installation):
        raise HTTPException(422, "Missing diagnostic installation ID")
    db = request.app.state.db
    now = datetime.now(timezone.utc)
    # Atomic daily allowance; account sign-in is deliberately not required.
    client_hash = hashlib.sha256(installation.encode()).hexdigest()
    allowance = await db.diagnostic_requests.find_one_and_update(
        {"_id": f"{client_hash}:{now.date()}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(days=2)}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    if allowance["count"] > 10:
        raise HTTPException(429, "Daily diagnostic limit reached. Try again tomorrow.")
    reservation = await db.diagnostic_quota.find_one_and_update(
        {"_id": "storage", "bytes": {"$lte": MAX_STORAGE - MAX_UPLOAD}},
        {"$inc": {"bytes": MAX_UPLOAD}},
    )
    if not reservation:
        raise HTTPException(503, "Diagnostic storage is full. Please try again later.")
    retained = 0
    try:
        with tempfile.TemporaryFile() as temporary:
            size = 0
            try:
                async with asyncio.timeout(240):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_UPLOAD:
                            raise HTTPException(413, "Diagnostics must be smaller than 64 MB")
                        temporary.write(chunk)
            except TimeoutError as error:
                raise HTTPException(408, "Diagnostic upload timed out") from error
            temporary.seek(0)
            report = await asyncio.to_thread(validate_archive, temporary)
            temporary.seek(0)
            bucket = AsyncGridFSBucket(db, bucket_name=BUCKET)
            file_id = await bucket.upload_from_stream(
                "diagnostics.zip", temporary,
                metadata={"schema": 1, "build": str(report["build"].get("version", "unknown"))[:100],
                          "client": client_hash, "expires_at": now + timedelta(days=RETENTION_DAYS)},
            )
            retained = size
        return {"id": str(file_id), "bytes": size, "retention_days": RETENTION_DAYS}
    finally:
        await db.diagnostic_quota.update_one({"_id": "storage"}, {"$inc": {"bytes": retained - MAX_UPLOAD}})
