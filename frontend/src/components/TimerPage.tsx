import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Plus,
  RotateCcw,
  Shuffle,
  Timer,
  Trash2,
} from "lucide-react";
import { localSolve, queueSolveEdit, clearSolveEdit, writeStored, solvesKey } from "../lib/offline";
import {
  api,
  ApiError,
  averageOf,
  effective,
  formatTime,
  parseTime,
  type Scramble,
  type Solve,
  type User,
} from "../lib/api";
import { forEvent, puzzles, type CubeEvent } from "../lib/puzzles";
import ScrambleLibrary, { type TrainingProps } from './ScrambleLibrary';
import { createSession, inspectionPenalty } from '../lib/training';
import { applyMove, solved } from "../lib/cube";
const Cube = lazy(() => import("./Cube"));
const noMoves: string[] = [];
export default function TimerPage({
  event,
  training, updateTraining, onSelectScramble, active,
  onLockChange,
  scramble,
  loading,
  loadScramble,
  user,
  solves,
  setSolves,
  notify,
  onSignIn,
}: TrainingProps & {
  active: boolean;
  onSelectScramble: (scramble: Scramble) => void;
  event: CubeEvent;
  onLockChange: (locked: boolean) => void;
  scramble: Scramble | null;
  loading: boolean;
  loadScramble: () => Promise<void>;
  user: User | null;
  solves: Solve[];
  setSolves: React.Dispatch<React.SetStateAction<Solve[]>>;
  notify: (e: unknown) => void;
  onSignIn: () => void;
}) {
  const [running, setRunning] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [manual, setManual] = useState(""),
    [manualMode, setManualMode] = useState(false),
    [pending, setPending] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [penalty, setPenalty] = useState<Solve["penalty"]>("none");
  const [showPreview, setShowPreview] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectionElapsed, setInspectionElapsed] = useState(0);
  const [inspectionMs, setInspectionMs] = useState<number | undefined>();
  const inspectionStart = useRef(0);
  const [newSessionName, setNewSessionName] = useState('');
  const session = training.sessions.find(s => s.id === training.active[event] && s.event === event) ?? training.sessions.find(s => s.event === event);
  const locked = running || inspecting || pending !== null || busy || (manualMode && !!manual.trim());
  const puzzle = puzzles[event];
  const eventSolves = forEvent(solves, event).filter(s => (s.session_id ?? `legacy:${event}`) === session?.id);
  function updateSession(patch: Partial<NonNullable<typeof session>>) {
    if (session) updateTraining({ ...training, sessions: training.sessions.map(s => s.id === session.id ? { ...s, ...patch } : s) });
  }
  const preview = useMemo(() => showPreview && scramble
    ? scramble.moves.split(/\s+/).reduce((state, move) => applyMove(state, move), solved(puzzle.size))
    : undefined, [showPreview, scramble, puzzle.size]);
  useEffect(() => {
    onLockChange(locked);
  }, [locked, onLockChange]);
  useEffect(() => () => onLockChange(false), [onLockChange]);
  const start = useRef(0);
  const toggle = useCallback(() => {
    if (!scramble || pending !== null || busy || loading || manualMode) return;
    if (running) {
      const ms = Math.max(1, Math.round(performance.now() - start.current));
      setElapsed(ms);
      setPending(ms);
      setRunning(false);
    } else if (training.settings.inspection && !inspecting) {
      inspectionStart.current = performance.now();
      setInspectionElapsed(0); setInspectionMs(undefined); setInspecting(true); setPenalty('none');
    } else {
      if (inspecting) {
        const duration = performance.now() - inspectionStart.current;
        setInspectionMs(Math.round(duration)); setPenalty(inspectionPenalty(duration)); setInspecting(false);
      } else setInspectionMs(undefined);
      start.current = performance.now();
      setElapsed(0);
      setRunning(true);
    }
  }, [scramble, pending, busy, loading, running, inspecting, training.settings.inspection, manualMode]);
  useEffect(() => {
    if (!running && !inspecting) return;
    let frame: number;
    const tick = () => {
      if (inspecting) setInspectionElapsed(performance.now() - inspectionStart.current);
      else setElapsed(performance.now() - start.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, inspecting]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        active && e.code === "Space" &&
        !e.repeat &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest('input,button,select,textarea,[role="dialog"]')
        )
      ) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle, active]);
  const save = async () => {
    const ms = manualMode ? parseTime(manual) : pending;
    if (!ms) {
      notify(new Error("Enter a time such as 24.53 or 1:02.45."));
      return;
    }
    if (!scramble || !session) return;
    const metadata = { session_id: session.id, cube: session.cube, cube_name: training.cubes.find(c => c.id === session.cube)?.name, method: session.method, inspection_ms: manualMode ? undefined : inspectionMs };
    setBusy(true);
    try {
      let s: Solve;
      try {
        if (!user || !navigator.onLine || !scramble.id.match(/^[a-f0-9]{24}$/i)) throw Error("Local solve");
        s = await api<Solve>("/solves", {
          method: "POST",
          body: JSON.stringify({ scramble_id: scramble.id, time_ms: ms, penalty, ...metadata }),
          signal: AbortSignal.timeout(6000),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) throw error;
        s = localSolve(scramble, ms, penalty);
      }
      s = { ...s, ...metadata };
      writeStored(solvesKey(user?.id), [s, ...solves]);
      setSolves((prev) => [s, ...prev]);
      setPending(null);
      setManual("");
      setElapsed(0);
      setPenalty("none");
      await loadScramble();
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  };
  const best = eventSolves.length ? Math.min(...eventSolves.map(effective)) : null;
  const average = (n: number) => {
    const v = averageOf(eventSolves, n);
    return v === null ? "—" : Number.isFinite(v) ? formatTime(v) : "DNF";
  };
  const changePenalty = async (s: Solve, p: Solve["penalty"]) => {
    try {
      if (!s.id.startsWith("local:")) {
        try {
          if (!navigator.onLine) throw Error("Offline");
          await api(`/solves/${s.id}`, {
            method: "PATCH", body: JSON.stringify({ penalty: p }), signal: AbortSignal.timeout(6000),
          });
          if (user) clearSolveEdit(user.id, s.id);
        } catch (error) {
          if (!user || (error instanceof ApiError && error.status < 500)) throw error;
          queueSolveEdit(user.id, { id: s.id, penalty: p });
        }
      }
      writeStored(solvesKey(user?.id), solves.map(x => x.id === s.id ? { ...x, penalty: p } : x));
      setSolves((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, penalty: p } : x)),
      );
    } catch (e) {
      notify(e);
    }
  };
  const remove = async (s: Solve) => {
    try {
      if (!s.id.startsWith("local:")) {
        try {
          if (!navigator.onLine) throw Error("Offline");
          await api(`/solves/${s.id}`, { method: "DELETE", signal: AbortSignal.timeout(6000) });
          if (user) clearSolveEdit(user.id, s.id);
        } catch (error) {
          if (!user || (error instanceof ApiError && error.status < 500)) throw error;
          queueSolveEdit(user.id, { id: s.id, remove: true });
        }
      }
      writeStored(solvesKey(user?.id), solves.filter(x => x.id !== s.id));
      setSolves((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      notify(e);
    }
  };
  return (
    <>
      <section className="card session-controls">
        <div className="stats-filters">
          <label>Session<select aria-label="Session" disabled={locked} value={session?.id ?? ''} onChange={e => updateTraining({ ...training, active: { ...training.active, [event]: e.target.value } })}>{training.sessions.filter(s => s.event === event).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Session name<input disabled={locked} value={session?.name ?? ''} maxLength={100} onChange={e => updateSession({ name: e.target.value })} /></label>
          <label>Cube<select disabled={locked} value={session?.cube ?? ''} onChange={e => updateSession({ cube: e.target.value })}><option value="">Unspecified</option>{training.cubes.filter(c => c.event === event).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Method<select disabled={locked} value={session?.method ?? ''} onChange={e => updateSession({ method: e.target.value })}>{training.methods.map(m => <option key={m}>{m}</option>)}</select></label>
        </div>
        <form className="settings-row" onSubmit={e => { e.preventDefault(); const next = createSession(event, training, newSessionName); updateTraining({ ...training, sessions: [...training.sessions, next], active: { ...training.active, [event]: next.id } }); setNewSessionName(''); }}>
          <input disabled={locked} aria-label="New session name" placeholder="New session name" value={newSessionName} maxLength={100} onChange={e => setNewSessionName(e.target.value)} /><button className="button" disabled={locked}>New session</button>
        </form>
        <p className="small-muted">Times below belong to this session. Cube and method selections apply to future solves. Manage cubes and defaults in Settings.</p>
        <label className="check-setting"><input type="checkbox" disabled={locked} checked={training.settings.inspection} onChange={e => updateTraining({ ...training, settings: { ...training.settings, inspection: e.target.checked } })} />WCA-style inspection · 15 seconds</label>
        {training.settings.inspection && <p className="small-muted">Tap once to inspect, again to solve. Inspection stays separate from solve time. At 15s: +2; at 17s: DNF. <a href="https://www.worldcubeassociation.org/regulations/#A4d" target="_blank" rel="noreferrer">WCA rules</a></p>}
      </section>
      <div className="timer-layout">
        <section className="timer-card card">
          <div className="card-top">
            <span className="section-label">
              <span className="status-dot" />
              SCRAMBLE
            </span>
            <button
              className="text-button"
              disabled={locked || loading}
              onClick={() => void loadScramble()}
            >
              <Shuffle size={15} />
              {loading ? "Generating…" : "New scramble"}
            </button>
          </div>
          <div className="scramble" aria-label="Current scramble">
            {scramble?.moves || (loading ? "Generating…" : "No scramble")}
          </div>
          <div className="scramble-note">{scramble?.moves.split(/\s+/).length ?? puzzle.scrambleLength} moves · Yellow top, red front · Practice scramble</div>
          <details className="scramble-preview" onToggle={(e) => setShowPreview(e.currentTarget.open)}>
            <summary>Preview scramble</summary>
            {showPreview && preview && <div className="cube-stage">
              <Suspense fallback={<p>Loading cube…</p>}>
                <Cube key={scramble?.id} size={puzzle.size} initialState={preview} moves={noMoves} step={0}
                  transparent={false} resetView={0} maskIrrelevant={false} focus="all" />
              </Suspense>
            </div>}
          </details>
          <ScrambleLibrary {...{ training, updateTraining, event }} current={scramble} onSelect={onSelectScramble} disabled={locked || loading} />
          <div className={`timer-zone ${running ? "is-running" : ""}`}>
            <div className="timer-status">
              {inspecting ? "INSPECTION" : running ? "RUNNING" : pending !== null ? "UNSAVED" : "READY"}
            </div>
            <button
              className="time-display"
              onClick={toggle}
              disabled={manualMode || pending !== null || busy || !scramble || loading}
              aria-label={inspecting ? "Start solve" : running ? "Stop timer" : "Start timer"}
            >
              {inspecting ? inspectionElapsed >= 17000 ? "DNF" : inspectionElapsed >= 15000 ? "+2" : ((15000 - inspectionElapsed) / 1000).toFixed(1) : formatTime(elapsed)}
              <span>s</span>
            </button>
            <div className="timer-hint">
              {inspecting ? "Inspecting · Tap or press space to start solve" : running ? (
                "Tap to stop"
              ) : pending !== null ? (
                "Save or discard"
              ) : (
                <>
                  {manualMode ? "Enter a time below" : <>Tap to start <kbd>space</kbd></>}
                </>
              )}
            </div>
            <div className="timer-ring" />
          </div>
          {inspecting && <button className="text-button" onClick={() => { setInspecting(false); setInspectionMs(undefined); setInspectionElapsed(0); }}>Cancel inspection</button>}
          {pending !== null && inspectionMs !== undefined && <p className="small-muted">Inspection: {formatTime(inspectionMs)}s · {inspectionPenalty(inspectionMs) === 'none' ? 'No inspection penalty' : inspectionPenalty(inspectionMs)}</p>}
          <div className="timer-entry">
            <div className="entry-switch">
              <button
                className={!manualMode ? "selected" : ""}
                disabled={running || inspecting || pending !== null}
                onClick={() => setManualMode(false)}
              >
                <Timer size={15} />
                Timer
              </button>
              <button
                className={manualMode ? "selected" : ""}
                disabled={running || inspecting || pending !== null}
                onClick={() => setManualMode(true)}
              >
                <Plus size={15} />
                Enter time
              </button>
            </div>
            {manualMode && (
              <label className="manual-input">
                Time{" "}
                <input
                  aria-label="Solve time"
                  inputMode="decimal"
                  placeholder="24.53 or 1:02.45"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save();
                  }}
                />
              </label>
            )}
            {(manualMode || pending !== null) && (
              <div className="save-row">
                <select
                  aria-label="Solve penalty"
                  value={penalty}
                  onChange={(e) =>
                    setPenalty(e.target.value as Solve["penalty"])
                  }
                >
                  <option value="none">No penalty</option>
                  <option value="+2">+2 seconds</option>
                  <option value="DNF">DNF</option>
                </select>
                <button
                  className="button"
                  onClick={save}
                  disabled={busy || !scramble}
                >
                  {busy ? "Saving…" : "Save solve"}
                  <Check size={16} />
                </button>
                {pending !== null && (
                  <button
                    className="icon-button"
                    aria-label="Discard time"
                    onClick={() => {
                      setPending(null);
                      setElapsed(0);
                    }}
                  >
                    <RotateCcw size={17} />
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="session-stats" aria-label="Solve statistics">
        <div>
          <span>Solves</span>
          <strong>{eventSolves.length}</strong>
        </div>
        <div>
          <span>Best</span>
          <strong className="green-text">
            {best === null
              ? "—"
              : Number.isFinite(best)
                ? formatTime(best)
                : "DNF"}
          </strong>
        </div>
        <div>
          <span>Ao5</span>
          <strong>{average(5)}</strong>
        </div>
        <div>
          <span>Ao12</span>
          <strong>{average(12)}</strong>
        </div>
        <div>
          <span>Mean</span>
          <strong>
            {eventSolves.length
              ? eventSolves.some((s) => s.penalty === "DNF")
                ? "DNF"
                : formatTime(
                    eventSolves.reduce((a, s) => a + effective(s), 0) /
                      eventSolves.length,
                  )
              : "—"}
          </strong>
        </div>
      </section>
      <section className="card history-card">
        <div className="history-header">
          <div>
            <h2>
              Solves <span>{eventSolves.length}</span>
            </h2>
          </div>
          <span className="small-muted">
            Newest first <ArrowDown size={13} />
          </span>
        </div>
        {!user && !eventSolves.length ? (
          <div className="empty-state">
            <p>Solves are saved on this device. Sign in for online history.</p>
            <button className="button" onClick={onSignIn}>
              Sign in <ArrowRight size={16} />
            </button>
          </div>
        ) : !eventSolves.length ? (
          <div className="empty-state">
            <p>No solves yet.</p>
          </div>
        ) : (
          <ol className="solve-list">
            {eventSolves.map((s, i) => (
              <li key={s.id}>
                <div className="solve-row">
                  <span className="solve-number">{eventSolves.length - i}</span>
                  <strong className="solve-time">
                    {s.penalty === "DNF" ? "DNF" : formatTime(effective(s))}
                    {s.penalty === "+2" && <small> +2</small>}
                    {s.id.startsWith("local:") && <small> · On this device</small>}
                  </strong>
                  <select
                    aria-label={`Penalty for solve ${eventSolves.length - i}`}
                    value={s.penalty}
                    onChange={(e) =>
                      changePenalty(s, e.target.value as Solve["penalty"])
                    }
                  >
                    <option value="none">None</option>
                    <option value="+2">+2</option>
                    <option value="DNF">DNF</option>
                  </select>
                  <button
                    className="icon-button delete"
                    aria-label={`Delete solve ${eventSolves.length - i}`}
                    onClick={() => remove(s)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <details className="solve-details">
                  <summary>Scramble</summary>
                  <p>{s.scramble}</p>
                  <p>{s.cube_name || 'Unspecified cube'} · {s.method || 'Unspecified method'}{s.inspection_ms !== undefined && ` · Inspection ${formatTime(s.inspection_ms)}s`}</p>
                  <button className="text-button" onClick={() => updateTraining({ ...training, scrambles: [{ id: `saved:${crypto.randomUUID()}`, moves: s.scramble, event, name: `Solve ${eventSolves.length - i}`, created_at: new Date().toISOString() }, ...training.scrambles] })}>Save scramble to library</button>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
