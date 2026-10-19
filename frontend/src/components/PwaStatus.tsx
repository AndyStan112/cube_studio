import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { registerSW } from "virtual:pwa-register";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
// Register once per document. Updates are applied only when the user chooses to reload.
const updateListeners = new Set<() => void>();
let updateWaiting = false;
if ("serviceWorker" in navigator && window.isSecureContext) {
  // The catalog may have loaded before the first worker took control.
  // Warm its public cache when the worker starts controlling this document.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void fetch("/api/algorithm-catalog").catch(() => {});
  });
  registerSW({
    immediate: true,
    onNeedRefresh() {
      updateWaiting = true;
      updateListeners.forEach((listener) => listener());
    },
    onRegisterError(error) {
      console.warn("Offline support registration failed", error);
    },
  });
}
async function reloadForUpdate() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}
export default function PwaStatus() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [update, setUpdate] = useState(updateWaiting);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const online = () => setOffline(false),
      offline = () => setOffline(true),
      update = () => setUpdate(true);
    updateListeners.add(update);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      updateListeners.delete(update);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  return (
    <div className="pwa-status">
      {offline && (
        <div className="pwa-banner" role="status">
          <WifiOff size={17} />
          <span>Offline · Saved algorithms available.</span>
        </div>
      )}
      {update && (
        <div className="pwa-banner" role="status">
          <RefreshCw size={17} />
          <span>Update available.</span>
          <button
            className="text-button"
            onClick={() => void reloadForUpdate()}
          >
            Reload
          </button>
        </div>
      )}
      {!installed && prompt && (
        <div className="pwa-banner">
          <Download size={17} />
          <span>Cube Studio</span>
          <button
            className="text-button"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
          >
            Install app
          </button>
        </div>
      )}
    </div>
  );
}
