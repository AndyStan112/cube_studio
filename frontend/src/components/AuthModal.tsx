import { useEffect, useRef, useState } from "react";
import { ArrowRight, Box, X } from "lucide-react";
import type { User } from "../lib/api";
import { authProvider } from "../lib/auth";
export default function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (u: User) => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    let active = true;
    authProvider
      .listUsers()
      .then((items) => {
        if (active) setUsers(items);
      })
      .catch(() => {
        if (active) setError("Could not load demo users.");
      });
    return () => {
      active = false;
    };
  }, []);
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
          ref={closeButton}
          className="icon-button close-modal"
          onClick={onClose}
          aria-label="Close sign in"
        >
          <X size={20} />
        </button>
        <span className="brand-icon">
          <Box size={25} />
        </span>
        <h2 id="auth-title">Choose a user</h2>
        <p className="auth-note">Mock sign-in · Shared demo accounts</p>
        <div className="demo-users" aria-busy={busy || users.length === 0}>
          {users.map((user) => (
            <button
              key={user.id}
              className="demo-user"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  onSuccess(await authProvider.signIn(user.id));
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Unable to continue",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <span className="avatar" aria-hidden="true">
                {user.name[0]}
              </span>
              <span>{user.name}</span>
              <ArrowRight size={16} />
            </button>
          ))}
          {!users.length && !error && <p className="auth-note">Loading…</p>}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
