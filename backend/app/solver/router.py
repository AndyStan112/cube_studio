import asyncio
import json
from fastapi import APIRouter, Request as HTTPRequest, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from .schemas import Request, validate_request
from .jobs import Manager, TERMINAL


class LimitedRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def limited(request):
            if request.method == "POST":
                chunks, size = [], 0
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > 8192:
                        raise HTTPException(413, {"code": "input_too_large"})
                    chunks.append(chunk)
                request._body = b"".join(chunks)
            response = await handler(request)
            response.headers["Cache-Control"] = "no-store"
            return response

        return limited


router = APIRouter(prefix="/api/solver", tags=["solver"], route_class=LimitedRoute)
manager = Manager()


@router.get("/capabilities")
async def capabilities():
    return {
        "schema_version": 1,
        "puzzles": [{"type": "cube", "size": size} for size in (3, 4, 5)],
        "metrics": ["HTM", "OBTM"],
        "methods": ["unrestricted", "reduction"],
        "puzzle_capabilities": {
            "3": {"metric": "HTM", "objective": "optimal", "method": "unrestricted", "offline": True},
            "4": {"metric": "OBTM", "objective": "solution", "method": "reduction", "offline": False},
            "5": {"metric": "OBTM", "objective": "solution", "method": "reduction", "offline": False},
        },
        "constraints": [],
        "optimality_scope": "global",
        "exact_engine": "IDA*; limited heuristic, deep states may time out",
        "max_budget_ms": manager.budget,
        "offline": "two_phase_unproved",
    }


@router.post("/jobs", status_code=202)
async def create(data: Request):
    validate_request(data)
    return manager.create(data).view()


@router.get("/jobs/{id}")
async def get(id: str):
    return manager.get(id).view()


@router.delete("/jobs/{id}", status_code=202)
async def cancel(id: str):
    try:
        return await manager.cancel_job(manager.get(id))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            503,
            {
                "code": "worker_unavailable",
                "message": "Cancellation pending; retry polling.",
            },
        )


@router.get("/jobs/{id}/events")
async def events(id: str, request: HTTPRequest):
    job = manager.get(id)
    try:
        after = max(0, int(request.headers.get("last-event-id", "0")))
    except ValueError:
        raise HTTPException(422, "Invalid Last-Event-ID")
    if manager.streams >= 32:
        raise HTTPException(429, {"code": "stream_capacity"})
    manager.streams += 1

    async def stream():
        nonlocal after
        heartbeat = 0
        try:
            # Snapshot permits reconnect even when older progress history was evicted.
            yield "event: snapshot\ndata: " + json.dumps(job.view()) + "\n\n"
            while not await request.is_disconnected():
                for revision, event, view in list(job.events):
                    if revision > after:
                        yield f"id: {revision}\nevent: {event}\ndata: {json.dumps(view)}\n\n"
                        after = revision
                if job.status in TERMINAL:
                    break
                heartbeat += 1
                if heartbeat % 40 == 0:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(0.25)
        finally:
            manager.streams -= 1

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
