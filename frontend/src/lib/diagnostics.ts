import { diagnosticArchive, type DiagnosticFile } from './diagnosticArchive';

declare const __APP_VERSION__: string;
declare const __APP_BUILT_AT__: string;
const build = {version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development', builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : null};
const MAX_MEDIA = 32 * 1024 * 1024, MAX_SCANS = 2, MAX_FRAMES = 120;
const DB = 'cube-studio-diagnostics-v1';
export type DiagnosticEvent = {at: string; clock: number; type: string; data: unknown};
type StoredScan = {id: string; at: string; source: 'camera' | 'file'; size: number; build: typeof build; events: DiagnosticEvent[]; files: DiagnosticFile[]; media: DiagnosticFile | null; recordingFinalized: boolean; status: string; omittedFrames: number};
let events: DiagnosticEvent[] = [], scans: StoredScan[] = [], initialized = false;
let storageError = '', persistence: Promise<void> = Promise.resolve(), persistTimer: ReturnType<typeof setTimeout> | undefined;
let activeRecorder: MediaRecorder | null = null;
const finalizers = new Set<Promise<void>>();
const pendingFrames = new Set<Promise<void>>();
let database: Promise<IDBDatabase> | undefined;
let ready: Promise<void> | undefined;
const listeners = new Set<() => void>();
const eventSizes = new WeakMap<DiagnosticEvent, number>(), logSizes = new WeakMap<DiagnosticEvent[], number>();
function eventBytes(entry: DiagnosticEvent) {let size=eventSizes.get(entry);if(size === undefined){size=new TextEncoder().encode(JSON.stringify(entry)).length;eventSizes.set(entry,size);}return size;}
function appendEvent(log: DiagnosticEvent[], entry: DiagnosticEvent, count: number, bytes: number) {
  if(eventBytes(entry)>128*1024) entry={...entry,data:'[event exceeded diagnostic size limit]'};
  let total=logSizes.get(log) ?? log.reduce((sum,item)=>sum+eventBytes(item),0);
  log.push(entry);total+=eventBytes(entry);
  while(log.length>count || total>bytes){const removed=log.shift();if(removed)total-=eventBytes(removed);else break;}
  logSizes.set(log,total);
}
function changed() { for (const listener of listeners) listener(); }
export function subscribeDiagnostics(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener);};}
export function diagnosticStatus() {return {scans: scans.length, media: scans.filter(scan => scan.media).length, storageError, bytes: scans.reduce((n, scan) => n + (scan.media?.blob.size ?? 0) + scan.files.reduce((a,f) => a + f.blob.size, 0),0)};}
export function redactDiagnostic(value: unknown, depth = 0, budget = {nodes: 6000}): unknown {
  if (depth > 8 || --budget.nodes < 0) return '[size limit]';
  if (value instanceof Error || (typeof DOMException !== 'undefined' && value instanceof DOMException)) return {name: value.name, message: clean(value.message).slice(0,6000), stack: clean(value.stack ?? '').slice(0,6000)};
  if (typeof value === 'string') return clean(value).slice(0, 6000);
  if (Array.isArray(value)) return value.slice(0, 1000).map(item => redactDiagnostic(item, depth + 1,budget));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0,150).map(([key,item]) => [key, /token|password|authorization|cookie|email|secret|deviceId|groupId/i.test(key) ? '[redacted]' : redactDiagnostic(item, depth + 1,budget)]));
  return typeof value === 'function' ? '[function]' : value;
}
function clean(text: string) {return text.replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/([?&](?:token|key|code|secret|password)=)[^&#\s]*/gi,'$1[redacted]');}
function event(type: string, data: unknown): DiagnosticEvent {return {at: new Date().toISOString(), clock: performance.now(), type, data: redactDiagnostic(data)};}
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve,reject) => {
    if (typeof indexedDB === 'undefined') {reject(Error('Diagnostic storage is unavailable in this browser. Keep this tab open until sending.'));return;}
    const request = indexedDB.open(DB,1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return database;
}
export function loadDiagnostics() {
  ready ??= (async () => {
    try {
      const db = await openDatabase();
      const saved = await new Promise<{events: DiagnosticEvent[]; scans: StoredScan[]} | undefined>((resolve,reject) => {
        const request = db.transaction('data').objectStore('data').get('latest'); request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error);
      });
      if (saved) { events = [...saved.events, ...events].slice(-500); scans = [...scans,...saved.scans.filter(s => !scans.some(current => current.id === s.id))].sort((a,b) => b.at.localeCompare(a.at)).slice(0,MAX_SCANS); }
    } catch (error) {storageError = String((error as Error).message);}
    changed();
  })();
  return ready;
}
function scheduleSave() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {persistTimer = undefined;void persistDiagnostics();}, 2000);
}
export async function persistDiagnostics() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  persistence = persistence.catch(() => {}).then(async () => {
    await loadDiagnostics();
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve,reject) => {
        const tx = db.transaction('data','readwrite');tx.objectStore('data').put({events, scans},'latest'); tx.oncomplete = () => resolve();tx.onerror = () => reject(tx.error);tx.onabort = () => reject(tx.error);
      });
      storageError = '';
    } catch {storageError = 'Could not save diagnostics across reloads. Keep this tab open until sending.';}
    changed();
  });
  return persistence;
}
export function logDiagnostic(type: string, data: unknown) {appendEvent(events,event(type,data),500,1024*1024);scheduleSave();}
export function installDiagnostics() {
  if (initialized) return; initialized = true;void loadDiagnostics();
  window.addEventListener('error', e => logDiagnostic('client.error',e.error ?? {message: e.message, filename: e.filename, line: e.lineno}));
  window.addEventListener('unhandledrejection', e => logDiagnostic('client.unhandledrejection',e.reason));
  for (const level of ['warn','error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {logDiagnostic(`console.${level}`,args);original(...args);};
  }
  const original = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const start = performance.now();
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    const path = url.origin === location.origin ? url.pathname : '[external]';
    try {const response = await original(input,options); if(!response.ok) logDiagnostic('network.response',{path,status:response.status,method:options?.method ?? 'GET',ms:performance.now()-start});return response;}
    catch(error) {logDiagnostic('network.error',{path,error,ms:performance.now()-start});throw error;}
  };
  window.addEventListener('pagehide', () => {stopDiagnosticRecording();void persistDiagnostics();});
}
export type ScanDiagnostics = ReturnType<typeof beginScanDiagnostics>;
export function beginScanDiagnostics(source: 'camera' | 'file', size: number, context: unknown) {
  stopDiagnosticRecording();
  const scan: StoredScan = {id: crypto.randomUUID(), at: new Date().toISOString(), source, size, build, events: [], files: [], media: null, recordingFinalized: false, status: 'opening', omittedFrames: 0};
  scans.unshift(scan);scans = scans.slice(0,MAX_SCANS);changed();
  let lastFrame = -Infinity, frameCount = 0;
  const log = (type: string, data: unknown) => {appendEvent(scan.events,event(type,data),1600,2*1024*1024);scheduleSave();};
  log('scan.start',context);
  return {
    id: scan.id, log,
    phase(status: string) {scan.status = status;log('scan.phase',{status});},
    frame(canvas: HTMLCanvasElement, time: number, data: unknown, important: boolean) {
      log('scan.frame',{time, ...data as object});
      if (!important && time - lastFrame < 1) return;
      if (frameCount >= MAX_FRAMES) {scan.omittedFrames++;return;}
      frameCount++;lastFrame = time;
      const name = `scans/${scan.id}/frame-${String(frameCount).padStart(3,'0')}.jpg`;
      log('scan.image',{time,name,width:canvas.width,height:canvas.height,encoding:'jpeg',quality:0.8});
      const pending = new Promise<void>(resolve => {
        try {canvas.toBlob(blob => {if(blob)scan.files.push({name,blob});scheduleSave();resolve();},'image/jpeg',0.8);}
        catch(error) {log('scan.image.error',error);resolve();}
      });
      pendingFrames.add(pending);void pending.finally(() => pendingFrames.delete(pending));
    },
    async sourceFile(file: File) {
      log('scan.source',{name:file.name,type:file.type,bytes:file.size,lastModified:file.lastModified});
      if (file.size > MAX_MEDIA) {log('scan.media.omitted',{reason:'Source video exceeds 32 MB; analyzed-frame images and exact readings retained.'});return;}
      scan.media = {name:`scans/${scan.id}/source.${file.type.includes('webm') ? 'webm' : file.type.includes('quicktime') ? 'mov' : 'mp4'}`,blob:file};scan.recordingFinalized=true;await persistDiagnostics();
    },
    record(stream: MediaStream) {
      if (typeof MediaRecorder === 'undefined') {log('scan.recorder.unavailable',{});return;}
      try {
        const mimeType = ['video/webm;codecs=vp8','video/webm','video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(new MediaStream(stream.getVideoTracks()), {videoBitsPerSecond: 1000000, ...(mimeType ? {mimeType} : {})});
        const chunks: Blob[] = [];let bytes = 0, checkpoint = 0, failed = false;
        const saveRecording = () => {
          const blob = new Blob(chunks,{type:recorder.mimeType || mimeType || 'video/webm'});
          if(blob.size)scan.media = {name:`scans/${scan.id}/live.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`,blob};
          return blob;
        };
        let resolve!: () => void;const finalized = new Promise<void>(done => {resolve = done;});finalizers.add(finalized);
        const timeout = setTimeout(() => {log('scan.recorder.limit',{seconds:120});if(recorder.state !== 'inactive')recorder.stop();},120000);
        recorder.ondataavailable = e => {
          if(e.data.size){chunks.push(e.data);bytes += e.data.size;}
          if(bytes && Date.now() - checkpoint >= 5000){checkpoint=Date.now();saveRecording();log('scan.recorder.checkpoint',{bytes,finalized:false});changed();}
          if(bytes >= MAX_MEDIA && recorder.state !== 'inactive'){log('scan.recorder.limit',{bytes});recorder.stop();}
        };
        recorder.onerror = e => {failed=true;log('scan.recorder.error',{state:recorder.state,error:(e as Event & {error?: DOMException}).error ?? 'MediaRecorder error'});};
        recorder.onstop = () => {
          clearTimeout(timeout);if(activeRecorder === recorder)activeRecorder = null;
          const blob = saveRecording();scan.recordingFinalized=!failed;
          log('scan.recorder.stopped',{bytes:blob.size,type:blob.type});finalizers.delete(finalized);resolve();void persistDiagnostics();changed();
        };
        try {activeRecorder = recorder;recorder.start(1000);log('scan.recorder.started',{mimeType:recorder.mimeType});}
        catch(error) {clearTimeout(timeout);finalizers.delete(finalized);resolve();activeRecorder=null;throw error;}
      } catch(error) {log('scan.recorder.error',error);}
    },
  };
}
export function stopDiagnosticRecording() {if(activeRecorder && activeRecorder.state !== 'inactive')activeRecorder.stop();activeRecorder = null;}
async function finishCapture() {
  stopDiagnosticRecording();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all([...finalizers,...pendingFrames]),new Promise<void>(resolve => {timer=setTimeout(()=>{logDiagnostic('diagnostics.capture.timeout',{});resolve();},5000);})]);
  clearTimeout(timer);
}
export async function clearDiagnostics() {await finishCapture();await loadDiagnostics();scans=[];events=[];await persistDiagnostics();changed();}
export async function prepareDiagnostics(note: string, includeVideo: boolean): Promise<Blob> {
  await finishCapture();await loadDiagnostics();
  const selected = scans.slice();
  const files = selected.flatMap(scan => [...scan.files,...(includeVideo && scan.media ? [scan.media] : [])]);
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const worker = (value: ServiceWorker | null | undefined) => value ? {url:value.scriptURL,state:value.state} : null;
  const report = {schema:1, at:new Date().toISOString(),build,note:redactDiagnostic(note),environment:{userAgent:navigator.userAgent,language:navigator.language,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},serviceWorker:{controller:worker(navigator.serviceWorker?.controller),active:worker(registration?.active),waiting:worker(registration?.waiting),installing:worker(registration?.installing)},scripts:[...document.scripts].map(s=>s.src).filter(Boolean),recorder:typeof MediaRecorder !== 'undefined'},events:events.slice(),scans:selected.map(({files: images,media,...scan})=>({...scan,images:images.map(file=>file.name),media:includeVideo && media ? {name:media.name,type:media.blob.type,bytes:media.blob.size} : null}))};
  const json = new Blob([JSON.stringify(report)],{type:'application/json'});
  const zip = await diagnosticArchive([{name:'report.json',blob:json},...files]);
  if(zip.size > 64 * 1024 * 1024) throw Error('Report is larger than 64 MB. Turn off video inclusion and try again.');
  await persistDiagnostics();return zip;
}
let fallbackInstallation = '';
export function sendDiagnostics(blob: Blob, progress: (percent:number)=>void, signal: AbortSignal): Promise<{id:string;retention_days:number}> {
  let installation = fallbackInstallation ||= crypto.randomUUID();
  try {installation = localStorage.getItem('cube-studio-diagnostic-client') || installation;localStorage.setItem('cube-studio-diagnostic-client',installation);} catch {/* Still allow an in-memory report when storage is blocked. */}
  return new Promise((resolve,reject) => {
    const request = new XMLHttpRequest();request.open('POST','/api/diagnostics');request.timeout=240000;request.setRequestHeader('Content-Type','application/zip');request.setRequestHeader('X-Diagnostic-Client',installation!);
    request.upload.onprogress = e => {if(e.lengthComputable)progress(Math.round(e.loaded/e.total*100));};
    const abort = () => request.abort();signal.addEventListener('abort',abort,{once:true});
    const finish = () => signal.removeEventListener('abort',abort);
    request.onload = () => {finish();let response;try{response=JSON.parse(request.responseText);}catch{}if(request.status>=200&&request.status<300&&response?.id)resolve(response);else reject(Error(response?.detail || `Upload failed (${request.status}). Your report is still saved; try again.`));};
    request.onerror = () => {finish();reject(Error('Cannot upload diagnostics. Check your connection and try again.'));};
    request.ontimeout = () => {finish();reject(Error('Upload timed out. Your report is still saved; try again.'));};
    request.onabort = () => {finish();reject(new DOMException('Upload cancelled.','AbortError'));};
    if(signal.aborted){finish();reject(new DOMException('Upload cancelled.','AbortError'));return;}request.send(blob);
  });
}
