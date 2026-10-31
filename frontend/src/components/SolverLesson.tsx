import { ArrowLeft, ArrowRight, Check, Target } from 'lucide-react';
import { moveDescription } from '../lib/teaching';
import type { Solution } from '../lib/solver';
function turnLabel(move: string) {
  const face = {U:'Top',D:'Bottom',R:'Right',L:'Left',F:'Front',B:'Back',x:'Whole cube · right axis',y:'Whole cube · up axis',z:'Whole cube · front axis'}[move.replace(/^[2-5]/,'')[0] as 'R'];
  const layers = /^[2-5]/.test(move) ? move.includes('w') ? ` · outer ${move[0]} layers` : ` · inner layer ${move[0]}` : move.includes('w') ? ' · outer two layers' : '';
  return `${face ?? move}${layers} · ${move.endsWith('2') ? 'half turn' : move.endsWith("'") ? 'counterclockwise' : 'clockwise'}`;
}
const goals: Record<string,string> = {
  'white-cross':'Four white edges below. Each side color matches its center.',
  'white-corners':'One white face, with matching side colors all the way around.',
  'middle-edges':'The bottom two layers are solved.',
  'yellow-cross':'Four yellow edge stickers form a cross on top.',
  'yellow-edge-positions':'The yellow cross edges match their side centers.',
  'yellow-corner-positions':'Every corner sits between its three matching centers.',
  'yellow-corner-twists':'Yellow on top. All six faces solved.',
  'meyer-opposite-centers':'Two opposite centers complete.',
  'meyer-left-block':'A complete block on the lower left.',
  'meyer-remaining-centers':'All six center colors are grouped.',
  'meyer-remaining-wings':'Every edge group matches. Keep the left block intact.',
  'reduction-white-center':'The white center is a solid square.',
  'reduction-opposite-center':'The yellow center is opposite white.',
  'reduction-remaining-centers':'All six centers match the displayed color scheme.',
  'reduction-edge-pairing':'Each edge is a matching color group.',
};
export default function SolverLesson({ solution, step, viewedStage, onStage, onJump }: {
  solution: Solution; step: number; viewedStage: number | null;
  onStage: (index: number) => void; onJump: (step: number) => void;
}) {
  const stages = solution.stages!;
  const found = stages.findIndex(stage => step <= stage.end);
  const index = viewedStage ?? (found === -1 ? stages.length-1 : found);
  const stage = stages[index], complete = step >= stage.end;
  const chunk = solution.chunks?.find(c => c.start >= stage.start && c.start < stage.end && step < c.end);
  const next = step < stage.end ? solution.notation[step] : undefined;
  return <section className="solver-lesson compact-lesson" aria-label="Guided solve">
    <span className="learning-eyebrow">STAGE {index+1} / {stages.length}</span>
    <label className="guided-stage-select">Choose stage<select aria-label="Guided solve stage" value={index} onChange={e => onStage(Number(e.target.value))}>{stages.map((s,i) => <option key={s.id} value={i}>{i+1}. {s.title}{s.skipped ? ' · already solved' : ''}</option>)}</select></label>
    <h3>{stage.title}</h3>
    <div className={`guided-goal ${complete ? 'complete' : ''}`}><span>{complete ? <Check size={17}/> : <Target size={17}/>} {complete ? stage.skipped ? 'Already in place' : 'Checkpoint reached' : 'Your goal'}</span><p>{goals[stage.id] ?? 'Match the highlighted pieces and preserve the completed parts.'}</p></div>
    {next && !complete ? <><div className="guided-next"><span>NEXT TURN</span><strong title={moveDescription(next)}>{next}</strong><p>{turnLabel(next)}</p></div>{chunk && <div className="guided-action"><span>{chunk.name}</span><div className="learning-moves" aria-label="Current action moves">{solution.notation.slice(Math.max(chunk.start,step-2),Math.min(chunk.end,step+5)).map((move,i) => {const offset=Math.max(chunk.start,step-2)+i;return <button key={offset} title={moveDescription(move)} className={offset<step?'done':offset===step?'next':''} onClick={() => onJump(offset+1)}>{move}</button>;})}</div><small>{chunk.end-Math.max(step,chunk.start)} turns left in this action</small></div>}</> : <p className="guided-done">Check your physical cube against the goal, then continue.</p>}
    <div className="guided-stage-actions"><button className="icon-button" aria-label="Previous stage" disabled={!index} onClick={() => onStage(index-1)}><ArrowLeft size={17}/></button><button className="text-button" onClick={() => onJump(stage.start)}>Replay stage</button>{index<stages.length-1 && <button className="button" onClick={() => onStage(index+1)}>Next stage <ArrowRight size={15}/></button>}</div>
    <details className="guided-details"><summary>Why this works</summary><p>{stage.explanation}</p>{chunk && <p>{chunk.explanation}</p>}<p>{stage.checkpoint}</p></details>
  </section>;
}
