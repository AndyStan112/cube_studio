import asyncio
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from app.solver.schemas import Request, SOLVED, validate_facelets
from app.solver.jobs import Manager
from app.solver import router as module


def payload(value=SOLVED):
    return {
        "schema_version": 1,
        "puzzle": {"type": "cube", "size": 3},
        "state": {
            "encoding": "cube_facelets_v1",
            "face_order": list("URFDLB"),
            "value": value,
        },
        "solver": {
            "metric": "HTM",
            "objective": "optimal",
            "method": "unrestricted",
            "constraints": [],
        },
        "execution": {"fallback_after_ms": 5000, "continue_search": True},
    }


CANDIDATE = {
    "notation": [],
    "moves": [],
    "move_count": 0,
    "metric": "HTM",
    "verified": True,
    "optimality": "unproved",
}


class Worker:
    def __init__(self, failure=False, finish=True):
        self.calls = []
        self.polls = 0
        self.cancelled = False
        self.failure = failure
        self.finish = finish

    async def request(self, method, path, data=None):
        self.calls.append((method, path, data))
        if self.failure:
            raise ConnectionError("worker down")
        if method == "DELETE":
            self.cancelled = True
        if method == "GET":
            self.polls += 1
            return {
                "status": "cancelled"
                if self.cancelled
                else "timed_out"
                if self.finish and self.polls > 2
                else "searching",
                "candidate": CANDIDATE,
                "solution": None,
                "progress": {"bound": 3, "completed_bound": 2, "nodes": self.polls},
            }
        return {}


def client(monkeypatch, worker=None):
    manager = Manager(worker or Worker(), fallback_delay=0.01)
    monkeypatch.setattr(module, "manager", manager)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await manager.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(module.router)
    return TestClient(app), manager


def test_invalid_and_unsupported(monkeypatch):
    c, _ = client(monkeypatch)
    with c:
        for key, val in [
            ("puzzle", {"type": "megaminx"}),
            ("solver", {"metric": "QTM"}),
            ("solver", {"method": "roux"}),
            (
                "solver",
                {
                    "constraints": [
                        {"schema_version": 1, "kind": "stage_goal", "parameters": {}}
                    ]
                },
            ),
        ]:
            data = payload()
            data[key] = {**data[key], **val}
            response = c.post("/api/solver/jobs", json=data)
            assert response.status_code == 422
            assert response.json()["detail"]["code"] == "unsupported_capability"
        assert c.post("/api/solver/jobs", json=payload("U" * 54)).status_code == 422
        assert c.post("/api/solver/jobs", content=b"x" * 8193).status_code == 413
        assert c.post("/api/solver/jobs", json={}).status_code == 422
        assert c.get("/api/solver/capabilities").json()["metrics"] == ["HTM", "OBTM"]


def test_physical_invariants():
    validate_facelets(SOLVED)
    for indices in [(5, 10), (10, 19), (19, 16), (9, 20)]:
        f = list(SOLVED)
        f[indices[0]], f[indices[1]] = f[indices[1]], f[indices[0]]
        with pytest.raises(Exception):
            validate_facelets("".join(f))
    f = list(SOLVED)
    f[8], f[9], f[20] = f[20], f[8], f[9]
    with pytest.raises(Exception):
        validate_facelets("".join(f))


def test_lifecycle_fallback_sse_reconnection_expiration(monkeypatch):
    c, manager = client(monkeypatch)
    with c:
        response = c.post("/api/solver/jobs", json=payload())
        assert response.status_code == 202
        id = response.json()["id"]
        events = c.get(f"/api/solver/jobs/{id}/events").text
        for event in [
            "queued",
            "searching",
            "candidate_found",
            "fallback_available",
            "timed_out",
        ]:
            assert f"event: {event}" in events
        state = c.get(f"/api/solver/jobs/{id}").json()
        assert state["candidate"]["optimality"] == "unproved"
        assert state["solution"] is None
        replay = c.get(
            f"/api/solver/jobs/{id}/events", headers={"Last-Event-ID": "1"}
        ).text
        assert "event: snapshot" in replay
        assert "event: queued" not in replay
        assert (
            c.get(
                f"/api/solver/jobs/{id}/events", headers={"Last-Event-ID": "bad"}
            ).status_code
            == 422
        )
        manager.jobs[id].finished = time.monotonic() - manager.ttl - 1
        assert c.get(f"/api/solver/jobs/{id}").status_code == 404


def test_cancellation_reaches_worker(monkeypatch):
    worker = Worker(finish=False)
    c, _ = client(monkeypatch, worker)
    with c:
        id = c.post("/api/solver/jobs", json=payload()).json()["id"]
        for _ in range(30):
            if c.get(f"/api/solver/jobs/{id}").json()["status"] == "searching":
                break
            time.sleep(0.01)
        assert c.delete(f"/api/solver/jobs/{id}").status_code == 202
        events = c.get(f"/api/solver/jobs/{id}/events").text
        assert "event: cancelled" in events
        assert worker.cancelled


def test_worker_failure(monkeypatch):
    c, _ = client(monkeypatch, Worker(failure=True))
    with c:
        id = c.post("/api/solver/jobs", json=payload()).json()["id"]
        events = c.get(f"/api/solver/jobs/{id}/events").text
        assert "event: failed" in events
        assert c.get(f"/api/solver/jobs/{id}").json()["solution"] is None


def test_bounded_queue_rate_limit_and_cancel_queued():
    async def run():
        manager = Manager(Worker(finish=False))
        manager.queue = asyncio.Queue(maxsize=1)
        job = manager.create(Request.model_validate(payload()))
        with pytest.raises(Exception) as error:
            manager.create(Request.model_validate(payload()))
        assert error.value.status_code == 429
        await manager.cancel_job(job)
        assert job.status == "cancelled"
        await manager.close()

    asyncio.run(run())


def test_rate_and_sse_limits(monkeypatch):
    c, manager = client(monkeypatch)
    with c:
        id = c.post("/api/solver/jobs", json=payload()).json()["id"]
        manager.streams = 32
        assert c.get(f"/api/solver/jobs/{id}/events").status_code == 429
        manager.streams = 0
        manager.rate.extend([time.monotonic()] * 12)
        response = c.post("/api/solver/jobs", json=payload())
        assert response.status_code == 429
        assert response.headers["retry-after"] == "60"


def test_explicit_stop_after_fallback(monkeypatch):
    c, _ = client(monkeypatch, Worker(finish=False))
    with c:
        data = payload()
        data["execution"]["continue_search"] = False
        id = c.post("/api/solver/jobs", json=data).json()["id"]
        events = c.get(f"/api/solver/jobs/{id}/events").text
        assert "event: fallback_available" in events
        assert "event: cancelled" in events
