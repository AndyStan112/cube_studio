import { useState } from 'react';
import { api, type User } from '../lib/api';
import { calibrationKey, isCalibration, suggestedCalibration, type Calibration } from '../lib/cameraInput';
import { readStored, writeStored } from '../lib/offline';
import { cubeEvents, puzzles, type CubeEvent } from '../lib/puzzles';
import { clearLocalData } from '../lib/training';
import type { Representation } from '../lib/solverInput';
import type { TrainingProps } from './ScrambleLibrary';
export default function SettingsPage({ training, updateTraining, user, notify }: TrainingProps & { user: User | null; notify: (e: unknown) => void }) {
  const [profiles, setProfiles] = useState<Calibration[]>(() => readStored<unknown[]>(calibrationKey, []).filter(isCalibration));
  const [cubeName, setCubeName] = useState('');
  const [event, setEvent] = useState<CubeEvent>('333');
  const [method, setMethod] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = training.settings;
  function saveProfiles(next: Calibration[]) { setProfiles(next); writeStored(calibrationKey, next); }
  async function reset() {
    if (confirmation !== 'DELETE ALL DATA') return;
    setBusy(true);
    try {
      if (user) await api('/data/reset', { method: 'POST', body: JSON.stringify({ confirmation }), signal: AbortSignal.timeout(10000) });
      clearLocalData(); window.location.reload();
    } catch (e) { notify(e); setBusy(false); }
  }
  return <div className="settings-layout">
    <section className="card settings-card"><h2>Preferences</h2><p className="small-muted">Settings, sessions, saved scrambles and calibrations are saved on this device. Signed-in solve history also saves online.</p>
      <label className="check-setting"><input type="checkbox" checked={settings.inspection} onChange={e => updateTraining({ ...training, settings: { ...settings, inspection: e.target.checked } })} />Use WCA-style inspection by default</label>
      <label>Default cube<select value={settings.defaultCube} onChange={e => updateTraining({ ...training, settings: { ...settings, defaultCube: e.target.value } })}><option value="">Unspecified</option>{training.cubes.map(c => <option key={c.id} value={c.id}>{c.name} · {puzzles[c.event].label}</option>)}</select></label>
      <label>Default method<select value={settings.defaultMethod} onChange={e => updateTraining({ ...training, settings: { ...settings, defaultMethod: e.target.value } })}>{training.methods.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>Solver input view<select value={settings.representation} onChange={e => updateTraining({ ...training, settings: { ...settings, representation: e.target.value as Representation } })}>{['camera', '2d', '3d', 'text'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className="check-setting"><input type="checkbox" checked={settings.transparent} onChange={e => updateTraining({ ...training, settings: { ...settings, transparent: e.target.checked } })} />See-through cube by default</label>
      <label>Solution playback speed<select value={settings.playbackMs} onChange={e => updateTraining({ ...training, settings: { ...settings, playbackMs: Number(e.target.value) } })}><option value={400}>Fast · 0.4s per move</option><option value={800}>Normal · 0.8s per move</option><option value={1400}>Slow · 1.4s per move</option><option value={2000}>Very slow · 2s per move</option></select></label>
    </section>
    <section className="card settings-card"><h2>My cubes</h2><p className="small-muted">Link each cube to its camera calibration. Create calibrations in Solver → Camera.</p>
      <form className="settings-row" onSubmit={e => { e.preventDefault(); if (!cubeName.trim()) return; updateTraining({ ...training, cubes: [...training.cubes, { id: crypto.randomUUID(), name: cubeName.trim(), event, calibrationId: '' }] }); setCubeName(''); }}>
        <input aria-label="New cube name" placeholder="e.g. GAN 12" value={cubeName} maxLength={100} onChange={e => setCubeName(e.target.value)} required />
        <select aria-label="Cube category" value={event} onChange={e => setEvent(e.target.value as CubeEvent)}>{cubeEvents.map(v => <option key={v} value={v}>{puzzles[v].label}</option>)}</select><button className="button">Add cube</button>
      </form>
      {training.cubes.map(c => <div className="settings-item" key={c.id}><label>Cube name · {puzzles[c.event].label}<input value={c.name} aria-label={`Name for ${c.name}`} maxLength={100} onChange={e => updateTraining({ ...training, cubes: training.cubes.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) })} /></label>
        <label>Calibration<select value={c.calibrationId} onChange={e => updateTraining({ ...training, cubes: training.cubes.map(x => x.id === c.id ? { ...x, calibrationId: e.target.value } : x) })}><option value="">Automatic</option>{[suggestedCalibration, ...profiles].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div>)}
      <h3>Methods</h3><form className="settings-row" onSubmit={e => { e.preventDefault(); const name = method.trim(); if (name && !training.methods.includes(name)) updateTraining({ ...training, methods: [...training.methods, name] }); setMethod(''); }}><input aria-label="New method" placeholder="Add a method" value={method} maxLength={100} onChange={e => setMethod(e.target.value)} required /><button className="button">Add method</button></form>
      <p className="small-muted">{training.methods.join(' · ')}</p>
    </section>
    <section className="card settings-card"><h2>Camera calibrations</h2>{!profiles.length && <p className="small-muted">No custom calibrations yet. Capture one in the solver’s Camera view.</p>}
      {profiles.map(p => <div className="settings-item" key={p.id}><label>Calibration name<input value={p.name} maxLength={60} onChange={e => saveProfiles(profiles.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))} /></label><div className="calibration-swatches">{p.colors.map((rgb, i) => <span key={i} style={{ background: `rgb(${rgb.join(',')})` }} />)}</div><button className="text-button delete" onClick={() => { saveProfiles(profiles.filter(x => x.id !== p.id)); updateTraining({ ...training, cubes: training.cubes.map(c => c.calibrationId === p.id ? { ...c, calibrationId: '' } : c) }); }}>Delete calibration</button></div>)}
    </section>
    <section className="card settings-card danger-zone"><h2>Clear all data</h2><p>Delete all Cube Studio data on this device: times for all local profiles, sessions, saved scrambles, cubes, calibrations and preferences.{user && ' Also permanently delete all online solve history for the signed-in account.'} This cannot be undone.</p>
      {!confirm ? <button className="button danger-button" onClick={() => setConfirm(true)}>Clear all data…</button> : <div role="alertdialog" aria-modal="true" aria-label="Confirm clearing all data"><p className="delete">Type DELETE ALL DATA to confirm permanent deletion.</p><input autoFocus aria-label="Deletion confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} /><div className="settings-row"><button className="button danger-button" disabled={busy || confirmation !== 'DELETE ALL DATA'} onClick={() => void reset()}>{busy ? 'Deleting…' : 'Permanently delete all data'}</button><button className="button" disabled={busy} onClick={() => { setConfirm(false); setConfirmation(''); }}>Cancel</button></div></div>}
    </section>
  </div>;
}
