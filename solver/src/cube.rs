//! Integer cubie representation; URFDLB, standard Kociemba row-major indexing.
pub const SOLVED: &str = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
pub const FACES: &[u8; 6] = b"URFDLB";
pub const CORNERS: [[usize; 3]; 8] = [
    [8, 9, 20],
    [6, 18, 38],
    [0, 36, 47],
    [2, 45, 11],
    [29, 26, 15],
    [27, 44, 24],
    [33, 53, 42],
    [35, 17, 51],
];
pub const EDGES: [[usize; 2]; 12] = [
    [5, 10],
    [7, 19],
    [3, 37],
    [1, 46],
    [32, 16],
    [28, 25],
    [30, 43],
    [34, 52],
    [23, 12],
    [21, 41],
    [50, 39],
    [48, 14],
];
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Cube {
    pub cp: [u8; 8],
    pub co: [u8; 8],
    pub ep: [u8; 12],
    pub eo: [u8; 12],
}
impl Default for Cube {
    fn default() -> Self {
        Self {
            cp: std::array::from_fn(|i| i as u8),
            co: [0; 8],
            ep: std::array::from_fn(|i| i as u8),
            eo: [0; 12],
        }
    }
}
fn parity(p: &[u8]) -> usize {
    p.iter()
        .enumerate()
        .map(|(i, a)| p[i + 1..].iter().filter(|b| a > *b).count())
        .sum::<usize>()
        % 2
}
impl Cube {
    pub fn parse(value: &str) -> Result<Self, String> {
        let f = value.as_bytes();
        if f.len() != 54
            || FACES
                .iter()
                .any(|s| f.iter().filter(|c| *c == s).count() != 9)
        {
            return Err("Expected nine of each URFDLB symbol".into());
        }
        if FACES.iter().enumerate().any(|(i, c)| f[i * 9 + 4] != *c) {
            return Err("Incorrect fixed centers".into());
        }
        let mut cube = Self::default();
        for (i, slot) in CORNERS.iter().enumerate() {
            let found = CORNERS.iter().enumerate().find_map(|(p, home)| {
                (0..3)
                    .find(|o| (0..3).all(|n| f[slot[(n + o) % 3]] == SOLVED.as_bytes()[home[n]]))
                    .map(|o| (p, o))
            });
            let (p, o) = found.ok_or("Invalid corner inventory")?;
            cube.cp[i] = p as u8;
            cube.co[i] = o as u8;
        }
        for (i, slot) in EDGES.iter().enumerate() {
            let found = EDGES.iter().enumerate().find_map(|(p, home)| {
                (0..2)
                    .find(|o| (0..2).all(|n| f[slot[(n + o) % 2]] == SOLVED.as_bytes()[home[n]]))
                    .map(|o| (p, o))
            });
            let (p, o) = found.ok_or("Invalid edge inventory")?;
            cube.ep[i] = p as u8;
            cube.eo[i] = o as u8;
        }
        let mut cp = cube.cp;
        cp.sort();
        let mut ep = cube.ep;
        ep.sort();
        if cp != Self::default().cp || ep != Self::default().ep {
            return Err("Duplicate pieces".into());
        }
        if cube.co.iter().sum::<u8>() % 3 != 0
            || cube.eo.iter().sum::<u8>() % 2 != 0
            || parity(&cube.cp) != parity(&cube.ep)
        {
            return Err("Impossible orientation or permutation parity".into());
        }
        Ok(cube)
    }
    pub fn facelets(&self) -> String {
        let mut f = SOLVED.as_bytes().to_vec();
        for (i, slot) in CORNERS.iter().enumerate() {
            for n in 0..3 {
                f[slot[(n + self.co[i] as usize) % 3]] =
                    SOLVED.as_bytes()[CORNERS[self.cp[i] as usize][n]];
            }
        }
        for (i, slot) in EDGES.iter().enumerate() {
            for n in 0..2 {
                f[slot[(n + self.eo[i] as usize) % 2]] =
                    SOLVED.as_bytes()[EDGES[self.ep[i] as usize][n]];
            }
        }
        String::from_utf8(f).expect("ASCII faces")
    }
    pub fn moved(&self, m: &Self) -> Self {
        Self {
            cp: std::array::from_fn(|i| self.cp[m.cp[i] as usize]),
            co: std::array::from_fn(|i| (self.co[m.cp[i] as usize] + m.co[i]) % 3),
            ep: std::array::from_fn(|i| self.ep[m.ep[i] as usize]),
            eo: std::array::from_fn(|i| self.eo[m.ep[i] as usize] ^ m.eo[i]),
        }
    }
    pub fn twist(&self) -> usize {
        self.co[..7].iter().fold(0, |a, c| a * 3 + *c as usize)
    }
    pub fn flip(&self) -> usize {
        self.eo[..11].iter().fold(0, |a, c| a * 2 + *c as usize)
    }
    pub fn perm(&self) -> usize {
        rank(&self.cp)
    }
}
pub fn rank(p: &[u8]) -> usize {
    p.iter().enumerate().fold(0, |a, (i, c)| {
        a * (p.len() - i) + p[i + 1..].iter().filter(|d| c > *d).count()
    })
}
pub fn unrank(mut n: usize) -> [u8; 8] {
    let mut digits = [0; 8];
    for i in (0..8).rev() {
        digits[i] = n % (8 - i);
        n /= 8 - i;
    }
    let mut available: Vec<u8> = (0..8).collect();
    std::array::from_fn(|i| available.remove(digits[i]))
}
pub fn notation(m: usize) -> String {
    format!("{}{}", FACES[m / 3] as char, ["", "2", "'"][m % 3])
}
pub fn moves() -> [Cube; 18] {
    std::array::from_fn(|m| {
        Cube::parse(&min2phase::from_moves(&notation(m)).expect("move")).expect("valid move")
    })
}
