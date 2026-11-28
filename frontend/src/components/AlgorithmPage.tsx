import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Contrast,
  Eye,
  EyeOff,
  Info,
  ListFilter,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Gauge,
  Hand,
  ZoomIn,
} from "lucide-react";
import { type Algorithm, type AlgorithmCatalog } from "../lib/api";
import type { CubeSize } from "../lib/cube";
import { describeMove } from "../lib/notation";
import { belongsTo, algorithmFocus } from "../lib/catalog";
import Sheet from './Sheet';
import './AlgorithmPage.css';
const Cube = lazy(() => import("./Cube"));

export default function AlgorithmPage({ algorithms, sets, puzzleSize: selectedPuzzle }: AlgorithmCatalog & { puzzleSize: CubeSize }) {
  const [query, setQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [speedOpen, setSpeedOpen] = useState(false);
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
  const moves = useMemo(() => variation?.moves.trim().split(/\s+/).filter(Boolean) || [], [variation]);
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
    setSelectedSet("all");
    setSelectedSection("all");
    setStep(0);
    setPlaying(false);
    const next = algorithms.find(item => (item.puzzle_size ?? 3) === selectedPuzzle);
    if (next) {
      setSelected(next.id);
      setSelectedVariation(next.variations[0].id);
    }
  }, [selectedPuzzle]);
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
  const library = <>      <aside className="card algorithm-library">
        <label className="library-set">
          <span>Set</span>
          <select
            aria-label="Algorithm set"
            value={selectedSet}
            onChange={(event) => { setQuery(''); changeFilter(event.target.value); }}
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
        <label className="library-set"><span>Find a case</span><input type="search" aria-label="Find algorithm" placeholder="Name or pattern" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        {activeSet && <p className="algorithm-set-description">{activeSet.description}</p>}
        <div className="algorithm-list">
          {visibleAlgorithms.filter(item=>`${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())).map((item, index) => (
            <div className="algorithm-entry" key={item.id}><button
              className={`algorithm-option ${item.id === algorithm?.id ? "selected" : ""}`}
              aria-pressed={item.id === algorithm?.id}
              onClick={() => { selectAlgorithm(item); setLibraryOpen(isOpen => isOpen && item.variations.length > 1); }}
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
              {item.id === algorithm?.id && <Check size={18} aria-hidden="true"/>}
            </button>
            {item.id === algorithm?.id && item.variations.length > 1 && <div className="algorithm-variant-choices" role="group" aria-label="Algorithm variation">{item.variations.map(choice => <button key={choice.id} aria-pressed={variation?.id === choice.id} onClick={() => { setSelectedVariation(choice.id); jump(0); setLibraryOpen(false); }}>{choice.name}{choice.case && <small>{choice.case}</small>}</button>)}</div>}
            </div>
          ))}
        </div>
        {sets.length > 0 && !visibleAlgorithms.some(item=>`${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())) && (
          <p className="empty-state">No matching algorithms. Try another name or set.</p>
        )}
      </aside>
