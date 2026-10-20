mod benchmark;
mod cube;
mod search;
use cube::{Cube, notation};
use search::{Outcome, Progress, Search, Tables};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use tiny_http::{Header, Response, Server};

#[derive(Clone)]
struct Job {
    id: String,
    cancel: Arc<AtomicBool>,
    snapshot: Arc<Mutex<Value>>,
    busy: Arc<AtomicBool>,
}
fn solution(moves: &[usize], proved: bool) -> Value {
    json!({"notation":moves.iter().map(|m|notation(*m)).collect::<Vec<_>>(),"moves":moves.iter().map(|m|json!({"kind":"cube_layer_turn","face":(cube::FACES[m/3] as char).to_string(),"layer_start":0,"layer_count":1,"amount":([1,2,-1][m%3])})).collect::<Vec<_>>(),"move_count":moves.len(),"metric":"HTM","verified":true,"optimality":if proved{"global_proved"}else{"unproved"}})
}
fn parse_moves(s: &str) -> Option<Vec<usize>> {
    s.split_whitespace()
        .map(|s| (0..18).find(|m| notation(*m) == s))
        .collect()
}
fn verify(c: Cube, moves: &[usize], tables: &Tables) -> bool {
    moves.iter().fold(c, |c, m| c.moved(&tables.moves[*m])) == Cube::default()
}
fn start_job(id: String, c: Cube, budget: u64, tables: Arc<Tables>) -> Job {
    let job = Job {
        id,
        cancel: Arc::new(AtomicBool::new(false)),
        snapshot: Arc::new(Mutex::new(
            json!({"status":"searching","candidate":null,"solution":null,"progress":Progress::default()}),
        )),
        busy: Arc::new(AtomicBool::new(true)),
    };
    let task = job.clone();
    thread::spawn(move || {
        let started = Instant::now();
        let deadline = started + Duration::from_millis(budget);
        let upper = Arc::new(Mutex::new(None));
        let fallback_task = task.clone();
        let fallback_upper = upper.clone();
        let fallback_tables = tables.clone();
        let fallback = thread::spawn(move || {
            if c == Cube::default() {
                return;
            }
            if let Some(text) = min2phase::solve_controlled(
                &c.facelets(),
                22,
                fallback_task.cancel.clone(),
                deadline,
            ) && let Some(moves) =
                parse_moves(&text).filter(|moves| verify(c, moves, &fallback_tables))
            {
                *fallback_upper.lock().expect("upper") = Some(moves.clone());
                fallback_task.snapshot.lock().expect("snapshot")["candidate"] =
                    solution(&moves, false);
            }
        });
        let progress_task = task.clone();
        let mut last = Instant::now();
        let mut search = Search {
            tables: &tables,
            cancel: task.cancel.clone(),
            deadline,
            started,
            progress: Progress::default(),
            report: Box::new(move |p| {
                if last.elapsed() > Duration::from_millis(200) || p.completed_bound == Some(p.bound)
                {
                    progress_task.snapshot.lock().expect("snapshot")["progress"] = json!(p);
                    last = Instant::now();
                }
            }),
        };
        let outcome =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| search.run(c, &upper)));
        task.cancel.store(true, Ordering::Relaxed); // also interrupts an unfinished fallback
        let fallback_ok = fallback.join().is_ok();
        let mut snapshot = task.snapshot.lock().expect("snapshot");
        snapshot["progress"] = json!(search.progress);
        snapshot["progress"]["elapsed_ms"] = json!(started.elapsed().as_millis() as u64);
        match outcome {
            Ok(Outcome::Proved(moves)) if verify(c, &moves, &tables) => {
                snapshot["status"] = json!("optimal_proved");
                snapshot["solution"] = solution(&moves, true);
            }
            Ok(Outcome::Cancelled) => snapshot["status"] = json!("cancelled"),
            Ok(Outcome::TimedOut) => snapshot["status"] = json!("timed_out"),
            _ => {
                snapshot["status"] = json!("failed");
                snapshot["error"] = json!("Exact result verification failed");
            }
        }
        if !fallback_ok {
            snapshot["fallback_error"] = json!("Fallback thread failed");
        }
        task.busy.store(false, Ordering::Release);
    });
    job
}
fn main() {
    if std::env::args().any(|a| a == "--healthcheck") {
        let ready = (|| -> std::io::Result<bool> {
            let mut stream = std::net::TcpStream::connect_timeout(
                &"127.0.0.1:8081".parse().expect("address"),
                Duration::from_secs(2),
            )?;
            stream.set_read_timeout(Some(Duration::from_secs(2)))?;
            stream.write_all(
                b"GET /ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            )?;
            let mut bytes = [0; 128];
            let n = stream.read(&mut bytes)?;
            Ok(std::str::from_utf8(&bytes[..n])
                .unwrap_or("")
                .starts_with("HTTP/1.1 200"))
        })()
        .unwrap_or(false);
        std::process::exit(if ready { 0 } else { 1 });
    }
    let shutting_down = Arc::new(AtomicBool::new(false));
    for signal in [signal_hook::consts::SIGTERM, signal_hook::consts::SIGINT] {
        signal_hook::flag::register(signal, shutting_down.clone()).expect("signal handler");
    }
    let started = Instant::now();
    // min2phase's lazy tables must be constructed before readiness and cancellation.
    assert!(!min2phase::solve(&cube::SOLVED.to_owned(), 22).starts_with("Error"));
    let tables = Arc::new(Tables::new());
    eprintln!(
        "ready pdb_version=1 pdb_fnv1a={:016x} table_bytes={} startup_ms={}",
        tables.checksum(),
        tables.bytes(),
        started.elapsed().as_millis()
    );
    if std::env::args().any(|a| a == "--benchmark") {
        benchmark::run(&tables);
        return;
    }
    let server = Server::http("0.0.0.0:8081").expect("listen");
    let mut active: Option<Job> = None;
    while !shutting_down.load(Ordering::Relaxed) {
        let Some(mut request) = server
            .recv_timeout(Duration::from_millis(100))
            .expect("receive")
        else {
            continue;
        };
        let path = request.url().to_owned();
        let method = request.method().as_str().to_owned();
        let (code, body) = if method == "GET" && (path == "/health" || path == "/ready") {
            (
                200,
                json!({"ready":true,"pdb_version":1,"table_bytes":tables.bytes()}),
            )
        } else if method == "POST" && path == "/jobs" {
            if active
                .as_ref()
                .is_some_and(|j| j.busy.load(Ordering::Acquire))
            {
                (429, json!({"error":"worker_busy"}))
            } else {
                let mut body = String::new();
                let read = request.as_reader().take(8193).read_to_string(&mut body);
                let parsed = serde_json::from_str::<Value>(&body).ok();
                if read.is_err() || body.len() > 8192 {
                    (422, json!({"error":"invalid_input"}))
                } else if let Some((data, c)) = parsed.and_then(|d| {
                    Cube::parse(d.get("facelets")?.as_str()?)
                        .ok()
                        .map(|c| (d, c))
                }) {
                    if let Some(id) = data["id"].as_str().filter(|id| id.len() <= 128) {
                        let budget = data["budget_ms"]
                            .as_u64()
                            .unwrap_or(300000)
                            .clamp(1, 300000);
                        active = Some(start_job(id.to_owned(), c, budget, tables.clone()));
                        (202, json!({"id":id}))
                    } else {
                        (422, json!({"error":"invalid_id"}))
                    }
                } else {
                    (422, json!({"error":"invalid_state"}))
                }
            }
        } else if let Some(job) = active
            .as_ref()
            .filter(|j| path == format!("/jobs/{}", j.id))
        {
            if method == "DELETE" {
                job.cancel.store(true, Ordering::Relaxed);
                (202, json!({"status":"cancelling"}))
            } else if method == "GET" {
                (200, job.snapshot.lock().expect("snapshot").clone())
            } else {
                (405, json!({"error":"method"}))
            }
        } else {
            (404, json!({"error":"not_found"}))
        };
        let response = Response::from_string(body.to_string())
            .with_status_code(code)
            .with_header(Header::from_bytes("Content-Type", "application/json").expect("header"));
        let _ = request.respond(response);
    }
    if let Some(job) = active {
        job.cancel.store(true, Ordering::Relaxed);
        let deadline = Instant::now() + Duration::from_secs(5);
        while job.busy.load(Ordering::Acquire) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
    }
    eprintln!("worker shutdown complete");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::{HashSet, VecDeque},
        sync::OnceLock,
    };
    fn tables() -> &'static Tables {
        static T: OnceLock<Tables> = OnceLock::new();
        T.get_or_init(Tables::new)
    }
    fn exact(c: Cube, budget: u64, cancel: bool) -> Outcome {
        let tables = tables();
        let start = Instant::now();
        Search {
            tables,
            cancel: Arc::new(AtomicBool::new(cancel)),
            deadline: start + Duration::from_millis(budget),
            started: start,
            progress: Progress::default(),
            report: Box::new(|_| {}),
        }
        .run(c, &Mutex::new(None))
    }
    #[test]
    fn representation_and_inverse() {
        let t = tables();
        for m in 0..18 {
            let c = Cube::default().moved(&t.moves[m]);
            assert_eq!(Cube::parse(&c.facelets()).unwrap(), c);
            assert_eq!(c.moved(&t.moves[m / 3 * 3 + 2 - m % 3]), Cube::default());
        }
    }
    #[test]
    fn solved_and_all_single_turns() {
        let t = tables();
        for c in std::iter::once(Cube::default()).chain(t.moves) {
            let Outcome::Proved(p) = exact(c, 1000, false) else {
                panic!("no proof")
            };
            assert_eq!(p.len(), usize::from(c != Cube::default()));
            assert!(verify(c, &p, t));
        }
    }
    #[test]
    fn bfs_oracle() {
        let t = tables();
        let mut seen = HashSet::from([Cube::default()]);
        let mut q = VecDeque::from([(Cube::default(), 0)]);
        let mut count = 0;
        while let Some((c, d)) = q.pop_front() {
            let Outcome::Proved(p) = exact(c, 1000, false) else {
                panic!("no proof")
            };
            assert_eq!(p.len(), d);
            assert!(verify(c, &p, t));
            count += 1;
            if d < 2 {
                for m in &t.moves {
                    let n = c.moved(m);
                    if seen.insert(n) {
                        q.push_back((n, d + 1));
                    }
                }
            }
        }
        assert!(count > 250);
    }
    #[test]
    fn impossible_states() {
        let mut f = cube::SOLVED.as_bytes().to_vec();
        f.swap(5, 10);
        assert!(Cube::parse(std::str::from_utf8(&f).unwrap()).is_err());
        let mut c = Cube::default();
        c.co[0] = 1;
        assert!(Cube::parse(&c.facelets()).is_err());
        c = Cube::default();
        c.ep.swap(0, 1);
        assert!(Cube::parse(&c.facelets()).is_err());
        assert!(Cube::parse(&"U".repeat(54)).is_err());
        let mut duplicate = cube::SOLVED.as_bytes().to_vec();
        duplicate.swap(19, 16);
        assert!(Cube::parse(std::str::from_utf8(&duplicate).unwrap()).is_err());
        let mut mirrored = cube::SOLVED.as_bytes().to_vec();
        mirrored.swap(9, 20);
        assert!(Cube::parse(std::str::from_utf8(&mirrored).unwrap()).is_err());
    }
    #[test]
    fn timeout_and_cancel_are_not_proofs() {
        let c =
            Cube::parse(&min2phase::from_moves(&"R U F L D B R U F".to_owned()).unwrap()).unwrap();
        assert!(matches!(exact(c, 0, false), Outcome::TimedOut));
        assert!(matches!(exact(c, 1000, true), Outcome::Cancelled));
    }
    #[test]
    fn two_phase_random_states_verified_unproved() {
        let t = tables();
        for _ in 0..8 {
            let c = Cube::parse(&min2phase::random_cube()).unwrap();
            let text = min2phase::solve_controlled(
                &c.facelets(),
                22,
                Arc::new(AtomicBool::new(false)),
                Instant::now() + Duration::from_secs(10),
            )
            .unwrap();
            let p = parse_moves(&text).unwrap();
            assert!(verify(c, &p, t));
            assert_eq!(solution(&p, false)["optimality"], "unproved");
        }
    }
    #[test]
    fn fallback_cancellation() {
        let c = min2phase::random_cube();
        assert!(
            min2phase::solve_controlled(
                &c,
                22,
                Arc::new(AtomicBool::new(true)),
                Instant::now() + Duration::from_secs(2)
            )
            .is_none()
        );
    }
}
