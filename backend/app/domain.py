import json
import secrets
from pathlib import Path

# Stable algorithm/variation IDs are independent of set memberships. Future
# practice records can refer to (algorithm_id, variation_id) from any set.
_catalog = json.loads(Path(__file__).with_name("algorithm_catalog.json").read_text())
ALGORITHM_SETS = _catalog["sets"]
ALGORITHMS = _catalog["algorithms"]

def scramble(length=25):
    # Practice random-move scramble; deliberately not a WCA random-state scramble.
    faces = [("R", "L"), ("U", "D"), ("F", "B")]
    result, previous = [], -1
    for _ in range(length):
        axis = secrets.choice([i for i in range(3) if i != previous])
        result.append(secrets.choice(faces[axis]) + secrets.choice(["", "'", "2"]))
        previous = axis
    return " ".join(result)
