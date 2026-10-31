import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { algorithmStates, solved, type Cubie } from '../lib/cube';
import { FACE_COLORS, FACE_ORDER, cubiesToFacelets } from '../lib/facelets';
import type { Home } from '../lib/learningGoals';
import { moveDescription } from '../lib/teaching';
const Cube = lazy(() => import('./Cube'));
export default function LearningCube({ moves, initialState, startSolved, target, autoPlay = false, label = 'Interactive cube demonstration' }: {
  moves: string[]; initialState?: Cubie[]; startSolved?: boolean; target?: Home[]; autoPlay?: boolean; label?: string;
}) {
  const [step, setStep] = useState(0), [playing, setPlaying] = useState(autoPlay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [view, setView] = useState<'front' | 'under' | 'back' | 'net'>(target?.some(h => h[1] === -1) ? 'under' : 'front');
  const initial = useMemo(() => initialState ?? (startSolved ? solved() : undefined), [initialState, startSolved]);
  const states = useMemo(() => algorithmStates(moves, initial), [moves, initial]);
  const facelets = useMemo(() => cubiesToFacelets(states[Math.min(step, moves.length)]), [states, step, moves.length]);
  useEffect(() => {
    if (!playing || step >= moves.length) { if (playing) setPlaying(false); return; }
    const timer = setTimeout(() => setStep(s => s + 1), 850);
    return () => clearTimeout(timer);
  }, [playing, step, moves.length]);
  return <div className="learning-visual" aria-label={label}>
    <div className="learning-view-switch" aria-label="Cube view">{(['front','under','back','net'] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'net' ? 'All faces' : v === 'under' ? 'Underneath' : v === 'back' ? 'Back' : 'Front'}</button>)}</div>
    {view === 'net' ? <div className="learning-net" aria-label="All six cube faces">{[...'ULFRBD'].map(face => <div className={`learning-net-face face-${face}`} key={face}><span>{face}</span>{Array.from({length:9},(_,i) => <i key={i} aria-label={`${face}${i + 1}: ${facelets[FACE_ORDER.indexOf(face)*9+i]}`} style={{background:FACE_COLORS[facelets[FACE_ORDER.indexOf(face)*9+i]]}} />)}</div>)}</div> : <div className="learning-cube-stage"><Suspense fallback={<p>Loading cube…</p>}><Cube key={view} moves={moves} step={step} initialState={initial} transparent={false} resetView={0} maskIrrelevant={false} focus="all" highlightHomes={target} viewPosition={view === 'under' ? [5,-4.3,5] : view === 'back' ? [-5,4.3,-5] : undefined} /></Suspense></div>}
    {!!moves.length && <><div className="learning-playback"><button className="icon-button" aria-label="Restart demonstration" onClick={() => {setStep(0);setPlaying(false);}}><RotateCcw size={17}/></button><button className="button" onClick={() => {if(step === moves.length)setStep(0);setPlaying(p => !p);}}>{playing ? <Pause size={16}/> : <Play size={16}/>} {playing ? 'Pause' : step === moves.length ? 'Replay' : 'Watch'}</button><button className="icon-button" aria-label="Next demonstration move" disabled={step === moves.length} onClick={() => {setPlaying(false);setStep(s => Math.min(moves.length,s+1));}}><SkipForward size={18}/></button><span>{step}/{moves.length}</span></div><div className="learning-moves" aria-label="Demonstration moves">{moves.map((move,i) => <button key={i} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : i === step ? 'next' : ''} title={moveDescription(move)} onClick={() => {setPlaying(false);setStep(i+1);}}>{move}</button>)}</div></>}
    <p className="visual-caption">{view === 'net' ? 'U up · R right · F front · D down · L left · B back' : 'Drag to orbit · Pinch to zoom · Yellow up, red front'}</p>
  </div>;
}
