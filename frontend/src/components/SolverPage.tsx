import { lazy, Suspense, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import { readStored, writeStored } from "../lib/offline";
import { useSolverInput } from "../lib/solverInput";
import { ApiError } from "../lib/api";
import { applyMove, solved, type CubeSize } from "../lib/cube";
import {
  FACE_COLORS,
  FACE_ORDER,
  solvedFacelets,
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
  type SolverMethod,
} from "../lib/solver";
import { practiceMoves, type CubeEvent } from "../lib/puzzles";
import "./SolverPage.css";
import SolverLesson from "./SolverLesson";
import { moveDescription } from "../lib/teaching";
const FaceletCube = lazy(() => import("./FaceletCube"));
const Cube = lazy(() => import("./Cube"));

const faceNames: Record<string, string> = {
  U: "Up · yellow",
  R: "Right · green",
  F: "Front · red",
  D: "Down · white",
  L: "Left · blue",
  B: "Back · orange",
};
export default function SolverPage({ size = 3 }: { size?: CubeSize }) {
  const [method, setMethod] = useState<SolverMethod>(size === 3 ? "beginner" : size === 4 ? "meyer" : "reduction_beginner");
  const [viewedStage, setViewedStage] = useState<number | null>(null);
  const guided = method === "beginner" || method === "reduction_beginner" || method === "meyer";
  const area = size * size;
  const stickerCount = area * 6;
  const solvedValue = solvedFacelets(size);
  const savedKey = size === 3 ? "cube-studio-solver-job-v1" : `cube-studio-solver-job-v1:${size}`;
  const { value, setValue, representation, setRepresentation } = useSolverInput(size);
  const [color, setColor] = useState("U"),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Ready"),
    [mode, setMode] = useState("");
  const [job, setJob] = useState<Job | null>(null),
    [selected, setSelected] = useState<Solution | null>(null),
    [input, setInput] = useState(solvedValue),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [transparent, setTransparent] = useState(false),
    [resetView, setResetView] = useState(0);
  const offline = useRef(new OfflineSolver()),
    generation = useRef(0);
  const initial = useMemo(() => faceletsToCubies(input, size), [input, size]);
  const moves = useMemo(() => selected?.notation ?? [], [selected]);
  const running = !!job && !terminal(job),
    locked = busy || running;
  function choose(solution: Solution, state = input) {
    verifySolution(state, solution, size);
    if (guided && solution.method !== method) throw Error("The worker returned a different method. Start a new guided solve after updating the solver service.");
    setViewedStage(null);
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
          setMethod(j.method ?? (size === 3 ? "unrestricted" : "reduction"));
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
              const savedMethod = saved.method ?? (size === 3 ? "unrestricted" : "reduction");
              setMethod(savedMethod);
              setMode("Offline");
              setInput(saved.input);
              setValue(saved.input);
              if (terminal(saved)) {
                setJob(saved);
                return;
              }
              if (size === 3 && savedMethod === "unrestricted") {
                localStorage.removeItem(savedKey);
                void runOffline(saved.input, ticket);
                return;
              }
              setStatus("Connect to resume the guided solve.");
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
      "complete",
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
          if (size === 3 && !guided && canUseOffline(e)) {
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
    job?.status === "complete",
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
    const timer = setTimeout(() => {
      const next = step + 1;
      setViewedStage(null);
      setStep(next);
      if (selected?.stages?.some(stage => stage.end === next)) setPlaying(false);
    }, selected?.stages ? 1400 : 800);
    return () => clearTimeout(timer);
  }, [playing, step, moves.length, selected]);
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
      validateFacelets(value, size);
      faceletsToCubies(value, size);
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
    if ((size !== 3 || guided) && !navigator.onLine) {
      setBusy(false);
      setError(guided ? "Connect to the internet for the guided method solver. Offline two-phase solving is available in unrestricted 3×3 mode." : "Connect to the internet to solve a 4×4 or 5×5 cube.");
      setStatus("Ready");
      return;
    }
    if (forceOffline || !navigator.onLine) {
      await runOffline(value, ticket);
      return;
    }
    try {
      const next = await createJob(value, size, method);
      if (generation.current !== ticket) {
        void cancelJob(next.id).catch(() => {});
        return;
      }
      localStorage.setItem(savedKey, next.id);
      setJob(next);
      setMode("Online");
    } catch (e) {
      if (generation.current === ticket) {
        if (size === 3 && !guided && canUseOffline(e)) await runOffline(value, ticket);
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
        if (size === 3 && !guided && canUseOffline(e)) {
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
    const sequence = practiceMoves(`${size}${size}${size}` as CubeEvent);
    editValue(cubiesToFacelets(sequence.reduce((s, m) => applyMove(s, m), solved(size))));
  }
  function jump(n: number) {
    setPlaying(false);
    setViewedStage(null);
    setStep(Math.max(0, Math.min(moves.length, n)));
  }
  const viewerTools = (
    <div className="cube-tools">
      <button className="tool-button" aria-label="Reset view"
        title="Reset view · Yellow up, red front"
        onClick={() => setResetView((value) => value + 1)}>
        <RotateCcw size={17} />
      </button>
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
        <h2>Your {size}×{size} cube</h2>
        <p className="solver-hint">Yellow up · Red front{size !== 3 && " · Online reduction solver"}</p>
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
              style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
              aria-label={`${f} face`}
            >
              {Array.from({ length: area }, (_, i) => {
                const index = FACE_ORDER.indexOf(f) * area + i;
                return (
                  <button
                    key={i}
                    disabled={locked || (size % 2 === 1 && i === Math.floor(area / 2))}
                    aria-label={`${f}${i + 1}: ${value[index]}`}
                    style={{ background: FACE_COLORS[value[index]] ?? "#ccc" }}
                    onClick={() =>
                      editValue(
                        (s) => s.slice(0, index) + color + s.slice(index + 1),
                      )
                    }
                  >
                    {size % 2 === 1 && i === Math.floor(area / 2) ? f : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        : <Suspense fallback={<p>Loading cube…</p>}>
          <FaceletCube size={size} value={value} color={color} disabled={locked} onChange={editValue} transparent={transparent} resetView={resetView}>
            {viewerTools}
          </FaceletCube>
        </Suspense>}
        <p className="solver-hint">Pick a color, then a sticker.{representation === "3d" && " Drag to orbit · Pinch to zoom"}</p>
        </>}
        {representation === "text" && <div className="solver-facelets">
          <p id="facelet-format">
            A facelet is one sticker. Enter {stickerCount} letters: {area} per face, in{" "}
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
            Keep U above the side faces, B above U, and F above D. {size % 2 === 1 ? `Letter ${Math.floor(area / 2) + 1} is the fixed center.` : "The 4×4 has no fixed centers; use the displayed color reference."}
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
                e.target.value.toUpperCase().replace(/\s/g, "").slice(0, stickerCount),
              )
            }
          />
        </div>}
        <div className="solver-methods">
          <label htmlFor="solver-mode">Solve style</label>
          <select id="solver-mode" disabled={locked} value={guided ? 'guided' : 'unrestricted'} onChange={e => {
            setMethod(e.target.value === 'guided' ? size === 3 ? 'beginner' : size === 4 ? 'meyer' : 'reduction_beginner' : size === 3 ? 'unrestricted' : 'reduction');
            setSelected(null); setJob(null); setPlaying(false); setStep(0); setViewedStage(null);
            localStorage.removeItem(savedKey); localStorage.removeItem(`${savedKey}:snapshot`);
          }}>
            <option value="guided">Guided method · learn step by step</option>
            <option value="unrestricted">{size === 3 ? 'Unrestricted · shortest-solution search' : 'Automatic reduction · compact solution'}</option>
          </select>
          {guided && <>
            <label htmlFor="solver-method">{size === 3 ? '3×3 method' : 'Big-cube method'}</label>
            <select id="solver-method" disabled={locked} value={method === 'meyer' ? 'meyer' : size === 3 ? 'beginner' : 'reduction'} onChange={e => {
              setMethod(e.target.value === 'meyer' ? 'meyer' : size === 3 ? 'beginner' : 'reduction_beginner');
              setSelected(null); setJob(null); setPlaying(false); setStep(0); setViewedStage(null);
              localStorage.removeItem(savedKey); localStorage.removeItem(`${savedKey}:snapshot`);
            }}>
              {size === 3 ? <option value="beginner">Beginner’s layer-by-layer</option> : <option value="reduction">Reduction</option>}
              {size === 4 && <option value="meyer">Meyer · preserve the left block</option>}
            </select>
            {size !== 3 && <>
              <label htmlFor="post-reduction-method">After reduction · 3×3 method</label>
              <select id="post-reduction-method" disabled={locked} defaultValue="beginner"><option value="beginner">Beginner’s layer-by-layer</option></select>
              <p className="solver-hint">{method === 'meyer' ? 'Opposite centers, left block, remaining centers and wings; then the beginner 3×3 finish.' : 'Centers first, then matching edge groups; then the beginner 3×3 finish.'} Named three-piece cycles show their setup, core and undo. Complete each action before checking preserved pieces.</p>
            </>}
            <p className="solver-hint">Seven beginner stages, named actions, and checked goals. No unrestricted 3×3 fallback. Guided solving currently requires a connection.</p>
          </>}
        </div>
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
            onClick={() => editValue(solvedValue)}
          >
            Reset cube
          </button>
          {size === 3 && !guided && <button
            className="button"
            disabled={locked}
            onClick={() => void start(true)}
          >
            Offline
          </button>}
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
            {status === "searching" ? guided ? "Planning and checking the method stages…" : size === 3 ? "Finding the shortest solution…" : "Solving centers and edges…" : status}
          </p>
        )}
        {job && (!selected || running) && (
          <div className="solver-progress">
            <span>
              {job.best_move_count === null
                ? guided ? "Planning lesson" : "Searching"
                : `${job.best_move_count} moves`}{" "}
              · {(job.elapsed_ms / 1000).toFixed(1)} s
            </span>
            {!guided && <details className="solver-search-details">
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
            </details>}
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
        {size === 3 && !guided && job?.status === "failed" && (
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
              selected.stages ? "A verified method-constrained lesson. Stage goals and the final solve are checked; shortest length is not claimed." : selected.optimality === "global_proved"
                ? "Proved globally optimal in HTM (a half turn counts as one move)."
                : size === 3 ? "Verified solution; optimality has not been proved. A half turn counts as one move." : "Verified reduction solution. Optimality has not been proved. Outer block turns count as one move."
            }
          >
            <strong>
              {selected.stages ? "Guided solve" : selected.optimality === "global_proved"
                ? "Optimal"
                : size === 3 ? "Near-optimal" : "Verified solution"}
            </strong>
            <span>{selected.move_count} {selected.move_count === 1 ? "move" : "moves"}</span>
          </div>
        )}
        {selected ? <div className={`cube-stage ${transparent ? "is-see-through" : ""}`}>
          <Suspense fallback={<p>Loading cube…</p>}>
            <Cube
              key={input}
              size={size}
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
          <FaceletCube size={size} value={value} color={color} disabled onChange={editValue} transparent={transparent} resetView={resetView}>
            {viewerTools}
          </FaceletCube>
        </Suspense>}
        {selected?.stages && <SolverLesson solution={selected} step={step} viewedStage={viewedStage}
          onJump={jump} onStage={index => { jump(selected.stages![index].start); setViewedStage(index); }} />}
        {!selected?.stages && <div className="notation">
          {moves.map((m, i) => (
            <button
              key={i}
              className={i < step ? "completed" : i === step ? "next" : ""}
              onClick={() => jump(i + 1)}
              title={moveDescription(m)}
              aria-label={`Go to move ${i + 1}: ${moveDescription(m)}`}
            >
              {m}
            </button>
          ))}
        </div>}
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
              setViewedStage(null);
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
