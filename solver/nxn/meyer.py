"""Meyer reduction with explicit block preservation and named three-cycle actions.

Pure center/wing commutators move only three pieces. Conjugation generates the
24-piece orbit's directed three-cycles, so placements can protect completed
pieces at every action boundary. No unrestricted solve is used as a guide.
"""
from collections import deque
from functools import lru_cache
from itertools import permutations, product

from model import geometry, permutation, solved
from beginner import Lesson, CORNERS, HOME, around, alg, search, inverse
from teaching import skeleton, reduced, parity_corrections, finish_reduced

HOME4 = solved(4)
OUTER = [f+s for f in 'URFDLB' for s in ('', "'", '2')]
INNER = ['2'+f+s for f in 'URF' for s in ('', "'", '2')]


@lru_cache(maxsize=2)
def pieces(size=4):
    grouped = {}
    for i, (position, _) in enumerate(geometry(size)):
        grouped.setdefault(position, []).append(i)
    return {kind: [tuple(indices) for indices in grouped.values() if len(indices) == kind] for kind in (1, 2, 3)}


def cycle_key(mapping):
    return tuple(sorted(mapping))


@lru_cache(maxsize=4)
def cycles(kind, size=4):
    """Enumerate pure three-cycles, retaining short setup/commutator/undo plans."""
    slots = pieces(size)[kind]
    slot_of = {sticker: i for i, slot in enumerate(slots) for sticker in slot}
    found = {}
    inner = INNER if size == 4 else [n+f+s for n in ("2", "3") for f in "URF" for s in ("", "'", "2")]
    for a, b, c in product(inner, OUTER, inner if kind == 1 else OUTER):
        moves = [a, b, *inverse([a]), c, a, *inverse([b]), *inverse([a]), *inverse([c])]
        p = list(range(6*size*size))
        for move in moves:
            q = permutation(size, move)
            p = [q[i] for i in p]
        sparse = tuple((i, j) for i, j in enumerate(p) if i != j)
        if len(sparse) != kind*3 or any(i not in slot_of or j not in slot_of for i, j in sparse):
            continue
        support = {slot_of[i] for i, _ in sparse}
        if len(support) == 3:
            found.setdefault(cycle_key(sparse), (sparse, moves, []))
    queue = deque(found)
    setups = [(move, permutation(size, move)) for move in OUTER + inner]
    # Conjugating a pure cycle keeps it pure, even if the setup temporarily
    # disturbs other pieces. Its inverse restores every non-target piece.
    while queue:
        key = queue.popleft()
        sparse, core, setup = found[key]
        for move, q in setups:
            nxt = tuple((q[i], q[j]) for i, j in sparse)
            nxt_key = cycle_key(nxt)
            if nxt_key not in found:
                found[nxt_key] = (nxt, core, [*setup, move])
                queue.append(nxt_key)
    return list(found.values())


@lru_cache(maxsize=2)
def wing_identities(size=4):
    """A wing's handed position fixes its orientation; color pair alone does not."""
    geo = geometry(size)
    slots = pieces(size)[2]
    index = {geo[slot[0]][0]: i for i, slot in enumerate(slots)}
    lookup = {}
    for axes in permutations(range(3)):
        sign_of_axes = (-1)**sum(a > b for i, a in enumerate(axes) for b in axes[i+1:])
        for signs in product((-1, 1), repeat=3):
            if sign_of_axes * signs[0]*signs[1]*signs[2] != 1:
                continue
            def rotate(v):
                return tuple(signs[i]*v[axes[i]] for i in range(3))
            for identity, home in enumerate(slots):
                dest = index[rotate(geo[home[0]][0])]
                colors = {rotate(geo[i][1]): solved(size)[i] for i in home}
                color_order = tuple(colors[geo[i][1]] for i in slots[dest])
                key = dest, color_order
                if key in lookup and lookup[key] != identity:
                    raise ValueError('Ambiguous wing identity')
                lookup[key] = identity
    return lookup


def wing_order(value, size=4):
    lookup = wing_identities(size)
    return [lookup[(i, tuple(value[j] for j in slot))] for i, slot in enumerate(pieces(size)[2])]


