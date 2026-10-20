import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Box, Layers3, LogOut, Timer, X } from "lucide-react";
import {
  api,
  ApiError,
  type AlgorithmCatalog,
  type Scramble,
  type Solve,
  type User,
} from "./lib/api";
import { cachedCatalog, refreshCatalog, flushSolveEdits, localScramble, readStored, writeStored, solvesKey } from "./lib/offline";
import TimerPage from "./components/TimerPage";
import AlgorithmPage from "./components/AlgorithmPage";
import SolverPage from "./components/SolverPage";
import AuthModal from "./components/AuthModal";
import { authProvider } from "./lib/auth";
import PwaStatus from "./components/PwaStatus";
type Page = "timer" | "algorithms" | "solver";
export default function App() {
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
  const notify = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "Something went wrong"),
    [],
  );
  const loadScramble = useCallback(async () => {
    setLoading(true);
    try {
      if (!navigator.onLine) { setScramble(localScramble()); return; }
      setScramble(await api<Scramble>("/scrambles", { method: "POST", signal: AbortSignal.timeout(6000) }));
    } catch {
      setScramble(localScramble());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadScramble();
    const refresh = () => void refreshCatalog().then(setCatalog).catch(notify);
    refresh();
    window.addEventListener("online", refresh);
    authProvider.getUser().then(setUser).catch(() => {});
    return () => window.removeEventListener("online", refresh);
  }, [loadScramble, notify]);
  useEffect(() => {
    let active = true;
    setSolves(readStored<Solve[]>(solvesKey(user?.id), []));
    const refresh = () => {
      if (user)
        flushSolveEdits(user.id).then(() => api<Solve[]>("/solves", { signal: AbortSignal.timeout(6000) }))
          .then((items) => {
            if (active) {
              const local = readStored<Solve[]>(solvesKey(user?.id), []).filter(s => s.id.startsWith("local:"));
              const merged = [...local, ...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
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
  }, [user, notify]);
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
                : "Algorithms"}
          </h1>
          <div className="topbar-right">
            <span className="event-badge">
              <Box size={14} />3 × 3 × 3
            </span>
            {user ? (
              <>
                <span className="avatar" title={`${user.name} · Demo user`}>
                  {user.name[0].toUpperCase()}
                </span>
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
          {page === "timer" ? (
            <TimerPage
              {...{
                scramble,
                loading,
                loadScramble,
                user,
                solves,
                setSolves,
                notify,
              }}
              onSignIn={() => setAuthOpen(true)}
            />
          ) : page === "solver" ? (
            <SolverPage />
          ) : (
            <AlgorithmPage {...catalog} />
          )}
        </main>
      </div>
      <nav className="mobile-nav">
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
      </nav>
      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onSuccess={signedIn} />
      )}
    </div>
  );
}
