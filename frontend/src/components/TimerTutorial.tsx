import { lazy, Suspense, useEffect, useState } from 'react';
import { Bookmark, Box, Check, Hand, Hourglass, Library, PanelsTopLeft, RotateCw, Shuffle } from 'lucide-react';
import type { CubeSize } from '../lib/cube';
import Sheet from './Sheet';

const Cube = lazy(() => import('./Cube'));
const noMoves: string[] = [];
export const timerTutorialKey = 'cube-studio-timer-tutorial-v1';

export default function TimerTutorial({ size, inspection, onClose }: { size: CubeSize; inspection: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [trying, setTrying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const steps = inspection ? 5 : 4;
  useEffect(() => {
    if (!trying) return;
    const start = performance.now() - elapsed;
    const interval = setInterval(() => setElapsed(performance.now() - start), 50);
    return () => clearInterval(interval);
  }, [trying]);
  useEffect(() => { setTrying(false); }, [step]);
  const titles = ['Orient your cube', 'Read the scramble', 'Try the timer', 'Keep a scramble', 'Inspect, then solve'];
  return <Sheet title="Timer quick start" onClose={onClose}>
    <div className="timer-tour">
      <div className="timer-tour-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin={0} aria-valuemax={steps} aria-valuenow={step+1}>{Array.from({ length: steps }, (_,i) => <i key={i} className={i <= step ? 'is-done' : ''}/>)}</div>
      <h3>{titles[step]}</h3>
      {step === 0 ? <>
        <div className="timer-tour-cube"><Suspense fallback={<Box size={48}/>}><Cube size={size} moves={noMoves} step={0} transparent={false} resetView={0} maskIrrelevant={false} focus="all"/></Suspense></div>
        <div className="timer-orientation"><span><i className="orientation-yellow"/>Top</span><span><i className="orientation-red"/>Front</span></div>
        <p>Yellow on top. Red facing you.</p>
      </> : step === 1 ? <>
        <div className="timer-tour-notation" aria-label="Example scramble: R, U, R prime"><strong>R</strong><span>U</span><span>R′</span></div>
        <p>Read left to right. Each token is a turn.</p>
        <div className="timer-tour-icons"><span><RotateCw size={25}/><small>Turn count</small></span><span><Box size={25}/><small>Preview</small></span><span><Shuffle size={25}/><small>New scramble</small></span></div>
      </> : step === 2 ? <>
        <div className="timer-tour-tryout"><button aria-label={trying ? 'Stop practice timer' : 'Start practice timer'} onClick={() => setTrying(value => !value)}>{(elapsed/1000).toFixed(2)}</button><Hand size={27} aria-hidden="true"/></div>
        <p>Tap to start. Tap again to stop.</p><small>This tryout isn’t saved.</small>
        <div className="timer-tour-icons"><span><Check size={25}/><small>Save your time</small></span><span><PanelsTopLeft size={25}/><small>Sessions</small></span></div>
      </> : step === 3 ? <>
        <div className="timer-tour-icons timer-tour-icons-large"><span><Bookmark size={38}/><small>Save</small></span><span><Library size={38}/><small>Saved list</small></span><span><Box size={38}/><small>Solve preview</small></span></div>
        <p>Bookmark a scramble to repeat it later.</p><p className="timer-tour-secondary">The cube icon beside a solve opens its scramble.</p>
      </> : <>
        <div className="timer-tour-inspection"><Hourglass size={42}/><div><strong>15s</strong><span>+2</span></div><div><strong>17s</strong><span>DNF</span></div></div>
        <p>First tap starts inspection. Next tap starts the solve.</p>
      </>}
      <div className="timer-tour-navigation"><button className="text-button" disabled={step === 0} onClick={() => setStep(value => value-1)}>Back</button><span aria-hidden="true">{step+1}/{steps}</span><button className="button" onClick={() => step === steps-1 ? onClose() : setStep(value => value+1)}>{step === steps-1 ? 'Done' : 'Next'}</button></div>
    </div>
  </Sheet>;
}
