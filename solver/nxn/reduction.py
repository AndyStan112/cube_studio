"""Human-followable 5×5 center-first reduction, then a beginner-only finish."""
from model import geometry, solved
from beginner import Lesson
from meyer import pieces, place, wing_order
from teaching import skeleton, reduced, finish_reduced

FLIP_WINGS = "Rw2 R2 U2 Rw2 R2 U2 Rw R' U2 Rw R' U2 Rw' R' U2 B2 U Rw' R U' B2 U Rw R' U R2".split()


def wing_goal(value):
    geo = geometry(5)
    lookup = {slot: i for i, slot in enumerate(geo)}
    result = list(value)
    for slot in pieces(5)[2]:
        for i in slot:
            position, normal = geo[i]
            midge = tuple(c if abs(c) == 4 else 0 for c in position)
            result[i] = value[lookup[(midge, normal)]]
    return ''.join(result)


def plan_reduction(value):
    lesson = Lesson(value, 5)
    centers = pieces(5)[1]
    home = solved(5)
    white = [i for i, slot in enumerate(centers) if home[slot[0]] == 'D']
    opposite = [i for i, slot in enumerate(centers) if home[slot[0]] in 'DU']
    def correct(ids):
        return all(lesson.value[j] == home[j] for i in ids for j in centers[i])
    lesson.stage('reduction-white-center', 'Reduction · white center',
                 'Use the fixed white center as your anchor. Join its surrounding center pieces into a solid white 3×3 block. Three-piece cycles move centers only; corners and edges return after every complete action.',
                 'The bottom 3×3 center block is entirely white.',
                 lambda: place(lesson, 1, white, 'White-center placement'), lambda: correct(white))
    lesson.stage('reduction-opposite-center', 'Reduction · opposite yellow center',
                 'Build the yellow 3×3 center opposite white. Each complete action preserves the finished white center. Keep the fixed yellow center up and red center front.',
                 'White and yellow center blocks are solved on opposite faces.',
                 lambda: place(lesson, 1, opposite, 'Opposite-center placement'), lambda: correct(opposite))
    all_centers = list(range(len(centers)))
    lesson.stage('reduction-remaining-centers', 'Reduction · remaining centers',
                 'Build the red, green, orange and blue center blocks around their fixed centers. The diagonal and side center pieces belong to separate orbits; each named cycle keeps those orbits and all completed centers intact at its boundary.',
                 'All six 3×3 center blocks match their fixed centers.',
                 lambda: place(lesson, 1, all_centers, 'Remaining-center placement'), lambda: correct(all_centers))
    def pair():
        goal = wing_goal(lesson.value)
        current_order, target_order = wing_order(lesson.value, 5), wing_order(goal, 5)
        target_index = {identity: i for i, identity in enumerate(target_order)}
        relative = [target_index[identity] for identity in current_order]
        if sum(a > b for i, a in enumerate(relative) for b in relative[i+1:]) % 2:
            before = skeleton(lesson.value, 5)
            lesson.add('Reduction · wing parity correction', FLIP_WINGS,
                       'An odd wing permutation cannot be completed with three-piece cycles alone. This dedicated big-cube parity sequence exchanges the upper-front wings. It restores all centers, corners and middle edge pieces, so the 3×3 skeleton stays unchanged.')
            if not correct(all_centers) or skeleton(lesson.value, 5) != before:
                raise ValueError('5×5 wing parity disturbed centers or the 3×3 skeleton')
        place(lesson, 2, list(range(len(pieces(5)[2]))), 'Match wings to their middle edge', goal)
    lesson.stage('reduction-edge-pairing', 'Reduction · build twelve edge groups',
                 'Each edge contains a middle piece and two wings. Use the middle piece as a color reference and bring its two matching wings alongside it. Center-only work is finished; these pure wing cycles preserve every center at action boundaries.',
                 'Every edge is a matching three-piece group, and all six center blocks remain solved.', pair,
                 lambda: reduced(lesson.value, 5))
    return finish_reduced(lesson, 'reduction_beginner')
