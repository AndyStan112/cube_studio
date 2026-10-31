import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Box, Layers3, LogOut, Timer, X, ChartNoAxesCombined, Settings, GraduationCap } from "lucide-react";
import {
  api,
  ApiError,
  type AlgorithmCatalog,
  type Scramble,
  type Solve,
  type User,
} from "./lib/api";
import { cachedCatalog, refreshCatalog, flushSolveEdits, localScramble, readStored, writeStored, solvesKey } from "./lib/offline";
import { cubeEvents, puzzles, type CubeEvent } from "./lib/puzzles";
import BigCubePractice from "./components/BigCubePractice";
import TimerPage from "./components/TimerPage";
import AlgorithmPage from "./components/AlgorithmPage";
import SolverPage from "./components/SolverPage";
import AuthModal from "./components/AuthModal";
import { authProvider } from "./lib/auth";
import PwaStatus from "./components/PwaStatus";
import LearningPage from "./components/LearningPage";
import { useLearning } from "./lib/useLearning";
import { levelInfo } from "./lib/learning";
import SettingsPage from "./components/SettingsPage";
import StatsPage from "./components/StatsPage";
import { readTraining, storeTraining, type TrainingData } from "./lib/training";
type Page = "timer" | "algorithms" | "solver" | "stats" | "settings" | "learn";
export default function App() {
  const [event, setEvent] = useState<CubeEvent>(() => {
    const saved = readStored<CubeEvent>("cube-studio-event-v1", "333");
    return cubeEvents.includes(saved) ? saved : "333";
  });
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [timerLocked, setTimerLocked] = useState(false);
  const scrambleTicket = useRef(0);
  const [page, setPage] = useState<Page>("timer"),
    [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [error, setError] = useState("");
  const [solves, setSolves] = useState<Solve[]>([]),
    [scramble, setScramble] = useState<Scramble | null>(null),
    [catalog, setCatalog] = useState<AlgorithmCatalog>(() => cachedCatalog() ?? ({
      sets: [],
      algorithms: [],
    })),
    [loading, setLoading] = useState(false);
  const { progress, award } = useLearning(user?.id);
  const [training, setTraining] = useState<TrainingData>(() => readTraining());
  useEffect(() => { setTraining(readTraining(user?.id)); }, [user?.id]);
  const updateTraining = (data: TrainingData) => { storeTraining(data, user?.id); setTraining(data); };
  const notify = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "Something went wrong"),
    [],
  );
  const loadScramble = useCallback(async () => {
    const ticket = ++scrambleTicket.current;
    setLoading(true);
    try {
      const next = navigator.onLine
        ? await api<Scramble>("/scrambles", {
          method: "POST", body: JSON.stringify({ event }), signal: AbortSignal.timeout(6000),
        })
        : localScramble(event);
      if (ticket === scrambleTicket.current) setScramble(next);
    } catch {
      if (ticket === scrambleTicket.current) setScramble(localScramble(event));
    } finally {
      if (ticket === scrambleTicket.current) setLoading(false);
    }
  }, [event]);
  useEffect(() => {
    void loadScramble();
    return () => { scrambleTicket.current++; };
  }, [loadScramble]);
  useEffect(() => {
    const refresh = () => void refreshCatalog().then(setCatalog).catch(notify);
    refresh();
    window.addEventListener("online", refresh);
    authProvider.getUser().then(setUser).catch(() => {});
    return () => window.removeEventListener("online", refresh);
  }, [notify]);
  useEffect(() => {
    let active = true;
    setSolves(readStored<Solve[]>(solvesKey(user?.id), []));
    const refresh = () => {
      if (user)
        flushSolveEdits(user.id).then(() => Promise.all(cubeEvents.map(category => api<Solve[]>(`/solves?event=${category}`, { signal: AbortSignal.timeout(6000) })))).then(groups => groups.flat())
          .then((items) => {
            if (active) {
              const retained = readStored<Solve[]>(solvesKey(user.id), []).filter(s => s.id.startsWith("local:"));
              const merged = [...retained, ...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
              writeStored(solvesKey(user?.id), merged);
              setSolves(merged);
            }
          })
          .catch((error) => {
            if (active && error instanceof ApiError && error.status < 500) notify(error);
          });
    };
    refresh();
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      window.removeEventListener("online", refresh);
    };
  }, [user, notify, event]);
  const signedIn = (u: User) => {
    setUser(u);
    setAuthOpen(false);
    setError("");
  };
  const signOut = async () => {
    try {
      await authProvider.signOut();
      setUser(null);
    } catch (e) {
      notify(e);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">
            <Box size={25} />
          </span>
          cube<span className="brand-light">studio</span>
          <span className="brand-dot">.</span>
        </a>
        <nav>
          <button className={page === "learn" ? "nav-link active" : "nav-link"} onClick={() => setPage("learn")}><GraduationCap size={20}/>Learn</button>
          <button
            className={page === "timer" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("timer")}
          >
            <Timer size={20} />
            Timer
          </button>
          <button
            className={page === "algorithms" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("algorithms")}
          >
            <Layers3 size={20} />
            Algorithms
          </button>
          <button
            className={page === "solver" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("solver")}
          >
            <Box size={20} />
            Solver
          </button>
          <button className={page === "stats" ? "nav-link active" : "nav-link"} onClick={() => setPage("stats")}><ChartNoAxesCombined size={20} />Stats</button>
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a
            className="mobile-brand"
            href="#"
            onClick={(e) => e.preventDefault()}
          >
            <Box size={23} />
            Cube Studio
          </a>
          <h1 className="screen-title">
            {page === "timer"
              ? "Timer"
              : page === "solver"
                ? "Solver"
                : page === "learn" ? "Learn" : page === "stats" ? "Statistics" : page === "settings" ? "Settings" : "Algorithms"}
          </h1>
          <div className="topbar-right">
            <button className="learning-level-badge" onClick={() => setPage("learn")} aria-label={`Level ${levelInfo(progress.xp).level}, ${progress.xp} XP. Open learning.`}>Lv {levelInfo(progress.xp).level}</button>
            <label className="puzzle-picker" hidden={page === "learn"}>
              <span>Puzzle</span>
              <select aria-label="Puzzle" value={event} disabled={timerLocked}
                title={timerLocked ? "Save or discard this time before changing puzzles." : "Choose puzzle"}
                onChange={(e) => {
                  const next = e.target.value as CubeEvent;
                  writeStored("cube-studio-event-v1", next);
                  setEvent(next);
                }}>
                {cubeEvents.map(value => <option key={value} value={value}>{puzzles[value].label}</option>)}
              </select>
            </label>
            <button className="icon-button" aria-label="Settings" onClick={() => setPage("settings")}><Settings size={20} /></button>
            {user ? (
              <>
                <button className="avatar" aria-label="Profile settings" onClick={() => setPage("settings")} title={`${user.name} · Settings`}>
                  {user.name[0].toUpperCase()}
                </button>
                <span className="user-name">{user.name}</span>
                <button
                  className="icon-button"
                  onClick={signOut}
                  aria-label="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button
                className="button small"
                onClick={() => setAuthOpen(true)}
              >
                Sign in <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main>
          <PwaStatus />
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div hidden={page !== "timer"}><TimerPage
              key={`${event}:${user?.id ?? "guest"}`}
              event={event}
              active={page === "timer"}
              training={training} updateTraining={updateTraining}
              onSelectScramble={setScramble}
              onLockChange={setTimerLocked}
              scramble={scramble?.event === event ? scramble : null}
              {...{
                loading,
                loadScramble,
                user,
                solves,
                setSolves,
                notify,
              }}
              onSolveSaved={(solve, manual) => award({ type: 'solve', id: solve.id, dnf: solve.penalty === 'DNF', event: solve.event ?? event, method: solve.method, sessionId: solve.session_id, cubeId: solve.cube, manual })}
              onSignIn={() => setAuthOpen(true)}
            /></div>
          {page === "solver" ? (
            <>
              <SolverPage key={event} size={puzzles[event].size} training={training} updateTraining={updateTraining} />
              {event !== "333" && <details className="card practice-panel" onToggle={e => setPracticeOpen(e.currentTarget.open)}>
                <summary>Scramble playback and return sequence</summary>
                {practiceOpen && <BigCubePractice key={event} event={event} scramble={scramble?.event === event ? scramble : null} />}
              </details>}
            </>
          ) : page === "learn" ? <LearningPage key={user?.id ?? "guest"} {...{progress,award}} /> : page === "settings" ? <SettingsPage {...{ training, updateTraining, user, notify }} />
            : page === "stats" ? <StatsPage {...{ solves, training, updateTraining }} /> : page === "algorithms" ? (
            <AlgorithmPage {...catalog} puzzleSize={puzzles[event].size} />
          ) : null}
        </main>
      </div>
      <nav className="mobile-nav">
        <button className={page === "learn" ? "active" : ""} onClick={() => setPage("learn")}><GraduationCap size={19}/>Learn</button>
        <button
          className={page === "timer" ? "active" : ""}
          onClick={() => setPage("timer")}
        >
          <Timer size={19} />
          Timer
        </button>
        <button
          className={page === "algorithms" ? "active" : ""}
          onClick={() => setPage("algorithms")}
        >
          <Layers3 size={19} />
          Algorithms
        </button>
        <button
          className={page === "solver" ? "active" : ""}
          onClick={() => setPage("solver")}
        >
          <Box size={19} />
          Solver
        </button>
        <button className={page === "stats" ? "active" : ""} onClick={() => setPage("stats")}><ChartNoAxesCombined size={19} />Stats</button>
      </nav>
      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onSuccess={signedIn} />
      )}
    </div>
  );
}
