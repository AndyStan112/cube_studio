from app.domain import ALGORITHMS, scramble

def test_practice_scramble_valid_and_avoids_repeated_axes():
    axes = {face: axis for axis, faces in enumerate(["RL", "UD", "FB"]) for face in faces}
    for _ in range(100):
        moves = scramble().split()
        assert len(moves) == 25
        for i, move in enumerate(moves):
            assert move[0] in axes
            assert move[1:] in ["", "'", "2"]
            if i:
                assert axes[moves[i-1][0]] != axes[move[0]]

def test_algorithm_catalog():
    assert {a["id"] for a in ALGORITHMS} == {"sune", "reverse-sune"}
    assert all(len(a["moves"].split()) == 7 for a in ALGORITHMS)
