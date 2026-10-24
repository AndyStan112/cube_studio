"""Center-first 4×4 reduction as an alternative to Meyer."""
from beginner import Lesson
from model import solved
from meyer import pieces, place, wing_order
from reduction import FLIP_WINGS
from teaching import reduced, parity_corrections, finish_reduced


def plan_reduction4(value):
    lesson = Lesson(value, 4)
    centers = pieces()[1]
    home = solved(4)
    white = [i for i, slot in enumerate(centers) if home[slot[0]] == 'D']
    opposite = [i for i, slot in enumerate(centers) if home[slot[0]] in 'DU']
    def correct(ids):
        return all(lesson.value[j] == home[j] for i in ids for j in centers[i])
    for id, title, ids, explanation, checkpoint in [
        ('white-center', 'White center', white,
         'Build the white 2×2 center on the bottom. There is no fixed center on a 4×4: use the displayed reference colors.', 'The bottom center block is white.'),
        ('opposite-center', 'Opposite yellow center', opposite,
         'Build yellow opposite white, keeping the completed white center intact at each action boundary.', 'White and yellow center blocks are solved on opposite faces.'),
        ('remaining-centers', 'Remaining four centers', list(range(len(centers))),
         'Build red front, green right, orange back and blue left. A complete center three-cycle restores all non-target pieces and completed centers.', 'All six 2×2 centers match the reference color scheme.'),
    ]:
        lesson.stage('reduction-'+id, 'Reduction · '+title, explanation, checkpoint,
                     lambda ids=ids: place(lesson, 1, ids, 'Center placement'), lambda ids=ids: correct(ids))
    def pair():
        order = wing_order(lesson.value)
        if sum(a > b for i, a in enumerate(order) for b in order[i+1:]) % 2:
            lesson.add('Reduction · wing parity correction', FLIP_WINGS,
                       'Correct odd wing permutation before pairing. This dedicated big-cube sequence restores all centers and corners and exchanges the upper-front wings.')
        place(lesson, 2, list(range(len(pieces()[2]))), 'Edge-wing pairing')
        for name, moves, explanation in parity_corrections(lesson.value):
            lesson.add(name, moves, explanation)
    lesson.stage('reduction-edge-pairing', 'Reduction · pair the twelve edges',
                 'Bring matching wings together with pure three-piece cycles. This variant places pairs against matching centers, making the beginner finish easier. Finish each setup, core and undo before checking. Any even-cube parity is corrected here.',
                 'All twelve edges are paired and all six centers are restored.', pair, lambda: reduced(lesson.value, 4))
    return finish_reduced(lesson, 'reduction_beginner')
