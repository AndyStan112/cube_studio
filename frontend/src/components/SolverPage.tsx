import { lazy, Suspense, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { Check, ChevronLeft, Eye, EyeOff, GraduationCap, Info, Pause, Play, RotateCcw, Settings2, SkipBack, SkipForward, X } from "lucide-react";
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
import CameraInput from "./CameraInput";
import Sheet from './Sheet';
import ScrambleLibrary, { type TrainingProps } from './ScrambleLibrary';
import { stateScramble } from '../lib/training';
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
export default function SolverPage({ size = 3, training, updateTraining, onClose, onSizeChange }: TrainingProps & { size?: CubeSize; onClose: () => void; onSizeChange: (size: CubeSize) => void }) {
  const event = `${size}${size}${size}` as CubeEvent;
  const [stateSequence, setStateSequence] = useState<{ value: string; moves: string } | null>(null);
  const [generatingScramble, setGeneratingScramble] = useState(false);
  const scrambleWorker = useRef(new OfflineSolver());
  const scrambleJob = useRef<string | null>(null);
  const methodKey = `cube-studio-solver-method-v1:${size}`;
  const savedMethod = readStored<SolverMethod | null>(methodKey, null);
  const validMethods: SolverMethod[] = size === 3 ? ['beginner', 'unrestricted'] : size === 4 ? ['meyer', 'reduction_beginner', 'reduction'] : ['reduction_beginner', 'reduction'];
  const rememberedMethod = savedMethod && validMethods.includes(savedMethod) ? savedMethod : null;
  const [flow, setFlow] = useState<'style' | 'input' | 'solution'>(rememberedMethod ? 'input' : 'style');
  const [sheet, setSheet] = useState<'style' | 'info' | 'tools' | null>(null);
  useEffect(() => { window.scrollTo({top:0,behavior:'instant'}); }, [flow]);
  const [method, setMethod] = useState<SolverMethod>(rememberedMethod ?? (size === 3 ? "beginner" : size === 4 ? "meyer" : "reduction_beginner"));
  const [viewedStage, setViewedStage] = useState<number | null>(null);
  const guided = method === "beginner" || method === "reduction_beginner" || method === "meyer";
  const area = size * size;
  const stickerCount = area * 6;
  const solvedValue = solvedFacelets(size);
  const savedKey = size === 3 ? "cube-studio-solver-job-v1" : `cube-studio-solver-job-v1:${size}`;
  const { value, setValue, representation, setRepresentation } = useSolverInput(size);
  const [cameraReady, setCameraReady] = useState(false);
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
    [transparent, setTransparent] = useState(training.settings.transparent),
    [resetView, setResetView] = useState(0);
  const offline = useRef(new OfflineSolver()),
    generation = useRef(0);
  const initial = useMemo(() => faceletsToCubies(input, size), [input, size]);
  const moves = useMemo(() => selected?.notation ?? [], [selected]);
  const running = !!job && !terminal(job),
    locked = busy || running || generatingScramble;
  const methodLabel = method === 'meyer' ? 'Meyer' : method === 'beginner' ? 'Beginner · layer by layer' : method === 'reduction_beginner' ? 'Reduction · beginner finish' : 'Automatic';
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const historySession = useRef(crypto.randomUUID());
  const historyInitialized = useRef(false);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    // Keep the wizard's back stack local to the solver, including device back.
    if (!historyInitialized.current) {
      historyInitialized.current = true;
      history.pushState({ ...history.state, cubeSolver: { size, flow: flowRef.current, session: historySession.current } }, '');
    }
    const back = (event: PopStateEvent) => {
      if (lockedRef.current) void cancelRef.current();
      if (event.state?.cubeSolver?.session === historySession.current) {
        setPlaying(false);
        setSheet(null);
        setFlow(event.state.cubeSolver.flow);
      } else onClose();
    };
    window.addEventListener('popstate', back);
    return () => { window.removeEventListener('popstate', back); };
  }, [size, onClose]);
  function goTo(next: typeof flow) {
    if (next !== flowRef.current) history.pushState({ ...history.state, cubeSolver: { size, flow: next, session: historySession.current } }, '');
    setFlow(next);
    setPlaying(false);
  }
  function changeMethod(next: SolverMethod) {
    if (locked || next === method) return;
    setMethod(next);
    setSelected(null); setJob(null); setPlaying(false); setStep(0); setViewedStage(null);
    localStorage.removeItem(savedKey); localStorage.removeItem(`${savedKey}:snapshot`);
    writeStored(methodKey, next);
  }
  const styleChoices = <div className="solver-style-choices" role="group" aria-label="Solve style">
    <button aria-pressed={guided} disabled={locked} onClick={() => changeMethod(size === 3 ? 'beginner' : size === 4 ? 'meyer' : 'reduction_beginner')}>
      <GraduationCap size={23}/><span><strong>Guided</strong><small>Learn one stage at a time</small></span><span className="solver-radio" aria-hidden="true"/>
    </button>
    <button aria-pressed={!guided} disabled={locked} onClick={() => changeMethod(size === 3 ? 'unrestricted' : 'reduction')}>
      <Play size={23}/><span><strong>Automatic</strong><small>Follow a move sequence</small></span><span className="solver-radio" aria-hidden="true"/>
    </button>
    {guided && size === 4 && <div className="solver-method-choice" role="group" aria-label="Guided method">{(['meyer', 'reduction_beginner'] as const).map(value => <button key={value} aria-pressed={method === value} disabled={locked} onClick={() => changeMethod(value)}>{value === 'meyer' ? 'Meyer' : 'Reduction'}</button>)}</div>}
    {guided && <p className="solver-method-name">{methodLabel}</p>}
  </div>;
  function choose(solution: Solution, state = input) {
    verifySolution(state, solution, size);
    if (guided && solution.method !== method) throw Error("The worker returned a different method. Start a new guided solve after updating the solver service.");
    const sequence = stateScramble(state, solution.notation, size);
    setStateSequence({ value: state, moves: sequence.join(' ') });
    goTo('solution');
    setViewedStage(null);
    setSelected(solution);
    setInput(state);
    setStep(0);
    setPlaying(false);
  }
  useEffect(() => {
    setRepresentation(training.settings.representation);
    const ticket = generation.current;
    const id = localStorage.getItem(savedKey);
    if (id)
      getJob(id)
        .then((j) => {
          if (generation.current !== ticket) return;
          setMethod(j.method ?? (size === 3 ? "unrestricted" : "reduction"));
          setJob(j);
          setFlow('solution');
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
              setFlow("solution");
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
      scrambleWorker.current.cancel();
      if (scrambleJob.current) void cancelJob(scrambleJob.current).catch(() => {});
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
    }, selected?.stages ? Math.max(1400, training.settings.playbackMs) : training.settings.playbackMs);
    return () => clearTimeout(timer);
  }, [playing, step, moves.length, selected, training.settings.playbackMs]);
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
    goTo('solution');
    window.scrollTo({top:0,behavior:'instant'});
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
    scrambleWorker.current.cancel();
    if (scrambleJob.current) { void cancelJob(scrambleJob.current).catch(() => {}); scrambleJob.current = null; }
    setGeneratingScramble(false);
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
    setCameraReady(false);
    setStateSequence(null);
    scrambleWorker.current.cancel();
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
    const next = cubiesToFacelets(sequence.reduce((s, m) => applyMove(s, m), solved(size)));
    editValue(next);
    setStateSequence({ value: next, moves: sequence.join(' ') });
    setRepresentation('2d');
  }
  async function generateStateScramble() {
    setError('');
    try { validateFacelets(value, size); faceletsToCubies(value, size); } catch (e) { setError((e as Error).message); return; }
    const ticket = ++generation.current;
    setGeneratingScramble(true);
    setStatus('Generating a scramble for this state…');
    try {
      let solution: Solution;
      if (size === 3) solution = await scrambleWorker.current.solve(value, message => { if (generation.current === ticket) setStatus(message); });
      else {
        let next = await createJob(value, size, 'reduction');
        scrambleJob.current = next.id;
        const deadline = performance.now() + 180000;
        while (!next.solution && !next.candidate && !terminal(next)) {
          if (generation.current !== ticket) return;
          if (performance.now() > deadline) throw Error('Scramble generation timed out. Try again.');
          await new Promise(resolve => setTimeout(resolve, 700));
          if (generation.current !== ticket) return;
          next = await getJob(next.id);
        }
        if (!next.solution && !next.candidate) throw Error(next.error || 'No solution was found for this state.');
        solution = (next.solution ?? next.candidate)!;
      }
      if (generation.current !== ticket) return;
      verifySolution(value, solution, size);
      setStateSequence({ value, moves: stateScramble(value, solution.notation, size).join(' ') });
      setStatus('State scramble ready');
    } catch (e) { if (generation.current === ticket) { setError((e as Error).message); setStatus('Ready'); } }
    finally {
      if (generation.current === ticket) setGeneratingScramble(false);
      if (scrambleJob.current) { void cancelJob(scrambleJob.current).catch(() => {}); scrambleJob.current = null; }
    }
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
    <div className="solver-flow">
      <header className="solver-app-header">
        <button className="icon-button" aria-label="Back" disabled={locked} onClick={() => flow === 'solution' ? goTo('input') : flow === 'input' ? goTo('style') : onClose()}><ChevronLeft size={24}/></button>
        <h1>{flow === 'style' ? 'New solve' : flow === 'solution' ? guided ? 'Guided solve' : 'Your solution' : cameraReady ? 'Cube scanned' : `${representation === 'camera' ? 'Scan' : 'Set up'} your ${size}×${size}`}</h1>
        <button className="icon-button" aria-label="Solver information" onClick={() => { setPlaying(false); setSheet('info'); }}><Info size={22}/></button>
        <button className="icon-button" aria-label={locked ? 'Cancel search' : 'Close solver'} onClick={() => locked ? void cancel() : onClose()}><X size={22}/></button>
      </header>
      {flow === 'style' && <section className="solver-style-screen">
        <div className="solver-size-choice" role="group" aria-label="Puzzle size">{([3,4,5] as const).map(value => <button key={value} aria-pressed={size === value} onClick={() => onSizeChange(value)}>{value}×{value}</button>)}</div>
        <h2>How do you want to solve?</h2>
        {styleChoices}
        <div className="solver-bottom-action"><button className="button" onClick={() => { writeStored(methodKey, method); goTo('input'); }}>Continue to scan</button></div>
      </section>}
      <div className="solver-layout solver-workspace" hidden={flow === 'style'}>
      <section hidden={flow !== 'input'} className={`solver-input ${representation === 'camera' ? 'camera-workspace' : ''}`}>
        <div className="solver-input-toolbar"><button className="text-button" disabled={locked} onClick={() => setSheet('tools')}><Settings2 size={18}/> Input options</button><span>{size}×{size}</span></div>
        {representation === "camera" && <>
          {cameraReady && <div className="solver-scan-preview"><Suspense fallback={<p>Loading cube…</p>}><FaceletCube size={size} value={value} color={color} disabled onChange={editValue} transparent={transparent} resetView={resetView}>{viewerTools}</FaceletCube></Suspense><span className="solver-scan-checked"><Check size={17}/> Six faces checked</span></div>}
          <CameraInput defaultCalibration={training.cubes.find(c => c.id === (training.sessions.find(s => s.id === training.active[event])?.cube || training.settings.defaultCube) && c.event === event)?.calibrationId || 'auto'} size={size} disabled={locked} onChange={editValue} onReady={setCameraReady} />
        </>}
        {representation !== "text" && representation !== "camera" && <>
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
          <div className="facelet-legend">
            {[...FACE_ORDER].map((f) => (
              <span key={f}>
                <i style={{ background: FACE_COLORS[f] }} aria-hidden="true" />
                <strong>{f}</strong> {faceNames[f]}
              </span>
            ))}
          </div>
          <label className="facelet-label" htmlFor="solver-facelets">
            Cube facelets
          </label>
          <textarea
            id="solver-facelets"
            aria-label="Cube facelets"
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
        <div className="solver-input-footer">
          <div className="solver-style-summary"><span><strong>{guided ? 'Guided' : 'Automatic'}</strong>{guided && <small>{methodLabel}</small>}</span><button className="text-button" disabled={locked} onClick={() => setSheet('style')}>Change</button></div>
          <button className="button solver-start" disabled={locked || (representation === 'camera' && !cameraReady)} onClick={() => void start()}>{locked ? 'Preparing…' : guided ? 'Start guided solve' : 'Start solution'}</button>
        </div>

      </section>
      {flow === 'solution' && <section className="trainer-card">
        {locked && <div className="solver-job-actions"><button className="text-button" onClick={() => void cancel()}>Cancel search</button></div>}
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
        {selected && <div className="solver-result"><span>{selected.move_count} {selected.move_count === 1 ? 'move' : 'moves'}</span><span>{selected.optimality === 'global_proved' ? 'Optimal' : 'Verified'}</span></div>}
        <div className={selected?.stages ? 'guided-workspace' : 'automatic-workspace'}>
        <div className="solver-cube-column">
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
        <div className="solver-actions">
          <button
            className="button"
            aria-label="Restart playback"
            onClick={() => {
              jump(0);
              setResetView((n) => n + 1);
            }}
          >
            <RotateCcw size={20} aria-hidden="true" />
          </button>
          <button
            className="button"
            disabled={!step}
            aria-label="Previous move"
            title="Previous move"
            onClick={() => jump(step - 1)}
          >
            <SkipBack size={20} aria-hidden="true" />
          </button>
          <button
            className="button"
            disabled={!moves.length}
            aria-label={playing ? 'Pause playback' : 'Play solution'}
            aria-pressed={playing}
            onClick={() => {
              setViewedStage(null);
              if (step === moves.length) setStep(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause size={23} aria-hidden="true"/> : <Play size={23} aria-hidden="true"/>}
          </button>
          <button
            className="button"
            disabled={step === moves.length}
            aria-label="Next move"
            title="Next move"
            onClick={() => jump(step + 1)}
          >
            <SkipForward size={20} aria-hidden="true" />
          </button>
          <span>
            {step} / {moves.length}
          </span>
        </div>
        </div>
        {selected?.stages && <SolverLesson solution={selected} step={step} viewedStage={viewedStage}
          onInspect={() => setPlaying(false)}
          onJump={jump} onStage={index => { jump(selected.stages![index].start); setViewedStage(index); }} />}
        </div>
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

      </section>}
      </div>
      {sheet && <Sheet title={sheet === 'style' ? 'Solve style' : sheet === 'tools' ? 'Input options' : 'Solver information'} onClose={() => setSheet(null)}>
        {sheet === 'style' ? <>{styleChoices}<button className="button" onClick={() => { writeStored(methodKey, method); setSheet(null); }}>Use this style</button></> : sheet === 'tools' ? <>
          <div className="representation-toggle" role="group" aria-label="Cube input">{(['camera','2d','text','3d'] as const).map(view => <button className="button" key={view} aria-pressed={representation === view} disabled={locked} onClick={() => { setRepresentation(view); setSheet(null); }}>{view === 'camera' ? 'Video' : view === 'text' ? 'Text' : view.toUpperCase()}</button>)}</div>
          <div className="solver-actions"><button className="button" disabled={locked} onClick={() => { demo(); setSheet(null); }}>Try a scramble</button><button className="button" disabled={locked} onClick={() => { editValue(solvedValue); setSheet(null); }}>Reset cube</button>{size === 3 && !guided && <button className="button" disabled={locked || (representation === 'camera' && !cameraReady)} onClick={() => { setSheet(null); void start(true); }}>Solve offline</button>}</div>
        <details className="state-scramble" open={stateSequence?.value === value || undefined}><summary>Scramble for this cube</summary>
          {stateSequence?.value === value ? <p className="scramble-text">{stateSequence.moves || 'Solved cube · no moves needed'}</p> : <p className="small-muted">Generate a sequence that leads from a solved cube to your entered or scanned state.</p>}
          <button className="button" disabled={locked || value === solvedValue} onClick={() => void generateStateScramble()}>{generatingScramble ? 'Generating…' : 'Generate state scramble'}</button>
          <ScrambleLibrary {...{ training, updateTraining, event }} disabled={locked} current={stateSequence?.value === value ? { id: 'local:state', moves: stateSequence.moves, event } : null} onSelect={scramble => {
            const next = cubiesToFacelets(scramble.moves.split(/\s+/).reduce((s, m) => applyMove(s, m), solved(size)));
            editValue(next); setStateSequence({ value: next, moves: scramble.moves }); setRepresentation('2d');
          }} />
        </details>
        </> : <div className="solver-info-copy">
          <h3>{guided ? 'Guided solving' : 'Automatic solving'}</h3>
          <p>{guided ? 'The solution follows a teaching method. Play advances the cube and pauses at checkpoints so you can match your physical cube before continuing. Guided solving needs an internet connection.' : size === 3 ? 'The solver searches for a short solution. Verified means the moves solve your cube; Optimal means the search has proved there is no shorter solution in the half-turn metric.' : 'The solver reduces the centers and edge groups, then solves the cube. The result is verified, but shortest length is not guaranteed.'}</p>
          {guided && <><h3>{methodLabel}</h3><p>{method === 'meyer' ? 'Solve opposite centers, build and preserve the left block, then finish centers and edge groups before the beginner 3×3 finish.' : method === 'reduction_beginner' ? 'Group the centers and edges, then finish using the beginner 3×3 method.' : 'Build the white cross, finish the first two layers, then solve the last layer.'}</p></>}
          {mode && <p>Execution: {mode.toLowerCase()}.</p>}
          <h3>Controls</h3><p>Play or pause the animation, step backward or forward one move, or restart playback. Drag the cube to orbit and pinch to zoom. Reset view restores yellow up and red front.</p>
          <h3>Entering a cube</h3><p>Scan all six faces with live video or upload a video. Input options also includes sticker editors, text input, and saved scrambles. Changing solve style keeps your scanned cube.</p>
          {representation === 'text' && <p>Enter {stickerCount} stickers in U R F D L B order, reading each face left to right, top to bottom. {area} letters per face. Read each face left to right, top to bottom, looking directly at it. Keep U above the side faces, B above U, and F above D. {size % 2 === 1 ? `Letter ${Math.floor(area / 2) + 1} is the fixed center.` : 'The 4×4 has no fixed centers; use the displayed color reference.'}</p>}
        </div>}
      </Sheet>}
      {error && <p role="alert" className="error-banner">{error}</p>}
    </div>
  );
}
