import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  Check,
  LoaderCircle,
  RotateCcw,
  Upload,
  VideoOff,
  X,
} from "lucide-react";
import type { CubeSize } from "../lib/cube";
import { FACE_ORDER } from "../lib/facelets";
import { readStored } from "../lib/offline";
import {
  calibrationKey,
  isCalibration,
  suggestedCalibration,
  type Calibration,
  type ScanMatch,
} from "../lib/cameraInput";
import { detectFace, facePoint, type Point } from "../lib/cameraVision";
import { VideoScanSession, type VideoScanSnapshot } from "../lib/videoScan";
import "./CameraInput.css";

const names = ["Yellow", "Green", "Red", "White", "Blue", "Orange"];
const swatches = [
  "#f5d54f",
  "#65b99a",
  "#e9574e",
  "#f5f5eb",
  "#6297ed",
  "#ff9c39",
];
type Phase =
  | "idle"
  | "opening"
  | "scanning"
  | "processing"
  | "checking"
  | "incomplete"
  | "ready"
  | "error";
function profilesFor(selected: string): Calibration[] {
  const saved = readStored<unknown>(calibrationKey, []);
  const profiles = [
    suggestedCalibration,
    ...(Array.isArray(saved) ? saved.filter(isCalibration) : []),
  ];
  return selected === "auto"
    ? profiles
    : profiles.filter((p) => p.id === selected).length
      ? profiles.filter((p) => p.id === selected)
      : profiles;
}
function seek(
  player: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Cancelled", "AbortError"));
  if (Math.abs(player.currentTime - time) < 0.01 && player.readyState >= 2)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      player.removeEventListener("seeked", done);
      player.removeEventListener("error", failed);
      signal.removeEventListener("abort", cancelled);
      if (error) reject(error);
      else resolve();
    };
    const done = () => finish();
    const failed = () =>
      finish(Error("Could not decode this video. Try another MP4 or WebM."));
    const cancelled = () => finish(new DOMException("Cancelled", "AbortError"));
    const timeout = setTimeout(
      () => finish(Error("Video decoding timed out. Try another video.")),
      5000,
    );
    player.addEventListener("seeked", done, { once: true });
    player.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", cancelled, { once: true });
    player.currentTime = time;
  });
}
export default function CameraInput({
  size,
  disabled,
  onChange,
  onReady,
  defaultCalibration = "auto",
}: {
  defaultCalibration?: string;
  size: CubeSize;
  disabled: boolean;
  onChange: (value: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    modal = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null),
    worker = useRef<Worker | null>(null);
  const [initialSession] = useState(
    () => new VideoScanSession(size, profilesFor(defaultCalibration)),
  );
  const session = useRef(initialSession);
  const generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null),
    objectUrl = useRef("");
  const selectedFile = useRef<File | null>(null);
  const source = useRef<"camera" | "file">("camera"),
    ended = useRef(false),
    pending = useRef(false),
    validatedRevision = useRef(-1);
  const phaseRef = useRef<Phase>("idle");
  const [open, setOpen] = useState(false),
    [phase, setPhase] = useState<Phase>("idle");
  const [snapshot, setSnapshot] = useState<VideoScanSnapshot>(() =>
    session.current.snapshot(),
  );
  const [corners, setCorners] = useState<Point[] | null>(null),
    [preview, setPreview] = useState("");
  const [match, setMatch] = useState<ScanMatch | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [aspect, setAspect] = useState(4 / 3),
    [viewport, setViewport] = useState({ width: 0, height: 0 }),
    [progress, setProgress] = useState(0);
  const scanReady = () => phaseRef.current === "ready";
  function transition(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }
  function releaseMedia() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    abort.current?.abort();
    abort.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    video.current?.pause();
  }
  function close() {
    generation.current++;
    transition("idle");
    releaseMedia();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    selectedFile.current = null;
    if (video.current) {
      video.current.srcObject = null;
      video.current.removeAttribute("src");
      video.current.load();
    }
    setOpen(false);
  }
  function freeze() {
    if (canvas.current?.width)
      setPreview(canvas.current.toDataURL("image/jpeg", 0.85));
    releaseMedia();
  }
  function initialize(mode: "camera" | "file", preserve = false) {
    generation.current++;
    releaseMedia();
    worker.current?.terminate();
    worker.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    if (video.current) {
      video.current.srcObject = null;
      video.current.removeAttribute("src");
      video.current.load();
    }
    if (!preserve)
      session.current = new VideoScanSession(
        size,
        profilesFor(defaultCalibration),
      );
    if (mode === "camera") selectedFile.current = null;
    if (canvas.current) canvas.current.width = 0;
    source.current = mode;
    ended.current = false;
    pending.current = false;
    validatedRevision.current = -1;
    setSnapshot(session.current.snapshot());
    setCorners(null);
    setMatch(null);
    setPreview("");
    setError("");
    setMessage("");
    setProgress(0);
    setOpen(true);
    onReady(false);
    return generation.current;
  }
  function validate() {
    const state = session.current.snapshot();
    if (
      state.faces.length !== 6 ||
      state.revision === validatedRevision.current
    )
      return;
    validatedRevision.current = state.revision;
    pending.current = true;
    if (!worker.current) {
      worker.current = new Worker(
        new URL("../lib/videoScan.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current.onmessage = (event) => {
        const result = event.data as {
          generation: number;
          revision: number;
          match: ScanMatch | null;
        };
        if (
          result.generation !== generation.current ||
          result.revision !== session.current.snapshot().revision
        )
          return;
        pending.current = false;
        if (result.match) {
          setMatch(result.match);
          setError("");
          transition("ready");
          freeze();
        } else {
          setError(
            "The six readings do not yet give a unique valid cube. Keep layers still and show clear faces, or start over.",
          );
          if (source.current === "file" && ended.current)
            transition("incomplete");
        }
      };
      worker.current.onerror = () => {
        worker.current?.terminate();
        worker.current = null;
        pending.current = false;
        setError("Could not check the scan. Start over to try again.");
        transition("error");
        releaseMedia();
      };
    }
    worker.current.postMessage({
      generation: generation.current,
      revision: state.revision,
      size,
      faces: state.faces.map((face) => face.colors),
      neighbors: state.faces.map((face) => face.neighbors ?? []),
      calibrations: session.current.calibrations,
    });
  }
  function readFrame(time: number) {
    const player = video.current;
    if (
      !player ||
      player.readyState < 2 ||
      player.seeking ||
      !player.videoWidth
    )
      return;
    const frame = (canvas.current ??= document.createElement("canvas"));
    const scale = Math.min(
      1,
      800 / Math.max(player.videoWidth, player.videoHeight),
    );
    const width = Math.round(player.videoWidth * scale),
      height = Math.round(player.videoHeight * scale);
    if (frame.width !== width) frame.width = width;
    if (frame.height !== height) frame.height = height;
    const context = frame.getContext("2d", { willReadFrequently: true });
    if (!context) throw Error("This browser cannot read video frames.");
    context.drawImage(player, 0, 0, width, height);
    const detection = detectFace(
      context.getImageData(0, 0, width, height),
      size,
      (face) => session.current.accepts(face),
    );
    setCorners(
      detection?.corners.map((p) => ({
        x: (p.x / width) * 100,
        y: (p.y / height) * 100,
      })) ?? null,
    );
    setSnapshot(session.current.observe(detection, time));
    validate();
  }
  async function startCamera(preserve = false) {
    const ticket = initialize("camera", preserve);
    transition("opening");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera access requires HTTPS. Choose a video instead.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      if (ticket !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      if (ticket !== generation.current) return;
      transition("scanning");
      const step = () => {
        if (ticket !== generation.current || phaseRef.current !== "scanning")
          return;
        try {
          readFrame(video.current?.currentTime ?? 0);
        } catch (reason) {
          setError((reason as Error).message);
        }
        if (phaseRef.current === "scanning")
          timer.current = setTimeout(step, 180);
      };
      step();
    } catch (reason) {
      if (ticket !== generation.current) return;
      releaseMedia();
      transition("error");
      setError((reason as Error).message);
    }
  }
  async function analyzeVideo() {
    const player = video.current;
    if (
      !player ||
      source.current !== "file" ||
      phaseRef.current !== "processing" ||
      abort.current
    )
      return;
    if (
      !Number.isFinite(player.duration) ||
      player.duration <= 0 ||
      player.duration > 120
    ) {
      setError("Choose a video of two minutes or less.");
      transition("error");
      return;
    }
    const ticket = generation.current,
      controller = new AbortController();
    abort.current = controller;
    player.pause();
    try {
      const count = Math.min(720, Math.ceil(player.duration * 6));
      for (let i = 0; i < count; i++) {
        if (ticket !== generation.current || controller.signal.aborted) return;
        const time = Math.min(
          player.duration - 0.001,
          ((i + 0.5) * player.duration) / count,
        );
        await seek(player, time, controller.signal);
        if (ticket !== generation.current || controller.signal.aborted) return;
        readFrame(time);
        setProgress(Math.round(((i + 1) / count) * 100));
      }
      ended.current = true;
      if (ticket === generation.current && !scanReady()) {
        transition(pending.current ? "checking" : "incomplete");
        freeze();
      }
    } catch (reason) {
      if (ticket === generation.current && !controller.signal.aborted) {
        setError((reason as Error).message);
        transition("error");
      }
    }
  }
  function startFile(file: File) {
    if (file.size > 200 * 1024 * 1024) {
      setError("Choose a video smaller than 200 MB.");
      return;
    }
    initialize("file");
    selectedFile.current = file;
    transition("processing");
    objectUrl.current = URL.createObjectURL(file);
    video.current!.src = objectUrl.current;
    video.current!.load();
  }
  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) startFile(file);
  }
  function restart() {
    if (source.current === "file" && selectedFile.current)
      startFile(selectedFile.current);
    else void startCamera();
  }
  function useCube() {
    if (!match) return;
    onChange(match.value);
    onReady(true);
    close();
    setMessage("");
  }
  useEffect(
    () => () => {
      generation.current++;
      releaseMedia();
      worker.current?.terminate();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  useEffect(() => {
    const hidden = () => {
      if (
        document.hidden &&
        (phaseRef.current === "scanning" || phaseRef.current === "opening")
      ) {
        generation.current++;
        freeze();
        transition("incomplete");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  useEffect(() => {
    if (!open) return;
    const dialog = modal.current!,
      previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (stage.current) observer.observe(stage.current);
    return () => {
      observer.disconnect();
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, [open]);
  useEffect(() => {
    close();
    session.current = new VideoScanSession(
      size,
      profilesFor(defaultCalibration),
    );
    setSnapshot(session.current.snapshot());
    setMatch(null);
    setCorners(null);
    setPreview("");
    setMessage("");
    onReady(false);
  }, [size, defaultCalibration]);
  const count = snapshot.faces.length,
    complete = count === 6;
  const missing = names.filter(
    (_, i) => !snapshot.faces.some((face) => face.identity === i),
  );
  const current = snapshot.faces.findIndex(
    (face) => face.id === snapshot.current,
  );
  const recognized =
    snapshot.status === "recognized" || snapshot.status === "known";
  const status =
    phase === "ready"
      ? "Cube checked"
      : phase === "checking"
        ? "Checking cube…"
        : phase === "opening"
          ? "Opening camera…"
          : snapshot.status === "holding"
            ? "Hold steady"
            : recognized
              ? size % 2
                ? `${names[snapshot.faces[current]?.identity ?? 0]} face scanned`
                : `Face ${current + 1} scanned`
              : snapshot.status === "unclear"
                ? "Keep all stickers visible"
                : snapshot.status === "extra"
                  ? "Show an unscanned side"
                  : "Show one full face";
  const remaining =
    phase === "error"
      ? "Choose a video or retry the camera"
      : complete
        ? "All six faces scanned"
        : size % 2 && missing.length <= 2
          ? `Still needed: ${missing.join(" and ").toLowerCase()}`
          : `${6 - count} faces left · turn the whole cube`;
  const width = Math.min(viewport.width, viewport.height * aspect);
  const center = corners ? facePoint(corners, 0.5, 0.5) : null;
  const upload = (
    <label className="video-upload">
      <Upload size={17} /> Use video
      <input
        type="file"
        accept="video/*"
        aria-label="Choose cube video"
        disabled={disabled}
        onChange={chooseVideo}
      />
    </label>
  );
  return (
    <div className="video-camera-input">
      <div className="video-launch">
        <button
          className="button scan-primary"
          disabled={disabled}
          onClick={() => void startCamera()}
        >
          <Camera size={18} /> Scan video
        </button>
        {upload}
      </div>
      {message && <p role="status">{message}</p>}
      {!open && error && <p role="alert">{error}</p>}
      <dialog
        ref={modal}
        className="video-scan-dialog"
        aria-labelledby="video-scan-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <div className="video-scan-shell">
          <header className="video-scan-header">
            <h2 id="video-scan-title">
              Scan your {size}×{size}
            </h2>
            <span aria-label={`${count} of 6 faces scanned`}>{count} / 6</span>
            <button
              className="icon-button"
              aria-label="Close video scan"
              onClick={close}
            >
              <X size={23} />
            </button>
          </header>
          <div className="video-scan-stage" ref={stage}>
            <div
              className="video-scan-view"
              style={{
                width: width || "100%",
                height: width ? width / aspect : "100%",
              }}
            >
              <video
                ref={video}
                muted
                playsInline
                hidden={!!preview}
                onLoadedMetadata={() => {
                  const player = video.current!;
                  setAspect(player.videoWidth / player.videoHeight || 4 / 3);
                  if (
                    source.current === "file" &&
                    player.currentSrc === objectUrl.current
                  )
                    void analyzeVideo();
                }}
                onError={() => {
                  if (source.current === "file") {
                    setError(
                      "This video could not be decoded. Try MP4 or WebM.",
                    );
                    transition("error");
                  }
                }}
              />
              {preview && <img src={preview} alt="Last video frame" />}
              {corners && (
                <svg
                  className={`video-face-outline ${recognized ? "is-recognized" : ""}`}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-label="Detected face grid"
                >
                  {Array.from({ length: size * size }, (_, i) => {
                    const x = i % size,
                      y = Math.floor(i / size);
                    return (
                      <polygon
                        key={i}
                        points={[
                          [x, y],
                          [x + 1, y],
                          [x + 1, y + 1],
                          [x, y + 1],
                        ]
                          .map(([u, v]) => {
                            const p = facePoint(corners, u / size, v / size);
                            return `${p.x},${p.y}`;
                          })
                          .join(" ")}
                      />
                    );
                  })}
                </svg>
              )}
              {recognized && center && (
                <span
                  className="video-face-check"
                  style={{ left: `${center.x}%`, top: `${center.y}%` }}
                >
                  <Check size={26} />
                </span>
              )}
              {phase !== "opening" && phase !== "error" && (
                <div
                  className={`video-scan-status ${recognized || phase === "ready" ? "is-recognized" : ""}`}
                  role="status"
                >
                  {phase === "checking" ? (
                    <LoaderCircle size={17} className="scan-spinner" />
                  ) : recognized || phase === "ready" ? (
                    <Check size={17} />
                  ) : null}
                  <span>{status}</span>
                </div>
              )}
              {snapshot.status === "holding" && !preview && (
                <div
                  className="video-stability"
                  role="progressbar"
                  aria-label="Face stability"
                  aria-valuenow={Math.round(snapshot.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${snapshot.progress * 100}%` }} />
                </div>
              )}
            </div>
            {phase === "error" && !preview && (
              <div className="video-opening">
                <VideoOff size={32} />
                <span>Video unavailable</span>
              </div>
            )}
            {phase === "opening" && (
              <div className="video-opening" role="status">
                <LoaderCircle className="scan-spinner" size={32} />
                <span>Opening camera…</span>
              </div>
            )}
          </div>
          <section
            className="video-scan-progress"
            aria-label="Face scan progress"
          >
            <ol>
              {Array.from({ length: 6 }, (_, i) => {
                const face =
                  size % 2
                    ? snapshot.faces.find((face) => face.identity === i)
                    : snapshot.faces[i];
                return (
                  <li
                    key={i}
                    aria-label={`${size % 2 ? names[i] : `Face ${i + 1}`}: ${face ? "scanned" : "not scanned"}`}
                    className={face ? "is-scanned" : ""}
                  >
                    <span
                      className="video-face-thumb"
                      style={{ gridTemplateColumns: `repeat(${size},1fr)` }}
                    >
                      {face ? (
                        face.colors.map((rgb, j) => (
                          <i
                            key={j}
                            style={{ background: `rgb(${rgb.join(",")})` }}
                          />
                        ))
                      ) : (
                        <span
                          className="video-face-empty"
                          style={{ color: size % 2 ? swatches[i] : undefined }}
                        >
                          {size % 2 ? FACE_ORDER[i] : i + 1}
                        </span>
                      )}
                      {face && (
                        <Check className="video-thumb-check" size={15} />
                      )}
                    </span>
                    <small>{size % 2 ? names[i] : `Face ${i + 1}`}</small>
                  </li>
                );
              })}
            </ol>
            <p>
              {phase === "processing"
                ? `${remaining} · ${progress}% read`
                : remaining}
            </p>
          </section>
          {error && (
            <p className="video-scan-error" role="alert">
              {error}
            </p>
          )}
          <footer className="video-scan-controls">
            {count > 0 && (
              <button
                className="text-button"
                disabled={phase === "opening"}
                onClick={restart}
              >
                <RotateCcw size={16} /> Start over
              </button>
            )}
            {phase === "ready" ? (
              <button className="button scan-primary" onClick={useCube}>
                <Check size={18} /> Use cube
              </button>
            ) : phase === "incomplete" || phase === "error" ? (
              <>
                <button
                  className="button scan-primary"
                  onClick={() => void startCamera(true)}
                >
                  <Camera size={17} />{" "}
                  {count ? "Continue with camera" : "Use camera"}
                </button>
                {!count && upload}
              </>
            ) : (
              <span className="video-scan-hint">Keep the layers still</span>
            )}
          </footer>
        </div>
      </dialog>
    </div>
  );
}
