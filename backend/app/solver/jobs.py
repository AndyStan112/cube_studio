import asyncio
import logging
import os
import secrets
import time
from collections import deque
from dataclasses import dataclass, field
from fastapi import HTTPException
from .worker_client import WorkerClient

log = logging.getLogger(__name__)
TERMINAL = {"complete", "optimal_proved", "timed_out", "cancelled", "failed"}


@dataclass
class Job:
    id: str
    request: object
    created: float = field(default_factory=time.monotonic)
    status: str = "queued"
    candidate: dict | None = None
    solution: dict | None = None
    progress: dict = field(default_factory=dict)
    events: deque = field(default_factory=lambda: deque(maxlen=512))
    cancel: bool = False
    fallback_available: bool = False
    error: str | None = None
    finished: float | None = None
    revision: int = 0

    def view(self):
        return {
            "id": self.id,
            "status": self.status,
            "metric": self.request.solver.metric,
            "puzzle_size": self.request.puzzle.size,
            "method": self.request.solver.method,
            "post_reduction_method": self.request.solver.post_reduction_method,
            "elapsed_ms": int(
                (self.finished or time.monotonic()) * 1000 - self.created * 1000
            ),
            "candidate": self.candidate,
            "solution": self.solution,
            "best_move_count": min(
                (s["move_count"] for s in [self.candidate, self.solution] if s),
                default=None,
            ),
            "fallback_available": self.fallback_available,
            "progress": self.progress,
            "error": self.error,
            "input": self.request.state.value,
        }

    def emit(self, event):
        self.revision += 1
        self.events.append((self.revision, event, self.view()))

    def finish(self, status):
        self.status = status
        self.finished = time.monotonic()
        self.emit(status)


class Manager:
    def __init__(self, client=None, fallback_delay=None):
        self.client = client or WorkerClient()
        self.jobs = {}
        self.queue = asyncio.Queue(
            maxsize=max(1, min(32, int(os.getenv("SOLVER_QUEUE_LENGTH", "8"))))
        )
        self.runner = None
        self.rate = deque()
        self.ttl = int(os.getenv("SOLVER_JOB_TTL_SECONDS", "3600"))
        self.budget = min(300000, max(1, int(os.getenv("SOLVER_BUDGET_MS", "300000"))))
        self.streams = 0
        self.fallback_delay = fallback_delay  # injectable clock boundary in tests

    def expire(self):
        now = time.monotonic()
        self.jobs = {
            k: j
            for k, j in self.jobs.items()
            if j.finished is None or now - j.finished < self.ttl
        }

    def create(self, data):
        self.expire()
        now = time.monotonic()
        while self.rate and now - self.rate[0] >= 60:
            self.rate.popleft()
        if len(self.rate) >= 12 or self.queue.full() or len(self.jobs) >= 128:
            raise HTTPException(
                429,
                {
                    "code": "solver_capacity",
                    "message": "Solver capacity reached; retry later.",
                },
                headers={"Retry-After": "60"},
            )
        self.rate.append(now)
        job = Job(secrets.token_urlsafe(32), data)
        self.jobs[job.id] = job
        job.emit("queued")
        self.queue.put_nowait(job)
        if self.runner is None or self.runner.done():
            self.runner = asyncio.create_task(self.run())
        return job

    def get(self, id):
        self.expire()
        if id not in self.jobs:
            raise HTTPException(
                404,
                {
                    "code": "job_not_found",
                    "message": "Job expired or server restarted.",
                },
            )
        return self.jobs[id]

    async def cancel_job(self, job):
        if job.status not in TERMINAL:
            job.cancel = True
            if job.status == "queued":
                job.finish("cancelled")
            else:
                await self.client.request("DELETE", "/jobs/" + job.id)
        return job.view()

    async def execute(self, job):
        started = time.monotonic()
        deadline = started + self.budget / 1000 + 5
        delay = (
            self.fallback_delay
            if self.fallback_delay is not None
            else job.request.execution.fallback_after_ms / 1000
        )
        job.status = "searching"
        job.emit("searching")
        await self.client.request(
            "POST",
            "/jobs",
            {
                "id": job.id,
                "facelets": job.request.state.value,
                "budget_ms": self.budget,
                "method": job.request.solver.method,
                "post_reduction_method": job.request.solver.post_reduction_method,
            },
        )
        previous_progress = None
        while True:
            if job.cancel:
                await self.client.request("DELETE", "/jobs/" + job.id)
            state = await self.client.request("GET", "/jobs/" + job.id)
            candidate = state.get("candidate")
            if candidate and candidate != job.candidate:
                job.candidate = candidate
                job.emit("candidate_found")
            job.progress = state.get("progress", {})
            terminal = state["status"] in TERMINAL
            if (
                state["status"] != "optimal_proved"
                and job.candidate
                and time.monotonic() - started >= delay
                and not job.fallback_available
            ):
                job.fallback_available = True
                job.emit("fallback_available")
                if not job.request.execution.continue_search:
                    job.cancel = True
            if terminal:
                job.solution = state.get("solution")
                job.error = state.get("error")
                job.finish(state["status"])
                return
            if job.progress != previous_progress:
                previous_progress = job.progress.copy()
                job.emit("searching")
            if time.monotonic() > deadline:
                await self.client.request("DELETE", "/jobs/" + job.id)
                raise TimeoutError("Worker did not acknowledge deadline")
            await asyncio.sleep(0.2)

    async def run(self):
        while True:
            job = await self.queue.get()
            try:
                if job.status not in TERMINAL:
                    await self.execute(job)
            except asyncio.CancelledError:
                if job.status not in TERMINAL:
                    job.finish("cancelled")
                raise
            except Exception:
                log.exception("Solver worker failed for job %s", job.id)
                # Best effort stop before processing another request. Worker rejects
                # new jobs while any search remains active, including after API restart.
                try:
                    await self.client.request("DELETE", "/jobs/" + job.id)
                except Exception:
                    pass
                job.error = (
                    "Method solver unavailable or failed. Reconnect and retry the guided solve."
                    if job.request.solver.method in ("beginner", "meyer", "reduction_beginner") else
                    "Native worker unavailable or failed. Use the offline solver." if job.request.puzzle.size == 3
                    else "Bigger-cube solver unavailable or failed. Please retry when the solver is online."
                )
                job.finish("failed")
            finally:
                self.queue.task_done()

    async def close(self):
        for job in self.jobs.values():
            if job.status not in TERMINAL:
                try:
                    await self.cancel_job(job)
                except Exception:
                    pass
        if self.runner:
            self.runner.cancel()
            await asyncio.gather(self.runner, return_exceptions=True)
