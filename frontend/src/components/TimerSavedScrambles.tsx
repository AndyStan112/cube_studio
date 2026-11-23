import { Bookmark, Play, Trash2 } from 'lucide-react';
import type { Scramble } from '../lib/api';
import type { CubeEvent } from '../lib/puzzles';
import type { TrainingProps } from './ScrambleLibrary';

export default function TimerSavedScrambles({ training, updateTraining, event, onSelect }: TrainingProps & {
  event: CubeEvent; onSelect: (scramble: Scramble) => void;
}) {
  const saved = training.scrambles.filter(item => item.event === event);
  if (!saved.length) return <div className="timer-library-empty"><Bookmark size={32} aria-hidden="true"/><p>No saved scrambles</p></div>;
  return <ul className="timer-saved-list">{saved.map(item => <li key={item.id}>
    <div className="timer-saved-heading"><strong>{item.name}</strong><div>
      <button className="icon-button" aria-label={`Use ${item.name}`} title="Use scramble" onClick={() => onSelect({ ...item, id: `local:${crypto.randomUUID()}` })}><Play size={21}/></button>
      <button className="icon-button delete" aria-label={`Remove ${item.name}`} title="Remove bookmark" onClick={() => updateTraining({ ...training, scrambles: training.scrambles.filter(other => other.id !== item.id) })}><Trash2 size={19}/></button>
    </div></div><p className="scramble-text">{item.moves}</p>
  </li>)}</ul>;
}
