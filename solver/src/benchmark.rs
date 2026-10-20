//! Reproducible distributions; random moves are kept separate from uniform states.
use crate::{
    cube::Cube,
    parse_moves,
    search::{Outcome, Progress, Search, Tables},
    verify,
};
use serde_json::json;
use std::{
    sync::{Arc, Mutex, atomic::AtomicBool},
    time::{Duration, Instant},
};
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut n = self.0;
        n = (n ^ (n >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        n = (n ^ (n >> 27)).wrapping_mul(0x94d049bb133111eb);
        n ^ (n >> 31)
    }
    fn bounded(&mut self, max: u64) -> u64 {
        let limit = u64::MAX - u64::MAX % max;
        loop {
            let n = self.next();
            if n < limit {
                return n % max;
            }
        }
    }
    fn shuffle(&mut self, p: &mut [u8]) {
        for i in (1..p.len()).rev() {
            let j = self.bounded((i + 1) as u64) as usize;
            p.swap(i, j);
        }
    }
    fn uniform(&mut self) -> Cube {
        let mut c = Cube::default();
        self.shuffle(&mut c.cp);
        self.shuffle(&mut c.ep);
        for i in 0..7 {
            c.co[i] = self.bounded(3) as u8;
        }
        c.co[7] = (3 - c.co[..7].iter().sum::<u8>() % 3) % 3;
        for i in 0..11 {
            c.eo[i] = self.bounded(2) as u8;
        }
        c.eo[11] = c.eo[..11].iter().fold(0, |a, b| a ^ b);
        // Pair each edge permutation with the parity-compatible one bijectively.
        if Cube::parse(&c.facelets()).is_err() {
            c.ep.swap(0, 1);
        }
        c
    }
}
pub fn run(tables: &Tables) {
    let budget = std::env::var("SOLVER_BENCH_BUDGET_MS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(5000);
    let mut rng = Rng(112);
    let started = Instant::now();
    for (name, count) in [
        ("shallow_0_to_5_random_moves", 32),
        ("random_25_moves", 6),
        ("uniform_valid_states", 6),
    ] {
        for i in 0..count {
            let cube = if name == "uniform_valid_states" {
                rng.uniform()
            } else {
                let length = if name == "random_25_moves" { 25 } else { i % 6 };
                (0..length).fold(Cube::default(), |c, _| {
                    c.moved(&tables.moves[rng.bounded(18) as usize])
                })
            };
            let fallback_start = Instant::now();
            let text = min2phase::solve_controlled(
                &cube.facelets(),
                22,
                Arc::new(AtomicBool::new(false)),
                fallback_start + Duration::from_secs(10),
            );
            let fallback_ms = fallback_start.elapsed().as_secs_f64() * 1000.;
            let candidate = text
                .and_then(|s| parse_moves(&s))
                .filter(|p| verify(cube, p, tables));
            let candidate_count = candidate.as_ref().map(Vec::len);
            let upper = Mutex::new(candidate);
            let exact_start = Instant::now();
            let mut search = Search {
                tables,
                cancel: Arc::new(AtomicBool::new(false)),
                deadline: exact_start + Duration::from_millis(budget),
                started: exact_start,
                progress: Progress::default(),
                report: Box::new(|_| {}),
            };
            let outcome = search.run(cube, &upper);
            let exact_ms = exact_start.elapsed().as_secs_f64() * 1000.;
            let (status, length) = match outcome {
                Outcome::Proved(p) => {
                    assert!(verify(cube, &p, tables));
                    ("optimal_proved", Some(p.len()))
                }
                Outcome::TimedOut => ("timed_out", None),
                Outcome::Cancelled => ("cancelled", None),
            };
            println!(
                "{}",
                json!({"distribution":name,"sample":i,"budget_ms":budget,"facelets":cube.facelets(),"fallback_ms":fallback_ms,"fallback_moves":candidate_count,"exact_ms":exact_ms,"status":status,"optimal_moves":length,"nodes":search.progress.nodes,"completed_bound":search.progress.completed_bound})
            );
        }
    }
    eprintln!("benchmark_ms={} seed=112", started.elapsed().as_millis());
}
