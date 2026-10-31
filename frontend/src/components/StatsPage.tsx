import { useMemo, useState } from 'react';
import { averageOf, effective, formatTime, type Solve } from '../lib/api';
import { cubeEvents, puzzles, solveEvent, type CubeEvent } from '../lib/puzzles';
import { summarize } from '../lib/training';
import type { TrainingProps } from './ScrambleLibrary';
const time = (n: number | null) => n === null ? '—' : Number.isFinite(n) ? formatTime(n) : 'DNF';
export default function StatsPage({ solves, training }: TrainingProps & { solves: Solve[] }) {
  const [event, setEvent] = useState<CubeEvent>('333');
  const [session, setSession] = useState('all');
  const [cube, setCube] = useState('all');
  const [method, setMethod] = useState('all');
  const category = solves.filter(s => solveEvent(s) === event);
  const filtered = category.filter(s => (session === 'all' || (s.session_id ?? `legacy:${event}`) === session) && (cube === 'all' || (s.cube || 'unknown') === cube) && (method === 'all' || (s.method || 'Unspecified') === method)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const summary = summarize(filtered);
  const chronological = [...filtered].reverse();
  const bestAverage = (n: number) => { const values = filtered.slice(0, Math.max(0, filtered.length - n + 1)).map((_, i) => averageOf(filtered.slice(i), n)!); return values.length ? Math.min(...values) : null; };
  const cubeName = (id: string) => training.cubes.find(c => c.id === id)?.name ?? category.find(s => s.cube === id)?.cube_name ?? 'Unspecified';
  const points = useMemo(() => {
    const values = chronological.map((s, index) => ({ s, index, ms: effective(s) })).filter(p => Number.isFinite(p.ms));
    const max = Math.max(1, ...values.map(p => p.ms));
    return values.map(p => ({ ...p, x: 65 + p.index / Math.max(1, chronological.length - 1) * 805, y: 180 - p.ms / max * 155 }));
  }, [solves, event, session, cube, method]);
  function comparison(kind: 'cube' | 'method') {
    const groups = new Map<string, Solve[]>();
    for (const s of filtered) { const key = kind === 'cube' ? s.cube || 'unknown' : s.method || 'Unspecified'; groups.set(key, [...(groups.get(key) ?? []), s]); }
    const rows = [...groups].map(([key, items]) => ({ key, ...summarize(items) })).sort((a, b) => (a.mean ?? Infinity) - (b.mean ?? Infinity));
    return <section className="card settings-card"><h2>Compare {kind === 'cube' ? 'cubes' : 'methods'}</h2><p className="small-muted">Ordered by mean of completed solves, including +2 penalties. DNF attempts are counted separately.</p><div className="table-scroll"><table><thead><tr><th>{kind === 'cube' ? 'Cube' : 'Method'}</th><th>Solves</th><th>Best</th><th>Mean</th><th>DNF</th></tr></thead><tbody>{rows.map(r => <tr key={r.key}><td>{kind === 'cube' ? cubeName(r.key) : r.key}</td><td>{r.count}</td><td>{time(r.best)}</td><td>{time(r.mean)}</td><td>{r.dnf}</td></tr>)}</tbody></table></div>{!rows.length && <p>No solves match these filters.</p>}</section>;
  }
  return <div className="stats-page"><section className="card settings-card"><h2>Your progress</h2><div className="stats-filters">
    <label>Category<select value={event} onChange={e => { setEvent(e.target.value as CubeEvent); setSession('all'); setCube('all'); setMethod('all'); }}>{cubeEvents.map(v => <option key={v} value={v}>{puzzles[v].label}</option>)}</select></label>
    <label>Session<select value={session} onChange={e => setSession(e.target.value)}><option value="all">All sessions</option><option value={`legacy:${event}`}>Previous solves</option>{training.sessions.filter(s => s.event === event).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{[...new Set(category.map(s => s.session_id).filter((id): id is string => !!id && !training.sessions.some(s => s.id === id)))].map(id => <option key={id} value={id}>Session {id.slice(0, 8)}</option>)}</select></label>
    <label>Cube<select value={cube} onChange={e => setCube(e.target.value)}><option value="all">All cubes</option>{[...new Set(category.map(s => s.cube || 'unknown'))].map(id => <option key={id} value={id}>{cubeName(id)}</option>)}</select></label>
    <label>Method<select value={method} onChange={e => setMethod(e.target.value)}><option value="all">All methods</option>{[...new Set(category.map(s => s.method || 'Unspecified'))].map(m => <option key={m}>{m}</option>)}</select></label>
  </div></section>
  <section className="session-stats"><div><span>Solves</span><strong>{summary.count}</strong></div><div><span>Best</span><strong>{time(summary.best)}</strong></div><div><span>Mean (completed)</span><strong>{time(summary.mean)}</strong></div><div><span>Best Ao5</span><strong>{time(bestAverage(5))}</strong></div><div><span>Best Ao12</span><strong>{time(bestAverage(12))}</strong></div><div><span>DNF</span><strong>{summary.dnf}</strong></div></section>
  <section className="card settings-card"><h2>Solve times over time</h2><p className="small-muted">Oldest → newest · Seconds · Hover or focus a point for its time and date. Gaps represent DNF attempts.</p>{points.length ? <svg className="progress-chart" viewBox="0 0 900 220" role="img" aria-label="Solve time progress"><text x="4" y="30" fontSize="11" fill="currentColor">{time(Math.max(...points.map(p => p.ms)))}s</text><text x="35" y="185" fontSize="11" fill="currentColor">0</text><line x1="65" y1="185" x2="875" y2="185" stroke="currentColor" opacity=".2" />{points.map((p, i) => <g key={p.s.id}>{i > 0 && p.index === points[i - 1].index + 1 && <line x1={points[i - 1].x} y1={points[i - 1].y} x2={p.x} y2={p.y} stroke="var(--green)" strokeWidth="2" />}<circle cx={p.x} cy={p.y} r="4" fill="var(--green)" tabIndex={0}><title>{formatTime(p.ms)}s · {new Date(p.s.created_at).toLocaleString()}</title></circle></g>)}<text x="30" y="210" fontSize="12" fill="currentColor">{chronological[0] && new Date(chronological[0].created_at).toLocaleDateString()}</text><text x="870" y="210" textAnchor="end" fontSize="12" fill="currentColor">{chronological.at(-1) && new Date(chronological.at(-1)!.created_at).toLocaleDateString()}</text></svg> : <p>Save some solves to see your progress.</p>}</section>
  <div className="comparison-grid">{comparison('cube')}{comparison('method')}</div>
  </div>;
}
