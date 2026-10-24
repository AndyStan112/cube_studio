"""Version 1 puzzle boundary. Unsupported capabilities are rejected explicitly."""

from collections import Counter, defaultdict
from itertools import permutations as axis_permutations, product
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
    value: str = Field(max_length=150)


class Constraint(Strict):
    schema_version: int
    kind: str  # allowed_moves | state_invariant | stage_goal; reserved, unsupported
    parameters: dict[str, Any] = Field(default_factory=dict)


class Options(Strict):
    metric: str = "HTM"
    objective: str = "optimal"
    method: str = "unrestricted"
    constraints: list[Constraint] = Field(default_factory=list, max_length=16)
    post_reduction_method: str | None = None


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


def validate_facelets(value: str, size: int = 3):
    def invalid(message):
        raise HTTPException(422, {"code": "invalid_state", "message": message})

    if size != 3:
        area = size * size
        if len(value) != 6 * area or any(value.count(f) != area for f in "URFDLB"):
            invalid(f"Use exactly {area} of each symbol U R F D L B ({6 * area} stickers).")
        def inventory(state):
            pieces = defaultdict(list)
            normals = {"U": (0, 1, 0), "R": (1, 0, 0), "F": (0, 0, 1), "D": (0, -1, 0), "L": (-1, 0, 0), "B": (0, 0, -1)}
            rotations = [(axes, signs) for axes in axis_permutations(range(3)) for signs in product((-1, 1), repeat=3)
                         if (-1) ** parity(axes) * signs[0] * signs[1] * signs[2] == 1]
            edge = size - 1
            for f, face in enumerate("URFDLB"):
                for row in range(size):
                    for col in range(size):
                        r, c = row * 2, col * 2
                        coordinates = {"U": (c-edge, edge, r-edge), "R": (edge, edge-r, edge-c),
                                       "F": (c-edge, edge-r, edge), "D": (c-edge, -edge, edge-r),
                                       "L": (-edge, edge-r, c-edge), "B": (edge-c, edge-r, -edge)}
                        pieces[coordinates[face]].append((normals[face], state[f * area + row * size + col]))
            def identity(position, stickers):
                possibilities = []
                for axes, signs in rotations:
                    def rotate(vector):
                        return tuple(signs[i] * vector[axes[i]] for i in range(3))
                    possibilities.append((rotate(position), tuple(sorted((rotate(normal), color) for normal, color in stickers))))
                return min(possibilities)
            return Counter(identity(position, stickers) for position, stickers in pieces.items())
        if inventory(value) != inventory("".join(f * area for f in "URFDLB")):
            invalid("Duplicate, missing, or invalid pieces in a center or edge orbit.")
        if size == 5:
            skeleton = "".join(value[f * area + r * size + c] for f in range(6) for r in (0, 2, 4) for c in (0, 2, 4))
            validate_facelets(skeleton)
        else:
            def convert(i):
                face, offset = divmod(i, 9)
                row, col = divmod(offset, 3)
                return face * area + (row // 2) * (size - 1) * size + (col // 2) * (size - 1)
            used, twists = set(), 0
            for slot in CORNERS:
                colors = "".join(value[convert(i)] for i in slot)
                matches = [(p, o) for p, home in enumerate(CORNERS) for o in range(3)
                           if all(colors[(n + o) % 3] == SOLVED[i] for n, i in enumerate(home))]
                if len(matches) != 1 or matches[0][0] in used:
                    invalid("Invalid, mirrored, or duplicate corners.")
                used.add(matches[0][0])
                twists += matches[0][1]
            if twists % 3:
                invalid("Impossible corner twist.")
        return
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
    if data.puzzle.type != "cube" or data.puzzle.size not in (3, 4, 5):
        unsupported.append("puzzle")
    if data.state.encoding != "cube_facelets_v1" or data.state.face_order != list(
        "URFDLB"
    ):
        unsupported.append("encoding/face_order")
    big = data.puzzle.size in (4, 5)
    if data.solver.metric != ("OBTM" if big else "HTM"):
        unsupported.append("metric")
    teaching = data.solver.method in ("beginner", "reduction_beginner", "meyer")
    if data.solver.objective != ("solution" if big or teaching else "optimal"):
        unsupported.append("objective")
    methods = {3: ("unrestricted", "beginner"), 4: ("reduction", "reduction_beginner", "meyer"), 5: ("reduction", "reduction_beginner")}
    if data.solver.method not in methods.get(data.puzzle.size, ()):
        unsupported.append("method")
    if data.solver.post_reduction_method is not None and (not big or data.solver.method not in ("reduction_beginner", "meyer") or data.solver.post_reduction_method != "beginner"):
        unsupported.append("post_reduction_method")
    if data.solver.constraints:
        unsupported.append("constraints")
    if unsupported:
        raise HTTPException(
            422, {"code": "unsupported_capability", "fields": unsupported}
        )
    validate_facelets(data.state.value, data.puzzle.size)
