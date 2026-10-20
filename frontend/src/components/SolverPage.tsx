import { lazy, Suspense, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { readStored, writeStored } from "../lib/offline";
import { useSolverInput } from "../lib/solverInput";
import { ApiError } from "../lib/api";
import { applyMove, solved } from "../lib/cube";
import {
  FACE_COLORS,
  FACE_ORDER,
  SOLVED_FACELETS,
  cubiesToFacelets,
  faceletsToCubies,
  validateFacelets,
} from "../lib/facelets";
import {
  OfflineSolver,
  canUseOffline,
  cancelJob,
  createJob,
  getJob,
  terminal,
  verifySolution,
  type Job,
  type Solution,
} from "../lib/solver";
import "./SolverPage.css";
const FaceletCube = lazy(() => import("./FaceletCube"));
const Cube = lazy(() => import("./Cube"));
const savedKey = "cube-studio-solver-job-v1";
const faceNames: Record<string, string> = {
  U: "Up · yellow",
  R: "Right · green",
  F: "Front · red",
  D: "Down · white",
  L: "Left · blue",
  B: "Back · orange",
};
export default function SolverPage() {
  const { value, setValue, representation, setRepresentation } = useSolverInput();
  const [color, setColor] = useState("U"),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Ready"),
    [mode, setMode] = useState("");
  const [job, setJob] = useState<Job | null>(null),
    [selected, setSelected] = useState<Solution | null>(null),
    [input, setInput] = useState(SOLVED_FACELETS),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [transparent, setTransparent] = useState(false),
    [resetView, setResetView] = useState(0);
  const offline = useRef(new OfflineSolver()),
    generation = useRef(0);
  const initial = useMemo(() => faceletsToCubies(input), [input]);
  const moves = useMemo(() => selected?.notation ?? [], [selected]);
  const running = !!job && !terminal(job),
    locked = busy || running;
  function choose(solution: Solution, state = input) {
    verifySolution(state, solution);
    setSelected(solution);
    setInput(state);
    setStep(0);
    setPlaying(false);
  }
  useEffect(() => {
    const ticket = generation.current;
    const id = localStorage.getItem(savedKey);
    if (id)
      getJob(id)
        .then((j) => {
          if (generation.current !== ticket) return;
          setJob(j);
          setInput(j.input);
          setValue(j.input);
          setMode("Online");
        })
        .catch((e) => {
          if (generation.current !== ticket) return;
          if (e instanceof ApiError && e.status === 404) {
            localStorage.removeItem(savedKey);
            return;
          }
          if (canUseOffline(e)) {
            const saved = readStored<Job | null>(`${savedKey}:snapshot`, null);
            if (saved?.id === id) {
              setMode("Offline");
              setInput(saved.input);
              setValue(saved.input);
              if (terminal(saved)) setJob(saved);
              else {
                localStorage.removeItem(savedKey);
                void runOffline(saved.input, ticket);
              }
              return;
            }
            setStatus("Ready");
            return;
          }
          setError(e.message);
        });
    return () => {
      generation.current++;
      offline.current.cancel();
    };
  }, []);
  useEffect(() => {
    if (!job) return;
    writeStored(`${savedKey}:snapshot`, job);
    if (job.solution) {
      try {
        choose(job.solution, job.input);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setStatus(job.status.replaceAll("_", " "));
    if (terminal(job)) {
      if (job.error) setError(job.error);
      return;
    }
    let active = true,
      inflight = false;
    const update = (j: Job) => {
      if (active) {
        setJob(j);
        setStatus(j.status.replaceAll("_", " "));
        setMode("Online");
      }
    };
    const source = new EventSource(
      `/api/solver/jobs/${encodeURIComponent(job.id)}/events`,
    );
    const onEvent = (event: MessageEvent) => {
      try {
        update(JSON.parse(event.data));
      } catch {
        setError("Invalid progress response");
      }
    };
    for (const name of [
      "snapshot",
      "queued",
      "searching",
      "candidate_found",
      "fallback_available",
      "optimal_proved",
      "timed_out",
      "cancelled",
      "failed",
    ])
      source.addEventListener(name, onEvent as EventListener);
    const poll = setInterval(() => {
      if (inflight) return;
      inflight = true;
      getJob(job.id)
        .then(update)
        .catch((e) => {
          if (!active) return;
          if (canUseOffline(e)) {
            active = false;
            source.close();
            clearInterval(poll);
            localStorage.removeItem(savedKey);
            setJob(null);
            void runOffline(job.input, ++generation.current);
          } else setStatus(`Reconnecting: ${e.message}`);
        })
        .finally(() => {
          inflight = false;
        });
    }, 3000);
    return () => {
      active = false;
      source.close();
      clearInterval(poll);
    };
    // Subscribe once per job; incoming progress does not replace the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    job?.id,
    job?.status === "optimal_proved",
    job?.status === "timed_out",
    job?.status === "cancelled",
    job?.status === "failed",
  ]);
  useEffect(() => {
    if (!playing) return;
    if (step >= moves.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((s) => s + 1), 800);
    return () => clearTimeout(timer);
  }, [playing, step, moves.length]);
  async function runOffline(state: string, ticket: number) {
    setMode("Offline");
    setBusy(true);
    setStatus("Loading offline solver…");
    try {
      const result = await offline.current.solve(state, (message) => {
        if (generation.current === ticket) setStatus(message);
      });
      if (generation.current === ticket) {
        choose(result, state);
        setStatus("Complete");
      }
    } catch (e) {
      if (generation.current === ticket) setError((e as Error).message);
    } finally {
      if (generation.current === ticket) setBusy(false);
    }
  }
  async function start(forceOffline = false) {
    setError("");
    try {
      validateFacelets(value);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const ticket = ++generation.current;
    localStorage.removeItem(savedKey);
    setBusy(true);
    setSelected(null);
    setStep(0);
    setPlaying(false);
    setJob(null);
    setInput(value);
    setStatus("Connecting…");
    if (forceOffline || !navigator.onLine) {
      await runOffline(value, ticket);
      return;
    }
    try {
      const next = await createJob(value);
      if (generation.current !== ticket) {
        void cancelJob(next.id).catch(() => {});
        return;
      }
      localStorage.setItem(savedKey, next.id);
      setJob(next);
      setMode("Online");
    } catch (e) {
      if (generation.current === ticket) {
        if (canUseOffline(e)) await runOffline(value, ticket);
        else setError((e as Error).message);
      }
    } finally {
      if (generation.current === ticket) setBusy(false);
    }
  }
  async function cancel() {
    generation.current++;
    offline.current.cancel();
    setBusy(false);
    setPlaying(false);
    if (job && !terminal(job)) {
      try {
        setJob(await cancelJob(job.id));
        setStatus("Cancelling…");
      } catch (e) {
        if (canUseOffline(e)) {
          setJob(null);
          localStorage.removeItem(savedKey);
          setStatus("Cancelled");
        } else setError((e as Error).message);
      }
    } else setStatus("Cancelled");
  }
  function editValue(next: SetStateAction<string>) {
    generation.current++;
    setValue(next);
    setSelected(null);
    setJob(null);
    setStep(0);
    setPlaying(false);
    setError("");
    setStatus("Ready");
    setMode("");
    localStorage.removeItem(savedKey);
    localStorage.removeItem(`${savedKey}:snapshot`);
  }
  function demo() {
    const sequence = Array.from(
      { length: 25 },
      () =>
        FACE_ORDER[Math.floor(Math.random() * 6)] +
        ["", "'", "2"][Math.floor(Math.random() * 3)],
    );
    editValue(
      cubiesToFacelets(sequence.reduce((s, m) => applyMove(s, m), solved())),
    );
  }
  function jump(n: number) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(moves.length, n)));
  }
  const viewerTools = (
    <div className="cube-tools">
      <button className={`tool-button ${transparent ? "selected" : ""}`}
        aria-label="See-through" aria-pressed={transparent}
        title={transparent ? "Disable see-through" : "Enable see-through"}
        onClick={() => setTransparent((value) => !value)}>
        {transparent ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
  return (
    <div className="solver-layout">
      <section className="card solver-input">
        <h2>Your cube</h2>
        <p className="solver-hint">Yellow up · Red front</p>
        <div className="representation-toggle" role="group" aria-label="Cube representation">
          {(["2d", "text", "3d"] as const).map((view) => (
            <button key={view} className="button" aria-pressed={representation === view}
              onClick={() => setRepresentation(view)}>
              {view === "text" ? "Text" : view.toUpperCase()}
            </button>
          ))}
        </div>
        {representation !== "text" && <>
        <div className="solver-palette">
          {[...FACE_ORDER].map((f) => (
            <button
              key={f}
              aria-label={`Paint ${faceNames[f]} stickers`}
              title={faceNames[f]}
              aria-pressed={color === f}
              onClick={() => setColor(f)}
              style={{
                background: FACE_COLORS[f],
                outline: color === f ? "3px solid #326b55" : undefined,
              }}
            >
              {f}
            </button>
          ))}
        </div>
        {representation === "2d" ? <div className="cube-net">
          {[..."ULFRBD"].map((f) => (
            <div
              key={f}
              className={`net-face net-${f}`}
              aria-label={`${f} face`}
            >
              {Array.from({ length: 9 }, (_, i) => {
                const index = FACE_ORDER.indexOf(f) * 9 + i;
                return (
                  <button
                    key={i}
                    disabled={locked || i === 4}
                    aria-label={`${f}${i + 1}: ${value[index]}`}
                    style={{ background: FACE_COLORS[value[index]] ?? "#ccc" }}
                    onClick={() =>
                      editValue(
                        (s) => s.slice(0, index) + color + s.slice(index + 1),
                      )
                    }
                  >
                    {i === 4 ? f : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        : <Suspense fallback={<p>Loading cube…</p>}>
          <FaceletCube value={value} color={color} disabled={locked} onChange={editValue} transparent={transparent}>
            {viewerTools}
          </FaceletCube>
        </Suspense>}
        <p className="solver-hint">Pick a color, then a sticker.{representation === "3d" && " Drag to orbit · Pinch to zoom"}</p>
        </>}
        {representation === "text" && <div className="solver-facelets">
          <p id="facelet-format">
            A facelet is one sticker. Enter 54 letters: nine per face, in{" "}
            <strong>U R F D L B</strong> order.
          </p>
          <div className="facelet-legend">
            {[...FACE_ORDER].map((f) => (
              <span key={f}>
                <i style={{ background: FACE_COLORS[f] }} aria-hidden="true" />
                <strong>{f}</strong> {faceNames[f]}
              </span>
            ))}
          </div>
          <p id="facelet-traversal">
            Read each face left to right, top to bottom, looking directly at it.
            Keep U above the side faces, B above U, and F above D. The fifth
            letter is the center.
          </p>
          <label className="facelet-label" htmlFor="solver-facelets">
            Cube facelets
          </label>
          <textarea
            id="solver-facelets"
            aria-label="Cube facelets"
            aria-describedby="facelet-format facelet-traversal"
            value={value}
            spellCheck={false}
            autoCapitalize="characters"
            disabled={locked}
            onChange={(e) =>
              editValue(
                e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 54),
              )
            }
          />
        </div>}
        <div className="solver-actions">
          <button
            className="button"
            disabled={locked}
            onClick={() => void start()}
          >
            Solve
          </button>
          <button className="button" disabled={locked} onClick={demo}>
            Scramble
          </button>
          <button
            className="button"
            disabled={locked}
            onClick={() => editValue(SOLVED_FACELETS)}
          >
            Reset cube
          </button>
          <button
            className="button"
            disabled={locked}
            onClick={() => void start(true)}
          >
            Offline
          </button>
          {locked && (
            <button className="button" onClick={() => void cancel()}>
              Cancel
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
      </section>
      <section className="card trainer-card">
        <div className="trainer-heading">
          <h2>{selected ? "Solution" : "Cube preview"}</h2>
          {mode && <span className="outline-label">{mode}</span>}
        </div>
        {(locked || (!selected && status !== "Ready")) && (
          <p className="solver-status" role="status" aria-live="polite">
            {status === "searching" ? "Finding the shortest solution…" : status}
          </p>
        )}
        {job && (!selected || running) && (
          <div className="solver-progress">
            <span>
              {job.best_move_count === null
                ? "Searching"
                : `${job.best_move_count} moves`}{" "}
              · {(job.elapsed_ms / 1000).toFixed(1)} s
            </span>
            <details className="solver-search-details">
              <summary>Search details</summary>
              <dl>
                <div>
                  <dt>Current bound</dt>
                  <dd>{job.progress.bound ?? "—"}</dd>
                </div>
                <div>
                  <dt>Completed bound</dt>
                  <dd>{job.progress.completed_bound ?? "—"}</dd>
                </div>
                <div>
                  <dt>Nodes</dt>
                  <dd>{(job.progress.nodes ?? 0).toLocaleString()}</dd>
                </div>
              </dl>
            </details>
          </div>
        )}
        {job?.candidate &&
          job.fallback_available &&
          job.status !== "optimal_proved" && (
            <div className="solver-actions solver-choice">
              <button
                className="button"
                onClick={() => {
                  try {
                    choose(job.candidate!, job.input);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Use {job.candidate.move_count}-move solution
              </button>
              {running && (
                <span className="solver-hint">Still checking for shorter.</span>
              )}
            </div>
          )}
        {job?.status === "failed" && (
          <button
            className="button"
            disabled={busy}
            onClick={() => void start(true)}
          >
            Use offline solver
          </button>
        )}
        {selected && (
          <div
            className="solver-result"
            title={
              selected.optimality === "global_proved"
                ? "Proved globally optimal in HTM (a half turn counts as one move)."
                : "Verified solution; optimality has not been proved. A half turn counts as one move."
            }
          >
            <strong>
              {selected.optimality === "global_proved"
                ? "Optimal"
                : "Near-optimal"}
            </strong>
            <span>{selected.move_count} {selected.move_count === 1 ? "move" : "moves"}</span>
          </div>
        )}
        {selected ? <div className={`cube-stage ${transparent ? "is-see-through" : ""}`}>
          <Suspense fallback={<p>Loading cube…</p>}>
            <Cube
              key={input}
              moves={moves}
              initialState={initial}
              step={step}
              transparent={transparent}
              resetView={resetView}
              maskIrrelevant={false}
              focus="all"
            />
          </Suspense>
          {viewerTools}
        </div> : <Suspense fallback={<p>Loading cube…</p>}>
          <FaceletCube value={value} color={color} disabled onChange={editValue} transparent={transparent}>
            {viewerTools}
          </FaceletCube>
        </Suspense>}
        <div className="notation">
          {moves.map((m, i) => (
            <button
              key={i}
              className={i < step ? "completed" : i === step ? "next" : ""}
              onClick={() => jump(i + 1)}
              aria-label={`Go to move ${i + 1}: ${m}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="solver-actions">
          <button
            className="button"
            onClick={() => {
              jump(0);
              setResetView((n) => n + 1);
            }}
          >
            Reset
          </button>
          <button
            className="button"
            disabled={!step}
            aria-label="Previous move"
            title="Previous move"
            onClick={() => jump(step - 1)}
          >
            <ArrowLeft size={19} aria-hidden="true" />
          </button>
          <button
            className="button"
            disabled={!moves.length}
            onClick={() => {
              if (step === moves.length) setStep(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            className="button"
            disabled={step === moves.length}
            aria-label="Next move"
            title="Next move"
            onClick={() => jump(step + 1)}
          >
            <ArrowRight size={19} aria-hidden="true" />
          </button>
          <span>
            {step} / {moves.length}
          </span>
        </div>
      </section>
    </div>
  );
}
