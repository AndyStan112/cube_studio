"""Private worker HTTP calls use I/O threads; no CPU work on the ASGI loop."""

import asyncio
import json
import os
import urllib.request
import urllib.error


class WorkerClient:
    def __init__(self):
        self.url = os.getenv("SOLVER_WORKER_URL", "http://127.0.0.1:8081").rstrip("/")

    async def request(self, method, path, data=None):
        def call():
            request = urllib.request.Request(
                self.url + path,
                method=method,
                data=json.dumps(data).encode() if data is not None else None,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=3) as response:
                return json.load(response)

        return await asyncio.to_thread(call)
