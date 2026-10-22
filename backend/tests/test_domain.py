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
    sections = {item["id"]: {section["id"] for section in item["sections"]} for item in ALGORITHM_SETS}
    focuses = {"all", "last-layer", "last-layer-corners", "corner-orientation", "corner-permutation"}
    for item in ALGORITHM_SETS:
        assert item["focus"] in focuses
        assert len(sections[item["id"]]) == len(item["sections"])
        assert all(section["focus"] in focuses for section in item["sections"])
    assert len(set_ids) == len(ALGORITHM_SETS)
    assert {item["id"] for item in ALGORITHMS} == {"sune", "reverse-sune", "j-perm", "t-perm", "4x4-oll-parity", "4x4-pll-parity", "5x5-edge-parity"}
    set_sizes = {item["id"]: item["puzzle_size"] for item in ALGORITHM_SETS}
    for algorithm in ALGORITHMS:
        assert algorithm["puzzle_size"] in {3, 4, 5}
        assert all(set_sizes[m["set_id"]] == algorithm["puzzle_size"] for m in algorithm["memberships"])
        memberships = algorithm["memberships"]
        assert memberships
        ids = [membership["set_id"] for membership in memberships]
        assert len(ids) == len(set(ids))
        assert set(ids) <= set_ids
        for membership in memberships:
            assert len(membership["section_ids"]) == len(set(membership["section_ids"]))
            assert set(membership["section_ids"]) <= sections[membership["set_id"]]
        variants = algorithm["variations"]
        assert variants and variants[0]["id"] == "normal"
        assert len({item["id"] for item in variants}) == len(variants)
        for variant in variants:
            assert variant["name"]
            assert variant["moves"].split()
            assert all(re.fullmatch(r"(?:[2-5])?[RLUDFB]w?(?:2|')?", move) for move in variant["moves"].split())
    sune = next(item for item in ALGORITHMS if item["id"] == "sune")
    assert {item["set_id"] for item in sune["memberships"]} == {"2-look-oll", "2-look-cmll"}
    assert sum(item["id"] == "sune" for item in ALGORITHMS) == 1
    cmll_sections = {"corner-permutation": set(), "corner-orientation": set()}
    for algorithm in ALGORITHMS:
        for membership in algorithm["memberships"]:
            if membership["set_id"] == "2-look-cmll":
                for section in membership["section_ids"]:
                    cmll_sections[section].add(algorithm["id"])
    assert cmll_sections == {"corner-permutation": {"j-perm", "t-perm"}, "corner-orientation": {"sune", "reverse-sune"}}


def test_lefty_j_perm_is_a_mirrored_case_with_its_own_notation():
    variants = {item["id"]: item for item in next(item for item in ALGORITHMS if item["id"] == "j-perm")["variations"]}
    assert variants["normal"]["case"] == variants["righty"]["case"] == "Jb"
    assert variants["lefty"]["case"] == "Ja"
    assert variants["normal"]["moves"] != variants["righty"]["moves"]
    mirror = {"R": "L", "L": "R", "U": "U", "D": "D", "F": "F", "B": "B"}
    mirrored = [mirror[move[0]] + ("2" if move.endswith("2") else "" if move.endswith("'") else "'")
                for move in variants["normal"]["moves"].split()]
    assert " ".join(mirrored) == variants["lefty"]["moves"]
