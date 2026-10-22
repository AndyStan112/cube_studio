"""Independent sticker permutations used to verify NxN engine results."""
import re
from collections import deque
from functools import lru_cache

FACES = 'URFDLB'
NORMALS = {'U': (0, 1, 0), 'R': (1, 0, 0), 'F': (0, 0, 1), 'D': (0, -1, 0), 'L': (-1, 0, 0), 'B': (0, 0, -1)}


def solved(size):
    return ''.join(f * (size * size) for f in FACES)


@lru_cache(maxsize=3)
def geometry(size):
    edge = size - 1
    result = []
    for face in FACES:
        for row in range(size):
            for col in range(size):
                r, c = row * 2, col * 2
                positions = {'U': (c-edge, edge, r-edge), 'R': (edge, edge-r, edge-c), 'F': (c-edge, edge-r, edge),
                             'D': (c-edge, -edge, edge-r), 'L': (-edge, edge-r, c-edge), 'B': (edge-c, edge-r, -edge)}
                result.append((positions[face], NORMALS[face]))
    return tuple(result)


def turn(vector, axis):
    x, y, z = vector
    return ((x, -z, y), (z, y, -x), (-y, x, z))[axis]


@lru_cache(maxsize=256)
def permutation(size, move):
    rotation = re.fullmatch(r"([xyz])(2|')?", move)
    if rotation:
        axis = 'xyz'.index(rotation[1])
        layers = range(-(size-1), size, 2)
        direction, suffix = -1, rotation[2]
    else:
        match = re.fullmatch(r"([2-5])?([URFDLB])(w)?(2|')?", move)
        if not match:
            raise ValueError(f'Invalid move: {move}')
        prefix, face, wide, suffix = match.groups()
        normal = NORMALS[face]
        axis = next(i for i, n in enumerate(normal) if n)
        side = normal[axis]
        depth = int(prefix) if prefix else 2 if wide else 1
        if depth > size:
            raise ValueError('Move exceeds cube size')
        layers = [side * (size-1-2*i) for i in range(depth)] if wide else [side * (size-1-2*(depth-1))]
        direction = -side
    quarters = (direction * (2 if suffix == '2' else -1 if suffix == "'" else 1)) % 4
    stickers = geometry(size)
    slots = {slot: i for i, slot in enumerate(stickers)}
    result = []
    for position, normal in stickers:
        if position[axis] in layers:
            for _ in range(quarters):
                position, normal = turn(position, axis), turn(normal, axis)
        result.append(slots[(position, normal)])
    return result


def apply(value, move, size):
    result = list(value)
    for source, target in enumerate(permutation(size, move)):
        result[target] = value[source]
    return ''.join(result)


def verify_and_orient(value, moves, size):
    end = value
    for move in moves:
        end = apply(end, move, size)
    # A reduction engine can finish in another whole-cube orientation.
    area = size * size
    if any(len(set(end[f*area:(f+1)*area])) != 1 for f in range(6)):
        raise ValueError('Engine result does not solve the cube')
    queue, seen = deque([(end, [])]), {end}
    while queue:
        state, rotations = queue.popleft()
        if state == solved(size):
            return [*moves, *rotations]
        for move in ('x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2'):
            rotated = apply(state, move, size)
            if rotated not in seen:
                seen.add(rotated)
                queue.append((rotated, [*rotations, move]))
    raise ValueError('Engine result has an invalid color scheme')


def solution(value, moves, size):
    moves = verify_and_orient(value, moves, size)
    turns = []
    for move in moves:
        if move[0] in 'xyz':
            turns.append({'kind': 'cube_rotation', 'axis': move[0], 'amount': 2 if move.endswith('2') else -1 if move.endswith("'") else 1})
        else:
            match = re.fullmatch(r"([2-5])?([URFDLB])(w)?(2|')?", move)
            prefix, face, wide, suffix = match.groups()
            depth = int(prefix) if prefix else 2 if wide else 1
            turns.append({'kind': 'cube_layer_turn', 'face': face, 'layer_start': 0 if wide else depth-1,
                          'layer_count': depth if wide else 1, 'amount': 2 if suffix == '2' else -1 if suffix == "'" else 1})
    return {'notation': moves, 'moves': turns, 'move_count': sum(m[0] not in 'xyz' for m in moves),
            'metric': 'OBTM', 'verified': True, 'optimality': 'unproved'}
