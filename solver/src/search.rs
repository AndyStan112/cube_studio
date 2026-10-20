//! Exact HTM IDA*. PDB distances are BFS distances in projections, never summed.
use crate::cube::{Cube, unrank};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

pub struct Tables {
    pub moves: [Cube; 18],
    twist: Vec<[u16; 18]>,
    flip: Vec<[u16; 18]>,
    perm: Vec<[u16; 18]>,
    orientation: Vec<u8>,
    corners: Vec<u8>,
}
fn bfs(size: usize, next: impl Fn(usize, usize) -> usize) -> Vec<u8> {
    let mut d = vec![u8::MAX; size];
    d[0] = 0;
    let mut q = VecDeque::from([0]);
    while let Some(i) = q.pop_front() {
        for m in 0..18 {
            let n = next(i, m);
            if d[n] == u8::MAX {
                d[n] = d[i] + 1;
                q.push_back(n);
            }
        }
    }
    d
}
impl Tables {
    pub fn new() -> Self {
        let moves = crate::cube::moves();
        let twist = (0..2187)
            .map(|mut n| {
                let mut c = Cube::default();
                let mut sum = 0;
                for i in (0..7).rev() {
                    c.co[i] = (n % 3) as u8;
                    sum += c.co[i];
                    n /= 3;
                }
                c.co[7] = (3 - sum % 3) % 3;
                std::array::from_fn(|m| c.moved(&moves[m]).twist() as u16)
            })
            .collect::<Vec<_>>();
        let flip = (0..2048)
            .map(|mut n| {
                let mut c = Cube::default();
                let mut sum = 0;
                for i in (0..11).rev() {
                    c.eo[i] = (n % 2) as u8;
                    sum ^= c.eo[i];
                    n /= 2;
                }
                c.eo[11] = sum;
                std::array::from_fn(|m| c.moved(&moves[m]).flip() as u16)
            })
            .collect::<Vec<_>>();
        let perm = (0..40320)
            .map(|n| {
                let c = Cube {
                    cp: unrank(n),
                    ..Cube::default()
                };
                std::array::from_fn(|m| c.moved(&moves[m]).perm() as u16)
            })
            .collect::<Vec<_>>();
        let orientation = bfs(2187 * 2048, |n, m| {
            twist[n / 2048][m] as usize * 2048 + flip[n % 2048][m] as usize
        });
        let corners = bfs(40320, |n, m| perm[n][m] as usize);
        Self {
            moves,
            twist,
            flip,
            perm,
            orientation,
            corners,
        }
    }
    pub fn bytes(&self) -> usize {
        self.orientation.len()
            + self.corners.len()
            + (self.twist.len() + self.flip.len() + self.perm.len()) * 36
    }
    pub fn checksum(&self) -> u64 {
        self.orientation
            .iter()
            .chain(&self.corners)
            .fold(0xcbf29ce484222325, |a, b| {
                (a ^ *b as u64).wrapping_mul(0x100000001b3)
            })
    }
    fn h(&self, c: &Cube, coords: [usize; 3]) -> u8 {
        self.orientation[coords[0] * 2048 + coords[1]]
            .max(self.corners[coords[2]])
            .max(
                c.ep.iter()
                    .enumerate()
                    .filter(|(i, e)| *i != **e as usize)
                    .count()
                    .div_ceil(4) as u8,
            )
    }
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct Progress {
    pub bound: u8,
    pub completed_bound: Option<u8>,
    pub nodes: u64,
    pub elapsed_ms: u64,
}
pub enum Outcome {
    Proved(Vec<usize>),
    TimedOut,
    Cancelled,
}
pub struct Search<'a> {
    pub tables: &'a Tables,
    pub cancel: Arc<AtomicBool>,
    pub deadline: Instant,
    pub started: Instant,
    pub progress: Progress,
    pub report: Box<dyn FnMut(&Progress) + 'a>,
}
enum Visit {
    Found,
    Exhausted,
    Stopped,
}
impl Search<'_> {
    fn stopped(&self) -> bool {
        self.cancel.load(Ordering::Relaxed) || Instant::now() >= self.deadline
    }
    fn dfs(
        &mut self,
        c: Cube,
        coords: [usize; 3],
        remaining: u8,
        last: usize,
        path: &mut Vec<usize>,
    ) -> Visit {
        self.progress.nodes += 1;
        if self.progress.nodes.is_multiple_of(4096) {
            if self.stopped() {
                return Visit::Stopped;
            }
            self.progress.elapsed_ms = self.started.elapsed().as_millis() as u64;
            (self.report)(&self.progress);
        }
        if self.tables.h(&c, coords) > remaining {
            return Visit::Exhausted;
        }
        if c == Cube::default() {
            return Visit::Found;
        }
        if remaining == 0 {
            return Visit::Exhausted;
        }
        for m in 0..18 {
            let face = m / 3;
            // Same-face turns combine. Opposite faces commute; retain one order.
            if last < 6 && (face == last || (face % 3 == last % 3 && face < last)) {
                continue;
            }
            let next = [
                self.tables.twist[coords[0]][m] as usize,
                self.tables.flip[coords[1]][m] as usize,
                self.tables.perm[coords[2]][m] as usize,
            ];
            path.push(m);
            match self.dfs(
                c.moved(&self.tables.moves[m]),
                next,
                remaining - 1,
                face,
                path,
            ) {
                Visit::Found => return Visit::Found,
                Visit::Stopped => return Visit::Stopped,
                Visit::Exhausted => {
                    path.pop();
                }
            }
        }
        Visit::Exhausted
    }
    // The verified fallback upper bound may improve concurrently.
    pub fn run(&mut self, c: Cube, upper: &std::sync::Mutex<Option<Vec<usize>>>) -> Outcome {
        let coords = [c.twist(), c.flip(), c.perm()];
        for bound in self.tables.h(&c, coords)..=20 {
            if self.stopped() {
                break;
            }
            self.progress.bound = bound;
            self.progress.elapsed_ms = self.started.elapsed().as_millis() as u64;
            (self.report)(&self.progress);
            if let Some(candidate) = upper.lock().expect("candidate lock").as_ref()
                && candidate.len() <= bound as usize
            {
                return Outcome::Proved(candidate.clone());
            }
            let mut path = Vec::new();
            match self.dfs(c, coords, bound, 6, &mut path) {
                Visit::Found => return Outcome::Proved(path),
                Visit::Stopped => break,
                Visit::Exhausted => {
                    self.progress.completed_bound = Some(bound);
                    (self.report)(&self.progress);
                }
            }
        }
        if self.cancel.load(Ordering::Relaxed) {
            Outcome::Cancelled
        } else {
            Outcome::TimedOut
        }
    }
}
