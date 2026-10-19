import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Box, Layers3, LogOut, Timer, X } from "lucide-react";
import {
  api,
  type Algorithm,
  type Scramble,
  type Solve,
  type User,
} from "./lib/api";
import TimerPage from "./components/TimerPage";
import AlgorithmPage from "./components/AlgorithmPage";
import AuthModal from "./components/AuthModal";
import { authProvider } from "./lib/auth";
import PwaStatus from "./components/PwaStatus";
type Page = "timer" | "algorithms";
export default function App() {
  const [page, setPage] = useState<Page>("timer"),
    [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [error, setError] = useState("");
  const [solves, setSolves] = useState<Solve[]>([]),
    [scramble, setScramble] = useState<Scramble | null>(null),
    [algorithms, setAlgorithms] = useState<Algorithm[]>([]),
    [loading, setLoading] = useState(false);
  const notify = useCallback(
    (e: unknown) =>
      setError(e instanceof Error ? e.message : "Something went wrong"),
    [],
  );
  const loadScramble = useCallback(async () => {
    setLoading(true);
    try {
      setScramble(await api<Scramble>("/scrambles", { method: "POST" }));
    } catch (e) {
      notify(e);
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => {
    void loadScramble();
    api<Algorithm[]>("/algorithms").then(setAlgorithms).catch(notify);
    authProvider.getUser().then(setUser).catch(notify);
  }, [loadScramble, notify]);
  useEffect(() => {
    let active = true;
    setSolves([]);
    if (user)
      api<Solve[]>("/solves")
        .then((items) => {
          if (active) setSolves(items);
        })
        .catch((error) => {
          if (active) notify(error);
        });
    return () => {
      active = false;
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
            {page === "timer" ? "Timer" : "Algorithms"}
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
          ) : (
            <AlgorithmPage algorithms={algorithms} />
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
      </nav>
      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onSuccess={signedIn} />
      )}
    </div>
  );
}
