"""Layer-by-layer teaching planner. Searches piece placements and beginner triggers only.

A stage is verified before its moves are exposed. No two-phase solution is used
or relabelled. Search keys track the stickers relevant to the current subgoal.
"""
from collections import deque
from functools import lru_cache
from model import apply, permutation, solved, solution

CORNERS = [(8, 9, 20), (6, 18, 38), (0, 36, 47), (2, 45, 11),
           (29, 26, 15), (27, 44, 24), (33, 53, 42), (35, 17, 51)]
EDGES = [(5, 10), (7, 19), (3, 37), (1, 46), (32, 16), (28, 25),
         (30, 43), (34, 52), (23, 12), (21, 41), (50, 39), (48, 14)]
COLORS = dict(U='yellow', R='green', F='red', D='white', L='blue', B='orange')
HOME = solved(3)


def inverse(moves):
    return [m if m.endswith('2') else m[:-1] if m.endswith("'") else m + "'" for m in reversed(moves)]


def alg(name, text):
    return name, text.split()


def around(text, name):
    """Four working faces, with fixed yellow-up, red-front reference."""
    return [(f'{name} · {COLORS[face]} working face', [
        ''.join('FRBL'[('FRBL'.index(c) + offset) % 4] if c in 'FRBL' else c for c in move)
        for move in text.split()]) for offset, face in enumerate('FRBL')]


@lru_cache(maxsize=256)
def sequence_permutation(moves):
    result = list(range(54))
    for move in moves:
        p = permutation(3, move)
        result = [p[i] for i in result]
    return result


def piece_positions(value, slots):
    positions = []
    for target in slots:
        colors = [HOME[i] for i in target]
        current = next(slot for slot in (EDGES if len(target) == 2 else CORNERS)
                       if set(value[i] for i in slot) == set(colors))
        positions.extend(next(i for i in current if value[i] == color) for color in colors)
    return tuple(positions)


def search(value, slots, actions, *, locked=0, goal=None):
    """BFS over named actions, retaining already placed pieces at action boundaries.

    Outer-turn cross placement may temporarily displace earlier cross edges.
    Insertion actions restore earlier layers before their boundary is reached.
    """
    start = piece_positions(value, slots)
    target = tuple(i for slot in slots for i in slot)
    goal = goal or (lambda state: state == target)
    if goal(start):
        return []
    transforms = [sequence_permutation(tuple(moves)) for _, moves in actions]
    parents = {start: None}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        for index, p in enumerate(transforms):
            nxt = tuple(p[i] for i in state)
            if nxt in parents or nxt[:locked] != target[:locked]:
                continue
            parents[nxt] = (state, index)
            if goal(nxt):
                path = []
                while parents[nxt] is not None:
                    previous, action = parents[nxt]
                    path.append(actions[action])
                    nxt = previous
                return path[::-1]
            queue.append(nxt)
    raise ValueError('No route using the selected beginner actions; no unrestricted fallback was used.')


class Lesson:
    def __init__(self, value, size=3):
        self.initial = value
        self.value = value
        self.size = size
        self.notation = []
        self.stages = []
        self.chunks = []

    def add(self, name, moves, explanation):
        if not moves:
            return
        start = len(self.notation)
        for move in moves:
            self.value = apply(self.value, move, self.size)
        self.notation.extend(moves)
        self.chunks.append(dict(name=name, explanation=explanation, start=start, end=len(self.notation)))

    def stage(self, id, title, explanation, checkpoint, run, check):
        start = len(self.notation)
        run()
        if not check():
            raise ValueError(f'Beginner checkpoint failed: {title}')
        self.stages.append(dict(id=id, title=title, explanation=explanation, checkpoint=checkpoint,
                                start=start, end=len(self.notation), skipped=start == len(self.notation), verified=True))

    def result(self, method='beginner'):
        result = solution(self.initial, self.notation, self.size)
        result.update(metric='HTM' if self.size == 3 else 'OBTM', method=method,
                      stages=self.stages, chunks=self.chunks, post_reduction_method='beginner' if self.size != 3 else None)
        return result


