"""Version 1 puzzle boundary. Unsupported capabilities are rejected explicitly."""

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException

SOLVED = "".join(f * 9 for f in "URFDLB")
CORNERS = [
    (8, 9, 20),
    (6, 18, 38),
    (0, 36, 47),
    (2, 45, 11),
    (29, 26, 15),
    (27, 44, 24),
    (33, 53, 42),
    (35, 17, 51),
]
EDGES = [
    (5, 10),
    (7, 19),
    (3, 37),
    (1, 46),
    (32, 16),
    (28, 25),
    (30, 43),
    (34, 52),
    (23, 12),
    (21, 41),
    (50, 39),
    (48, 14),
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Puzzle(Strict):
    type: str
    size: int | None = None


class State(Strict):
    encoding: str
    face_order: list[str] = Field(max_length=16)
    value: str = Field(max_length=54)


class Constraint(Strict):
    schema_version: int
    kind: str  # allowed_moves | state_invariant | stage_goal; reserved, unsupported
    parameters: dict[str, Any] = Field(default_factory=dict)


class Options(Strict):
    metric: str = "HTM"
    objective: str = "optimal"
    method: str = "unrestricted"
    constraints: list[Constraint] = Field(default_factory=list, max_length=16)


class Execution(Strict):
    fallback_after_ms: int = Field(default=5000, ge=5000, le=300000)
    continue_search: bool = True


class Request(Strict):
    schema_version: int
    puzzle: Puzzle
    state: State
    solver: Options
    execution: Execution = Field(default_factory=Execution)


class CubeTurn(Strict):
    kind: Literal["cube_layer_turn"] = "cube_layer_turn"
    face: Literal["U", "R", "F", "D", "L", "B"]
    layer_start: Literal[0] = 0
    layer_count: Literal[1] = 1
    amount: Literal[1, 2, -1]


def parity(values):
    return sum(a > b for i, a in enumerate(values) for b in values[i + 1 :]) % 2


def validate_facelets(value: str):
    def invalid(message):
        raise HTTPException(422, {"code": "invalid_state", "message": message})

    if len(value) != 54 or any(value.count(f) != 9 for f in "URFDLB"):
        invalid("Use exactly nine of each symbol U R F D L B (54 stickers).")
    if any(value[i * 9 + 4] != f for i, f in enumerate("URFDLB")):
        invalid("Centers must follow the fixed URFDLB reference orientation.")
    permutations = []
    for slots, modulus in [(CORNERS, 3), (EDGES, 2)]:
        identities = ["".join(SOLVED[i] for i in slot) for slot in slots]
        perm, orientations = [], []
        for slot in slots:
            colors = "".join(value[i] for i in slot)
            matches = [
                (p, o)
                for p, home in enumerate(identities)
                for o in range(modulus)
                if all(colors[(n + o) % modulus] == home[n] for n in range(modulus))
            ]
            if len(matches) != 1:
                invalid("Invalid or mirrored piece inventory.")
            p, o = matches[0]
            perm.append(p)
            orientations.append(o)
        if len(set(perm)) != len(slots):
            invalid("Duplicate or missing pieces.")
        if sum(orientations) % modulus:
            invalid("Impossible corner twist or edge flip.")
        permutations.append(perm)
    if parity(permutations[0]) != parity(permutations[1]):
        invalid("Corner and edge permutation parity differs.")


def validate_request(data: Request):
    unsupported = []
    if data.schema_version != 1:
        unsupported.append("schema_version")
    if data.puzzle.type != "cube" or data.puzzle.size != 3:
        unsupported.append("puzzle")
    if data.state.encoding != "cube_facelets_v1" or data.state.face_order != list(
        "URFDLB"
    ):
        unsupported.append("encoding/face_order")
    if data.solver.metric != "HTM":
        unsupported.append("metric")
    if data.solver.objective != "optimal":
        unsupported.append("objective")
    if data.solver.method != "unrestricted":
        unsupported.append("method")
    if data.solver.constraints:
        unsupported.append("constraints")
    if unsupported:
        raise HTTPException(
            422, {"code": "unsupported_capability", "fields": unsupported}
        )
    validate_facelets(data.state.value)
