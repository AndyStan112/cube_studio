import { useCallback, useEffect, useRef, useState } from "react";
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
export default function TimerPage({
  scramble,
  loading,
  loadScramble,
  user,
  solves,
  setSolves,
  notify,
  onSignIn,
}: {
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
  const start = useRef(0);
  const toggle = useCallback(() => {
    if (!scramble || pending !== null || busy || loading) return;
    if (running) {
      const ms = Math.max(1, Math.round(performance.now() - start.current));
      setElapsed(ms);
      setPending(ms);
      setRunning(false);
    } else {
      start.current = performance.now();
      setElapsed(0);
      setRunning(true);
    }
  }, [scramble, pending, busy, loading, running]);
  useEffect(() => {
    if (!running) return;
    let frame: number;
    const tick = () => {
      setElapsed(performance.now() - start.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
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
  }, [toggle]);
  const save = async () => {
    const ms = manualMode ? parseTime(manual) : pending;
    if (!ms) {
      notify(new Error("Enter a time such as 24.53 or 1:02.45."));
      return;
    }
    if (!scramble) return;
    setBusy(true);
    try {
      let s: Solve;
      try {
        if (!user || !navigator.onLine || scramble.id.startsWith("local:")) throw Error("Local solve");
        s = await api<Solve>("/solves", {
          method: "POST",
          body: JSON.stringify({ scramble_id: scramble.id, time_ms: ms, penalty }),
          signal: AbortSignal.timeout(6000),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) throw error;
        s = localSolve(scramble, ms, penalty);
      }
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
  const best = solves.length ? Math.min(...solves.map(effective)) : null;
  const average = (n: number) => {
    const v = averageOf(solves, n);
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
      <div className="timer-layout">
        <section className="timer-card card">
          <div className="card-top">
            <span className="section-label">
              <span className="status-dot" />
              SCRAMBLE
            </span>
            <button
              className="text-button"
              disabled={running || pending !== null || loading || busy}
              onClick={() => void loadScramble()}
            >
              <Shuffle size={15} />
              {loading ? "Generating…" : "New scramble"}
            </button>
          </div>
          <div className="scramble" aria-label="Current scramble">
            {scramble?.moves || (loading ? "Generating…" : "No scramble")}
          </div>
          <div className="scramble-note">25 moves · White top, green front</div>
          <div className={`timer-zone ${running ? "is-running" : ""}`}>
            <div className="timer-status">
              {running ? "RUNNING" : pending !== null ? "UNSAVED" : "READY"}
            </div>
            <button
              className="time-display"
              onClick={toggle}
              disabled={pending !== null || busy || !scramble || loading}
              aria-label={running ? "Stop timer" : "Start timer"}
            >
              {formatTime(elapsed)}
              <span>s</span>
            </button>
            <div className="timer-hint">
              {running ? (
                "Tap to stop"
              ) : pending !== null ? (
                "Save or discard"
              ) : (
                <>
                  Tap to start <kbd>space</kbd>
                </>
              )}
            </div>
            <div className="timer-ring" />
          </div>
          <div className="timer-entry">
            <div className="entry-switch">
              <button
                className={!manualMode ? "selected" : ""}
                disabled={running || pending !== null}
                onClick={() => setManualMode(false)}
              >
                <Timer size={15} />
                Timer
              </button>
              <button
                className={manualMode ? "selected" : ""}
                disabled={running || pending !== null}
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
          <strong>{solves.length}</strong>
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
            {solves.length
              ? solves.some((s) => s.penalty === "DNF")
                ? "DNF"
                : formatTime(
                    solves.reduce((a, s) => a + effective(s), 0) /
                      solves.length,
                  )
              : "—"}
          </strong>
        </div>
      </section>
      <section className="card history-card">
        <div className="history-header">
          <div>
            <h2>
              Solves <span>{solves.length}</span>
            </h2>
          </div>
          <span className="small-muted">
            Newest first <ArrowDown size={13} />
          </span>
        </div>
        {!user && !solves.length ? (
          <div className="empty-state">
            <p>Solves are saved on this device. Sign in for online history.</p>
            <button className="button" onClick={onSignIn}>
              Sign in <ArrowRight size={16} />
            </button>
          </div>
        ) : !solves.length ? (
          <div className="empty-state">
            <p>No solves yet.</p>
          </div>
        ) : (
          <ol className="solve-list">
            {solves.map((s, i) => (
              <li key={s.id}>
                <div className="solve-row">
                  <span className="solve-number">{solves.length - i}</span>
                  <strong className="solve-time">
                    {s.penalty === "DNF" ? "DNF" : formatTime(effective(s))}
                    {s.penalty === "+2" && <small> +2</small>}
                    {s.id.startsWith("local:") && <small> · On this device</small>}
                  </strong>
                  <select
                    aria-label={`Penalty for solve ${solves.length - i}`}
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
                    aria-label={`Delete solve ${solves.length - i}`}
                    onClick={() => remove(s)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <details className="solve-details">
                  <summary>Scramble</summary>
                  <p>{s.scramble}</p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
