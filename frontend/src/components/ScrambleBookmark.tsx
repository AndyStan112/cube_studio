import { Bookmark } from 'lucide-react';
import type { CubeEvent } from '../lib/puzzles';
import type { TrainingProps } from './ScrambleLibrary';

export default function ScrambleBookmark({ training, updateTraining, event, moves, name, disabled = false }: TrainingProps & {
  event: CubeEvent; moves: string; name?: string; disabled?: boolean;
}) {
  const saved = training.scrambles.some(item => item.event === event && item.moves === moves);
  return <button className="icon-button scramble-bookmark" aria-label={saved ? 'Remove saved scramble' : 'Save scramble'} aria-pressed={saved}
    title={saved ? 'Remove saved scramble' : 'Save scramble'} disabled={disabled || !moves.trim()}
    onClick={() => updateTraining({ ...training, scrambles: saved
      ? training.scrambles.filter(item => item.event !== event || item.moves !== moves)
      : [{ id: `saved:${crypto.randomUUID()}`, event, moves, name: name || `Scramble ${training.scrambles.length + 1}`, created_at: new Date().toISOString() }, ...training.scrambles] })}>
    <Bookmark size={21} fill={saved ? 'currentColor' : 'none'} aria-hidden="true"/>
  </button>;
}