def plan(value):
    lesson = Lesson(value)
    top_turns = [alg('Top-layer setup', m) for m in ('U', "U'", 'U2')]

    def fixed(slots):
        return all(lesson.value[i] == HOME[i] for slot in slots for i in slot)

    def perform(path, why):
        for name, moves in path:
            lesson.add(name, moves, why)

    def cross():
        for count in range(1, 5):
            slots = EDGES[4:4+count]
            colors = '–'.join(COLORS[HOME[i]] for i in slots[-1])
            perform(search(lesson.value, slots, [alg('Cross placement', f + s) for f in 'URFDLB' for s in ('', "'", '2')]),
                    f'Place the {colors} edge with white down and its side color matching the center. Earlier cross edges are restored at the end of this placement.')

    lesson.stage('white-cross', 'White cross',
                 'Solve the four white edges on the bottom. Each side sticker must also match its side center; a white plus alone is not enough.',
                 'Four white edge stickers face down, and all four side colors match their centers.', cross, lambda: fixed(EDGES[4:8]))

    def corners():
        actions = top_turns + around("R U R'", 'Right corner insertion') + around("R U' R'", 'Right corner extraction / insertion')
        for count in range(1, 5):
            slots = CORNERS[4:4+count]
            colors = '–'.join(COLORS[HOME[i]] for i in slots[-1])
            perform(search(lesson.value, slots, actions, locked=(count-1)*3),
                    f'Bring the {colors} corner above its home, then use the working face to insert it. The white cross and completed corners are preserved after each trigger.')

    lesson.stage('white-corners', 'White corners',
                 'Find a corner containing white. Its other two colors identify the slot between the matching centers. Insert corners one at a time.',
                 'The whole white face and the bottom row of every side face are solved.', corners,
                 lambda: fixed(EDGES[4:8] + CORNERS[4:]))

    def middle():
        actions = top_turns + around("U R U' R' U' F' U F", 'Middle edge · insert right') + around("U' L' U L U F U' F'", 'Middle edge · insert left')
        for count in range(1, 5):
            slots = EDGES[8:8+count]
            colors = '–'.join(COLORS[HOME[i]] for i in slots[-1])
            perform(search(lesson.value, slots, actions, locked=(count-1)*2),
                    f'Place the {colors} edge into the middle layer. A wrong or flipped middle edge is first taken out with an insertion, then reinserted correctly. Complete the entire sequence to restore the white layer.')

    lesson.stage('middle-edges', 'Middle-layer edges',
                 'Choose a top edge without yellow. Match its front sticker to a center, then insert left or right. Keep white down throughout.',
                 'The bottom two rows of every side face are solved.', middle,
                 lambda: fixed(EDGES[4:] + CORNERS[4:]))

    lesson.stage('yellow-cross', 'Make the yellow cross',
                 'Look only at the four yellow edge stickers on top. Use the cross builder to change a dot into an L, an L into a line, and a line into a cross. Ignore the corners for now.',
                 'All four top edge stickers are yellow; the first two layers are restored.',
                 lambda: perform(search(lesson.value, EDGES[:4], top_turns + around("F R U R' U' F'", 'Yellow cross builder'),
                                        goal=lambda state: all(state[i] < 9 for i in range(0, 8, 2))),
                                 'This short sequence flips top edges while restoring the first two layers. Use the indicated working face for this case.'),
                 lambda: all(lesson.value[i] == 'U' for i in (1, 3, 5, 7)) and fixed(EDGES[4:] + CORNERS[4:]))

    lesson.stage('yellow-edge-positions', 'Match the yellow edges to their centers',
                 'The yellow cross is made. Turn the top to line up side colors, then cycle the remaining top edges. The corners may change during this step.',
                 'All twelve edges are in their correct positions and orientations.',
                 lambda: perform(search(lesson.value, EDGES[:4], top_turns + around("R U R' U R U2 R'", 'Beginner top-edge cycle')),
                                 'Cycle the unmatched yellow edges. Keep white down and finish the whole sequence before checking the side colors.'),
                 lambda: fixed(EDGES))

    def corner_positions():
        base = "U R U' L' U R' U' L".split()
        actions = []
        for setup in ([], ['U'], ['U2'], ["U'"]):
            actions.append(('Beginner three-corner cycle', setup + base + inverse(setup)))
        slots = CORNERS[:4]
        groups = [set(slot) for slot in slots]
        perform(search(lesson.value, slots, actions,
                       goal=lambda state: all(set(state[i*3:i*3+3]) == group for i, group in enumerate(groups))),
                'Keep the correctly located corner in place and cycle the other three. A corner is in the right location when its three colors match the surrounding centers, even if yellow faces sideways.')

    lesson.stage('yellow-corner-positions', 'Put the yellow corners in their homes',
                 'Check the three colors of each yellow corner. Position them first; they do not need to face the right way yet.',
                 'Every corner has the correct three colors for its location, and all edges remain solved.', corner_positions,
                 lambda: fixed(EDGES) and all(set(lesson.value[i] for i in slot) == set(HOME[i] for i in slot) for slot in CORNERS))

    def twist():
        if lesson.value == HOME:
            return
        for _ in range(4):
            repeats = 0
            while lesson.value[8] != 'U':
                lesson.add('Corner twist · repeat the four-move trigger', "R' D' R D".split(),
                           'Work on the top-front-right corner. Repeat this four-move trigger until its yellow sticker faces up. The lower layers temporarily look scrambled: keep the same grip and finish all corners.')
                repeats += 1
                if repeats > 6:
                    raise ValueError('Corner twist did not converge')
            lesson.add('Bring the next corner to the working slot', ['U'],
                       'Turn only the top layer to bring the next corner to top-front-right. Do not rotate the whole cube. After all four corners, the lower layers return to solved.')

    lesson.stage('yellow-corner-twists', 'Turn the yellow corners upright',
                 'Keep yellow up and red front. Use top-front-right as the working slot. Twist that corner, then turn only U to bring in the next one. Do not stop while the lower layers look disturbed.',
                 'Every face is a single color. The cube is solved.', twist, lambda: lesson.value == HOME)
    return lesson.result()
