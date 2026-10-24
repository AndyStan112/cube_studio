import { moveDescription } from '../lib/teaching';
import type { Solution } from '../lib/solver';

export default function SolverLesson({ solution, step, viewedStage, onStage, onJump }: {
  solution: Solution; step: number; viewedStage: number | null;
  onStage: (index: number) => void; onJump: (step: number) => void;
}) {
  const stages = solution.stages!;
  const index = viewedStage ?? Math.max(0, stages.findIndex(stage => step <= stage.end));
  const stage = stages[index];
  const complete = step >= stage.end;
  const chunk = solution.chunks?.find(c => c.start >= stage.start && c.start < stage.end && step < c.end);
  const next = step < stage.end ? solution.notation[step] : undefined;
  return <section className="solver-lesson" aria-label="Guided solve">
    <p className="solver-hint">Keep yellow up and red front. For inner slices, count layers from the named face. A complete three-piece cycle restores the pieces outside its target locations. Turn directions are viewed from outside the face being turned.</p>
    <details className="lesson-notation-help">
      <summary>How to read these instructions</summary>
      <p><strong>Faces:</strong> U top, R right, F front, D bottom, L left, B back. A plain letter means a clockwise quarter turn; a prime (′) means counterclockwise; 2 after a letter means a half turn. Always judge direction while looking straight at that face.</p>
      {solution.method !== 'beginner' && <>
        <p><strong>Layers:</strong> 2R turns only the second layer from the right; Rw turns the outer two right layers together. On a 5×5, 3R turns only the middle layer.</p>
        <p><strong>Three-piece cycle:</strong> move three chosen pieces around their three locations. A setup puts them within reach of a known sequence, the core performs that cycle, and undoing the setup restores the other pieces. Follow the entire named action before checking your centers or block.</p>
      </>}
    </details>
    <nav className="lesson-stages" aria-label="Solve stages">
      {stages.map((s, i) => <button key={s.id} className={`lesson-stage ${i === index ? 'active' : ''}`}
        aria-current={i === index ? 'step' : undefined} onClick={() => onStage(i)}>
        <span>{i + 1}. {s.title}</span>
        <small>{s.skipped ? 'Already complete at this stage' : step >= s.end ? 'Complete' : `${s.end - s.start} turns`}</small>
      </button>)}
    </nav>
    <div className="lesson-instruction" aria-live="polite">
      <h3>Step {index + 1}: {stage.title}</h3>
      <p>{stage.explanation}</p>
      <p className={complete ? 'lesson-checkpoint complete' : 'lesson-checkpoint'}><strong>{complete ? 'Checkpoint reached: ' : 'Look for: '}</strong>{stage.checkpoint}</p>
      {chunk && !complete && <>
        <h4>{chunk.name}</h4>
        <p>{chunk.explanation}</p>
        <div className="notation lesson-algorithm" aria-label={chunk.name}>
          {solution.notation.slice(chunk.start, chunk.end).map((move, i) => <button key={i}
            className={chunk.start + i < step ? 'completed' : chunk.start + i === step ? 'next' : ''}
            title={moveDescription(move)} aria-label={moveDescription(move)} onClick={() => onJump(chunk.start + i + 1)}>{move}</button>)}
        </div>
      </>}
      {next && !complete && <p className="lesson-next"><strong>Next move: </strong>{moveDescription(next)}</p>}
    </div>
    <div className="solver-actions">
      <button className="button" disabled={index === 0} onClick={() => onStage(index - 1)}>Previous stage</button>
      <button className="button" onClick={() => onJump(stage.start)}>Restart stage</button>
      <button className="button" disabled={index === stages.length - 1} onClick={() => onStage(index + 1)}>Next stage</button>
    </div>
    <p className="solver-hint">Play pauses at each stage boundary. Only mark a physical stage complete after checking your cube against the checkpoint.</p>
  </section>;
}
