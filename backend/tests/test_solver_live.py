"""Real Rust/API/proxy integration; enabled by the release Compose test job."""

import os
import time
import httpx
import pytest

BASE = os.getenv("CUBE_API_URL")
pytestmark = pytest.mark.skipif(
    not BASE, reason="Set CUBE_API_URL for live solver integration"
)
SOLVED = "".join(f * 9 for f in "URFDLB")
R_TURN = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB"
DEEP = "UDDRUDFRBDLLDRUULBDURBFRLLFUURFDFDBLBBLRLURDFBBRFBFULF"


def request(value):
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


def wait(client, id, predicate, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        response = client.get("/solver/jobs/" + id)
        response.raise_for_status()
        state = response.json()
        if predicate(state):
            return state
        time.sleep(0.1)
    pytest.fail(f"Job did not reach expected state: {state}")


def test_real_worker_proof_and_cancellation_through_nginx():
    with httpx.Client(base_url=BASE, timeout=10) as client:
        for value, count in [(SOLVED, 0), (R_TURN, 1)]:
            created = client.post("/solver/jobs", json=request(value))
            assert created.status_code == 202, created.text
            id = created.json()["id"]
            try:
                state = wait(
                    client, id, lambda j: j["status"] in ["optimal_proved", "failed"]
                )
                assert state["status"] == "optimal_proved", state
                assert state["solution"]["optimality"] == "global_proved"
                assert state["solution"]["move_count"] == count
                if count:
                    assert state["solution"]["notation"] == ["R'"]
            finally:
                client.delete("/solver/jobs/" + id)
        created = client.post("/solver/jobs", json=request(DEEP))
        assert created.status_code == 202, created.text
        id = created.json()["id"]
        try:
            with client.stream("GET", "/solver/jobs/" + id + "/events") as response:
                assert response.status_code == 200
                assert response.headers["content-type"].startswith("text/event-stream")
                assert response.headers["cache-control"].startswith("no-store")
                assert next(response.iter_lines()) == "event: snapshot"
            early = wait(client, id, lambda j: j["candidate"] is not None)
            assert not early["fallback_available"]
            assert early["candidate"]["optimality"] == "unproved"
            health = client.get("/health")
            assert health.status_code == 200
            offered = wait(client, id, lambda j: j["fallback_available"])
            assert offered["elapsed_ms"] >= 5000
            assert offered["status"] == "searching"
            assert offered["candidate"]["verified"]
            assert client.delete("/solver/jobs/" + id).status_code == 202
            state = wait(client, id, lambda j: j["status"] == "cancelled")
            assert state["solution"] is None
        finally:
            client.delete("/solver/jobs/" + id)
