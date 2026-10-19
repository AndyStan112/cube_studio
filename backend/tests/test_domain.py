import re

from app.domain import ALGORITHM_SETS, ALGORITHMS, scramble

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

def test_algorithm_catalog_memberships_and_variations():
    set_ids = {item["id"] for item in ALGORITHM_SETS}
    assert len(set_ids) == len(ALGORITHM_SETS)
    assert {item["id"] for item in ALGORITHMS} == {"sune", "reverse-sune", "j-perm", "t-perm"}
    for algorithm in ALGORITHMS:
        assert algorithm["set_ids"]
        assert len(algorithm["set_ids"]) == len(set(algorithm["set_ids"]))
        assert set(algorithm["set_ids"]) <= set_ids
        variants = algorithm["variations"]
        assert variants and variants[0]["id"] == "normal"
        assert len({item["id"] for item in variants}) == len(variants)
        for variant in variants:
            assert variant["name"]
            assert variant["moves"].split()
            assert all(re.fullmatch(r"[RLUDFB](?:2|')?", move) for move in variant["moves"].split())
    sune = next(item for item in ALGORITHMS if item["id"] == "sune")
    assert set(sune["set_ids"]) == {"2-look-oll", "2-look-cmll"}
    assert sum(item["id"] == "sune" for item in ALGORITHMS) == 1
    assert "2-look-cmll" in next(item for item in ALGORITHMS if item["id"] == "t-perm")["set_ids"]


def test_lefty_j_perm_is_a_mirrored_case_with_its_own_notation():
    variants = {item["id"]: item for item in next(item for item in ALGORITHMS if item["id"] == "j-perm")["variations"]}
    assert variants["normal"]["case"] == variants["righty"]["case"] == "Jb"
    assert variants["lefty"]["case"] == "Ja"
    assert variants["normal"]["moves"] != variants["righty"]["moves"]
    mirror = {"R": "L", "L": "R", "U": "U", "D": "D", "F": "F", "B": "B"}
    mirrored = [mirror[move[0]] + ("2" if move.endswith("2") else "" if move.endswith("'") else "'")
                for move in variants["normal"]["moves"].split()]
    assert " ".join(mirrored) == variants["lefty"]["moves"]
