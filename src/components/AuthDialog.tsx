"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/client/api";
export default function AuthDialog({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  onSignedIn: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ confirmationRequired?: boolean }>("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: signup ? "signup" : "signin",
          email: form.get("email"),
          password: form.get("password"),
          displayName: form.get("displayName"),
        }),
      });
      if (data.confirmationRequired)
        setMessage(
          "Check your email to confirm your account, then sign in here.",
        );
      else await onSignedIn();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="auth-dialog"
      onCancel={onClose}
      aria-labelledby="auth-title"
    >
      <button
        className="dialog-close"
        aria-label="Close sign in"
        onClick={onClose}
      >
        ×
      </button>
      <h2 id="auth-title">
        {signup ? "Create your account" : "Welcome back."}
      </h2>
      <p>Viewing is open to everyone. Sign in to leave your mark.</p>
      <form onSubmit={submit}>
        {signup && (
          <>
            <label htmlFor="displayName">Public display name</label>
            <input
              id="displayName"
              name="displayName"
              required
              minLength={2}
              maxLength={40}
              autoComplete="nickname"
            />
            <small>
              This name appears with your strokes. Your email stays private.
            </small>
          </>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete={signup ? "new-password" : "current-password"}
        />
        <button className="primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <button
        className="cancel"
        disabled={busy}
        onClick={() => {
          setSignup(!signup);
          setMessage("");
        }}
      >
        {signup ? "Already have an account? Sign in" : "Create an account"}
      </button>
    </dialog>
  );
}
