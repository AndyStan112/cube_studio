import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Pause, Play, RotateCcw } from "lucide-react";
import type { Scramble } from "../lib/api";
import { readStored, writeStored } from "../lib/offline";
import { parsePracticeMoves, practiceSequence } from "../lib/practice";
import { practiceMoves, puzzles, type CubeEvent } from "../lib/puzzles";
import { describeMove } from "../lib/notation";
import "./SolverPage.css";
const Cube = lazy(() => import("./Cube"));

export default function BigCubePractice({ event, scramble }: { event: CubeEvent; scramble: Scramble | null }) {
  const puzzle = puzzles[event];
  const storageKey = `cube-studio-practice-v1:${event}`;
  const [draft, setDraft] = useState(() => readStored<string>(storageKey, ""));
  const [sequence, setSequence] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [transparent, setTransparent] = useState(false);
  const [resetView, setResetView] = useState(0);
  const playback = useMemo(() => practiceSequence(sequence, puzzle.size, returning), [sequence, puzzle.size, returning]);
  const moves = playback.moves;
  function load(value: string) {
    try {
      const next = parsePracticeMoves(value, puzzle.size);
      setSequence(next);
      setDraft(value);
      writeStored(storageKey, value);
      setError("");
      setStep(0);
      setPlaying(false);
      setReturning(false);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(draft); }, []);
  useEffect(() => {
    if (!playing) return;
    if (step >= moves.length) { setPlaying(false); return; }
    const timer = setTimeout(() => setStep(n => n + 1), speed);
    return () => clearTimeout(timer);
  }, [playing, step, moves.length, speed]);
  function jump(next: number) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(moves.length, next)));
  }
  return <div className="solver-layout">
    <section className="card solver-input">
      <h2>{puzzle.label} scramble playback</h2>
      <p className="solver-hint">Enter moves from a solved cube, then play them or follow the return sequence to solve it again.</p>

      <label className="facelet-label" htmlFor="practice-moves">Scramble moves</label>
      <textarea id="practice-moves" className="practice-moves" aria-label="Scramble moves" value={draft}
        onChange={e => setDraft(e.target.value)} spellCheck={false} autoCapitalize="off"
        placeholder="Rw U2 F' Lw2…" />
      <p className="solver-hint">Yellow up · Red front. Rw = outer two layers; 2R = second layer only; x = rotate the whole cube.</p>
      <div className="solver-actions">
        <button className="button" onClick={() => load(draft)}>Apply scramble</button>
        <button className="button" onClick={() => load(practiceMoves(event).join(" "))}>Generate scramble</button>
        <button className="button" disabled={!scramble} onClick={() => scramble && load(scramble.moves)}>Use timer scramble</button>
        <button className="button" onClick={() => load("")}>Clear</button>
      </div>
      {error && <p role="alert" className="error-banner">{error}</p>}
    </section>
    <section className="card trainer-card">
      <div className="trainer-heading">
        <h2>{returning ? "Return to solved" : "Scramble"}</h2>
        <span className="outline-label">{moves.length} moves</span>
      </div>
      <div className="solver-actions" role="group" aria-label="Playback sequence">
        <button className="button" aria-pressed={!returning} onClick={() => { setReturning(false); jump(0); }}>Play scramble</button>
        <button className="button" aria-pressed={returning} disabled={!sequence.length} onClick={() => { setReturning(true); jump(0); }}>Return to solved</button>
      </div>
      <div className={`cube-stage ${transparent ? "is-see-through" : ""}`}>
        <Suspense fallback={<p>Loading cube…</p>}>
          <Cube key={`${sequence.join(" ")}:${returning}`} size={puzzle.size} initialState={playback.initial}
            moves={moves} step={step} transparent={transparent} resetView={resetView} maskIrrelevant={false} focus="all" />
        </Suspense>
        <div className="cube-tools">
          <button className="tool-button" aria-label="Reset view" onClick={() => setResetView(n => n + 1)}><RotateCcw size={17} /></button>
          <button className="tool-button" aria-label="See-through" aria-pressed={transparent} onClick={() => setTransparent(v => !v)}>
            {transparent ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div className="notation" aria-label="Playback moves">
        {moves.map((move, i) => <button key={i} className={i < step ? "completed" : i === step ? "next" : ""}
          aria-label={`Go to move ${i + 1}: ${move}`} onClick={() => jump(i + 1)}>{move}</button>)}
      </div>
      <div className="move-instruction" role="status">
        <p>{!moves.length ? "Apply a scramble to begin." : step === moves.length
          ? returning ? "Solved" : "Scramble complete"
          : `Next: ${moves[step]} · ${describeMove(moves[step])}`}</p>
      </div>
      <div className="playback">
        <div className="playback-buttons">
          <button className="icon-button" aria-label="Reset playback" onClick={() => jump(0)}><RotateCcw size={18} /></button>
          <button className="icon-button" aria-label="Previous move" disabled={!step} onClick={() => jump(step - 1)}><ArrowLeft size={19} /></button>
          <button className="play-button" aria-label={playing ? "Pause animation" : "Play animation"} disabled={!moves.length}
            onClick={() => { if (step === moves.length) setStep(0); setPlaying(v => !v); }}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button className="icon-button" aria-label="Next move" disabled={step === moves.length} onClick={() => jump(step + 1)}><ArrowRight size={19} /></button>
        </div>
        <span className="step-count">{step} / {moves.length} moves</span>
        <select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
          <option value={1200}>Slow</option><option value={500}>Normal</option><option value={200}>Fast</option>
        </select>
      </div>
    </section>
  </div>;
}
