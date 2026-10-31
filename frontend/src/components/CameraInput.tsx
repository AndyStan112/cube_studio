import { useEffect, useRef, useState } from 'react';
import type { CubeSize } from '../lib/cube';
import { FACE_ORDER } from '../lib/facelets';
import { readStored, writeStored } from '../lib/offline';
import { calibrationFromFaces, calibrationKey, isCalibration, matchScan, sampleFace, suggestedCalibration, type Calibration, type RGB } from '../lib/cameraInput';
import './CameraInput.css';

const labels = ['Up · yellow', 'Right · green', 'Front · red', 'Down · white', 'Left · blue', 'Back · orange'];
const guidance = ['Show yellow, with orange along its top edge.', 'Show green, with yellow along its top edge.', 'Show red, with yellow along its top edge.', 'Show white, with red along its top edge.', 'Show blue, with yellow along its top edge.', 'Show orange, with yellow along its top edge.'];
export default function CameraInput({ size, disabled, onChange, onReady }: {
  size: CubeSize; disabled: boolean; onChange: (value: string) => void; onReady: (ready: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
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
  const [selected, setSelected] = useState('auto');
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
      setFaces(captured); setActive(0);
    } catch (e) {
      if (request.current === ticket) setError((e as Error).message);
    } finally { if (request.current === ticket) setAnalyzing(false); }
  }
  function capture() {
    try {
      if (!live) video.current?.pause();
      const samples = readFrame();
      setFaces(previous => previous.map((face, i) => i === active ? samples : face));
      setActive(Math.min(5, active + 1)); setError('');
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
        if (index === 6) stopRecording();
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
      setError('No calibration produced a valid, confident cube state. Choose another saved calibration or recalibrate below. Also check face order, top edges, glare and alignment; recapture any unclear face.');
      return;
    }
    const best = matches[0];
    onChange(best.value); onReady(true);
    setMessage(`State extracted and checked using ${best.calibration.name}. Review the cube preview, then solve.`);
  }
  function saveCalibration() {
    try {
      const profile = calibrationFromFaces(crypto.randomUUID(), name, faces, size);
      const next = [...profiles, profile];
      writeStored(calibrationKey, next); setProfiles(next); setSelected('auto'); setCalibrating(false); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  const complete = faces.every(Boolean);
  return <div className="camera-input">
    <p className="solver-hint">Scan all six faces without turning any layers. Match each face to the guide, fill the square, and avoid glare. Processing stays on this device.</p>
    <fieldset disabled={disabled || analyzing}>
      <details className="camera-calibration" open={calibrating || undefined}>
        <summary>Cube calibrations · {profiles.length} saved</summary>
        <p className="solver-hint">Automatic mode tries the suggested colors and every saved cube, then uses the closest match that passes cube-state checks. Save a calibration for each cube or lighting setup.</p>
        <label htmlFor="camera-calibration">Calibration</label>
        <select id="camera-calibration" value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="auto">Automatic · suggested + saved cubes</option>
          {[suggestedCalibration, ...profiles].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="solver-actions">
          <button type="button" className="button" disabled={recording} onClick={() => { setCalibrating(true); setFaces(Array(6).fill(null)); setActive(0); setError(''); }}>New calibration / recalibrate</button>
          {selected !== 'auto' && selected !== 'suggested' && <button type="button" className="button" onClick={() => {
            const next = profiles.filter(p => p.id !== selected); setProfiles(next); writeStored(calibrationKey, next); setSelected('auto');
          }}>Delete selected</button>}
        </div>
        {calibrating && <div>
          <p className="solver-hint">{size % 2 ? 'Capture each face below. Its fixed center supplies that color, so your cube may stay scrambled.' : 'Use a solved cube for calibration. Capture each solid-color face below.'} Keep the same lighting for your scan.</p>
          <label htmlFor="calibration-name">Cube / lighting name</label>
          <input id="calibration-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
          <div className="solver-actions">
            <button className="button" disabled={!complete || recording} onClick={saveCalibration}>Save calibration</button>
            <button className="button" disabled={recording} onClick={() => setCalibrating(false)}>Cancel calibration</button>
          </div>
        </div>}
      </details>
      <div className="solver-actions">
        <button className="button" disabled={opening || recording} onClick={() => void openCamera()}>{opening ? 'Opening camera…' : 'Use camera'}</button>
        {live && <button className="button" onClick={stopCamera}>Stop camera</button>}
        <label className="button camera-upload">Upload / take video
          <input aria-label="Upload or take a short cube video" type="file" accept="video/*" disabled={disabled || recording} onChange={e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            if (file.size > 200 * 1024 * 1024) { setError('Choose a video smaller than 200 MB.'); return; }
            stopCamera(); if (video.current) video.current.srcObject = null;
            setFaces(Array(6).fill(null)); setActive(0); setError(''); setDuration(0); setPosition(0); setSource(URL.createObjectURL(file));
          }} />
        </label>
      </div>
      <p className="solver-hint">For an uploaded video, use six equal holds in U → R → F → D → L → B order. We sample the middle of each hold automatically; use the timeline to replace any unclear frame. Keep clips under two minutes.</p>
      <div className="camera-guide" role="status" aria-live="polite">
        <strong>{calibrating ? 'Calibrate' : 'Scan'} {active + 1}/6 · {labels[active]}</strong>
        <p>{guidance[active]} {recording && `Hold still · capture in ${countdown}s`}</p>
      </div>
      <div className="camera-view" style={{ aspectRatio: aspect }} hidden={!source && !live && !opening}>
        <video ref={video} src={source || undefined} muted playsInline controls={!!source && !analyzing} onLoadedMetadata={() => {
          const player = video.current!; setAspect(player.videoWidth / player.videoHeight || 4 / 3);
          if (source) {
            if (!Number.isFinite(player.duration) || player.duration > 120) { setSource(''); setError('Choose a video of two minutes or less.'); return; }
            setDuration(player.duration);
            void sampleUploadedVideo();
          }
        }} onTimeUpdate={() => setPosition(video.current?.currentTime ?? 0)} onError={() => { if (source) setError('This video could not be decoded. Try an MP4 or WebM video supported by your browser.'); }} />
        <div className="camera-grid" style={{ width: aspect >= 1 ? `${72 / aspect}%` : '72%', height: aspect >= 1 ? '72%' : `${72 * aspect}%`, gridTemplateColumns: `repeat(${size}, 1fr)` }} aria-hidden="true">
          {Array.from({ length: size * size }, (_, i) => <span key={i} />)}
        </div>
      </div>
      {source && duration > 0 && <label className="camera-seek">Video frame · {position.toFixed(1)}s
        <input aria-label="Choose video frame" type="range" min="0" max={duration} step="0.05" value={position} disabled={recording} onChange={e => { const player = video.current!; player.pause(); player.currentTime = Number(e.target.value); setPosition(Number(e.target.value)); }} />
      </label>}
      {analyzing && <p role="status">Reading the six face holds from your video…</p>}
      <div className="camera-faces" aria-label="Captured faces">
        {faces.map((face, i) => <button key={i} aria-pressed={active === i} disabled={recording} onClick={() => setActive(i)}>
          <span>{FACE_ORDER[i]} {face ? '✓' : '○'}</span>
          {face && <span className="camera-samples" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>{face.map((rgb, j) => <i key={j} style={{ background: `rgb(${rgb.join(',')})` }} />)}</span>}
        </button>)}
      </div>
      <div className="solver-actions">
        <button className="button" disabled={(!live && !source) || recording} onClick={capture}>Capture {FACE_ORDER[active]} face</button>
        {live && !recording && <button className="button" onClick={record}>Record guided scan · 24s</button>}
        {recording && <button className="button" onClick={stopRecording}>Stop recording</button>}
        <button className="button" disabled={!complete || recording || calibrating} onClick={extract}>Extract state</button>
        {source && <button className="button" disabled={recording} onClick={() => void sampleUploadedVideo()}>Resample video</button>}
        <button className="button" disabled={recording} onClick={() => { setFaces(Array(6).fill(null)); setActive(0); setError(''); }}>Clear scan</button>
      </div>
    </fieldset>
    {analyzing && <button className="button" onClick={stopCamera}>Cancel video processing</button>}
    {message && <p role="status">{message}</p>}
    {error && <div role="alert" className="error-banner"><p>{error}</p><button className="button" disabled={disabled || recording} onClick={() => setCalibrating(true)}>Recalibrate</button><p className="solver-hint">Open Cube calibrations to choose a saved setting, or select a face above to recapture it.</p></div>}
  </div>;
}
