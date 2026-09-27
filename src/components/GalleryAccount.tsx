"use client";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/client/useAccount";
import { api } from "@/client/api";
import AuthDialog from "./AuthDialog";
export default function GalleryAccount({
  onSignedIn,
}: {
  onSignedIn: () => void;
}) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    try {
      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signout" }),
      });
      await account.refreshUser();
      setError("");
    } catch {
      setError("Could not sign out. Please retry.");
    }
  }
  return (
    <div className="account">
      {account.user ? (
        <>
          {account.user.role && account.user.role !== "user" && (
            <Link href="/moderation">Moderation</Link>
          )}
          <span>Signed in as {account.user.displayName}</span>
          <button onClick={() => void signOut()}>Sign out</button>
        </>
      ) : (
        <button onClick={() => setOpen(true)}>Sign in</button>
      )}
      {(error || account.authError) && (
        <span role="status">{error || account.authError}</span>
      )}
      {open && (
        <AuthDialog
          onClose={() => setOpen(false)}
          onSignedIn={async () => {
            if (await account.refreshUser()) {
              onSignedIn();
              setOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}
