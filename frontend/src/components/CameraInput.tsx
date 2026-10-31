import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, RotateCcw, Upload, X } from 'lucide-react';
import type { CubeSize } from '../lib/cube';
import { FACE_ORDER } from '../lib/facelets';
import { readStored, writeStored } from '../lib/offline';
import { calibrationFromFaces, calibrationKey, isCalibration, matchScan, sampleFace, suggestedCalibration, type Calibration, type RGB } from '../lib/cameraInput';
import './CameraInput.css';

const labels = ['Up · yellow', 'Right · green', 'Front · red', 'Down · white', 'Left · blue', 'Back · orange'];
const faceColors = ['#f5d54f', '#65b99a', '#e9574e', '#f5f5eb', '#6297ed', '#ff9c39'];
const topColors = [5, 0, 0, 2, 0, 0];
const guidance = ['Show yellow, with orange along its top edge.', 'Show green, with yellow along its top edge.', 'Show red, with yellow along its top edge.', 'Show white, with red along its top edge.', 'Show blue, with yellow along its top edge.', 'Show orange, with yellow along its top edge.'];
export default function CameraInput({ size, disabled, onChange, onReady, defaultCalibration = 'auto' }: {
  defaultCalibration?: string; size: CubeSize; disabled: boolean; onChange: (value: string) => void; onReady: (ready: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [notice, setNotice] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [source, setSource] = useState('');
  const [live, setLive] = useState(false);
  const [opening, setOpening] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const [faces, setFaces] = useState<(RGB[] | null)[]>(Array(6).fill(null));
  const [active, setActive] = useState(0);
  const [profiles, setProfiles] = useState<Calibration[]>(() => {
    const saved = readStored<unknown>(calibrationKey, []);
    return Array.isArray(saved) ? saved.filter(isCalibration) : [];
  });
  const [selected, setSelected] = useState(defaultCalibration);
  const [calibrating, setCalibrating] = useState(false);
  const [name, setName] = useState('My cube');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(4);
  const [analyzing, setAnalyzing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
  }
  function stopCamera() {
    request.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setLive(false);
    setOpening(false);
    setAnalyzing(false);
    stopRecording();
  }
  useEffect(() => () => {
    request.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    if (timer.current) clearInterval(timer.current);
  }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => { if (disabled) stopCamera(); }, [disabled]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  // Any change to the scan or calibration requires a fresh validated extraction.
  useEffect(() => { onReady(false); setMessage(''); }, [faces, selected, profiles, calibrating, onReady]);

  useEffect(() => {
    if (!fullscreen) return;
    const modal = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (stage.current) observer.observe(stage.current);
    return () => { observer.disconnect(); modal.close(); document.body.style.overflow = previousOverflow; };
  }, [fullscreen]);
  useEffect(() => { if (disabled && fullscreen) closeCapture(); }, [disabled, fullscreen]);
  function closeCapture() { stopCamera(); setSource(''); setFullscreen(false); setReviewing(false); }
  function beginCapture(calibration: boolean) {
    setCalibrating(calibration); setFaces(Array(6).fill(null)); setActive(0);
    setReviewing(false); setError(''); setMessage(''); setNotice(''); setFullscreen(true);
    void openCamera();
  }
  function chooseVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { setError('Choose a video smaller than 200 MB.'); return; }
    stopCamera(); if (video.current) video.current.srcObject = null;
    setFaces(Array(6).fill(null)); setActive(0); setReviewing(false); setError(''); setDuration(0); setPosition(0); setSource(URL.createObjectURL(file));
  }
  function retake(index: number) {
    setActive(index); setReviewing(false); setError('');
    if (source && duration > 0 && video.current) { video.current.pause(); video.current.currentTime = duration * (index + .5) / 6; }
    else if (!source && !live) void openCamera();
  }
  async function openCamera() {
    stopCamera();
    setSource(''); setError(''); setOpening(true);
    const ticket = request.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Camera access requires HTTPS and a supported browser. You can upload a video instead.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (request.current !== ticket) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const player = video.current!;
      player.srcObject = media;
      await player.play();
      if (request.current !== ticket) return;
      setLive(true);
    } catch (e) {
      if (request.current !== ticket) return;
      stopCamera();
      setError(`Could not start the camera. ${(e as Error).message} Upload a video or use manual input.`);
    } finally { if (request.current === ticket) setOpening(false); }
  }
  function readFrame() {
    const player = video.current;
    if (!player || player.readyState < 2 || !player.videoWidth || player.seeking) throw Error('Wait for a clear video frame to load.');
    const canvas = document.createElement('canvas');
    // Bound work on high-resolution phone videos.
    const scale = Math.min(1, 800 / Math.max(player.videoWidth, player.videoHeight));
    canvas.width = Math.round(player.videoWidth * scale); canvas.height = Math.round(player.videoHeight * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw Error('This browser cannot read video frames.');
    context.drawImage(player, 0, 0, canvas.width, canvas.height);
    return sampleFace(context.getImageData(0, 0, canvas.width, canvas.height), size);
  }
  async function sampleUploadedVideo() {
    const player = video.current;
    if (!player || !Number.isFinite(player.duration) || player.duration <= 0) return;
    const ticket = request.current;
    setAnalyzing(true); setError(''); player.pause();
    try {
      const captured: RGB[][] = [];
      for (let i = 0; i < 6; i++) {
        if (request.current !== ticket) return;
        const time = player.duration * (i + .5) / 6;
        if (Math.abs(player.currentTime - time) > .01 || player.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
              clearTimeout(timeout);
              player.removeEventListener('seeked', sought);
              player.removeEventListener('error', failed);
              if (error) reject(error); else resolve();
            };
            const sought = () => finish();
            const failed = () => finish(Error('Could not decode a video frame. Select frames manually or try another video.'));
            const timeout = setTimeout(() => finish(Error('Video frame loading timed out. Select frames manually or try another video.')), 5000);
            player.addEventListener('seeked', sought, { once: true });
            player.addEventListener('error', failed, { once: true });
            player.currentTime = time;
          });
        }
        if (request.current !== ticket) return;
        captured.push(readFrame());
      }
      setFaces(captured); setActive(0); setReviewing(true);
    } catch (e) {
      if (request.current === ticket) setError((e as Error).message);
    } finally { if (request.current === ticket) setAnalyzing(false); }
  }
  function capture() {
    try {
      if (!live) video.current?.pause();
      const samples = readFrame();
      setFaces(previous => previous.map((face, i) => i === active ? samples : face));
      const next = faces.findIndex((face, i) => i !== active && !face);
      if (next === -1) setReviewing(true); else setActive(next);
      setError('');
    } catch (e) { setError((e as Error).message); }
  }
  function record() {
    setFaces(Array(6).fill(null)); setActive(0); setError(''); setCountdown(4); setRecording(true);
    let index = 0, remaining = 4;
    timer.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining > 0) return;
      try {
        const samples = readFrame();
        const captured = index;
        setFaces(previous => previous.map((face, i) => i === captured ? samples : face));
        index++; remaining = 4; setCountdown(4);
        if (index === 6) { stopRecording(); setReviewing(true); }
        else setActive(index);
      } catch (e) { stopRecording(); setError((e as Error).message); }
    }, 1000);
  }
  function extract() {
    setError('');
    const candidates = [suggestedCalibration, ...profiles];
    const matches = matchScan(faces, size, selected === 'auto' ? candidates : candidates.filter(p => p.id === selected));
    if (!matches.length) {
      onReady(false);
      setError('These colors do not form a confident, valid cube. Retake unclear faces or recalibrate in the same lighting.');
      return;
    }
    const best = matches[0];
    onChange(best.value); onReady(true);
    closeCapture();
    setMessage(`State extracted and checked using ${best.calibration.name}. Review the cube preview, then solve.`);
  }
  function saveCalibration() {
    try {
      const profile = calibrationFromFaces(crypto.randomUUID(), name, faces, size);
      const next = [...profiles, profile];
      writeStored(calibrationKey, next); setProfiles(next); setSelected(profile.id); setCalibrating(false); setError(''); closeCapture(); setNotice(`Calibration saved: ${profile.name}. Ready to scan your cube.`);
    } catch (e) { setError((e as Error).message); }
  }
  const complete = faces.every(Boolean);
  const count = faces.filter(Boolean).length;
  const videoWidth = Math.min(viewport.width, viewport.height * aspect);
  const upload = <label className="capture-upload"><Upload size={16}/><span>Use video</span><input aria-label="Upload or take a short cube video" type="file" accept="video/*" disabled={disabled || recording || analyzing} onChange={chooseVideo}/></label>;
  return <div className="camera-input">
    <div className="camera-launch">
      <Camera size={25}/><div><h3>Scan your cube</h3><p>Six faces, one guided fullscreen view.</p></div>
      <button className="button" disabled={disabled} onClick={() => beginCapture(false)}>Scan cube <Camera size={16}/></button>
    </div>
    <label className="camera-profile-label" htmlFor="camera-calibration">Camera calibration</label>
    <select id="camera-calibration" disabled={disabled} value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="auto">Automatic · suggested + saved cubes</option>
      {[suggestedCalibration, ...profiles].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <div className="solver-actions">
      <button className="text-button" disabled={disabled} onClick={() => beginCapture(true)}>New calibration / recalibrate</button>
      {selected !== 'auto' && selected !== 'suggested' && <button className="text-button delete" disabled={disabled} onClick={() => {
        const next = profiles.filter(p => p.id !== selected); setProfiles(next); writeStored(calibrationKey, next); setSelected('auto');
      }}>Delete selected</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {message && <p role="status">{message}</p>}
    <dialog ref={dialog} className="capture-fullscreen" aria-labelledby="capture-title" onCancel={e => { e.preventDefault(); closeCapture(); }} onClose={() => { if (fullscreen) closeCapture(); }}>
      <div className="capture-shell">
        <header className="capture-header"><div><span>{calibrating ? 'CAMERA CALIBRATION' : 'CUBE SCAN'} · {size}×{size}</span><h2 id="capture-title">{reviewing ? 'Review all six faces' : calibrating ? 'Capture your cube’s colors' : 'Capture your cube'}</h2></div><button className="icon-button" aria-label="Close camera" onClick={closeCapture}><X size={23}/></button></header>
        <section className="capture-instruction" aria-live="polite">
          {reviewing ? <><span className="capture-face-chip"><Check size={22}/></span><div><strong>All six faces captured</strong><p>{calibrating ? 'Check the colors, name this calibration, then save.' : 'Check your faces, then extract the cube state.'} Tap a face to retake it.</p></div></> : <><span className="capture-face-chip" style={{background:faceColors[active]}}>{FACE_ORDER[active]}</span><div><strong>{active+1} / 6 · {labels[active]}</strong><p>{guidance[active]}</p><small>{calibrating ? size % 2 ? 'Center sticker supplies the color. Keep the lighting steady.' : 'Use a solved cube. Capture each solid-color face.' : 'Rotate the whole cube; keep the layers still.'}</small></div><span className="capture-top-edge"><i style={{background:faceColors[topColors[active]]}}/>This color<br/>along the top</span></>}
        </section>
        <div className="capture-stage" ref={stage}>
          <div className="camera-view" style={{width:videoWidth || '100%',height:videoWidth ? videoWidth/aspect : '100%'}} hidden={reviewing || (!source && !live && !opening)}>
            <video ref={video} src={source || undefined} muted playsInline controls={!!source && !analyzing} onLoadedMetadata={() => {
              const player = video.current!; setAspect(player.videoWidth / player.videoHeight || 4 / 3);
              if (source) {
                if (!Number.isFinite(player.duration) || player.duration > 120) { setSource(''); setError('Choose a video of two minutes or less.'); return; }
                setDuration(player.duration); void sampleUploadedVideo();
              }
            }} onTimeUpdate={() => setPosition(video.current?.currentTime ?? 0)} onError={() => { if (source) setError('This video could not be decoded. Try MP4 or WebM.'); }}/>
            <div className="camera-grid" style={{width:aspect >= 1 ? `${72/aspect}%` : '72%',height:aspect >= 1 ? '72%' : `${72*aspect}%`,gridTemplateColumns:`repeat(${size},1fr)`}} aria-hidden="true">{Array.from({length:size*size},(_,i) => <span key={i}/>)}</div>
            {recording && <span className="capture-countdown" role="status">{countdown}</span>}
          </div>
          {reviewing ? <div className="capture-review" aria-label="Review captured colors">{faces.map((face,i) => <button key={i} onClick={() => retake(i)}><span>{labels[i]}</span><span className="camera-samples" style={{gridTemplateColumns:`repeat(${size},1fr)`}}>{face?.map((rgb,j) => <i key={j} style={{background:`rgb(${rgb.join(',')})`}}/>)}</span><small><RotateCcw size={12}/> Retake</small></button>)}</div> : !source && !live && !opening && <div className="capture-placeholder"><Camera size={38}/><h3>{error ? 'Camera unavailable' : 'Ready when you are'}</h3><button className="button" disabled={opening || disabled} onClick={() => void openCamera()}>Use camera</button>{upload}<p>Video: hold each face equally in U → R → F → D → L → B order. Up to two minutes.</p></div>}
          {opening && <span className="capture-loading" role="status">Opening camera…</span>}
          {analyzing && <span className="capture-loading" role="status">Reading six faces…</span>}
        </div>
        {error && <div className="capture-error" role="alert"><p>{error}</p>{!calibrating && <button className="text-button" onClick={() => beginCapture(true)}>Recalibrate</button>}<button className="icon-button" aria-label="Dismiss camera error" onClick={() => setError('')}><X size={17}/></button></div>}
        {!reviewing && source && duration > 0 && <label className="camera-seek">Video frame · {position.toFixed(1)}s<input aria-label="Choose video frame" type="range" min="0" max={duration} step="0.05" value={position} disabled={recording || analyzing} onChange={e => { const player=video.current!; player.pause(); player.currentTime=Number(e.target.value); setPosition(Number(e.target.value)); }}/></label>}
        {!reviewing && <nav className="capture-faces" aria-label="Captured faces">{faces.map((face,i) => <button key={i} aria-label={`${labels[i]}${face ? ' captured, retake' : ''}`} aria-pressed={active === i} disabled={recording || analyzing} onClick={() => retake(i)}><i style={{background:faceColors[i]}}/><span>{FACE_ORDER[i]}</span>{face ? <Check size={13}/> : <small>{i+1}</small>}</button>)}</nav>}
        <footer className="capture-controls">
          {reviewing ? <>{calibrating && <label className="capture-name" htmlFor="calibration-name">Cube / lighting name<input id="calibration-name" value={name} maxLength={60} onChange={e => setName(e.target.value)}/></label>}<div className="capture-control-row"><button className="text-button" onClick={() => retake(active)}><RotateCcw size={15}/> Back to camera</button><button className="button" disabled={!complete || recording || disabled || analyzing} onClick={calibrating ? saveCalibration : extract}>{calibrating ? 'Save calibration' : 'Extract state'}<Check size={17}/></button></div></> : <><div className="capture-control-row"><span className="capture-progress">{count} / 6 captured</span><button className="button capture-shutter" disabled={(!live && !source) || recording || analyzing || disabled} onClick={capture}><Camera size={20}/>{faces[active] ? 'Retake' : 'Capture'} {FACE_ORDER[active]} face</button>{complete && <button className="text-button" disabled={recording || analyzing} onClick={() => setReviewing(true)}>Review <Check size={15}/></button>}</div><div className="capture-secondary">{recording ? <button className="text-button" onClick={stopRecording}>Stop recording</button> : analyzing ? <button className="text-button" onClick={stopCamera}>Cancel processing</button> : <>{(live || source) && upload}{live && <button className="text-button" onClick={record}>Auto-capture · 24s</button>}{!live && source && <button className="text-button" onClick={() => void openCamera()}>Use camera</button>}</>}</div></>}
        </footer>
      </div>
    </dialog>
  </div>;
}
