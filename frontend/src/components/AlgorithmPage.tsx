import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { type Algorithm } from "../lib/api";
import { describeMove } from "../lib/notation";
const Cube = lazy(() => import("./Cube"));
export default function AlgorithmPage({
  algorithms,
}: {
  algorithms: Algorithm[];
}) {
  const [selected, setSelected] = useState("sune"),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [transparent, setTransparent] = useState(false),
    [angle, setAngle] = useState(0),
    [speed, setSpeed] = useState(1000);
  const algorithm = algorithms.find((a) => a.id === selected),
    moves = useMemo(() => algorithm?.moves.split(" ") || [], [algorithm]);
  useEffect(() => {
    if (!playing) return;
    if (step >= moves.length) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => s + 1), speed);
    return () => clearTimeout(id);
  }, [playing, step, moves.length, speed]);
  const jump = (n: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(moves.length, n)));
  };
  return (
    <div className="algorithm-layout">
      <aside className="card algorithm-list">
        {algorithms.map((a, i) => (
          <button
            key={a.id}
            className={`algorithm-option ${a.id === selected ? "selected" : ""}`}
            onClick={() => {
              setSelected(a.id);
              setStep(0);
              setPlaying(false);
            }}
          >
            <span className="alg-number">0{i + 1}</span>
            <span>
              <strong>{a.name}</strong>
              <small>{a.set} · 7 moves</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </aside>
      <section className="card trainer-card">
        <div className="trainer-heading">
          <div>
            <div className="eyebrow">
              {algorithm?.set || "ALGORITHM TRAINER"}
            </div>
            <h2>{algorithm?.name || "Loading algorithms…"}</h2>
          </div>
          <span className="outline-label">{moves.length} moves</span>
        </div>
        <div className="cube-stage">
          <div className="cube-label">
            <span className="status-dot" />
            YELLOW UP · GREEN FRONT
          </div>
          {moves.length > 0 && (
            <Suspense
              fallback={
                <div className="empty-state">Loading the 3D viewer…</div>
              }
            >
              <Cube key={selected} {...{ moves, step, transparent, angle }} />
            </Suspense>
          )}
          <div className="cube-tools">
            <button
              className="tool-button"
              onClick={() => setAngle((angle + 1) % 4)}
            >
              <RotateCcw size={15} />
              Angle {angle + 1}
            </button>
            <button
              className={`tool-button ${transparent ? "selected" : ""}`}
              onClick={() => setTransparent(!transparent)}
            >
              {transparent ? <EyeOff size={15} /> : <Eye size={15} />}
              See-through {transparent ? "on" : "off"}
            </button>
          </div>
          <span className="drag-hint">Drag to orbit · Pinch to zoom</span>
        </div>
        <div className="notation" aria-label="Algorithm moves">
          {moves.map((m, i) => (
            <button
              key={i}
              className={i < step ? "completed" : i === step ? "next" : ""}
              onClick={() => jump(i + 1)}
              aria-label={`Go to move ${i + 1}: ${m}`}
              aria-current={i === step ? "step" : undefined}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="move-instruction">
          <span>
            {step === moves.length ? (
              <Check size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
          </span>
          <p>
            {!moves.length
              ? "Connect to the API to load the trainer."
              : step === moves.length
                ? "Solved"
                : `Next: ${moves[step]} — ${describeMove(moves[step])}`}
          </p>
        </div>
        <div className="playback">
          <div className="playback-buttons">
            <button
              className="icon-button"
              aria-label="Reset algorithm"
              onClick={() => jump(0)}
            >
              <RotateCcw size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Previous move"
              disabled={step === 0}
              onClick={() => jump(step - 1)}
            >
              <ArrowLeft size={19} />
            </button>
            <button
              className="play-button"
              disabled={!moves.length}
              aria-label={playing ? "Pause animation" : "Play animation"}
              onClick={() => {
                if (step === moves.length) setStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              className="icon-button"
              aria-label="Next move"
              disabled={step === moves.length}
              onClick={() => jump(step + 1)}
            >
              <ArrowRight size={19} />
            </button>
          </div>
          <span className="step-count">
            {step} <span>/ {moves.length} moves</span>
          </span>
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={1600}>Slow</option>
            <option value={1000}>Normal</option>
            <option value={500}>Fast</option>
          </select>
        </div>
        <details className="notation-help">
          <summary>Notation</summary>
          <span>
            R = right face · U = upper face · ′ = counterclockwise · 2 = half
            turn
          </span>
          <span>
            Clockwise is always viewed directly at the face being turned.
          </span>
        </details>
      </section>
    </div>
  );
}