def place(lesson, kind, goals, name, home=None):
    """Place pieces without changing any completed goal at action boundaries."""
    size = lesson.size
    home = home or solved(size)
    slots = pieces(size)[kind]
    goal_stickers = {j for i in goals for j in slots[i]}
    for _ in range(len(goals)+1):
        if all(lesson.value[j] == home[j] for j in goal_stickers):
            return
        old_score = sum(all(lesson.value[j] == home[j] for j in slots[i]) for i in goals)
        protected = {j for i in goals if all(lesson.value[j] == home[j] for j in slots[i]) for j in slots[i]}
        best = None
        for sparse, core, setup in cycles(kind, size):
            if any(target in protected and lesson.value[source] != home[target] for source, target in sparse):
                continue
            gain = sum((lesson.value[source] == home[target]) - (lesson.value[target] == home[target])
                       for source, target in sparse if target in goal_stickers)
            # Favor completing pieces, then extra correct stickers, then shorter actions.
            changed = {target: lesson.value[source] for source, target in sparse}
            completed = sum(all(changed.get(j, lesson.value[j]) == home[j] for j in slots[i])
                            and not all(lesson.value[j] == home[j] for j in slots[i]) for i in goals)
            score = (completed, gain, -len(core)-2*len(setup))
            if best is None or score > best[0]:
                best = score, core, setup, sparse
        if best is None or best[0][0] == 0:
            raise ValueError(f'Cannot place {name} while preserving completed pieces; no unrestricted fallback was used')
        _, core, setup, sparse = best
        moved = sorted({slot for source, _ in sparse for slot, indices in enumerate(slots) if source in indices})
        locations = ', '.join('/'.join(f'{solved(size)[j]} row {(j%(size*size))//size+1} column {j%size+1}' for j in slots[i]) for i in moved)
        lesson.add(f'{name} · three-piece cycle', inverse(setup) + core + setup,
                   f'Cycle three {"center" if kind == 1 else "wing"} pieces at {locations}. '
                   + (f'Setup: {" ".join(inverse(setup))}. ' if setup else '')
                   + f'Core commutator: {" ".join(core)}. '
                   + (f'Undo setup: {" ".join(setup)}. ' if setup else '')
                   + 'Finish the whole action: the setup is undone and every non-target piece returns. Completed goals are preserved at this boundary.')
        if sum(all(lesson.value[j] == home[j] for j in slots[i]) for i in goals) <= old_score:
            raise ValueError('Three-cycle placement failed its progress check')
    raise ValueError('Three-cycle placement exceeded its piece budget')


def plan_meyer(value):
    lesson = Lesson(value, 4)
    centers, wings = pieces()[1], pieces()[2]
    lr = [i for i, slot in enumerate(centers) if HOME4[slot[0]] in 'LR']
    block_wings = [i for i, slot in enumerate(wings) if set(HOME4[j] for j in slot) in ({'D', 'L'}, {'F', 'L'}, {'B', 'L'})]
    corner_slots = [CORNERS[5], CORNERS[6]]
    def correct(kind, ids):
        return all(lesson.value[j] == HOME4[j] for i in ids for j in pieces()[kind][i])
    def block():
        small = skeleton(lesson.value, 4)
        return correct(1, lr) and correct(2, block_wings) and all(small[j] == HOME[j] for slot in corner_slots for j in slot)
    lesson.stage('meyer-opposite-centers', 'Meyer · two opposite centers',
                 'Build the blue left and green right 2×2 centers. White stays down and red stays front. There are no fixed centers on a 4×4, so use this reference color scheme.',
                 'The left center is solid blue and the right center is solid green.',
                 lambda: place(lesson, 1, lr, 'Opposite-center placement'), lambda: correct(1, lr))
    def build_block():
        actions = [alg('Top-layer setup', m) for m in ('U', "U'", 'U2')] + around("R U R'", 'Block corner insertion') + around("R U' R'", 'Block corner extraction / insertion')
        for count in (1, 2):
            path = search(skeleton(lesson.value, 4), corner_slots[:count], actions, locked=(count-1)*3)
            for name, moves in path:
                lesson.add(name, moves, 'Place the white-blue corners at bottom-front-left and bottom-back-left. These outer turns keep the two solid opposite centers intact.')
        place(lesson, 2, block_wings, 'Left-block wing placement')
    lesson.stage('meyer-left-block', 'Meyer · build the left block',
                 'Build the left 1×3×4 block: its two white-blue corners and the blue-white, blue-red and blue-orange edge pairs. The opposite centers stay solved at each action boundary.',
                 'The bottom-left block is solved, including both corners and all three paired blue edges.', build_block, block)
    lesson.stage('meyer-remaining-centers', 'Meyer · remaining four centers',
                 'Finish the yellow, white, red and orange centers. Pure center three-cycles restore the left block and all completed centers at each action boundary.',
                 'All six center blocks are solved and the left block remains intact.',
                 lambda: place(lesson, 1, list(range(len(centers))), 'Remaining-center placement'),
                 lambda: block() and correct(1, list(range(len(centers)))))
    def pair_wings():
        order = wing_order(lesson.value)
        if sum(a > b for i, a in enumerate(order) for b in order[i+1:]) % 2:
            lesson.add('Meyer · wing parity correction', "Rw2 R2 U2 Rw2 R2 U2 Rw R' U2 Rw R' U2 Rw' R' U2 B2 U Rw' R U' B2 U Rw R' U R2".split(),
                       'Correct odd wing permutation at the upper-front edge before pairing. This dedicated big-cube parity action restores every other edge group, all centers and all corners. The left block is preserved.')
            if not block():
                raise ValueError('Parity correction disturbed the Meyer block')
        place(lesson, 2, list(range(len(wings))), 'Remaining-wing pairing')
        for name, moves, explanation in parity_corrections(lesson.value):
            lesson.add(name, moves, explanation)
        if not block():
            raise ValueError('Reduced parity correction disturbed the Meyer block')
    lesson.stage('meyer-remaining-wings', 'Meyer · pair the remaining wings',
                 'Join the remaining matching wings without breaking the left block. This teaching variant places pairs directly against matching centers, making the final 3×3 cross easier. Each three-cycle moves only three wings; finish its setup and undo before checking.',
                 'All twelve edges are paired; every center and the left block remain solved.', pair_wings,
                 lambda: block() and reduced(lesson.value, 4))
    return finish_reduced(lesson, 'meyer')
