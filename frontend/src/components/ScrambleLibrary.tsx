import { useState } from 'react';
import type { Scramble } from '../lib/api';
import type { CubeEvent } from '../lib/puzzles';
import type { TrainingData } from '../lib/training';
export type TrainingProps = { training: TrainingData; updateTraining: (data: TrainingData) => void };
export default function ScrambleLibrary({ training, updateTraining, event, current, onSelect, disabled = false }: TrainingProps & {
  event: CubeEvent; current?: Scramble | null; onSelect: (scramble: Scramble) => void; disabled?: boolean;
}) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  return <details className="scramble-library"><summary>Saved scrambles · {training.scrambles.filter(s => s.event === event).length}</summary>
    <fieldset disabled={disabled}>
      <div className="settings-row"><input aria-label="Scramble name" placeholder="Scramble name (optional)" maxLength={80} value={name} onChange={e => { setName(e.target.value); setMessage(''); }} />
        <button className="button" disabled={!current?.moves} onClick={() => {
          if (!current) return;
          updateTraining({ ...training, scrambles: [{ ...current, id: `saved:${crypto.randomUUID()}`, name: name.trim() || `Scramble ${training.scrambles.length + 1}`, created_at: new Date().toISOString() }, ...training.scrambles] });
          setName(''); setMessage('Scramble saved.');
        }}>Save current scramble</button></div>
      {message && <p role="status">{message}</p>}
      {training.scrambles.filter(s => s.event === event).map(s => <div className="saved-scramble" key={s.id}>
        <strong>{s.name}</strong><p className="scramble-text">{s.moves}</p><div className="settings-row">
          <button className="button small" onClick={() => onSelect({ ...s, id: `local:${crypto.randomUUID()}` })}>Use scramble</button>
          <button className="text-button delete" onClick={() => updateTraining({ ...training, scrambles: training.scrambles.filter(item => item.id !== s.id) })}>Remove</button>
        </div></div>)}
      {!training.scrambles.some(s => s.event === event) && <p className="small-muted">Save a scramble to practice it again on the timer or solver.</p>}
    </fieldset>
  </details>;
}
