import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Contrast,
  Eye,
  EyeOff,
  Info,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { type Algorithm, type AlgorithmCatalog } from "../lib/api";
import type { CubeSize } from "../lib/cube";
import { describeMove } from "../lib/notation";
import { belongsTo, algorithmFocus } from "../lib/catalog";
const Cube = lazy(() => import("./Cube"));
function InfoCircle({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details
      className="info-circle"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={label} title={label}>
        <Info size={16} aria-hidden="true" />
      </summary>
      <div className="info-popover">{children}</div>
    </details>
  );
}

export default function AlgorithmPage({ algorithms, sets }: AlgorithmCatalog) {
  const [selectedPuzzle, setSelectedPuzzle] = useState<CubeSize>(3);
  const puzzleSets = sets.filter((item) => (item.puzzle_size ?? 3) === selectedPuzzle);
  const [selectedSet, setSelectedSet] = useState("all"),
    [selectedSection, setSelectedSection] = useState("all"),
    [selected, setSelected] = useState("sune"),
    [selectedVariation, setSelectedVariation] = useState("normal"),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [transparent, setTransparent] = useState(false),
    [maskIrrelevant, setMaskIrrelevant] = useState(false),
    [resetView, setResetView] = useState(0),
    [speed, setSpeed] = useState(1000);
  const visibleAlgorithms = algorithms.filter((item) =>
    (item.puzzle_size ?? 3) === selectedPuzzle && belongsTo(item, selectedSet, selectedSection),
  );
  const algorithm =
    visibleAlgorithms.find((item) => item.id === selected) ??
    visibleAlgorithms[0];
  const variation =
    algorithm?.variations.find((item) => item.id === selectedVariation) ??
    algorithm?.variations[0];
  const moves = useMemo(() => variation?.moves.split(" ") || [], [variation]);
  const memberships = sets.filter((item) =>
    algorithm?.memberships.some((membership) => membership.set_id === item.id),
  );
  const activeSet = sets.find((item) => item.id === selectedSet);
  const focus = algorithmFocus(algorithm, sets, selectedSet, selectedSection);
  const selectAlgorithm = (item: Algorithm) => {
    setSelected(item.id);
    setSelectedVariation(item.variations[0].id);
    setStep(0);
    setPlaying(false);
  };
  const changeFilter = (setId: string, sectionId = "all", size = selectedPuzzle) => {
    setSelectedSet(setId);
    setSelectedSection(sectionId);
    const available = algorithms.filter((item) =>
      (item.puzzle_size ?? 3) === size && belongsTo(item, setId, sectionId),
    );
    const next =
      available.find((item) => item.id === algorithm?.id) ?? available[0];
    if (next && next.id !== algorithm?.id) selectAlgorithm(next);
    if (!next) {
      setPlaying(false);
      setStep(0);
    }
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
          <span>Puzzle</span>
          <select
            aria-label="Puzzle"
            value={selectedPuzzle}
            onChange={(event) => {
              const size = Number(event.target.value) as CubeSize;
              setSelectedPuzzle(size);
              changeFilter("all", "all", size);
            }}
          >
            {[3, 4, 5].map((size) => (
              <option key={size} value={size}>{size}×{size}</option>
            ))}
          </select>
        </label>
        <label className="library-set">
          <span>Set</span>
          <select
            aria-label="Algorithm set"
            value={selectedSet}
            onChange={(event) => changeFilter(event.target.value)}
          >
            <option value="all">All sets</option>
            {puzzleSets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {!!activeSet?.sections.length && (
          <label className="library-set">
            <span>Section</span>
            <select
              aria-label="Algorithm section"
              value={selectedSection}
              onChange={(event) =>
                changeFilter(selectedSet, event.target.value)
              }
            >
              <option value="all">All sections</option>
              {activeSet.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
          <p className="empty-state">No algorithms in this section.</p>
        )}
      </aside>
      <section className="card trainer-card">
        <div className="trainer-heading">
          <div>
            <div className="eyebrow">
              {memberships.map((item) => item.name).join(" · ") ||
                "ALGORITHM TRAINER"}
            </div>
            <h2>
              {algorithm?.name ||
                (sets.length ? "No algorithm selected" : "Loading algorithms…")}
            </h2>
          </div>
          <span className="outline-label">{moves.length} moves</span>
        </div>
        {algorithm && <p className="algorithm-description">{algorithm.description}</p>}
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
        <div className={`cube-stage ${transparent ? "is-see-through" : ""}`}>
          {moves.length > 0 && (
            <Suspense
              fallback={
                <div className="empty-state">Loading the 3D viewer…</div>
              }
            >
              <Cube
                key={`${algorithm?.id}:${variation?.id}`}
                size={selectedPuzzle}
                {...{
                  moves,
                  step,
                  transparent,
                  resetView,
                  maskIrrelevant,
                  focus,
                }}
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
            <button
              className={`tool-button ${maskIrrelevant ? "selected" : ""}`}
              aria-label="Black out irrelevant stickers"
              aria-pressed={maskIrrelevant}
              title={
                maskIrrelevant
                  ? "Show all sticker colors"
                  : "Black out irrelevant stickers"
              }
              onClick={() => setMaskIrrelevant(!maskIrrelevant)}
            >
              <Contrast size={16} />
            </button>
          </div>
          <div className="viewer-help">
            <InfoCircle label="Cube viewer help">
              <p>Yellow up · Red front</p>
              <p>Drag to orbit · Pinch to zoom</p>
              <p>Use the viewer buttons to reset the view, see through the cube, or black out irrelevant stickers.</p>
            </InfoCircle>
          </div>
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
              ? sets.length
                ? "Choose an algorithm to practise."
                : "Connect to the API to load the trainer."
              : step === moves.length
                ? "Solved"
                : `Next: ${moves[step]}`}
          </p>
          {!!moves.length && step < moves.length && (
            <InfoCircle key={`${algorithm?.id}:${variation?.id}:${step}`} label={`Explain move ${moves[step]}`}>
              <p>{describeMove(moves[step])}</p>
            </InfoCircle>
          )}
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
        <div className="notation-help">
          <span>Notation</span>
          <InfoCircle label="Notation help">
            <p>R = right face · U = upper face · ′ = counterclockwise · 2 = half turn</p>
            <p>Rw / Uw = outer two layers together · 2R / 2L = second layer only from that face.</p>
            <p>x = rotate the whole cube in the same direction as R.</p>
            <p>Clockwise is always viewed directly at the face being turned.</p>
          </InfoCircle>
        </div>
      </section>
    </div>
  );
}
