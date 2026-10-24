"""Verified reduction checkpoints followed exclusively by beginner 3×3 actions."""
from model import apply, solved
from beginner import plan, EDGES, CORNERS, HOME


def skeleton(value, size):
    indices = (0, 1, size-1) if size == 4 else (0, 2, 4)
    return ''.join(value[f*size*size + r*size + c] for f in range(6) for r in indices for c in indices)


def reduced(value, size):
    for face in range(6):
        start = face*size*size
        for row in range(1, size-1):
            for col in range(1, size-1):
                if value[start + row*size + col] != solved(size)[start]:
                    return False
        for line in ([start+c for c in range(1, size-1)],
                     [start+(size-1)*size+c for c in range(1, size-1)],
                     [start+r*size for r in range(1, size-1)],
                     [start+r*size+size-1 for r in range(1, size-1)]):
            if len({value[i] for i in line}) != 1:
                return False
    return True


def parity_corrections(value):
    """Normalize reduced 4×4 edge parity before any ordinary 3×3 action."""
    groups = []
    small = skeleton(value, 4)
    flips = 0
    for slot in EDGES:
        home = next(home for home in EDGES if set(small[i] for i in slot) == set(HOME[i] for i in home))
        flips += small[slot[0]] != HOME[home[0]]
    if flips % 2:
        moves = "Rw2 R2 U2 Rw2 R2 U2 Rw R' U2 Rw R' U2 Rw' R' U2 B2 U Rw' R U' B2 U Rw R' U R2".split()
        groups.append(('Even-cube flipped-edge parity correction', moves,
                       'A reduced 4×4 can have one flipped edge group, which is impossible on a 3×3. This dedicated big-cube sequence fixes that parity and restores all centers and paired edges.'))
        for move in moves:
            value = apply(value, move, 4)
    small = skeleton(value, 4)
    def parity(slots):
        ids = [set(HOME[i] for i in slot) for slot in slots]
        order = [ids.index(set(small[i] for i in slot)) for slot in slots]
        return sum(a > b for i, a in enumerate(order) for b in order[i+1:]) % 2
    if parity(EDGES) != parity(CORNERS):
        groups.append(('Even-cube edge-swap parity correction', '2R2 U2 2R2 Uw2 2R2 Uw2'.split(),
                       'A reduced 4×4 can need two edge groups swapped. Use the indicated inner slices to correct this big-cube parity, restoring the centers and paired groups before the beginner solve.'))
    return groups


def finish_reduced(lesson, method):
    if not reduced(lesson.value, lesson.size):
        raise ValueError('Beginner handoff requires solved centers and paired edges')
    finish = plan(skeleton(lesson.value, lesson.size))
    offset = len(lesson.notation)
    for chunk in finish['chunks']:
        lesson.add(chunk['name'], finish['notation'][chunk['start']:chunk['end']], chunk['explanation'])
    lesson.stages.extend({**stage, 'start': stage['start']+offset, 'end': stage['end']+offset}
                         for stage in finish['stages'])
    return lesson.result(method)
