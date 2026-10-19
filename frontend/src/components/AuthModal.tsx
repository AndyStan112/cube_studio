import { useEffect, useRef, useState } from "react";
import { ArrowRight, Box, X } from "lucide-react";
import { api, type User } from "../lib/api";
export default function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (u: User) => void;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="auth-modal card"
      >
        <button
          className="icon-button close-modal"
          onClick={onClose}
          aria-label="Close sign in"
        >
          <X size={20} />
        </button>
        <span className="brand-icon">
          <Box size={25} />
        </span>
        <h2 id="auth-title">{register ? "Create account" : "Sign in"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              const result = await api<{ token: string; user: User }>(
                `/auth/${register ? "register" : "login"}`,
                {
                  method: "POST",
                  body: JSON.stringify(Object.fromEntries(form)),
                },
              );
              localStorage.setItem("cube-token", result.token);
              onSuccess(result.user);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Unable to sign in",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              Name
              <input
                autoFocus
                name="name"
                required
                maxLength={60}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email
            <input
              autoFocus={!register}
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          <small>At least 8 characters</small>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? "Loading…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <button
          className="text-button auth-switch"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "Sign in" : "Create account"}
        </button>
      </section>
    </div>
  );
}