</>;
  const currentMove = moves[Math.min(step, Math.max(0, moves.length-1))];
  return (
    <div className="algorithm-layout algorithm-page">
      <div className="algorithm-desktop-library">{library}</div>
      {libraryOpen && <Sheet title="Algorithms" onClose={() => setLibraryOpen(false)}>{library}</Sheet>}
      <section className="trainer-card">
        <div className="trainer-heading">
          <div className="algorithm-title">
            {memberships.length > 0 && <div className="eyebrow">{activeSet?.name ?? memberships[0]?.name}</div>}
            <div className="algorithm-title-row"><h2>{algorithm?.name || (sets.length ? 'Choose an algorithm' : 'Loading algorithms…')}</h2><span className="algorithm-turn-count" aria-label={`${moves.length} moves`}><RotateCw size={17} aria-hidden="true"/>{moves.length}</span></div>
            {algorithm && algorithm.variations.length > 1 && <small className="algorithm-selected-variation">{variation?.name}</small>}
          </div>
          <div className="algorithm-header-actions">
            <button className="icon-button" aria-label="Choose algorithm" title="Choose algorithm" onClick={() => { setPlaying(false); setLibraryOpen(true); }}><ListFilter size={22}/></button>
            <button className="icon-button" aria-label="Algorithm guide" title="Algorithm guide" disabled={!algorithm} onClick={() => { setPlaying(false); setGuideStep(0); setGuideOpen(true); }}><Info size={22}/></button>
          </div>
        </div>
        <div className={`cube-stage ${transparent ? 'is-see-through' : ''}`}>
          {moves.length > 0 && <Suspense fallback={<div className="empty-state">Loading the 3D viewer…</div>}><Cube key={`${algorithm?.id}:${variation?.id}`} size={selectedPuzzle} {...{ moves, step, transparent, resetView, maskIrrelevant, focus }}/></Suspense>}
          <div className="cube-tools">
            <button className="tool-button" aria-label="Reset view" title="Reset view" onClick={() => setResetView(value => value+1)}><RotateCcw size={20}/></button>
            <button className={`tool-button ${transparent ? 'selected' : ''}`} aria-label="See-through" aria-pressed={transparent} title="See-through" onClick={() => setTransparent(value => !value)}>{transparent ? <EyeOff size={20}/> : <Eye size={20}/>}</button>
            <button className={`tool-button ${maskIrrelevant ? 'selected' : ''}`} aria-label="Black out irrelevant stickers" aria-pressed={maskIrrelevant} title="Focus stickers" onClick={() => setMaskIrrelevant(value => !value)}><Contrast size={20}/></button>
          </div>
        </div>
        <div className="notation" aria-label="Algorithm moves">{moves.map((move,i) => <button key={i} className={i < step ? 'completed' : i === step ? 'next' : ''} onClick={() => jump(i+1)} aria-label={`Go to move ${i+1}: ${move}`} aria-current={i === step ? 'step' : undefined}>{move}</button>)}</div>
        <div className="playback algorithm-playback">
          <button className="icon-button" aria-label="Reset algorithm" disabled={!moves.length} onClick={() => jump(0)}><RotateCcw size={21}/></button>
          <button className="icon-button" aria-label="Previous move" disabled={step === 0} onClick={() => jump(step-1)}><ArrowLeft size={21}/></button>
          <button className="play-button" disabled={!moves.length} aria-label={playing ? 'Pause animation' : 'Play animation'} aria-pressed={playing} onClick={() => { if (step === moves.length) setStep(0); setPlaying(value => !value); }}>{playing ? <Pause size={22}/> : <Play size={22}/>}</button>
          <button className="icon-button" aria-label="Next move" disabled={step === moves.length} onClick={() => jump(step+1)}><ArrowRight size={21}/></button>
          <button className="icon-button algorithm-speed-trigger" aria-label="Playback speed" title={`Playback speed · ${1000/speed}×`} onClick={() => { setPlaying(false); setSpeedOpen(true); }}><Gauge size={22}/></button>
        </div>
      </section>
      {speedOpen && <Sheet title="Playback speed" onClose={() => setSpeedOpen(false)}><div className="algorithm-speed-choices" role="group" aria-label="Playback speed">{[{value:2000,label:'0.5×',name:'Slow'},{value:1000,label:'1×',name:'Normal'},{value:500,label:'2×',name:'Fast'}].map(choice => <button key={choice.value} aria-pressed={speed === choice.value} onClick={() => { setSpeed(choice.value); setSpeedOpen(false); }}><strong>{choice.label}</strong><span>{choice.name}</span>{speed === choice.value && <Check size={20}/>}</button>)}</div></Sheet>}
      {guideOpen && algorithm && <Sheet title="Algorithm guide" onClose={() => setGuideOpen(false)}>
        <div className="algorithm-guide">
          <div className="algorithm-guide-progress" role="progressbar" aria-label="Guide progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={guideStep+1}>{[0,1,2].map(index => <i key={index} className={index <= guideStep ? 'is-done' : ''}/>)}</div>
          {guideStep === 0 ? <><h3>{algorithm.name}</h3><div className="algorithm-guide-tokens" aria-hidden="true">{moves.slice(0,4).map((move,index) => <span key={index}>{move}</span>)}</div><p>{algorithm.description}</p>{algorithm.source && <a className="text-button" href={algorithm.source} target="_blank" rel="noreferrer">Case reference</a>}</> : guideStep === 1 ? <><h3>Read a turn</h3><div className="algorithm-guide-move">{currentMove || 'R'}</div><p>{describeMove(currentMove || 'R')}</p><div className="algorithm-guide-symbols"><span><strong>′</strong><small>Reverse</small></span><span><strong>2</strong><small>Half turn</small></span></div></> : <><h3>Explore the cube</h3><div className="algorithm-guide-gestures"><span><Hand size={35}/><small>Drag to orbit</small></span><span><ZoomIn size={35}/><small>Pinch to zoom</small></span></div><div className="algorithm-guide-gestures"><span><RotateCcw size={26}/><small>Reset view</small></span><span><Eye size={26}/><small>See-through</small></span><span><Contrast size={26}/><small>Focus stickers</small></span></div><p>Yellow on top. Red facing you.</p></>}
          <div className="algorithm-guide-navigation"><button className="text-button" disabled={guideStep === 0} onClick={() => setGuideStep(value => value-1)}>Back</button><span>{guideStep+1}/3</span><button className="button" onClick={() => guideStep === 2 ? setGuideOpen(false) : setGuideStep(value => value+1)}>{guideStep === 2 ? 'Done' : 'Next'}</button></div>
        </div>
      </Sheet>}
    </div>
  );
}
