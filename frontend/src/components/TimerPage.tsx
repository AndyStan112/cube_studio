import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  RotateCcw,
  Shuffle,
  Info,
  Box,
  Library,
  LoaderCircle,
  PanelsTopLeft,
  PencilLine,
  RotateCw,
  Timer,
  Trash2,
} from "lucide-react";
import { readStored, localSolve, queueSolveEdit, clearSolveEdit, writeStored, solvesKey } from "../lib/offline";
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
import type { TrainingProps } from './ScrambleLibrary';
import ScrambleBookmark from './ScrambleBookmark';
import TimerSavedScrambles from './TimerSavedScrambles';
import TimerTutorial, { timerTutorialKey } from './TimerTutorial';
import './TimerPage.css';
import Sheet from './Sheet';
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
  onSolveSaved,
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
  onSolveSaved: (solve: Solve, manual: boolean) => number;
}) {
  const [running, setRunning] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [manual, setManual] = useState(""),
    [manualMode, setManualMode] = useState(false),
    [pending, setPending] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [penalty, setPenalty] = useState<Solve["penalty"]>("none");
  const [xpEarned, setXpEarned] = useState(0);
  useEffect(() => { if (!xpEarned) return; const timer = setTimeout(() => setXpEarned(0), 3000); return () => clearTimeout(timer); }, [xpEarned]);
  const [sheet, setSheet] = useState<'session' | 'preview' | 'library' | 'solve' | null>(null);
  const [selectedSolveId, setSelectedSolveId] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialWasSeen] = useState(() => readStored(timerTutorialKey, false));
  const tutorialSeen = useRef(tutorialWasSeen);
  useEffect(() => { if (active && !tutorialSeen.current) setTutorialOpen(true); if (!active) { setTutorialOpen(false); setSheet(null); } }, [active]);
  const closeTutorial = () => { tutorialSeen.current = true; writeStored(timerTutorialKey, true); setTutorialOpen(false); };
  const [inspecting, setInspecting] = useState(false);
  const [inspectionElapsed, setInspectionElapsed] = useState(0);
  const [inspectionMs, setInspectionMs] = useState<number | undefined>();
  const inspectionStart = useRef(0);
  const [newSessionName, setNewSessionName] = useState('');
  const session = training.sessions.find(s => s.id === training.active[event] && s.event === event) ?? training.sessions.find(s => s.event === event);
  const locked = running || inspecting || pending !== null || busy || (manualMode && !!manual.trim());
  const puzzle = puzzles[event];
  const eventSolves = forEvent(solves, event).filter(s => (s.session_id ?? `legacy:${event}`) === session?.id);
  const selectedSolve = eventSolves.find(s => s.id === selectedSolveId);
  const previewMoves = sheet === 'solve' ? selectedSolve?.scramble : scramble?.moves;
  const savedCount = training.scrambles.filter(item => item.event === event).length;
  const moveCount = scramble?.moves.trim().split(/\s+/).filter(Boolean).length ?? 0;
  function updateSession(patch: Partial<NonNullable<typeof session>>) {
    if (session) updateTraining({ ...training, sessions: training.sessions.map(s => s.id === session.id ? { ...s, ...patch } : s) });
  }
  const preview = useMemo(() => {
    if ((sheet !== 'preview' && sheet !== 'solve') || !previewMoves) return { state: undefined, error: '' };
    try { return { state: previewMoves.trim().split(/\s+/).reduce((state, move) => applyMove(state, move), solved(puzzle.size)), error: '' }; }
    catch { return { state: undefined, error: 'This scramble could not be previewed.' }; }
  }, [sheet, previewMoves, puzzle.size]);
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
        active && !sheet && !tutorialOpen && e.code === "Space" &&
        !e.repeat &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest('input,button,select,textarea,dialog,[role="dialog"]')
        )
      ) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle, active, sheet, tutorialOpen]);
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
      setXpEarned(onSolveSaved(s, manualMode));
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
      return true;
    } catch (e) {
      notify(e);
      return false;
    }
  };
  return (
    <div className="timer-screen">
      {xpEarned > 0 && <p className="timer-xp-notice" role="status">+{xpEarned} XP · Saved</p>}
      <div className="timer-toolbar"><div>
        <button className="icon-button" aria-label="Session settings" title={`Sessions · ${session?.name || 'Session'}`} disabled={locked} onClick={() => setSheet('session')}><PanelsTopLeft size={22}/></button>
        <button className="icon-button" aria-label={`Saved scrambles (${savedCount})`} title="Saved scrambles" disabled={locked} onClick={() => setSheet('library')}><Library size={22}/></button>
      </div><button className="icon-button" aria-label="Timer tutorial" title="Timer tutorial" disabled={running || inspecting} onClick={() => setTutorialOpen(true)}><Info size={22}/></button></div>
      {tutorialOpen && active && <TimerTutorial size={puzzle.size} inspection={training.settings.inspection} onClose={closeTutorial}/>}
      {sheet && <Sheet title={sheet === 'session' ? 'Session settings' : sheet === 'library' ? 'Saved scrambles' : sheet === 'solve' ? 'Solve details' : 'Scramble preview'} onClose={() => setSheet(null)}>
        {sheet === 'session' ? <>
      <section className="session-controls">
        <div className="stats-filters">
          <label>Session<select aria-label="Session" disabled={locked} value={session?.id ?? ''} onChange={e => updateTraining({ ...training, active: { ...training.active, [event]: e.target.value } })}>{training.sessions.filter(s => s.event === event).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Session name<input disabled={locked} value={session?.name ?? ''} maxLength={100} onChange={e => updateSession({ name: e.target.value })} /></label>
          <label>Cube<select disabled={locked} value={session?.cube ?? ''} onChange={e => updateSession({ cube: e.target.value })}><option value="">Unspecified</option>{training.cubes.filter(c => c.event === event).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Method<select disabled={locked} value={session?.method ?? ''} onChange={e => updateSession({ method: e.target.value })}>{training.methods.map(m => <option key={m}>{m}</option>)}</select></label>
        </div>
        <form className="settings-row" onSubmit={e => { e.preventDefault(); const next = createSession(event, training, newSessionName); updateTraining({ ...training, sessions: [...training.sessions, next], active: { ...training.active, [event]: next.id } }); setNewSessionName(''); }}>
          <input disabled={locked} aria-label="New session name" placeholder="New session name" value={newSessionName} maxLength={100} onChange={e => setNewSessionName(e.target.value)} /><button className="button" disabled={locked}>New session</button>
        </form>
        <label className="check-setting"><input type="checkbox" disabled={locked} checked={training.settings.inspection} onChange={e => updateTraining({ ...training, settings: { ...training.settings, inspection: e.target.checked } })} />WCA-style inspection · 15 seconds</label>

      </section>
          <button className="button" onClick={() => setSheet(null)}>Done</button>
        </> : sheet === 'library' ? <TimerSavedScrambles {...{ training, updateTraining, event }} onSelect={item => { onSelectScramble(item); setSheet(null); }}/>
        : <div className="timer-preview-sheet">
          {preview.error ? <p role="alert">{preview.error}</p> : preview.state && <div className="cube-stage"><Suspense fallback={<p>Loading cube…</p>}><Cube key={`${event}:${previewMoves}`} size={puzzle.size} initialState={preview.state} moves={noMoves} step={0} transparent={false} resetView={0} maskIrrelevant={false} focus="all"/></Suspense></div>}
          <p className="scramble-text">{previewMoves}</p>
          {sheet === 'solve' && selectedSolve ? <>
            <div className="timer-solve-meta"><strong>{selectedSolve.penalty === 'DNF' ? 'DNF' : formatTime(effective(selectedSolve))}</strong><time dateTime={selectedSolve.created_at}>{new Date(selectedSolve.created_at).toLocaleString()}</time></div>
            {(selectedSolve.cube_name || selectedSolve.method) && <p className="timer-solve-context">{[selectedSolve.cube_name, selectedSolve.method].filter(Boolean).join(' · ')}</p>}
            {selectedSolve.inspection_ms !== undefined && <p className="timer-solve-context">Inspection · {formatTime(selectedSolve.inspection_ms)}s</p>}
            <div className="timer-solve-actions"><label>Penalty<select aria-label="Solve penalty" value={selectedSolve.penalty} onChange={e => void changePenalty(selectedSolve, e.target.value as Solve['penalty'])}><option value="none">None</option><option value="+2">+2</option><option value="DNF">DNF</option></select></label>
              <ScrambleBookmark {...{ training, updateTraining, event }} moves={selectedSolve.scramble} name={`Solve ${eventSolves.length-eventSolves.indexOf(selectedSolve)}`}/>
              <button className="icon-button delete" aria-label="Delete solve" title="Delete solve" onClick={() => { void remove(selectedSolve).then(removed => { if (removed) { setSheet(null); setSelectedSolveId(null); } }); }}><Trash2 size={21}/></button>
            </div>
          </> : <div className="timer-preview-actions"><ScrambleBookmark {...{ training, updateTraining, event }} moves={scramble?.moves || ''} disabled={locked || loading}/></div>}
        </div>}
      </Sheet>}
      <div className="timer-layout">
        <section className="timer-workspace" aria-label="Timer">
          <div className="scramble" aria-label="Current scramble">{scramble?.moves || (loading ? 'Generating…' : 'No scramble')}</div>
          <div className="timer-scramble-actions"><span className="timer-turn-count" aria-label={`${moveCount} moves`} title="Turn count"><RotateCw size={17} aria-hidden="true"/>{moveCount}</span><div>
            <button className="icon-button" aria-label="Preview scramble" title="Preview scramble" disabled={locked || loading || !scramble?.moves} onClick={() => setSheet('preview')}><Box size={21}/></button>
            <ScrambleBookmark {...{ training, updateTraining, event }} moves={scramble?.moves || ''} disabled={locked || loading}/>
            <button className="icon-button" aria-label={loading ? 'Generating scramble' : 'New scramble'} title="New scramble" disabled={locked || loading} onClick={() => void loadScramble()}>{loading ? <LoaderCircle size={21} className="timer-loading"/> : <Shuffle size={21}/>}</button>
          </div></div>
          <div className={`timer-zone ${running ? "is-running" : ""}`}>
            <div className="timer-status">{inspecting ? 'Inspection' : running ? 'Running' : pending !== null ? 'Unsaved' : ''}</div>
            <button
              className="time-display"
              onClick={toggle}
              disabled={manualMode || pending !== null || busy || !scramble || loading}
              aria-label={inspecting ? "Start solve" : running ? "Stop timer" : "Start timer"}
            >
              {inspecting ? inspectionElapsed >= 17000 ? "DNF" : inspectionElapsed >= 15000 ? "+2" : ((15000 - inspectionElapsed) / 1000).toFixed(1) : formatTime(elapsed)}
              <span>s</span>
            </button>
            <div className="timer-ring" />
          </div>
          {inspecting && <button className="text-button" onClick={() => { setInspecting(false); setInspectionMs(undefined); setInspectionElapsed(0); }}>Cancel inspection</button>}
          {pending !== null && inspectionMs !== undefined && <p className="small-muted">Inspection: {formatTime(inspectionMs)}s · {inspectionPenalty(inspectionMs) === 'none' ? 'No inspection penalty' : inspectionPenalty(inspectionMs)}</p>}
          <div className="timer-entry">
            <div className="entry-switch">
              <button
                className={!manualMode ? "selected" : ""}
                aria-label="Timer mode" title="Timer" aria-pressed={!manualMode}
                disabled={running || inspecting || pending !== null}
                onClick={() => setManualMode(false)}
              >
                <Timer size={21} aria-hidden="true"/>
              </button>
              <button
                className={manualMode ? "selected" : ""}
                aria-label="Enter time" title="Enter time" aria-pressed={manualMode}
                disabled={running || inspecting || pending !== null}
                onClick={() => setManualMode(true)}
              >
                <PencilLine size={21} aria-hidden="true"/>
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
                  aria-label={busy ? 'Saving solve' : 'Save solve'} title="Save solve"
                  onClick={save}
                  disabled={busy || !scramble}
                >
                  {busy ? <LoaderCircle size={22} className="timer-loading"/> : <Check size={22}/> }
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
      <section className="history-card">
        <div className="history-header">
          <div>
            <h2>
              Solves <span>{eventSolves.length}</span>
            </h2>
          </div>
          <span className="timer-history-order" role="img" aria-label="Newest solves first"><ArrowDown size={18} aria-hidden="true"/></span>
        </div>
        {!user && !eventSolves.length ? (
          <div className="empty-state">
            <p>No solves in this session.</p>

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
                  </strong>
                  <button className="icon-button" aria-label={`View scramble for solve ${eventSolves.length-i}`} title="Solve details" disabled={locked} onClick={() => {setSelectedSolveId(s.id);setSheet('solve');}}><Box size={21}/></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
