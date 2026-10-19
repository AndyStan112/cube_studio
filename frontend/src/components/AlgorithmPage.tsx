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
import { type Algorithm, type AlgorithmCatalog } from "../lib/api";
import { describeMove } from "../lib/notation";
const Cube = lazy(() => import("./Cube"));
export default function AlgorithmPage({ algorithms, sets }: AlgorithmCatalog) {
  const [selectedSet, setSelectedSet] = useState("all"),
    [selected, setSelected] = useState("sune"),
    [selectedVariation, setSelectedVariation] = useState("normal"),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [transparent, setTransparent] = useState(false),
    [resetView, setResetView] = useState(0),
    [speed, setSpeed] = useState(1000);
  const visibleAlgorithms = algorithms.filter(
    (item) => selectedSet === "all" || item.set_ids.includes(selectedSet),
  );
  const algorithm =
    visibleAlgorithms.find((item) => item.id === selected) ??
    visibleAlgorithms[0];
  const variation =
    algorithm?.variations.find((item) => item.id === selectedVariation) ??
    algorithm?.variations[0];
  const moves = useMemo(() => variation?.moves.split(" ") || [], [variation]);
  const memberships = sets.filter((item) =>
    algorithm?.set_ids.includes(item.id),
  );
  const selectAlgorithm = (item: Algorithm) => {
    setSelected(item.id);
    setSelectedVariation(item.variations[0].id);
    setStep(0);
    setPlaying(false);
  };
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
      <aside className="card algorithm-library">
        <label className="library-set">
          <span>Set</span>
          <select
            aria-label="Algorithm set"
            value={selectedSet}
            onChange={(event) => {
              const id = event.target.value;
              setSelectedSet(id);
              const available = algorithms.filter(
                (item) => id === "all" || item.set_ids.includes(id),
              );
              const next =
                available.find((item) => item.id === algorithm?.id) ??
                available[0];
              if (next && next.id !== algorithm?.id) selectAlgorithm(next);
              if (!next) {
                setPlaying(false);
                setStep(0);
              }
            }}
          >
            <option value="all">All sets</option>
            {sets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="algorithm-list">
          {visibleAlgorithms.map((item, index) => (
            <button
              key={item.id}
              className={`algorithm-option ${item.id === algorithm?.id ? "selected" : ""}`}
              aria-pressed={item.id === algorithm?.id}
              onClick={() => selectAlgorithm(item)}
            >
              <span className="alg-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.variations.length}{" "}
                  {item.variations.length === 1 ? "variation" : "variations"}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
        {sets.length > 0 && !visibleAlgorithms.length && (
          <p className="empty-state">No algorithms in this set.</p>
        )}
      </aside>
      <section className="card trainer-card">
        <div className="trainer-heading">
          <div>
            <div className="eyebrow">
              {memberships.map((item) => item.name).join(" · ") ||
                "ALGORITHM TRAINER"}
            </div>
            <h2>{algorithm?.name || "Loading algorithms…"}</h2>
          </div>
          <span className="outline-label">{moves.length} moves</span>
        </div>
        {algorithm && algorithm.variations.length > 1 && (
          <label className="variation-control">
            <span>Variation</span>
            <select
              aria-label="Algorithm variation"
              value={variation?.id}
              onChange={(event) => {
                setSelectedVariation(event.target.value);
                jump(0);
              }}
            >
              {algorithm.variations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.case ? ` · ${item.case}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="cube-stage">
          <div className="cube-label">
            <span className="status-dot" />
            YELLOW UP · RED FRONT
          </div>
          {moves.length > 0 && (
            <Suspense
              fallback={
                <div className="empty-state">Loading the 3D viewer…</div>
              }
            >
              <Cube
                key={`${algorithm?.id}:${variation?.id}`}
                {...{ moves, step, transparent, resetView }}
              />
            </Suspense>
          )}
          <div className="cube-tools">
            <button
              className="tool-button"
              aria-label="Reset view"
              title="Reset view · Yellow up, red front"
              onClick={() => setResetView((value) => value + 1)}
            >
              <RotateCcw size={17} />
            </button>
            <button
              className={`tool-button ${transparent ? "selected" : ""}`}
              aria-label="See-through"
              aria-pressed={transparent}
              title={transparent ? "Disable see-through" : "Enable see-through"}
              onClick={() => setTransparent(!transparent)}
            >
              {transparent ? <EyeOff size={15} /> : <Eye size={15} />}
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
