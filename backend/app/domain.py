import secrets

ALGORITHMS = [
    {"id": "sune", "name": "Sune", "set": "2-look OLL", "moves": "R U R' U R U2 R'", "description": "Orient the last-layer corners with this essential seven-move sequence."},
    {"id": "reverse-sune", "name": "Reverse Sune", "set": "2-look OLL", "moves": "R U2 R' U' R U' R'", "description": "The inverse of Sune. Learn the opposite rhythm and corner orientation."},
]

def scramble(length=25):
    # Practice random-move scramble; deliberately not a WCA random-state scramble.
    faces = [("R", "L"), ("U", "D"), ("F", "B")]
    result, previous = [], -1
    for _ in range(length):
        axis = secrets.choice([i for i in range(3) if i != previous])
        result.append(secrets.choice(faces[axis]) + secrets.choice(["", "'", "2"]))
        previous = axis
    return " ".join(result)
