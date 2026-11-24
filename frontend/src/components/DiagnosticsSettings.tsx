import { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import Sheet from './Sheet';
import { clearDiagnostics, diagnosticStatus, loadDiagnostics, logDiagnostic, prepareDiagnostics, sendDiagnostics, subscribeDiagnostics } from '../lib/diagnostics';
import './DiagnosticsSettings.css';

export default function DiagnosticsSettings() {
  const [open,setOpen] = useState(false), [note,setNote] = useState(''), [includeVideo,setIncludeVideo] = useState(true);
  const [status,setStatus] = useState(diagnosticStatus), [busy,setBusy] = useState(false), [progress,setProgress] = useState<number | null>(null), [error,setError] = useState('');
  const [receipt,setReceipt] = useState(() => {try{return localStorage.getItem('cube-studio-diagnostic-last-sent') ?? '';}catch{return '';}});
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {void loadDiagnostics().then(() => setStatus(diagnosticStatus()));return subscribeDiagnostics(() => setStatus(diagnosticStatus()));},[]);
  useEffect(() => () => controller.current?.abort(),[]);
  async function send() {
    setBusy(true);setError('');setReceipt('');setProgress(null);
    const current = new AbortController();controller.current=current;
    try {
      const archive = await prepareDiagnostics(note,includeVideo);
      if(current.signal.aborted)return;
      setProgress(0);
      const result = await sendDiagnostics(archive,setProgress,current.signal);
      setReceipt(result.id);try{localStorage.setItem('cube-studio-diagnostic-last-sent',result.id);}catch{}
    } catch(reason) {if((reason as Error).name !== 'AbortError'){setError((reason as Error).message);logDiagnostic('diagnostics.upload.error',reason);}}
    finally {setBusy(false);setProgress(null);controller.current=null;}
  }
  return <>
    <section className="card settings-card diagnostics-settings"><h2>Diagnostics</h2>
      <button className="button" onClick={() => {setOpen(true);setError('');}}><Send size={18}/> Send diagnostics</button>
    </section>
    {open && <Sheet title="Send diagnostics" onClose={() => {controller.current?.abort();setOpen(false);}}>
      <div className="diagnostics-form">
        <p>Send client logs, scan images and readings to our server. Reports are kept for 30 days.</p>
        <p className="small-muted">{status.scans ? `${status.scans} recent scan${status.scans === 1 ? '' : 's'} · ${status.media} video${status.media === 1 ? '' : 's'} saved` : 'No recent scans. Client logs will still be included.'}</p>
        <label>What went wrong? <span className="small-muted">(optional)</span><textarea maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} disabled={busy} placeholder="For example: M' U fails after all six faces are scanned"/></label>
        <label className="check-setting"><input type="checkbox" checked={includeVideo} onChange={e=>setIncludeVideo(e.target.checked)} disabled={busy}/> Include scan videos and camera recordings</label>
        <p className="small-muted">Camera scans record up to two minutes without audio. The two latest scans stay on this device until replaced or cleared. Original videos over 32 MB are omitted; analyzed-frame images and readings are kept. Nothing uploads until you send.</p>
        {status.storageError && <p role="status">{status.storageError}</p>}
        {busy && <div role="status" aria-live="polite">{progress === null ? 'Preparing report…' : progress === 100 ? 'Saving report on server…' : `Uploading… ${progress}%`}{progress !== null && <progress max={100} value={progress} aria-label="Diagnostic upload progress"/>}</div>}
        {error && <p className="delete" role="alert">{error}</p>}
        {receipt && <p className="diagnostic-receipt" role="status">Diagnostics sent.<br/>Report ID: <code>{receipt}</code></p>}
        <div className="diagnostics-actions"><button className="button" disabled={busy} onClick={()=>void send()}><Send size={18}/> Send diagnostics</button>{busy && <button className="text-button" onClick={()=>controller.current?.abort()}>Cancel upload</button>}</div>
        <button className="text-button diagnostics-clear" disabled={busy} onClick={()=>void clearDiagnostics().then(()=>{setReceipt('');localStorage.removeItem('cube-studio-diagnostic-last-sent');}).catch(e=>setError(e.message))}><Trash2 size={17}/> Clear saved diagnostics</button>
      </div>
    </Sheet>}
  </>;
}
