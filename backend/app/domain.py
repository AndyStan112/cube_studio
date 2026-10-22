import json
import secrets
from pathlib import Path

# Stable algorithm/variation IDs are independent of set memberships. Future
# practice records can refer to (algorithm_id, variation_id) from any set.
_catalog = json.loads(Path(__file__).with_name("algorithm_catalog.json").read_text())
ALGORITHM_SETS = _catalog["sets"]
ALGORITHMS = _catalog["algorithms"]

SCRAMBLE_LENGTHS = {"333": 25, "444": 40, "555": 60}

def scramble(length=None, event="333"):
    # Practice random-move scramble; deliberately not a WCA random-state scramble.
    if event not in SCRAMBLE_LENGTHS:
        raise ValueError("Unsupported cube event")
    length = SCRAMBLE_LENGTHS[event] if length is None else length
    faces = [("R", "L"), ("U", "D"), ("F", "B")]
    result, previous = [], -1
    for _ in range(length):
        axis = secrets.choice([i for i in range(3) if i != previous])
        wide = secrets.choice(["", "w"]) if event != "333" else ""
        result.append(secrets.choice(faces[axis]) + wide + secrets.choice(["", "'", "2"]))
        previous = axis
    return " ".join(result)
